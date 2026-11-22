/* 记忆模块纯逻辑自测：从 memory.js 中抽取函数，用最少桩跑断言。 */
const fs = require('fs');
const src = fs.readFileSync('assets/js/memory.js', 'utf8');

function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unclosed ' + name);
}

const names = ['clampBatch', 'mergeProgress', 'mergeLogs', 'logKey', 'blankPart', 'makeCloze', 'makeOrder', 'shuffle'];
const code = 'const MAX_LOGS = 120;\n' + names.map(extract).join('\n') + '\nmodule.exports={' + names.join(',') + '};';
const mod = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);
const f = mod.exports;

function eq(a, b, label) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(label + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b));
  console.log('OK', label);
}

eq(f.clampBatch(0), 5, 'batch default');
eq(f.clampBatch(99), 20, 'batch upper bound');
eq(f.clampBatch(-3), 5, 'batch lower bound');
eq(f.clampBatch('4'), 4, 'batch string');

const newer = { ts: 200, box: 3, due: '2026-11-24', seen: 4 };
const older = { ts: 100, box: 1, due: '2026-11-23', seen: 2 };
eq(f.mergeProgress({ a: older }, { a: newer }).a.box, 3, 'cloud newer wins');
eq(f.mergeProgress({ a: newer }, { a: older }).a.box, 3, 'local newer wins');
eq(Object.keys(f.mergeProgress({ a: older }, { a: newer })).length, 1, 'merge key count');

const logs = [{ id: 'q1', mode: 'cloze', at: 100, ok: true }, { id: 'q1', mode: 'cloze', at: 100, ok: true }, { id: 'q1', mode: 'order', at: 200, ok: false }];
eq(f.mergeLogs(logs, []).length, 2, 'log dedupe');
eq(f.mergeLogs(logs, [])[0].at, 200, 'log sorted desc');

const idiom = { id: 'i1', kind: 'idiom', text: '破釜沉舟', meaning: '下定决心，不留退路' };
const pool = [idiom,
  { id: 'i2', kind: 'idiom', text: '卧薪尝胆', meaning: '刻苦自励' },
  { id: 'i3', kind: 'idiom', text: '背水一战', meaning: '绝境求胜' },
  { id: 'i4', kind: 'idiom', text: '水滴石穿', meaning: '坚持见效' },
  { id: 'q1', kind: 'quote', text: '海内存知己，天涯若比邻。', source: '王勃' },
  { id: 'q2', kind: 'quote', text: '千里之行，始于足下。', source: '老子' },
  { id: 'q3', kind: 'quote', text: '志当存高远。', source: '诸葛亮' },
  { id: 'q4', kind: 'quote', text: '读书破万卷，下笔如有神。', source: '杜甫' }];
const q = f.makeCloze(idiom, pool);
eq(q.meaningMode, true, 'idiom cloze by meaning');
eq(q.shown, idiom.meaning, 'idiom cloze shown');
if (q.options.indexOf('破釜沉舟') < 0 || q.options.length !== 4) throw new Error('idiom options bad');
console.log('OK idiom options', q.options.join('/'));

const q2 = f.makeCloze(pool[4], pool);
eq(q2.meaningMode, false, 'quote cloze by blank');
if (q2.shown.indexOf('＿＿') < 0) throw new Error('quote blank missing');
console.log('OK quote cloze', q2.shown, q2.options.join('/'));

const ord = f.makeOrder(idiom);
eq(ord.segs.length, 4, 'idiom order tiles');
const ord2 = f.makeOrder(pool[4]);
if (ord2.segs.length < 2) throw new Error('quote order tiles bad');
console.log('OK quote order tiles', ord2.segs.join('|'));
// 错题重测：错的条目挪到队尾，直到答对才出队
function answer(queue, ok) {
  if (ok) return queue.shift();
  queue.push(queue.shift());
  return null;
}
let cloze = ['a', 'b'];
eq(answer(cloze, false), null, 'wrong answer does not leave queue');
eq(cloze.join(','), 'b,a', 'wrong answer moves to tail');
eq(answer(cloze, true), 'b', 'correct answer leaves queue');
eq(cloze.join(','), 'a', 'retry item still queued');
let single = ['a'];
answer(single, false);
answer(single, false);
eq(single.join(','), 'a', 'single wrong item stays until correct');
eq(answer(single, true), 'a', 'single item finally passes');
eq(single.length, 0, 'queue empty after pass');
console.log('ALL MEMORY LOGIC TESTS PASSED');
