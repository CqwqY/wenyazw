/* 无头 Edge：实测登录态主页渲染。只读。
   用法: WY_BASE=http://127.0.0.1:8100 node tools/probe_dashboard.cjs <token> */
const { spawn } = require("child_process");
const http = require("http");
const os = require("os");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9600 + Math.floor(Math.random() * 200);
const PROFILE = path.join(os.tmpdir(), "wy-dash-" + Date.now());
const BASE = process.env.WY_BASE || "https://wenyazw.top";
const TOKEN = process.argv[2] || "";

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
    const evalJS = async expr => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Network.enable");
    await send("Network.setBlockedURLs", { urls: ["*cdnjs.cloudflare.com*"] });

    // 加载一次拿域，注入 token，再重载
    await send("Page.navigate", { url: BASE + "/" });
    await new Promise(r => setTimeout(r, 2000));
    await evalJS(`(function(){localStorage.setItem("wenyazw.auth.token",${JSON.stringify(TOKEN)});localStorage.setItem("wenyazw.auth.user","Cai");localStorage.setItem("wenyazw.auth.email","1784627101@qq.com");return 1;})()`);
    await send("Page.navigate", { url: BASE + "/?dashprobe=" + Date.now() });
    await new Promise(r => setTimeout(r, 5000));

    const state = await evalJS(`(function(){
      var q=function(id){return document.getElementById(id)};
      var vis=function(id){var e=q(id);return e?{hidden:e.hidden,disp:getComputedStyle(e).display}:null};
      return {href:location.href,loggedIn:!!(window.WY_AUTH&&window.WY_AUTH.loggedIn()),
        home:vis("viewHome"), essays:vis("viewEssays"),
        greet:q("dashGreet")?q("dashGreet").textContent:null,
        credits:q("dashCredits")?q("dashCredits").textContent:null,
        count:q("dashEssayCount")?q("dashEssayCount").textContent:null,
        words:q("dashWordCount")?q("dashWordCount").textContent:null,
        boards:q("dashBoardCount")?q("dashBoardCount").textContent:null,
        recentCards:document.querySelectorAll("#dashRecent .dash-card").length,
        recentText:q("dashRecent")?q("dashRecent").textContent.slice(0,80):null,
        entries:document.querySelectorAll(".dash-entry").length,
        teacherHidden:q("dashTeacher")?q("dashTeacher").hidden:null,
        sideHomeActive:(function(){var b=document.querySelector('.side-item[data-view=\"home\"]');return b?b.classList.contains('active'):null;})()};
    })()`);
    console.log("DASH=" + JSON.stringify(state));

    // 点「写篇新作文」，验证切到 create 视图
    await evalJS(`(function(){var b=document.getElementById("dashStart");if(b)b.click();return 1;})()`);
    await new Promise(r => setTimeout(r, 600));
    const after = await evalJS(`(function(){var h=document.getElementById("viewHome"),c=document.getElementById("viewCreate");return {homeHidden:h?h.hidden:null,createHidden:c?c.hidden:null,hash:location.hash};})()`);
    console.log("AFTER_CTA=" + JSON.stringify(after));
    console.log("LOGS=" + JSON.stringify(logs));
    ws.close();
  } finally {
    try { e.kill(); } catch (x) {}
  }
})().catch(x => { console.error("ERR=" + x.message); process.exit(1); });
