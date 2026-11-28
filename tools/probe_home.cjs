/* 登录主页渲染探测：无头 Edge + CDP。用法：node tools/probe_home.cjs <token>
   WY_BASE 可覆盖站点地址；截图写入 .impeccable/review/。 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const TOKEN = process.argv[2] || '';
const BASE = process.env.WY_BASE || 'https://wenyazw.top';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9531 + Math.floor(Math.random() * 200);
const PROFILE = path.join(os.tmpdir(), 'wy-home-' + Date.now());
const OUT = path.join(process.cwd(), '.impeccable', 'review');

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
  '--no-proxy-server', '--hide-scrollbars', 'about:blank'
], { stdio: 'ignore' });

const get = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

(async () => {
  let tabs;
  for (let i = 0; i < 60; i++) {
    try { tabs = await get('/json/list'); if (tabs && tabs.length) break; } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }
  const tab = tabs.find(t => t.type === 'page' && t.url === 'about:blank') || tabs.find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0;
  const pending = new Map(), logs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push('EXC: ' + ((d.exception && d.exception.description) || d.text));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      logs.push('CONSOLE: ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    }
  };
  const send = (method, params) => new Promise(r => {
    const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result && r.result.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*cdnjs.cloudflare.com*', '*fonts.googleapis.com*'] });
  const WIDTH = Number(process.env.WY_WIDTH || 1440);
  const HEIGHT = Number(process.env.WY_HEIGHT || 1000);
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 700 });

  await send('Page.navigate', { url: BASE + '/' });
  await new Promise(r => setTimeout(r, 2200));
  const injected = await evalJS(`(function(){
    localStorage.setItem('wenyazw.auth.token', ${JSON.stringify(TOKEN)});
    localStorage.setItem('wenyazw.auth.user', 'Cai');
    localStorage.setItem('wenyazw.auth.email', '1784627101@qq.com');
    return localStorage.getItem('wenyazw.auth.token') ? 'yes' : 'no';
  })()`);
  await send('Page.navigate', { url: BASE + '/?homeprobe=' + Date.now() });
  await new Promise(r => setTimeout(r, 4500));

  const state = await evalJS(`(function(){
    var q=function(s){return document.querySelector(s)};
    var chars=document.querySelectorAll('#dashHeroTitle .hero-char');
    var rows=document.querySelectorAll('#dashRecent .dash-row');
    var paper=q('#dashPaper');
    return {
      inject: ${JSON.stringify(injected)},
      loggedIn: !!(window.WY_AUTH && window.WY_AUTH.loggedIn && window.WY_AUTH.loggedIn()),
      homeHidden: q('#viewHome') ? q('#viewHome').hidden : null,
      title: q('#dashHeroTitle') ? q('#dashHeroTitle').textContent : null,
      chars: chars.length,
      sub: q('#dashHeroSub') ? q('#dashHeroSub').textContent : null,
      line: q('#dashHeroLine') ? q('#dashHeroLine').textContent : null,
      resumeHidden: q('#dashResume') ? q('#dashResume').hidden : null,
      paperTitle: q('#dashPaperTitle') ? q('#dashPaperTitle').textContent : null,
      paperWords: q('#dashPaperWords') ? q('#dashPaperWords').textContent : null,
      paperTime: q('#dashPaperTime') ? q('#dashPaperTime').textContent : null,
      paperParas: document.querySelectorAll('#dashPaperBody p').length,
      paperMark: !!q('#dashPaperMark, .dash-paper-mark'),
      paperTransform: paper ? getComputedStyle(paper).transform : null,
      rows: rows.length,
      firstRow: rows[0] ? rows[0].textContent.replace(/\\s+/g,' ').slice(0,120) : null,
      links: document.querySelectorAll('.dash-link[data-action]').length,
      actions: Array.from(document.querySelectorAll('.dash-link[data-action]')).map(function(b){return b.dataset.action;}).join(','),
      reviewHint: q('#dashReviewHint') ? q('#dashReviewHint').textContent : null,
      teacherHidden: q('#dashTeacher') ? q('#dashTeacher').hidden : null,
      docHeight: document.documentElement.scrollHeight
    };
  })()`);
  console.log('STATE=' + JSON.stringify(state, null, 2));
  console.log('LOGS=' + JSON.stringify(logs));

  if (process.env.WY_TEST_ACTIONS === '1') {
    const results = [];
    const cases = [
      ['create', 'viewCreate'], ['derive', 'viewEssays'], ['classify', 'viewEssays'],
      ['topics', 'viewTopics'], ['quotes', 'viewQuotes'], ['mem', 'viewQuotes'],
      ['bank', 'viewQuotes'], ['style', 'viewAccount']
    ];
    for (const [action, view] of cases) {
      await evalJS(`(function(){var h=document.querySelector('.side-item[data-view="home"]');if(h)h.click();var b=document.querySelector('[data-action="${action}"]');if(b)b.click();return 1;})()`);
      await new Promise(r => setTimeout(r, 450));
      const ok = await evalJS(`(function(){var v=document.getElementById('${view}');return v && !v.hidden ? 'ok' : 'hidden';})()`);
      results.push(action + ':' + ok);
    }
    console.log('ACTIONS=' + results.join(' '));
  }

  fs.mkdirSync(OUT, { recursive: true });
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: process.env.WY_FULL === '1'
  });
  if (shot.result && shot.result.data) {
    const base = WIDTH < 700 ? 'mobile' : 'desktop';
    const file = path.join(OUT, process.env.WY_FULL === '1' ? base + '-full.png' : base + '.png');
    fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    console.log('SHOT=' + file);
  }

  ws.close();
  child.kill();
})().catch(e => { console.error('ERR=' + e.message); child.kill(); process.exitCode = 1; });
