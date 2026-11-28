/* 无头 Edge：实测未登录落地页渲染与 JS 异常。只读。 */
const { spawn } = require("child_process");
const http = require("http");
const os = require("os");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9499 + Math.floor(Math.random() * 200);
const PROFILE = path.join(os.tmpdir(), "wy-lp-" + Date.now());

function get(p) {
  return new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port: PORT, path: p }, r => {
      let d = ""; r.on("data", c => d += c); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on("error", rej);
  });
}

(async () => {
  const e = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + PROFILE, "--no-proxy-server", "about:blank"
  ], { stdio: "ignore" });
  try {
    let tabs;
    for (let i = 0; i < 40; i++) {
      try { tabs = await get("/json/list"); if (tabs && tabs.length) break; } catch (x) {}
      await new Promise(r => setTimeout(r, 250));
    }
    const tab = tabs.find(t => t.type === "page" && t.url === "about:blank") || tabs.find(t => t.type === "page");
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0;
    const pend = new Map(), logs = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
      if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        logs.push("EXC: " + ((d.exception && d.exception.description) || d.text));
      }
    };
    const send = (method, params) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Network.enable");
    await send("Network.setBlockedURLs", { urls: ["*cdnjs.cloudflare.com*"] });
    await send("Page.navigate", { url: "https://wenyazw.top/?probe=" + Date.now() });
    await new Promise(r => setTimeout(r, 5000));
    const expr = "(function(){var q=function(s){return document.querySelector(s)};return {title:document.title,hero:!!q('.lp-hero'),paper:!!q('.lp-paper'),flow:document.querySelectorAll('.lp-flow-list li').length,entries:document.querySelectorAll('.lp-entry, .lp-entry-list button').length,cta:!!q('#homeCta'),guestShown:q('#guestView')?!q('#guestView').hidden:null,shellHidden:q('#appShell')?q('#appShell').hidden:null,teacherHidden:q('#lpTeacherLink')?q('#lpTeacherLink').hidden:null};})()";
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    console.log("LANDING=" + JSON.stringify(r.result.result.value));
    console.log("LOGS=" + JSON.stringify(logs));
    ws.close();
  } finally {
    try { e.kill(); } catch (x) {}
  }
})().catch(x => { console.error("ERR=" + x.message); process.exit(1); });
