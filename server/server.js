/* 文芽作文 - 账号后端（邮箱验证码版）
 * 注册与登录均使用邮箱 6 位验证码，无密码。
 * 存储：better-sqlite3（data/wenyazw.db）；发信：mailer.js（SMTP 465）。
 *
 * 接口：
 *   GET  /api/health
 *   POST /api/auth/send-code  { email, purpose: "register" | "login" }
 *   POST /api/auth/register   { username, email, code }
 *   POST /api/auth/login      { email, code }
 *   GET  /api/auth/me         Authorization: Bearer <token>
 *   POST /api/auth/logout
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const { sendMail } = require("./mailer.js");

const PORT = Number(process.env.PORT || 3033);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "wenyazw.db");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");
const TOKEN_TTL = 7 * 24 * 3600;      // token 7 天
const CODE_TTL = 10 * 60 * 1000;      // 验证码 10 分钟
const RESEND_GAP = 60 * 1000;         // 同一邮箱 60 秒内不重复发
const MAX_ATTEMPTS = 5;               // 验证码最多试错 5 次
const DAILY_LIMIT = 10;               // 每邮箱每天最多 10 封

const ALLOW_ORIGINS = new Set([
  "https://wenyazw.top",
  "https://www.wenyazw.top",
  "http://localhost:8080",
  "http://localhost:5500",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5500"
]);

const USER_RE = /^[A-Za-z0-9_]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 16 * 1024;

/* ---------------- 初始化 ---------------- */

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
if (!fs.existsSync(SECRET_FILE)) {
  fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString("hex"), { mode: 0o600 });
}
const SECRET = fs.readFileSync(SECRET_FILE, "utf8").trim();

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_codes (
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    sent_at INTEGER NOT NULL,
    PRIMARY KEY (email, purpose)
  );
  CREATE TABLE IF NOT EXISTS send_log (
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    sent_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_send_log ON send_log(email, purpose, sent_at);
`);
// 兼容早期没有 purpose 列的库
const sendLogCols = db.prepare("PRAGMA table_info(send_log)").all();
if (sendLogCols.length && !sendLogCols.some((c) => c.name === "purpose")) {
  db.exec("ALTER TABLE send_log ADD COLUMN purpose TEXT NOT NULL DEFAULT 'register'");
}
try { fs.chmodSync(DB_FILE, 0o600); } catch (e) { /* 新库可能还没生成 WAL 文件 */ }

/* ---------------- 工具 ---------------- */

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function codeHash(email, purpose, code) {
  return crypto.createHmac("sha256", SECRET)
    .update(email.trim().toLowerCase() + "|" + purpose + "|" + code)
    .digest("hex");
}

function b64url(buf) { return Buffer.from(buf).toString("base64url"); }

function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ u: user.username, e: user.email, iat: now, exp: now + TOKEN_TTL }));
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return payload + "." + sig;
}

function verifyToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expect = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (!safeEqual(sig, expect)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch (e) { return null; }
  if (!data || !data.u || !data.e || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
  return { username: data.u, email: data.e };
}

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
      if (raw.length > MAX_BODY) { reject(new Error("请求体过大")); req.destroy(); }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error("JSON 格式错误")); }
    });
    req.on("error", reject);
  });
}

function bearer(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  return m ? m[1] : "";
}

function clientIp(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

/* ---------------- 限流 ---------------- */

const ipAttempts = new Map();
function ipTooMany(ip) {
  const now = Date.now();
  const rec = ipAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  rec.count++;
  return rec.count > 30;
}

// 重发间隔按「邮箱 + 用途」分别计算：注册刚发过码，不影响马上切到登录发码
function sentRecently(email, purpose) {
  const row = db.prepare("SELECT MAX(sent_at) AS last FROM send_log WHERE email = ? AND purpose = ?")
    .get(email, purpose);
  return row && row.last && (Date.now() - row.last) < RESEND_GAP;
}
function emailDailyCount(email) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM send_log WHERE email = ? AND sent_at > ?")
    .get(email, Date.now() - 24 * 3600 * 1000);
  return row ? row.n : 0;
}
function logSend(email, purpose) {
  db.prepare("INSERT INTO send_log (email, purpose, sent_at) VALUES (?, ?, ?)")
    .run(email, purpose, Date.now());
  db.prepare("DELETE FROM send_log WHERE sent_at < ?").run(Date.now() - 7 * 24 * 3600 * 1000);
}

/* ---------------- 验证码 ---------------- */

function issueCode(email, purpose) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const now = Date.now();
  db.prepare(`
    INSERT INTO email_codes (email, purpose, code_hash, expires_at, attempts, sent_at)
    VALUES (?, ?, ?, ?, 0, ?)
    ON CONFLICT(email, purpose) DO UPDATE SET
      code_hash = excluded.code_hash,
      expires_at = excluded.expires_at,
      attempts = 0,
      sent_at = excluded.sent_at
  `).run(email, purpose, codeHash(email, purpose, code), now + CODE_TTL, now);
  return code;
}

function consumeCode(email, purpose, code) {
  const row = db.prepare("SELECT * FROM email_codes WHERE email = ? AND purpose = ?").get(email, purpose);
  if (!row) return "请先获取验证码";
  if (Date.now() > row.expires_at) {
    db.prepare("DELETE FROM email_codes WHERE email = ? AND purpose = ?").run(email, purpose);
    return "验证码已过期，请重新获取";
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    db.prepare("DELETE FROM email_codes WHERE email = ? AND purpose = ?").run(email, purpose);
    return "试错次数过多，请重新获取验证码";
  }
  if (!safeEqual(codeHash(email, purpose, code), row.code_hash)) {
    db.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?")
      .run(email, purpose);
    return "验证码不正确";
  }
  db.prepare("DELETE FROM email_codes WHERE email = ? AND purpose = ?").run(email, purpose);
  return null;
}

function mailBody(code, purpose) {
  const action = purpose === "register" ? "注册文芽作文账号" : "登录文芽作文";
  return [
    "你好，",
    "",
    "你正在" + action + "，本次验证码是：",
    "",
    "    " + code,
    "",
    "10 分钟内有效，用完即失效。若不是你本人操作，忽略这封邮件即可。",
    "",
    "文芽作文"
  ].join("\n");
}

/* ---------------- 路由 ---------------- */

async function handle(req, res) {
  const p = new URL(req.url, "http://localhost").pathname.replace(/\/+$/, "") || "/";
  const method = req.method.toUpperCase();

  if (method === "OPTIONS") { res.writeHead(204, corsHeaders(req)); res.end(); return; }

  if (p === "/api/health" && method === "GET") {
    send(req, res, 200, { ok: true, service: "wenyazw-back", time: Date.now() });
    return;
  }

  if (p === "/api/auth/send-code" && method === "POST") {
    const ip = clientIp(req);
    if (ipTooMany(ip)) { send(req, res, 429, { ok: false, error: "操作太频繁，请稍后再试" }); return; }
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const purpose = body.purpose === "login" ? "login" : "register";
    if (!EMAIL_RE.test(email) || email.length > 120) {
      send(req, res, 400, { ok: false, error: "请填写有效的邮箱地址" }); return;
    }
    const exists = db.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
    if (purpose === "register" && exists) {
      send(req, res, 409, { ok: false, error: "该邮箱已注册，请直接登录" }); return;
    }
    if (purpose === "login" && !exists) {
      send(req, res, 404, { ok: false, error: "该邮箱尚未注册" }); return;
    }
    if (sentRecently(email, purpose)) {
      send(req, res, 429, { ok: false, error: "发送太频繁，请 60 秒后再试" }); return;
    }
    if (emailDailyCount(email) >= DAILY_LIMIT) {
      send(req, res, 429, { ok: false, error: "今天发送次数过多，请明天再试" }); return;
    }
    const code = issueCode(email, purpose);
    logSend(email, purpose);
    try {
      await sendMail(email, "文芽作文 验证码", mailBody(code, purpose));
      send(req, res, 200, { ok: true, message: "验证码已发送，请查收邮件（可能在垃圾箱）" });
    } catch (e) {
      db.prepare("DELETE FROM email_codes WHERE email = ? AND purpose = ?").run(email, purpose);
      console.error("[mail] 发送失败:", e.message);
      send(req, res, 502, { ok: false, error: "邮件发送失败，请稍后重试" });
    }
    return;
  }

  if (p === "/api/auth/register" && method === "POST") {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || "").trim();
    if (!USER_RE.test(username)) {
      send(req, res, 400, { ok: false, error: "用户名需 3～24 位，只能用字母、数字、下划线" }); return;
    }
    if (!EMAIL_RE.test(email) || email.length > 120) {
      send(req, res, 400, { ok: false, error: "请填写有效的邮箱地址" }); return;
    }
    if (!/^\d{6}$/.test(code)) {
      send(req, res, 400, { ok: false, error: "验证码为 6 位数字" }); return;
    }
    if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
      send(req, res, 409, { ok: false, error: "该用户名已被使用" }); return;
    }
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      send(req, res, 409, { ok: false, error: "该邮箱已注册，请直接登录" }); return;
    }
    const err = consumeCode(email, "register", code);
    if (err) { send(req, res, 400, { ok: false, error: err }); return; }
    try {
      db.prepare("INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)")
        .run(username, email, new Date().toISOString());
    } catch (e) {
      send(req, res, 409, { ok: false, error: "用户名或邮箱已被使用" }); return;
    }
    const user = { username, email };
    send(req, res, 200, { ok: true, user: username, email, token: signToken(user) });
    return;
  }

  if (p === "/api/auth/login" && method === "POST") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || "").trim();
    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
      send(req, res, 400, { ok: false, error: "请填写邮箱和 6 位验证码" }); return;
    }
    const row = db.prepare("SELECT username, email FROM users WHERE email = ?").get(email);
    if (!row) { send(req, res, 404, { ok: false, error: "该邮箱尚未注册" }); return; }
    const err = consumeCode(email, "login", code);
    if (err) { send(req, res, 400, { ok: false, error: err }); return; }
    send(req, res, 200, { ok: true, user: row.username, email: row.email, token: signToken(row) });
    return;
  }

  if (p === "/api/auth/me" && method === "GET") {
    const user = verifyToken(bearer(req));
    if (!user) { send(req, res, 401, { ok: false, error: "未登录或登录已过期" }); return; }
    send(req, res, 200, { ok: true, user: user.username, email: user.email });
    return;
  }

  if (p === "/api/auth/logout" && method === "POST") {
    // 无状态 token，前端清除本地存储即完成登出
    send(req, res, 200, { ok: true });
    return;
  }

  send(req, res, 404, { ok: false, error: "接口不存在" });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    const msg = (e && e.message) || "服务器内部错误";
    console.error("[http]", msg);
    if (!res.headersSent) send(req, res, 400, { ok: false, error: msg });
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log("[wenyazw-back] listening on http://" + HOST + ":" + PORT);
  console.log("[wenyazw-back] db: " + DB_FILE);
  const n = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  console.log("[wenyazw-back] users: " + n);
});
