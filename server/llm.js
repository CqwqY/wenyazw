/* 站内模型网关：把浏览器的请求转发到中转站，带模型回退。
 *
 * 设计要点：
 * - 密钥只存在服务器环境变量里（RELAY_KEY），永不下发到浏览器；
 * - 固定先用 deepseek-v4.1-flash，失败（5xx/429/超时/空响应/不支持）自动换下一个；
 * - 响应原样透传，SSE 也逐块 flush，前端体验与直连一致；
 * - 一个请求最多换 MODEL_CHAIN.length 个模型，单个模型有整体超时。
 */
"use strict";

const https = require("node:https");
const http = require("node:http");
const { URL } = require("node:url");

const RELAY_BASE = (process.env.RELAY_BASE || "https://aiaiai.ruinet.work").replace(/\/+$/, "");
const RELAY_PATH = process.env.RELAY_PATH || "/v1/chat/completions";
const RELAY_KEY = process.env.RELAY_KEY || "";

/* 中文写作能力优先，后面几个是兜底（前几个常被限流时也能出活） */
const DEFAULT_CHAIN = [
  "deepseek-v4.1-flash",
  "deepseek-v4-flash",
  "kimi-k3.1-pro",
  "qwen3.8-flash",
  "glm-4.6",
  "mimo-v2.6-pro",
  "minimax-m3.1-flash",
  "gemini-3.5-flash",
  "gpt-4o-mini"
];

function modelChain() {
  const raw = (process.env.SITE_MODELS || "").trim();
  if (!raw) return DEFAULT_CHAIN.slice();
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function relayReady() {
  return !!RELAY_KEY;
}

/* 一个模型的一次请求。返回 { ok, status, contentType, stream } 或抛错。
   非 200 时把上游错误体读成字符串带回，便于判断是否值得换模型。 */
function postOnce(model, payload, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(RELAY_PATH, RELAY_BASE + "/"); } catch (e) { return reject(new Error("中转站地址无效")); }
    const body = Buffer.from(JSON.stringify(Object.assign({}, payload, { model })), "utf8");
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === "http:" ? 80 : 443),
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length,
        "Authorization": "Bearer " + RELAY_KEY,
        "Accept": payload.stream ? "text/event-stream" : "application/json",
        "User-Agent": "wenyazw-back/1.0"
      }
    }, (r) => {
      if (r.statusCode !== 200) {
        let err = "";
        r.setEncoding("utf8");
        r.on("data", (c) => { if (err.length < 600) err += c; });
        r.on("end", () => resolve({ ok: false, status: r.statusCode, error: err.slice(0, 600) }));
        return;
      }
      resolve({ ok: true, status: 200, contentType: r.headers["content-type"] || "", stream: r });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("模型响应超时")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/* 判断这次失败要不要换下一个模型：客户端参数错误（400 且不是「模型不可用」）就不要再试了。
   实际经验：中转站把「没有可用账号 / 账号耗尽 / 模型不支持」都包成 4xx/5xx，统一按可重试处理。 */
/* 刚失败过的模型先冷冻一会儿，避免每次都花十几秒等它超时 */
const cooldownUntil = new Map();
const COOLDOWN_MS = Number(process.env.MODEL_COOLDOWN_MS || 3 * 60 * 1000);
let lastGoodModel = "";

function cooled(model) {
  const t = cooldownUntil.get(model) || 0;
  return Date.now() < t;
}

function worthRetry(status, text) {
  if (!status) return true;                     // 网络层错误
  if (status === 429) return true;              // 限流
  if (status >= 500) return true;               // 503 No available accounts
  if (status === 404) return true;              // 模型不存在
  if (status === 401 || status === 403) return false;  // 密钥问题，换模型没用
  const t = String(text || "");
  return /no available account|exhausted|not supported|not found|overloaded|rate limit|capacity/i.test(t);
}

/* 流式：等第一个数据块到了才算成功，一个字节都没来就换下一个模型 */
function waitFirstChunk(stream, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(null);                 // 首块超时，按失败处理
    }, timeoutMs);
    stream.once("data", (chunk) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(chunk);
    });
    stream.once("end", () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(null);                 // 直接结束，等于没内容
    });
    stream.once("error", (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(e);
    });
  });
}

