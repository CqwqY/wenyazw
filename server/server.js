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
 *   GET  /api/essays          我的作文列表（不含正文）
 *   GET  /api/essays/:id      作文详情（含正文）
 *   POST /api/essays          新建或更新作文 { id?, title, body, outline?, category?, province?, wordCount? }
 *   DELETE /api/essays/:id    删除作文
 */
"use strict";

/* 基础模块先引，下面的 .env 读取要用 fs/path */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

/* 把 server/.env 读进 process.env（不引第三方依赖，简单 KEY=VALUE 即可）。
   必须在 require("./llm.js") 之前执行 —— 那个模块在加载时就固定了中转站地址与密钥。
   中转站密钥、管理员 token 都放这里，绝不写进仓库。 */
(function loadEnv() {
  try {
    const file = path.join(__dirname, ".env");
    if (!fs.existsSync(file)) return;
    const txt = fs.readFileSync(file, "utf8");
    txt.split(/\r?\n/).forEach((line) => {
      const s = line.trim();
      if (!s || s.startsWith("#")) return;
      const i = s.indexOf("=");
      if (i <= 0) return;
      const k = s.slice(0, i).trim();
      let v = s.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    });
  } catch (e) {
    console.error("[env] 读取 .env 失败:", e.message);
  }
})();

const Database = require("better-sqlite3");
const { sendMail } = require("./mailer.js");
const llm = require("./llm.js");

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
  "http://localhost:8081",
  "http://localhost:8899",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:8899"
]);

/* 积分：注册即送 15 分，每次 AI 操作扣 1 分 */
const SIGNUP_CREDITS = Number(process.env.SIGNUP_CREDITS || 15);
const COST_PER_CALL = Number(process.env.COST_PER_CALL || 1);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

/* 注册风控：一个邮箱一个号（数据库唯一）、一个 IP 一个号、同一 IP 每天最多发 5 次注册码、
   全站每天最多成功注册 50 个（防止被脚本刷号领积分）。 */
const REG_IP_DAILY_CODES = Number(process.env.REG_IP_DAILY_CODES || 5);
const REG_DAILY_TOTAL = Number(process.env.REG_DAILY_TOTAL || 50);

