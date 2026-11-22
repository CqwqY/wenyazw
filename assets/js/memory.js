/* 文芽作文 - 记一记（记忆模式）
   数据：优先从后端 /api/wordbank 读数据盘上的词库；挂了就退回本地名言库。
   进度：localStorage，按条目记熟练度与下次复习日期；不上传、不扣积分。
   流程：认读两遍 → 挖空选择 → 排序成句 → 隔天复习。 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  var STORE_KEY = "wy.memory.v1";
  var STEP_MS = 600;          // 长按判定时长
  var INTERVALS = [1, 2, 4, 7, 15, 30];   // 熟练度→间隔天数
  var PASS_TIMES = 2;         // 认读循环两遍
  var BATCH = 10;             // 一轮取多少条

  function $(id) { return document.getElementById(id); }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dayOffset(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  var els = {};
  var bank = [];              // 全部条目
  var themes = [];
  var progress = {};          // { [id]: { box:int, due:"YYYY-MM-DD", seen:int } }
  var state = null;           // 当前一轮状态
  var soundOn = true;

  /* ---------------- 进度 ---------------- */
  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var j = raw ? JSON.parse(raw) : null;
      progress = (j && typeof j === "object" && !Array.isArray(j)) ? j : {};
    } catch (e) { progress = {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* 无痕模式忽略 */ }
  }
  function mark(id, ok) {
    var p = progress[id] || { box: 0, due: today(), seen: 0 };
    p.seen = (p.seen || 0) + 1;
    p.box = ok ? Math.min((p.box || 0) + 1, INTERVALS.length - 1) : 0;
    p.due = dayOffset(INTERVALS[p.box]);
    progress[id] = p;
    saveProgress();
  }
  function dueList() {
    var t = today();
    return bank.filter(function (it) {
      var p = progress[it.id];
      return p && p.due && p.due <= t;
    });
  }

  /* ---------------- 词库加载 ---------------- */
  function endpoint() {
    try {
      var a = window.WY_AUTH;
      if (a && a.endpoint) return String(a.endpoint()).replace(/\/+$/, "");
    } catch (e) { /* 忽略 */ }
    return API;
  }

  function localFallback() {
    var out = [];
    var quotes = Array.isArray(window.WY_QUOTES) ? window.WY_QUOTES : [];
    quotes.forEach(function (r, i) {
      if (r && r[1]) out.push({ id: "lq" + i, kind: "quote", theme: r[0] || "其他", text: r[1], source: r[2] || "" });
    });
    return out;
  }

  async function loadBank() {
    try {
      var res = await fetch(endpoint() + "/api/wordbank", { method: "GET" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var j = await res.json();
      if (!j || !j.ok || !Array.isArray(j.items) || !j.items.length) throw new Error("空词库");
      return j.items;
    } catch (e) {
      var local = localFallback();
      if (els.memCount) els.memCount.textContent = "词库暂没连上，先用本地 " + local.length + " 条";
      return local;
    }
  }

  /* ---------------- 朗读 ---------------- */
  function speak(text) {
    if (!soundOn) return;
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 0.85;
      var voices = window.speechSynthesis.getVoices() || [];
      var zh = voices.filter(function (v) { return /^zh/i.test(v.lang || ""); })[0];
      if (zh) u.voice = zh;
      window.speechSynthesis.speak(u);
    } catch (e) { /* 不支持朗读就跳过，不影响记忆 */ }
  }
  function stopSpeak() {
    try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 挖空/排序题生成 ---------------- */
  // 从文本里挑一段连续片段挖空：优先 2～5 字的成语核心或句子短语
  function blankPart(text) {
    var s = String(text || "").replace(/[。！？!?，,；;：:]/g, " ");
    var parts = s.split(/\s+/).filter(function (x) { return x.length >= 2; });
    if (!parts.length) parts = [String(text || "").slice(0, 4)];
    var cand = parts.filter(function (x) { return x.length <= 6; });
    var src = (cand.length ? cand : parts)[0] || "";
    if (src.length > 5) src = src.slice(0, 5);
    if (src.length < 2) src = String(text || "").slice(0, 2);
    return src;
  }

  function makeCloze(item, pool) {
    var ans = blankPart(item.text);
    var text = String(item.text);
    var idx = text.indexOf(ans);
    var shown = idx >= 0 ? (text.slice(0, idx) + "＿＿" + text.slice(idx + ans.length)) : text;
    var distract = [];
    pool.forEach(function (x) {
      if (distract.length >= 9) return;
      var p = blankPart(x.text);
      if (p !== ans && distract.indexOf(p) < 0) distract.push(p);
    });
    var opts = shuffle([ans].concat(shuffle(distract).slice(0, 3)));
    return { shown: shown, answer: ans, options: opts };
  }

  // 排序：按字/短词切片，打乱后点选还原
  function makeOrder(item) {
    var text = String(item.text || "");
    var segs = [];
    var buf = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      buf += ch;
      if (/[，。！？、；：,!?;:]$/.test(ch) || buf.length >= 4) {
        segs.push(buf); buf = "";
      }
    }
    if (buf) segs.push(buf);
    if (segs.length < 2) {
      segs = text.split("");
    }
    var order = segs.map(function (_, i) { return i; });
    var shuffled = shuffle(order);
    return { segs: segs, shuffled: shuffled, picked: [] };
  }

  /* ---------------- 一轮流程 ---------------- */
  function startSession(items, mode) {
    if (!items || !items.length) return;
    state = {
      items: items.slice(0, BATCH),
      mode: mode || "new",     // new | review
      stage: "read",
      idx: 0,
      pass: 0,
      sound: soundOn,
      results: []
    };
    els.memMask.hidden = false;
    document.body.classList.add("mem-open");
    renderStep();
  }

  function endSession() {
    stopSpeak();
    state = null;
    els.memMask.hidden = true;
    document.body.classList.remove("mem-open");
    refreshHome();
  }

  function renderStep() {
    if (!state) return;
    var s = state;
    var item = s.items[s.idx];
    if (!item) { finish(); return; }
    var labels = { read: "读两遍", cloze: "挖空选词", order: "排序成句" };
    els.memPhase.textContent = s.mode === "review" ? ("复习 · " + labels[s.stage]) : labels[s.stage];
    els.memProgress.textContent = (s.idx + 1) + " / " + s.items.length + (s.stage === "read" ? (" · 第 " + (s.pass + 1) + " 遍") : "");
    els.memDots.innerHTML = "";
    ["read", "cloze", "order"].forEach(function (k) {
      var d = document.createElement("span");
      d.className = "mem-dot" + (k === s.stage ? " is-on" : "");
      els.memDots.appendChild(d);
    });
    ["memReadPanel", "memClozePanel", "memOrderPanel", "memDonePanel"].forEach(function (id) { els[id].hidden = true; });
    if (s.stage === "read") renderRead(item);
    else if (s.stage === "cloze") renderCloze(item);
    else if (s.stage === "order") renderOrder(item);
  }

  function renderRead(item) {
    els.memReadPanel.hidden = false;
    els.memCardText.textContent = item.text;
    els.memCardHint.textContent = item.kind === "idiom"
      ? (item.meaning || "成语")
      : (item.source || "名言警句");
    els.memReadTip.textContent = "点卡片下一条 · 长按重听 · 空格键也可以";
    speak(item.text);
  }

  function nextRead(replayOnly) {
    if (!state) return;
    if (replayOnly) { speak(state.items[state.idx].text); return; }
    stopSpeak();
    state.idx++;
    if (state.idx >= state.items.length) {
      state.pass++;
      state.idx = 0;
      if (state.pass < PASS_TIMES) {
        renderStep();
        return;
      }
      state.stage = "cloze";
      state.idx = 0;
      state.pass = 0;
    }
    renderStep();
  }

  function renderCloze(item) {
    els.memClozePanel.hidden = false;
    var q = makeCloze(item, bank);
    state.current = q;
    els.memClozeText.textContent = q.shown;
    els.memClozeHint.textContent = item.kind === "idiom"
      ? (item.meaning || "成语")
      : (item.source || "名言警句");
    els.memOptions.innerHTML = "";
    els.memClozeFeedback.textContent = "";
    els.memClozeFeedback.className = "mem-feedback";
    q.options.forEach(function (opt) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mem-option";
      b.textContent = opt;
      b.addEventListener("click", function () {
        var ok = opt === q.answer;
        mark(item.id, ok);
        state.results.push(ok);
        els.memClozeFeedback.textContent = ok ? "对了" : ("答案是「" + q.answer + "」");
        els.memClozeFeedback.className = "mem-feedback " + (ok ? "ok" : "no");
        Array.prototype.forEach.call(els.memOptions.children, function (x) { x.disabled = true; });
        speak(item.text);
        var cur = state;
        setTimeout(function () {
          if (state !== cur) return;   // 已退出或重开，丢弃这次延时
          state.idx++;
          if (state.idx >= state.items.length) {
            state.stage = "order"; state.idx = 0;
          }
          renderStep();
        }, ok ? 700 : 1300);
      });
      els.memOptions.appendChild(b);
    });
  }

  function renderOrder(item) {
    els.memOrderPanel.hidden = false;
    var q = makeOrder(item);
    state.current = q;
    els.memOrderFeedback.textContent = "";
    els.memOrderFeedback.className = "mem-feedback";
    drawOrder();
  }

  function drawOrder() {
    var q = state.current;
    els.memOrderSlots.innerHTML = "";
    q.picked.forEach(function (i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "mem-tile is-picked"; b.textContent = q.segs[i];
      b.addEventListener("click", function () {
        q.picked.pop();
        drawOrder();
      });
      els.memOrderSlots.appendChild(b);
    });
    els.memOrderBank.innerHTML = "";
    q.shuffled.forEach(function (i) {
      if (q.picked.indexOf(i) >= 0) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "mem-tile"; b.textContent = q.segs[i];
      b.addEventListener("click", function () {
        q.picked.push(i);
        drawOrder();
        if (q.picked.length === q.segs.length) checkOrder();
      });
      els.memOrderBank.appendChild(b);
    });
  }

  function checkOrder() {
    var q = state.current;
    var item = state.items[state.idx];
    var ok = q.picked.every(function (v, i) { return v === i; });
    mark(item.id, ok);
    state.results.push(ok);
    els.memOrderFeedback.textContent = ok ? "拼对了" : ("原句是：" + item.text);
    els.memOrderFeedback.className = "mem-feedback " + (ok ? "ok" : "no");
    speak(item.text);
    var cur = state;
    setTimeout(function () {
      if (state !== cur) return;
      state.idx++;
      if (state.idx >= state.items.length) finish();
      else renderStep();
    }, ok ? 800 : 1500);
  }

  function finish() {
    var s = state;
    var right = s.results.filter(Boolean).length;
    var total = s.results.length || 1;
    stopSpeak();
    s.stage = "done";
    ["memReadPanel", "memClozePanel", "memOrderPanel"].forEach(function (id) { els[id].hidden = true; });
    els.memDonePanel.hidden = false;
    els.memPhase.textContent = "完成";
    els.memProgress.textContent = "";
    els.memDots.innerHTML = "";
    els.memDoneLine.textContent = "这一轮答对 " + right + " / " + total + " 题";
    els.memDoneSub.textContent = right === total
      ? "全对，隔天再来一遍就更牢了。"
      : "错的地方明天会排进复习，再来一次就行。";
  }

  /* ---------------- 主页（设置区） ---------------- */
  var filter = { kind: "all", theme: "all" };

  function refreshHome() {
    if (!els.memCount) return;
    els.memCount.textContent = "词库 " + bank.length + " 条";
    var due = dueList();
    if (due.length) {
      els.memDue.hidden = false;
      els.memDueTitle.textContent = "有 " + due.length + " 条要复习";
      els.memDueDesc.textContent = "昨天及以前学过的，先过一遍再学新的。";
      if (els.sideDueTag) els.sideDueTag.hidden = false;
    } else {
      els.memDue.hidden = true;
      if (els.sideDueTag) els.sideDueTag.hidden = true;
    }
    updatePick();
  }

  function filtered() {
    return bank.filter(function (it) {
      if (filter.kind !== "all" && it.kind !== filter.kind) return false;
      if (filter.theme !== "all" && it.theme !== filter.theme) return false;
      return true;
    });
  }

  function updatePick() {
    var list = filtered();
    if (els.memPickTitle) els.memPickTitle.textContent = "已选 " + list.length + " 条，开始记一记";
    if (els.memStartBtn) {
      els.memStartBtn.disabled = list.length < 2;
      els.memStartBtn.textContent = list.length < 2 ? "至少选 2 条" : "开始记一记";
    }
  }

  function renderThemes() {
    if (!els.memThemeChips) return;
    els.memThemeChips.innerHTML = "";
    var names = ["all"].concat(themes);
    names.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mem-chip" + (t === filter.theme ? " is-on" : "");
      b.textContent = t === "all" ? "全部主题" : t;
      b.addEventListener("click", function () {
        filter.theme = t;
        Array.prototype.forEach.call(els.memThemeChips.children, function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
        updatePick();
      });
      els.memThemeChips.appendChild(b);
    });
  }

  function initHome() {
    themes = [];
    bank.forEach(function (it) { if (it.theme && themes.indexOf(it.theme) < 0) themes.push(it.theme); });
    renderThemes();
    Array.prototype.forEach.call(els.memKindChips.children, function (b) {
      b.addEventListener("click", function () {
        filter.kind = b.getAttribute("data-kind");
        Array.prototype.forEach.call(els.memKindChips.children, function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
        updatePick();
      });
    });
    if (els.memStartBtn) {
      els.memStartBtn.addEventListener("click", function () {
        var list = shuffle(filtered());
        if (list.length >= 2) startSession(list, "new");
      });
    }
    if (els.memReviewBtn) {
      els.memReviewBtn.addEventListener("click", function () {
        var list = shuffle(dueList());
        if (list.length >= 2) startSession(list, "review");
        else if (list.length) startSession(list, "review");
      });
    }
    refreshHome();
  }

  /* ---------------- 事件 ---------------- */
  function bindStage() {
    if (els.memExitBtn) els.memExitBtn.addEventListener("click", endSession);
    if (els.memDoneBtn) els.memDoneBtn.addEventListener("click", endSession);
    if (els.memNextBtn) els.memNextBtn.addEventListener("click", function () { nextRead(false); });
    if (els.memReplayBtn) els.memReplayBtn.addEventListener("click", function () { nextRead(true); });
    if (els.memSoundBtn) {
      els.memSoundBtn.addEventListener("click", function () {
        soundOn = !soundOn;
        els.memSoundBtn.textContent = "声音：" + (soundOn ? "开" : "关");
        if (!soundOn) stopSpeak();
      });
    }
    // 卡片：点击下一条，长按重听
    if (els.memCard) {
      var timer = 0, longFired = false;
      els.memCard.addEventListener("pointerdown", function () {
        longFired = false;
        timer = setTimeout(function () { longFired = true; nextRead(true); }, STEP_MS);
      });
      function clearTimer() { if (timer) { clearTimeout(timer); timer = 0; } }
      els.memCard.addEventListener("pointerup", function () {
        clearTimer();
        if (!longFired) nextRead(false);
      });
      els.memCard.addEventListener("pointercancel", clearTimer);
      els.memCard.addEventListener("pointerleave", clearTimer);
    }
    document.addEventListener("keydown", function (e) {
      if (!state || els.memMask.hidden) return;
      if (e.key === "Escape") { endSession(); return; }
      if (state.stage === "read" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault(); nextRead(false);
      }
    });
  }

  async function boot() {
    els = {
      memCount: $("memCount"), memDue: $("memDue"), memDueTitle: $("memDueTitle"),
      memDueDesc: $("memDueDesc"), memReviewBtn: $("memReviewBtn"),
      memKindChips: $("memKindChips"), memThemeChips: $("memThemeChips"),
      memPickTitle: $("memPickTitle"), memStartBtn: $("memStartBtn"), sideDueTag: $("sideDueTag"),
      memMask: $("memMask"), memPhase: $("memPhase"), memProgress: $("memProgress"),
      memSoundBtn: $("memSoundBtn"), memExitBtn: $("memExitBtn"), memDots: $("memDots"),
      memReadPanel: $("memReadPanel"), memCard: $("memCard"), memCardText: $("memCardText"),
      memCardHint: $("memCardHint"), memReadTip: $("memReadTip"),
      memReplayBtn: $("memReplayBtn"), memNextBtn: $("memNextBtn"),
      memClozePanel: $("memClozePanel"), memClozeText: $("memClozeText"), memClozeHint: $("memClozeHint"),
      memOptions: $("memOptions"), memClozeFeedback: $("memClozeFeedback"),
      memOrderPanel: $("memOrderPanel"), memOrderSlots: $("memOrderSlots"),
      memOrderBank: $("memOrderBank"), memOrderFeedback: $("memOrderFeedback"),
      memOrderReset: $("memOrderReset"), memDonePanel: $("memDonePanel"),
      memDoneLine: $("memDoneLine"), memDoneSub: $("memDoneSub"), memDoneBtn: $("memDoneBtn")
    };
    loadProgress();
    bindStage();
    if (els.memOrderReset) {
      els.memOrderReset.addEventListener("click", function () {
        if (!state || !state.current || state.stage !== "order") return;
        state.current.picked = [];
        drawOrder();
      });
    }
    bank = await loadBank();
    initHome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
