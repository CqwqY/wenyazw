/* 文芽作文 - 账号后端
 * 零第三方依赖，只用 Node 内置模块。PM2 守护，监听 3033。
 * 接口：
 *   GET  /api/health
 *   POST /api/auth/register  { username, password }
 *   POST /api/auth/login     { username, password }
 *   GET  /api/auth/me        Authorization: Bearer <token>
 *   POST /api/auth/logout    Authorization: Bearer <token>
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3033);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");
const TOKEN_TTL = 7 * 24 * 3600; // 7 天

// 允许的前端来源（同源部署在 wenyazw.top，另留本地调试）
const ALLOW_ORIGINS = new Set([
  "https://wenyazw.top",
  "https://www.wenyazw.top",
  "http://localhost:8080",
  "http://localhost:5500",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5500"
]);

const USER_RE = /^[A-Za-z0-9_]{3,24}$/;
const MAX_BODY = 16 * 1024;

/* ---------------- 存储 ---------------- */

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "{}", { mode: 0o600 });
  }
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString("hex"), { mode: 0o600 });
  }
}

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) || {}; }
  catch (e) { return {}; }
}

function writeUsers(users) {
  const tmp = USERS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, USERS_FILE);
}

function secret() {
  return fs.readFileSync(SECRET_FILE, "utf8").trim();
}

/* ---------------- 密码 / token ---------------- */

// scrypt 同步调用，参数固定，避免引入依赖
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function makeSalt() { return crypto.randomBytes(16).toString("hex"); }

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function signToken(username) {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ u: username, iat: now, exp: now + TOKEN_TTL }));
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return payload + "." + sig;
}

function verifyToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expect = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (!safeEqual(sig, expect)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch (e) { return null; }
  if (!data || !data.u || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
  return data.u;
}

/* ---------------- HTTP 辅助 ---------------- */

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (ALLOW_ORIGINS.has(origin) || /^http:\/\/100\.\d+\.\d+\.\d+(:\d+)?$/.test(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
  } else if (!origin) {
    // 无 Origin 的 curl / 服务端调用，不设 CORS 头也不影响
  }
  return h;
}

function send(req, res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store"
  }, corsHeaders(req)));
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > MAX_BODY) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error("JSON 格式错误")); }
    });
    req.on("error", reject);
  });
}

function bearer(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : "";
}

/* ---------------- 简单防爆破（内存计数） ---------------- */

const attempts = new Map(); // ip -> { count, resetAt }
function tooMany(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  rec.count++;
  return rec.count > 20;
}
function clearAttempts(ip) { attempts.delete(ip); }

/* ---------------- 路由 ---------------- */

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method.toUpperCase();

  if (method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  if (p === "/api/health" && method === "GET") {
    send(req, res, 200, { ok: true, service: "wenyazw-back", time: Date.now() });
    return;
  }

  if (p === "/api/auth/register" && method === "POST") {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USER_RE.test(username)) {
      send(req, res, 400, { ok: false, error: "用户名需 3～24 位，只能用字母、数字、下划线" });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      send(req, res, 400, { ok: false, error: "密码长度需 6～128 位" });
      return;
    }
    const users = readUsers();
    if (users[username]) {
      send(req, res, 409, { ok: false, error: "该用户名已注册" });
      return;
    }
    const salt = makeSalt();
    users[username] = {
      salt,
      hash: hashPassword(password, salt),
      createdAt: new Date().toISOString()
    };
    writeUsers(users);
    send(req, res, 200, { ok: true, user: username, token: signToken(username) });
    return;
  }

  if (p === "/api/auth/login" && method === "POST") {
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    if (tooMany(ip)) {
      send(req, res, 429, { ok: false, error: "尝试太频繁，请 10 分钟后再试" });
      return;
    }
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const users = readUsers();
    const rec = users[username];
    if (!rec || !safeEqual(hashPassword(password, rec.salt), rec.hash)) {
      send(req, res, 401, { ok: false, error: "用户名或密码不正确" });
      return;
    }
    clearAttempts(ip);
    send(req, res, 200, { ok: true, user: username, token: signToken(username) });
    return;
  }

  if (p === "/api/auth/me" && method === "GET") {
    const username = verifyToken(bearer(req));
    if (!username) { send(req, res, 401, { ok: false, error: "未登录或登录已过期" }); return; }
    send(req, res, 200, { ok: true, user: username });
    return;
  }

  if (p === "/api/auth/logout" && method === "POST") {
    // 无状态 token：服务端不记录会话，前端清除本地 token 即完成登出
    send(req, res, 200, { ok: true });
    return;
  }

  send(req, res, 404, { ok: false, error: "接口不存在" });
}

ensureData();

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    const msg = (e && e.message) || "服务器内部错误";
    if (!res.headersSent) send(req, res, 400, { ok: false, error: msg });
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log("[wenyazw-back] listening on http://" + HOST + ":" + PORT);
  console.log("[wenyazw-back] data dir: " + DATA_DIR);
});