/* 站内模型调用限速：单账号每分钟、单 IP 每分钟、单账号每天 */
const LLM_PER_MIN_USER = Number(process.env.LLM_PER_MIN_USER || 12);
const LLM_PER_MIN_IP = Number(process.env.LLM_PER_MIN_IP || 20);
const LLM_DAILY_USER = Number(process.env.LLM_DAILY_USER || 200);

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
    credits INTEGER NOT NULL DEFAULT 15,
    reg_ip TEXT NOT NULL DEFAULT "",
    last_ip TEXT NOT NULL DEFAULT "",
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
  CREATE TABLE IF NOT EXISTS essays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT "",
    outline TEXT NOT NULL DEFAULT "",
    category TEXT NOT NULL DEFAULT "",
    province TEXT NOT NULL DEFAULT "",
    word_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_essays_email ON essays(email, updated_at DESC);
  /* 积分流水：每一次扣分/补分都留痕，方便对账和抓异常 */
  CREATE TABLE IF NOT EXISTS credit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT "",
    ip TEXT NOT NULL DEFAULT "",
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_credit_log_email ON credit_log(email, created_at DESC);
  /* 注册风控日志：同一 IP 的发码次数、注册尝试都记在这里 */
  CREATE TABLE IF NOT EXISTS reg_log (
    ip TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT "",
    kind TEXT NOT NULL DEFAULT "",
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reg_log_ip ON reg_log(ip, at DESC);
  /* 兑换码：一次性或限次，兑换记录按「码 + 账号」唯一，杜绝同码重复兑给自己 */
  CREATE TABLE IF NOT EXISTS redeem_codes (
    code TEXT PRIMARY KEY,
    credits INTEGER NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT "",
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS redeem_log (
    code TEXT NOT NULL,
    email TEXT NOT NULL,
    credits INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (code, email)
  );
  CREATE INDEX IF NOT EXISTS idx_redeem_log_email ON redeem_log(email, created_at DESC);
`);
// 兼容早期没有 purpose 列的库
const sendLogCols = db.prepare("PRAGMA table_info(send_log)").all();
if (sendLogCols.length && !sendLogCols.some((c) => c.name === "purpose")) {
  db.exec("ALTER TABLE send_log ADD COLUMN purpose TEXT NOT NULL DEFAULT 'register'");
}
// 兼容早期没有 outline 列的库（大纲单独存一列，正文可以为空）
const essayCols = db.prepare("PRAGMA table_info(essays)").all();
if (essayCols.length && !essayCols.some((c) => c.name === "outline")) {
  db.exec('ALTER TABLE essays ADD COLUMN outline TEXT NOT NULL DEFAULT ""');
}
// 积分与注册 IP（老库补齐，老用户按 0 处理，需要补分走管理接口）
const userCols = db.prepare("PRAGMA table_info(users)").all();
if (userCols.length && !userCols.some((c) => c.name === "credits")) {
  db.exec("ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0");
}
if (userCols.length && !userCols.some((c) => c.name === "reg_ip")) {
  db.exec('ALTER TABLE users ADD COLUMN reg_ip TEXT NOT NULL DEFAULT ""');
}
if (userCols.length && !userCols.some((c) => c.name === "last_ip")) {
  db.exec('ALTER TABLE users ADD COLUMN last_ip TEXT NOT NULL DEFAULT ""');
}
db.exec("CREATE INDEX IF NOT EXISTS idx_users_reg_ip ON users(reg_ip)");
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

/* 只认本站页面：Origin 必须在白名单（含本机调试与 Tailscale 内网），
   站内模型接口额外要求必须带 Origin，防止别人拿 token 从别的站点批量刷。 */
function originAllowed(req) {
  const origin = req.headers.origin || "";
  if (!origin) return false;
  if (ALLOW_ORIGINS.has(origin)) return true;
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  const tail = /^http:\/\/100\.\d+\.\d+\.\d+(:\d+)?$/;
  return local.test(origin) || tail.test(origin);
}

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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

function readBody(req, maxBytes) {
  const cap = maxBytes || MAX_BODY;
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > cap) { reject(new Error("请求体过大")); req.destroy(); }
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

/* IPv6 每次连接后缀都会变，按 /64 前缀归类才拦得住 */
function ipKey(raw) {
  const ip = String(raw || "").replace(/^::ffff:/, "");
  if (!ip) return "";
  if (ip.indexOf(":") < 0) return ip;                 // IPv4 原样
  const parts = ip.split(":");
  return parts.slice(0, 4).join(":") + "::/64";       // IPv6 取前 4 段
}

/* ---------------- 积分 ---------------- */

function creditsOf(email) {
  const row = db.prepare("SELECT credits FROM users WHERE email = ?").get(email);
  return row ? row.credits : 0;
}

function addCredits(email, delta, reason, ip) {
  const info = db.prepare("UPDATE users SET credits = credits + ? WHERE email = ?").run(delta, email);
  if (!info.changes) return null;
  db.prepare("INSERT INTO credit_log (email, delta, reason, ip, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(email, delta, String(reason || "").slice(0, 80), String(ip || "").slice(0, 60), Date.now());
  return creditsOf(email);
}

/* 扣一次：余额不足返回 null，保证不会扣成负数（SQL 里带条件，避免并发超扣） */
function spendOne(email, reason, ip) {
  const info = db.prepare("UPDATE users SET credits = credits - ? WHERE email = ? AND credits >= ?")
    .run(COST_PER_CALL, email, COST_PER_CALL);
  if (!info.changes) return null;
  db.prepare("INSERT INTO credit_log (email, delta, reason, ip, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(email, -COST_PER_CALL, String(reason || "").slice(0, 80), String(ip || "").slice(0, 60), Date.now());
  return creditsOf(email);
}

/* ---------------- 兑换码 ---------------- */

// 兑换码只用无歧义字符：没有 I L O 0 1，避免手抄错
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newCode() {
  let out = "";
  for (let i = 0; i < 12; i++) out += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return out;
}

// 用户怎么输都认：小写、带空格、带横线一律归一成大写纯字母数字
function normalizeCode(raw) {
  const s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length >= 6 && s.length <= 32 ? s : "";
}

const redeemWin = new Map();

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

/* 滑动窗口：单账号 / IP 每分钟、单账号每天 */
const winUser = new Map();
const winIp = new Map();
function hitWindow(map, key, limit, spanMs) {
  const now = Date.now();
  let arr = map.get(key);
  if (!arr) { arr = []; map.set(key, arr); }
  while (arr.length && now - arr[0] > spanMs) arr.shift();
  arr.push(now);
  return arr.length > limit;
}
function llmRateLimited(email, ip) {
  if (hitWindow(winUser, email, LLM_PER_MIN_USER, 60 * 1000)) return "这台账号一分钟内请求太多次，稍等一会儿";
  if (hitWindow(winIp, ip || "-", LLM_PER_MIN_IP, 60 * 1000)) return "这个网络一分钟内请求太多次，稍等一会儿";
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const row = db.prepare("SELECT COUNT(*) AS n FROM credit_log WHERE email = ? AND delta < 0 AND created_at > ?")
    .get(email, dayAgo);
  if (row && row.n >= LLM_DAILY_USER) return "今天用量已达上限，明天再来";
  return "";
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

  // 站内模型接口不做跨站开放：没有 Origin 或 Origin 不在白名单，一律拒绝
  if (p.indexOf("/api/llm/") === 0 && !originAllowed(req)) {
    send(req, res, 403, { ok: false, error: "这个接口只允许在文芽作本站内调用" });
    return;
  }

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
    if (purpose === "register") {
      const ipk = ipKey(ip);
      const took = db.prepare("SELECT username FROM users WHERE reg_ip = ? LIMIT 1").get(ipk);
      if (took) {
        send(req, res, 409, { ok: false, error: "这个网络已经注册过一个账号了，请直接登录那个账号" });
        return;
      }
      const recent = db.prepare("SELECT COUNT(*) AS n FROM reg_log WHERE ip = ? AND kind = 'code' AND at > ?")
        .get(ipk, Date.now() - 24 * 3600 * 1000).n;
      if (recent >= REG_IP_DAILY_CODES) {
        send(req, res, 429, { ok: false, error: "这个网络今天注册次数过多，请明天再试" });
        return;
      }
    }
    if (sentRecently(email, purpose)) {
      send(req, res, 429, { ok: false, error: "发送太频繁，请 60 秒后再试" }); return;
    }
    if (emailDailyCount(email) >= DAILY_LIMIT) {
      send(req, res, 429, { ok: false, error: "今天发送次数过多，请明天再试" }); return;
    }
    const code = issueCode(email, purpose);
    logSend(email, purpose);
    db.prepare("INSERT INTO reg_log (ip, email, kind, at) VALUES (?, ?, ?, ?)")
      .run(ipKey(ip), email, purpose === "register" ? "code" : "login_code", Date.now());
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
    const ipk = ipKey(clientIp(req));
    if (db.prepare("SELECT 1 FROM users WHERE reg_ip = ?").get(ipk)) {
      send(req, res, 409, { ok: false, error: "这个网络已经注册过一个账号了，请直接登录那个账号" }); return;
    }
    const todayCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at > ?")
      .get(new Date(Date.now() - 24 * 3600 * 1000).toISOString()).n;
    if (todayCount >= REG_DAILY_TOTAL) {
      send(req, res, 429, { ok: false, error: "今天注册名额已满，请明天再试" }); return;
    }
    const err = consumeCode(email, "register", code);
    if (err) { send(req, res, 400, { ok: false, error: err }); return; }
    try {
      db.prepare("INSERT INTO users (username, email, credits, reg_ip, last_ip, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(username, email, SIGNUP_CREDITS, ipk, ipk, new Date().toISOString());
    } catch (e) {
      send(req, res, 409, { ok: false, error: "用户名或邮箱已被使用" }); return;
    }
    db.prepare("INSERT INTO credit_log (email, delta, reason, ip, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(email, SIGNUP_CREDITS, "注册赠送", ipk, Date.now());
    db.prepare("INSERT INTO reg_log (ip, email, kind, at) VALUES (?, ?, ?, ?)")
      .run(ipk, email, "register", Date.now());
    const user = { username, email };
    send(req, res, 200, { ok: true, user: username, email, token: signToken(user), credits: SIGNUP_CREDITS });
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
    db.prepare("UPDATE users SET last_ip = ? WHERE email = ?").run(ipKey(clientIp(req)), email);
    send(req, res, 200, {
      ok: true, user: row.username, email: row.email, token: signToken(row), credits: creditsOf(email)
    });
    return;
  }

  if (p === "/api/auth/me" && method === "GET") {
    const user = verifyToken(bearer(req));
    if (!user) { send(req, res, 401, { ok: false, error: "未登录或登录已过期" }); return; }
    db.prepare("UPDATE users SET last_ip = ? WHERE email = ?").run(ipKey(clientIp(req)), user.email);
    send(req, res, 200, { ok: true, user: user.username, email: user.email, credits: creditsOf(user.email) });
    return;
  }

  if (p === "/api/credits" && method === "GET") {
    const user = verifyToken(bearer(req));
    if (!user) { send(req, res, 401, { ok: false, error: "未登录或登录已过期" }); return; }
    const recent = db.prepare("SELECT delta, reason, created_at FROM credit_log WHERE email = ? ORDER BY id DESC LIMIT 50")
      .all(user.email);
    send(req, res, 200, {
      ok: true,
      credits: creditsOf(user.email),
      costPerCall: COST_PER_CALL,
      signupCredits: SIGNUP_CREDITS,
      log: recent
    });
    return;
  }

  /* ---------------- 兑换码 ---------------- */

  if (p === "/api/redeem" && method === "POST") {
    const user = verifyToken(bearer(req));
    if (!user) { send(req, res, 401, { ok: false, error: "请先登录再兑换" }); return; }
    const ip = ipKey(clientIp(req));
    // 防爆破：同一账号 10 分钟 8 次、同一 IP 10 分钟 20 次
    if (hitWindow(redeemWin, "u:" + user.email, 8, 10 * 60 * 1000)) {
      send(req, res, 429, { ok: false, error: "试得太频繁了，过 10 分钟再来" }); return;
    }
    if (hitWindow(redeemWin, "ip:" + (ip || "-"), 20, 10 * 60 * 1000)) {
      send(req, res, 429, { ok: false, error: "这个网络试得太频繁了，过 10 分钟再来" }); return;
    }
    const body = await readBody(req);
    const code = normalizeCode(body.code);
    if (!code) { send(req, res, 400, { ok: false, error: "请输入兑换码" }); return; }

    const row = db.prepare("SELECT * FROM redeem_codes WHERE code = ?").get(code);
    if (!row) { send(req, res, 404, { ok: false, error: "兑换码不存在，检查一下有没有输错" }); return; }
    if (row.expires_at && Date.now() > row.expires_at) {
      send(req, res, 400, { ok: false, error: "这个兑换码已经过期了" }); return;
    }
    // 先看这个账号兑没兑过：比「已用完」更贴近用户实际遇到的问题
    if (db.prepare("SELECT 1 FROM redeem_log WHERE code = ? AND email = ?").get(code, user.email)) {
      send(req, res, 400, { ok: false, error: "这个码你已经兑换过了" }); return;
    }
    if (row.used_count >= row.max_uses) {
      send(req, res, 400, { ok: false, error: "这个兑换码已经被用完了" }); return;
    }

    // 抢码用带条件的 UPDATE，靠 changes 判断是否抢到，避免并发超兑
    const grab = db.transaction(() => {
      const info = db.prepare("UPDATE redeem_codes SET used_count = used_count + 1 WHERE code = ? AND used_count < max_uses")
        .run(code);
      if (!info.changes) return false;
      db.prepare("INSERT INTO redeem_log (code, email, credits, created_at) VALUES (?, ?, ?, ?)")
        .run(code, user.email, row.credits, Date.now());
      return true;
    });
    if (!grab()) { send(req, res, 400, { ok: false, error: "这个兑换码刚被用完了" }); return; }

    const left = addCredits(user.email, row.credits, "兑换码 " + code, ip);
    send(req, res, 200, { ok: true, credits: left, added: row.credits });
    return;
  }

  /* 管理：批量生成兑换码。body { credits, count, maxUses, days, note } */
  if (p === "/api/admin/redeem" && method === "POST") {
    if (!ADMIN_TOKEN || !safeEqual(req.headers["x-admin-token"] || "", ADMIN_TOKEN)) {
      send(req, res, 403, { ok: false, error: "无权操作" }); return;
    }
    const body = await readBody(req);
    const credits = Math.trunc(Number(body.credits));
    const count = Math.trunc(Number(body.count || 1));
    const maxUses = Math.trunc(Number(body.maxUses || 1));
    const days = Math.trunc(Number(body.days || 0));
    if (!credits || credits < 1 || credits > 100000) { send(req, res, 400, { ok: false, error: "credits 不合法" }); return; }
    if (!count || count < 1 || count > 200) { send(req, res, 400, { ok: false, error: "count 只能是 1-200" }); return; }
    if (!maxUses || maxUses < 1 || maxUses > 1000) { send(req, res, 400, { ok: false, error: "maxUses 只能是 1-1000" }); return; }
    if (days < 0 || days > 3650) { send(req, res, 400, { ok: false, error: "days 只能是 0-3650" }); return; }

    const note = String(body.note || "").slice(0, 60);
    const now = Date.now();
    const expiresAt = days > 0 ? now + days * 24 * 3600 * 1000 : 0;
    const insert = db.prepare(`
      INSERT INTO redeem_codes (code, credits, max_uses, used_count, note, created_at, expires_at)
      VALUES (?, ?, ?, 0, ?, ?, ?)`);
    const exists = db.prepare("SELECT 1 FROM redeem_codes WHERE code = ?");
    const codes = [];
    const tx = db.transaction(() => {
      for (let i = 0; i < count; i++) {
        let code = "";
        for (let k = 0; k < 12; k++) {
          code = newCode();
          if (!exists.get(code)) break;
        }
        insert.run(code, credits, maxUses, note, now, expiresAt);
        codes.push(code);
      }
    });
    tx();
    send(req, res, 200, { ok: true, codes, credits, maxUses, expiresAt });
    return;
  }

  /* 管理：查看最近生成的兑换码 */
  if (p === "/api/admin/redeem" && method === "GET") {
    if (!ADMIN_TOKEN || !safeEqual(req.headers["x-admin-token"] || "", ADMIN_TOKEN)) {
      send(req, res, 403, { ok: false, error: "无权操作" }); return;
    }
    const rows = db.prepare(`
      SELECT code, credits, max_uses, used_count, note, created_at, expires_at
      FROM redeem_codes ORDER BY created_at DESC LIMIT 100`).all();
    send(req, res, 200, { ok: true, codes: rows });
    return;
  }

  /* 管理：作废兑换码 */
  if (p === "/api/admin/redeem/revoke" && method === "POST") {
    if (!ADMIN_TOKEN || !safeEqual(req.headers["x-admin-token"] || "", ADMIN_TOKEN)) {
      send(req, res, 403, { ok: false, error: "无权操作" }); return;
    }
    const body = await readBody(req);
    const code = normalizeCode(body.code);
    if (!code) { send(req, res, 400, { ok: false, error: "缺少 code" }); return; }
    const info = db.prepare("UPDATE redeem_codes SET max_uses = used_count WHERE code = ?").run(code);
    if (!info.changes) { send(req, res, 404, { ok: false, error: "没有这个码" }); return; }
    send(req, res, 200, { ok: true });
    return;
  }

  if (p === "/api/auth/logout" && method === "POST") {
    // 无状态 token，前端清除本地存储即完成登出
    send(req, res, 200, { ok: true });
    return;
  }

  /* ---------------- 站内模型（积分制） ---------------- */

  if (p === "/api/llm/chat/completions" && method === "POST") {
    const user = verifyToken(bearer(req));
    if (!user) { send(req, res, 401, { ok: false, error: "请先登录后再使用站内模型" }); return; }
    if (!llm.relayReady()) { send(req, res, 503, { ok: false, error: "站内模型还没配好，请先用自填接口" }); return; }

    const ip = ipKey(clientIp(req));
    const limited = llmRateLimited(user.email, ip);
    if (limited) { send(req, res, 429, { ok: false, error: limited }); return; }

    let body;
    try { body = await readBody(req, 512 * 1024); }
    catch (e) { send(req, res, 413, { ok: false, error: "内容太长，先精简一下" }); return; }

    const msgs = Array.isArray(body.messages) ? body.messages : null;
    if (!msgs || !msgs.length || msgs.length > 12) {
      send(req, res, 400, { ok: false, error: "messages 不合法" }); return;
    }
    const cleanMsgs = [];
    let totalChars = 0;
    for (const m of msgs) {
      const role = m && m.role;
      const content = typeof (m && m.content) === "string" ? m.content : "";
      if (role !== "system" && role !== "user" && role !== "assistant") continue;
      if (!content || content.length > 40000) { send(req, res, 400, { ok: false, error: "单条内容为空或过长" }); return; }
      totalChars += content.length;
      if (totalChars > 80000) { send(req, res, 413, { ok: false, error: "整段对话太长，先精简一下" }); return; }
      cleanMsgs.push({ role, content });
    }
    if (!cleanMsgs.length) { send(req, res, 400, { ok: false, error: "messages 不合法" }); return; }

    const payload = {
      messages: cleanMsgs,
      stream: body.stream === true,
      temperature: Math.min(2, Math.max(0, Number(body.temperature) || 0.7)),
      max_tokens: Math.min(16000, Math.max(64, Number(body.max_tokens) || 2400))
    };

    // 先扣分再请求：扣不动说明余额不足，直接拦下；全失败会退回
    const left = spendOne(user.email, "站内模型 · " + (body.purpose || "AI 操作"), ip);
    if (left === null) {
      send(req, res, 402, {
        ok: false, error: "积分用完了（每次操作 1 积分）。可以在控制台看明细，或去「接口配置」换成自己的模型接口，不消耗积分。",
        credits: 0
      });
      return;
    }

    const result = await llm.proxy(req, res, payload, {
      perModelTimeout: 9000,
      deadlineMs: 55000,
      extraHeaders: Object.assign({ "X-Wenyazw-Credits": String(left) }, corsHeaders(req))
    });

    if (!result.ok) {
      addCredits(user.email, COST_PER_CALL, "调用失败退回", ip);
      if (!res.headersSent) {
        send(req, res, result.status || 502, {
          ok: false, error: result.error || "站内模型都不可用，请稍后再试",
          credits: creditsOf(user.email)
        });
      }
    }
    return;
  }

  /* 管理：给某个账号加分/扣分。要在 .env 里配 ADMIN_TOKEN 才能用 */
  if (p === "/api/admin/credits" && method === "POST") {
    if (!ADMIN_TOKEN || !safeEqual(req.headers["x-admin-token"] || "", ADMIN_TOKEN)) {
      send(req, res, 403, { ok: false, error: "无权操作" }); return;
    }
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const delta = Math.trunc(Number(body.delta));
    if (!EMAIL_RE.test(email) || !delta || Math.abs(delta) > 10000) {
      send(req, res, 400, { ok: false, error: "email 或 delta 不合法" }); return;
    }
    const left = addCredits(email, delta, String(body.reason || "管理调整"), clientIp(req));
    if (left === null) { send(req, res, 404, { ok: false, error: "账号不存在" }); return; }
    send(req, res, 200, { ok: true, credits: left });
    return;
  }

  /* ---------------- 作文管理（按登录邮箱隔离） ---------------- */

  if (p === "/api/essays" && method === "GET") {
    const user = verifyToken(bearer(req));
    if (!user) { send(req, res, 401, { ok: false, error: "请先登录" }); return; }
    const rows = db.prepare(`
      SELECT id, title, category, province, word_count, created_at, updated_at,
             CASE WHEN length(outline) > 0 THEN 1 ELSE 0 END AS has_outline
      FROM essays WHERE email = ? ORDER BY updated_at DESC LIMIT 200
    `).all(user.email);
    send(req, res, 200, { ok: true, essays: rows });
    return;
  }

  if (p === "/api/essays" && method === "POST") {
    const user = verifyToken(bearer(req));
    if (!user) { send(req, res, 401, { ok: false, error: "请先登录" }); return; }
    const body = await readBody(req);
    const title = String(body.title || "").trim().slice(0, 120) || "无题";
    const text = String(body.body || "").slice(0, 100000);
    const outline = String(body.outline || "").slice(0, 40000);
    if (!text.trim() && !outline.trim()) {
      send(req, res, 400, { ok: false, error: "大纲和正文至少要有一样" });
      return;
    }
    const category = String(body.category || "").trim().slice(0, 40);
    const province = String(body.province || "").trim().slice(0, 40);
    const words = Array.from(text.replace(/\s/g, "")).length;
    const now = new Date().toISOString();
    const id = Number(body.id || 0);
    if (id > 0) {
      const owned = db.prepare("SELECT 1 FROM essays WHERE id = ? AND email = ?").get(id, user.email);
      if (!owned) { send(req, res, 404, { ok: false, error: "作文不存在" }); return; }
      db.prepare(`UPDATE essays SET title = ?, body = ?, outline = ?, category = ?, province = ?,
                  word_count = ?, updated_at = ? WHERE id = ? AND email = ?`)
        .run(title, text, outline, category, province, words, now, id, user.email);
      send(req, res, 200, { ok: true, id, wordCount: words });
      return;
    }
    const info = db.prepare(`INSERT INTO essays
      (email, title, body, outline, category, province, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(user.email, title, text, outline, category, province, words, now, now);
    send(req, res, 200, { ok: true, id: Number(info.lastInsertRowid), wordCount: words });
    return;
  }

  const essayMatch = /^\/api\/essays\/(\d+)$/.exec(p);
  if (essayMatch) {
    const user = verifyToken(bearer(req));
    if (!user) { send(req, res, 401, { ok: false, error: "请先登录" }); return; }
    const id = Number(essayMatch[1]);
    if (method === "GET") {
      const row = db.prepare("SELECT * FROM essays WHERE id = ? AND email = ?").get(id, user.email);
      if (!row) { send(req, res, 404, { ok: false, error: "作文不存在" }); return; }
      send(req, res, 200, { ok: true, essay: row });
      return;
    }
    if (method === "DELETE") {
      const info = db.prepare("DELETE FROM essays WHERE id = ? AND email = ?").run(id, user.email);
      if (!info.changes) { send(req, res, 404, { ok: false, error: "作文不存在" }); return; }
      send(req, res, 200, { ok: true });
      return;
    }
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
