/* 渗透自测：用 vm + 轻量 DOM 桩加载真实 home.js，验证"创建作文判断是否派生"的分支。
   不改业务源码，只在内存里给 IIFE 末尾注入测试钩子。 */
const fs = require('fs');
const vm = require('vm');

let code = fs.readFileSync('assets/js/home.js', 'utf8');
const tail = code.lastIndexOf('})();');
if (tail < 0) throw new Error('IIFE tail not found');
const hook = `
window.__test = {
  openCreateSmart: openCreateSmart, skipDerive: skipDerive,
  goNewEssay: goNewEssay, runDerive: runDerive,
  showNoMatch: showNoMatch, hideNoMatch: hideNoMatch,
  getFlag: function(){ return deriveFromCreate; },
  setFlag: function(v){ deriveFromCreate = v; },
  getPending: function(){ return pendingDerive; }
};
`;
code = code.slice(0, tail) + hook + code.slice(tail);

const els = new Map();
function fakeEl(id) {
  return {
    id, value: '', textContent: '', className: '', hidden: false, disabled: false,
    innerHTML: '', children: [], handlers: {}, style: {}, dataset: {},
    addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); },
    removeAttribute(n) { if (n === 'hidden') this.hidden = false; },
    setAttribute(n, v) { if (n === 'hidden') this.hidden = true; },
    getAttribute(n) { return n === 'hidden' ? (this.hidden ? '' : null) : (this[n] || ''); },
    focus() {}, blur() {},
    querySelectorAll() { return []; }, querySelector() { return null; },
    appendChild(c) { this.children.push(c); return c; },
    dispatchEvent() { return true; },
    classList: { add() {}, remove() {}, toggle() {} }
  };
}
const document = {
  readyState: 'complete',
  body: fakeEl('body'), documentElement: fakeEl('html'),
  getElementById(id) { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); },
  querySelectorAll() { return []; },
  addEventListener() {}, createElement(t) { return fakeEl('_' + t); }
};

let logged = false, authCb = null;
const opens = [];
const authStub = {
  loggedIn: () => logged, token: () => 'tok', open: (m) => opens.push(m),
  onChange: (cb) => { authCb = cb; }, refreshCredits() {}, hasPassword: () => true
};
let deriveResp = { ok: true, matched: true, id: 42, title: '派生稿', sourceIds: [1] };
let lastUrl = '';
const fetchCalls = [];
async function fetchStub(url, opt) {
  fetchCalls.push({ url, opt });
  return { ok: true, status: 200, json: async () => deriveResp };
}
const loc = { href: '', pathname: '/index.html', search: '' };
const hist = { replaceState() {} };
const win = {
  WY_AUTH: authStub,
  addEventListener(t, fn) { if (t === 'load') fn(); },   // 触发 load 才会注册 auth onChange
  setTimeout(fn) { fn(); }, location: loc, history: hist
};
const sandbox = {
  window: win, document, location: loc, history: hist,
  fetch: fetchStub, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  console, URLSearchParams, Event: function () {}, JSON, Array, Object, String, Number,
  Math, Date, RegExp, Promise, isFinite, parseInt, encodeURIComponent, decodeURIComponent,
  setTimeout(fn) { fn(); }
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const t = win.__test;
if (!t) throw new Error('test hooks not injected');

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('PASS ' + name)) : (fail++, console.log('FAIL ' + name)); }

(async () => {
  // 1. 未登录点"创建作文"：只弹登录、挂 pending，不直接跳写作页
  logged = false; opens.length = 0; lastUrl = '';
  t.openCreateSmart();
  ok('未登录挂起派生', t.getPending() === true);
  ok('未登录弹登录框', opens.includes('login'));
  ok('未登录不跳转', !loc.href);

  // 2. 登录成功后 onChange 自动续上弹层
  logged = true;
  if (authCb) authCb({ email: 'a@b.c' });
  ok('登录后自动打开派生弹层', document.getElementById('deriveMask').hidden === false);
  ok('登录后 pending 清空', t.getPending() === false);

  // 3. 创建作文入口 + 派生成功：带 id 跳写作页打开派生稿
  t.setFlag(true);
  document.getElementById('deriveTopic').value = '旧物里的光';
  deriveResp = { ok: true, matched: true, id: 42, title: '派生稿', sourceIds: [1] };
  await t.runDerive();
  ok('创建入口派生后打开派生稿', loc.href === 'write.html?essay=42');
  ok('派生后 flag 复位', t.getFlag() === false);
  ok('请求打在 /api/essays/derive', fetchCalls.some(c => c.url === 'https://back.wenyazw.top/api/essays/derive'));

  // 4. 从"我的作文"入口派生成功：不跳转，留原地
  loc.href = ''; t.setFlag(false);
  deriveResp = { ok: true, matched: true, id: 77, title: '派生稿2', sourceIds: [2] };
  await t.runDerive();
  ok('导图入口派生后不跳转', loc.href === '');

  // 5. 没挑到素材：显示"暂无符合"，不跳出，skip 按钮隐藏避免重复
  loc.href = ''; t.setFlag(true);
  deriveResp = { ok: true, matched: false, reason: '旧稿里没有能撑起这个题目的素材', poolCount: 0 };
  await t.runDerive();
  ok('无素材显示暂无符合', document.getElementById('deriveNoMatch').hidden === false);
  ok('无素材不跳出', loc.href === '');
  ok('无素材时隐藏重复跳过按钮', document.getElementById('deriveSkipBtn').hidden === true);

  // 6. 无素材后点"写新文"：带题目进全新流程，flag 复位
  document.getElementById('deriveTopic').value = '雨中的伞';
  t.goNewEssay();
  ok('写新文带题目进向导', loc.href === 'write.html?new=1&topic=' + encodeURIComponent('雨中的伞'));
  ok('写新文 flag 复位', t.getFlag() === false);

  // 7. 明确不派生：跳过判断直接进新文
  loc.href = ''; t.setFlag(true);
  t.skipDerive();
  ok('跳过派生直接新文', loc.href === 'write.html?new=1');
  ok('跳过派生 flag 复位', t.getFlag() === false);

  // 8. 派生成功但后端没给 id：不跳到 ?essay=undefined
  loc.href = ''; t.setFlag(true);
  deriveResp = { ok: true, matched: true, title: '无 id' };
  await t.runDerive();
  ok('缺 id 不跳 undefined', loc.href === '');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
