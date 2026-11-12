/* 文芽作文 - 发信模块
 * 零第三方依赖：Node 内置 tls 直连 SMTP 465(隐式 TLS)，实现 AUTH LOGIN + DATA。
 * 配置从 data/mail.json 读取（该文件不入库，权限 600）。
 */
"use strict";

const tls = require("node:tls");
const fs = require("node:fs");
const path = require("node:path");

const CONFIG_FILE = process.env.MAIL_CONFIG || path.join(__dirname, "data", "mail.json");

function loadConfig() {
  const c = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  if (!c.host || !c.user || !c.pass) throw new Error("发信配置不完整");
  return c;
}

function b64(s) { return Buffer.from(s, "utf8").toString("base64"); }

function mimeWord(s) { return "=?UTF-8?B?" + b64(s) + "?="; }

function wrap76(s) { return s.replace(/(.{1,76})/g, "$1\r\n").replace(/\r\n$/, ""); }

/* 一个极简 SMTP 会话客户端：按 \r\n 收行，最后一行为 "NNN " 视为响应结束 */
class SmtpSession {
  constructor(socket, timeoutMs) {
    this.sock = socket;
    this.buf = "";
    this.pending = null;
    this.timeoutMs = timeoutMs || 15000;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => this._onData(chunk));
    socket.on("error", (e) => this._fail(e));
    socket.on("close", () => this._fail(new Error("连接被关闭")));
  }

  _fail(e) {
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      clearTimeout(p.timer);
      p.reject(e);
    }
  }

  _onData(chunk) {
    this.buf += chunk;
    if (!this.pending) return;
    const lines = this.buf.split("\r\n").filter((l) => l.length > 0);
    if (!lines.length) return;
    const last = lines[lines.length - 1];
    const m = /^(\d{3}) (.*)$/.exec(last);
    if (!m) return; // 多行响应尚未结束（中间行形如 250-xxx）
    this.buf = "";
    const p = this.pending;
    this.pending = null;
    clearTimeout(p.timer);
    p.resolve({ code: Number(m[1]), lines });
  }

  response() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error("SMTP 响应超时"));
      }, this.timeoutMs);
      this.pending = { resolve, reject, timer };
      // 有可能在注册监听前数据已到，主动检查一次
      this._onData("");
    });
  }

  async command(cmd, expect) {
    if (cmd !== null) this.sock.write(cmd + "\r\n");
    const r = await this.response();
    if (expect && r.code !== expect) {
      throw new Error("SMTP " + cmd + " 返回 " + r.code + "：" + r.lines.join(" | "));
    }
    return r;
  }
}

function connect(cfg) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({
      host: cfg.host,
      port: cfg.port || 465,
      servername: cfg.host,
      rejectUnauthorized: true
    });
    const onErr = (e) => { cleanup(); reject(e); };
    const onConnect = () => { cleanup(); resolve(new SmtpSession(sock)); };
    const timer = setTimeout(() => { cleanup(); sock.destroy(); reject(new Error("SMTP 连接超时")); }, 15000);
    function cleanup() {
      clearTimeout(timer);
      sock.removeListener("secureConnect", onConnect);
      sock.removeListener("error", onErr);
    }
    sock.once("secureConnect", onConnect);
    sock.once("error", onErr);
  });
}

function buildMessage(cfg, to, subject, text) {
  const from = cfg.fromName ? (mimeWord(cfg.fromName) + " <" + cfg.user + ">") : ("<" + cfg.user + ">");
  const headers = [
    "From: " + from,
    "To: <" + to + ">",
    "Subject: " + mimeWord(subject),
    "Date: " + new Date().toUTCString(),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(text.replace(/\r?\n/g, "\r\n"))),
    ""
  ];
  // DATA 里行首的点需要转义
  return headers.join("\r\n").replace(/^\./gm, "..");
}

async function sendMail(to, subject, text) {
  const cfg = loadConfig();
  const s = await connect(cfg);
  try {
    await s.command(null, 220);
    const ehlo = await s.command("EHLO localhost", 250);
    // 若服务端不支持 AUTH LOGIN，直接报错
    if (!ehlo.lines.join(" ").toUpperCase().includes("AUTH")) {
      throw new Error("服务端未声明 AUTH 支持");
    }
    await s.command("AUTH LOGIN", 334);
    await s.command(b64(cfg.user), 334);
    await s.command(b64(cfg.pass), 235);
    await s.command("MAIL FROM:<" + cfg.user + ">", 250);
    await s.command("RCPT TO:<" + to + ">", 250);
    await s.command("DATA", 354);
    s.sock.write(buildMessage(cfg, to, subject, text) + "\r\n.\r\n");
    await s.command(null, 250);
    await s.command("QUIT", 221).catch(() => {});
    return true;
  } finally {
    s.sock.destroy();
  }
}

module.exports = { sendMail, loadConfig };