function extraHeaders(base, opts) {
  const extra = (opts && opts.extraHeaders) || null;
  return extra ? Object.assign({}, base, extra) : base;
}

/* 主入口：按链逐个试，第一个成活的直接接管 res。
   返回 { ok, model, attempts } 或 { ok:false, error, status } */
async function proxy(req, res, payload, opts) {
  if (!relayReady()) return { ok: false, status: 503, error: "站内模型未配置（缺少 RELAY_KEY）" };
  const base = modelChain();
  // 首选固定第一个（用户要求每次都先试 v4.1），后面接上次成功的模型和其余备选
  const chain = [base[0]];
  if (lastGoodModel && lastGoodModel !== base[0]) chain.push(lastGoodModel);
  base.slice(1).forEach((m) => { if (chain.indexOf(m) < 0) chain.push(m); });

  const attempts = [];
  const perModelTimeout = Number((opts && opts.perModelTimeout) || 8000);
  const deadline = Date.now() + Number((opts && opts.deadlineMs) || 60000);
  const stream = !!payload.stream;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    if (i > 0 && cooled(model)) { attempts.push({ model, error: "冷却中，跳过" }); continue; }
    if (Date.now() > deadline) { attempts.push({ model, error: "整体超时，放弃" }); break; }
    let r;
    try {
      r = await postOnce(model, payload, { timeoutMs: perModelTimeout });
    } catch (e) {
      attempts.push({ model, error: e.message });
      cooldownUntil.set(model, Date.now() + COOLDOWN_MS);
      continue;
    }
    if (!r.ok) {
      attempts.push({ model, status: r.status, error: r.error });
      if (r.status === 429 || /exhausted|no available account/i.test(String(r.error))) {
        cooldownUntil.set(model, Date.now() + COOLDOWN_MS);
      }
      if (!worthRetry(r.status, r.error)) break;
      continue;
    }

    if (!stream) {
      // 非流式：整段读完再转发，顺便校验内容
      let raw = "";
      r.stream.setEncoding("utf8");
      await new Promise((resolve) => {
        r.stream.on("data", (c) => { raw += c; });
        r.stream.on("end", resolve);
        r.stream.on("error", resolve);
      });
      let content = "";
      try {
        const j = JSON.parse(raw);
        const msg = j.choices && j.choices[0] && j.choices[0].message;
        content = (msg && msg.content) || "";
      } catch (e) { content = ""; }
      if (!content.trim()) {
        attempts.push({ model, error: "上游返回空内容" });
        continue;
      }
      res.writeHead(200, extraHeaders({
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(raw),
        "Cache-Control": "no-store",
        "X-Wenyazw-Model": model
      }, opts));
      res.end(raw);
      lastGoodModel = model;
      return { ok: true, model, attempts };
    }

    // 流式：先确认真的开始出字，再接管响应头
    let first;
    try {
      first = await waitFirstChunk(r.stream, perModelTimeout);
    } catch (e) {
      attempts.push({ model, error: e.message });
      continue;
    }
    if (!first) {
      attempts.push({ model, error: "上游没有输出内容" });
      continue;
    }
    res.writeHead(200, extraHeaders({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Wenyazw-Model": model
    }, opts));
    res.write(first);
    r.stream.pipe(res);
    r.stream.on("error", () => { try { res.end(); } catch (e) {} });
    lastGoodModel = model;
    return { ok: true, model, attempts, streaming: true };
  }

  const last = attempts[attempts.length - 1] || {};
  const status = last.status && last.status >= 400 && last.status < 500 ? 429 : 502;
  return {
    ok: false,
    status,
    error: "所有站内模型都不可用，请稍后再试",
    detail: attempts
  };
}

module.exports = { proxy, modelChain, relayReady, RELAY_BASE, RELAY_PATH };
