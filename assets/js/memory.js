/* 文芽作文 - 金句与成语 / 记一记
   词库：服务器数据盘 /api/wordbank，断网退回本地名言库。
   进度：登录后存云端 /api/memory/sync，本地留一份镜像；未登录只存本机。
   流程：认读两遍 → 主动回想 → 挖空选择 → 排序成句 → 隔天复习。 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  var STORE_KEY = "wy.memory.v2";
  var OLD_STORE_KEY = "wy.memory.v1";
  var LOG_KEY = "wy.memory.logs.v1";
  var STEP_MS = 600;                    // 长按判定时长
  var INTERVALS = [1, 2, 4, 7, 15, 30]; // 熟练度→间隔天数
  var PASS_TIMES = 2;
  var MAX_LOGS = 120;

  function $(id) { return document.getElementById(id); }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function clampBatch(v) {
    var n = Math.trunc(Number(v || 0));
    if (!isFinite(n) || n < 1) return 5;
    return Math.max(1, Math.min(20, n));
  }
  function stamp(n) {
    if (!n) return "";
    var d = new Date(Number(n));
    if (isNaN(d.getTime())) return "";
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
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
  var bank = [];
  var themes = [];
  var progress = {};                    // { [id]: { box, due, seen, ts } }
  var settings = { batch: 5 };
  var logs = [];                        // 最近学习记录
  var pendingLogs = [];                 // 还没同步上云的记录
  var state = null;                     // 当前一轮
  var soundOn = true;
  var cloudOn = false;
  var syncing = false;
  var syncTimer = 0;
  var filter = { kind: "all", theme: "all" };
  var qFilter = "";
  var qLimit = 40;

  /* ---------------- 账号与接口 ---------------- */
  function endpoint() {
    try {
      var a = window.WY_AUTH;
      if (a && a.endpoint) return String(a.endpoint()).replace(/\/+$/, "");
    } catch (e) { /* 忽略 */ }
    return API;
  }
  function loggedIn() {
    try { return !!(window.WY_AUTH && window.WY_AUTH.loggedIn() && window.WY_AUTH.token()); }
    catch (e) { return false; }
  }
  function authHeaders() {
    return { "Content-Type": "application/json", "Authorization": "Bearer " + (window.WY_AUTH && window.WY_AUTH.token()) };
  }

  /* ---------------- 本地镜像 ---------------- */
  function readJSON(key) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function writeJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 无痕模式忽略 */ }
  }
  function saveLocal() {
    writeJSON(STORE_KEY, { progress: progress, settings: settings, pending: pendingLogs });
    writeJSON(LOG_KEY, logs.slice(0, MAX_LOGS));
  }
  function loadLocal() {
    var saved = readJSON(STORE_KEY);
    if (!saved) {
      var old = readJSON(OLD_STORE_KEY);
      if (old && typeof old === "object" && !Array.isArray(old)) saved = { progress: old, settings: { batch: 5 } };
    }
    progress = (saved && saved.progress && typeof saved.progress === "object" && !Array.isArray(saved.progress))
      ? saved.progress : {};
    settings.batch = clampBatch(saved && saved.settings && saved.settings.batch);
    pendingLogs = (saved && Array.isArray(saved.pending)) ? saved.pending.slice(-200) : [];
    var ls = readJSON(LOG_KEY);
    logs = Array.isArray(ls) ? ls.slice(0, MAX_LOGS) : [];
  }
  function mergeProgress(a, b) {
    var out = {};
    var ia = (a && typeof a === "object") ? a : {};
    var ib = (b && typeof b === "object") ? b : {};
    Object.keys(ia).forEach(function (k) { if (ia[k] && typeof ia[k] === "object") out[k] = ia[k]; });
    Object.keys(ib).forEach(function (k) {
      var nb = ib[k];
      if (!nb || typeof nb !== "object" || Array.isArray(nb)) return;
      var ob = out[k];
      if (!ob || Number(nb.ts || 0) >= Number(ob.ts || 0)) out[k] = nb;
    });
    return out;
  }
  function logKey(v) { return [v.id, v.mode, v.at].join("|"); }
  function mergeLogs(a, b) {
    var seen = {}, out = [];
    ([]).concat(a || [], b || []).forEach(function (v) {
      if (!v || typeof v !== "object") return;
      var k = logKey(v);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(v);
    });
    out.sort(function (x, y) { return Number(y.at || 0) - Number(x.at || 0); });
    return out.slice(0, MAX_LOGS);
  }

  function syncNote(text) {
    if (els.memSyncNote) els.memSyncNote.textContent = text;
  }
  function updateSyncNote() {
    if (!loggedIn()) syncNote("现在没登录：进度先存这台设备，登录后会自动补到云端。");
    else if (cloudOn) syncNote("进度已存云端，换设备接着记。");
    else syncNote("云端暂时没连上，进度先存本机，恢复后会自动补上。");
  }
  function scheduleSync() {
    if (!cloudOn || !loggedIn()) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncTimer = 0; syncNow(); }, 900);
  }
  async function loadCloud() {
    if (!loggedIn()) { cloudOn = false; updateSyncNote(); return; }
    try {
      var res = await fetch(endpoint() + "/api/memory/sync", { headers: authHeaders() });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var j = await res.json();
      if (!j || !j.ok) throw new Error("同步失败");
      progress = mergeProgress(progress, j.progress);
      if (j.settings && j.settings.batch) settings.batch = clampBatch(j.settings.batch);
      logs = mergeLogs(j.logs, logs);
      cloudOn = true;
      saveLocal();
      if (pendingLogs.length) scheduleSync();
    } catch (e) {
      cloudOn = false;
    }
    updateSyncNote();
    refreshHome();
  }
  async function syncNow() {
    if (!cloudOn || syncing || !loggedIn()) return;
    syncing = true;
    try {
      var res = await fetch(endpoint() + "/api/memory/sync", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ progress: progress, settings: settings, logs: pendingLogs.slice(0, 200) })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var j = await res.json();
      if (!j || !j.ok) throw new Error("同步失败");
      pendingLogs = [];
      progress = mergeProgress(progress, j.progress);
      logs = mergeLogs(j.logs, logs);
      saveLocal();
      syncNote("已同步到云端。");
    } catch (e) {
      syncNote("还没同步上，进度先存本机，恢复后会自动补上。");
    } finally {
      syncing = false;
    }
  }
  function addLog(v) {
    logs = mergeLogs([v], logs);
    pendingLogs.push(v);
    if (pendingLogs.length > 200) pendingLogs = pendingLogs.slice(-200);
  }
  function mark(id, ok, mode, item) {
    var p = progress[id] || { box: 0, due: today(), seen: 0, ts: 0 };
    p.seen = (p.seen || 0) + 1;
    p.box = ok ? Math.min((p.box || 0) + 1, INTERVALS.length - 1) : 0;
    p.due = dayOffset(INTERVALS[p.box]);
    p.ts = Date.now();
    progress[id] = p;
    addLog({ id: id, text: item.text, theme: item.theme || "", kind: item.kind || "",
      ok: !!ok, mode: mode, at: p.ts });
    saveLocal();
    scheduleSync();
  }
  function dueList() {
    var t = today();
    return bank.filter(function (it) {
      var p = progress[it.id];
      return p && p.due && p.due <= t;
    });
  }

  /* ---------------- 词库加载 ---------------- */
  function localFallback() {
    var out = [];
    var quotes = Array.isArray(window.WY_QUOTES) ? window.WY_QUOTES : [];
    quotes.forEach(function (r, i) {
      if (r && r[1]) out.push({
        id: "lq" + i, kind: "quote", theme: r[0] || "其他", text: r[1],
        source: r[2] || "", meaning: "语出 " + (r[2] || "待查")
      });
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
      return localFallback();
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

  /* ---------------- 出题 ---------------- */
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
    var ans;
    var shown;
    var meaningMode = item.kind === "idiom";
    if (meaningMode) {
      ans = item.text;
      shown = item.meaning || "成语释义";
    } else {
      ans = blankPart(item.text);
      var text = String(item.text);
      var idx = text.indexOf(ans);
      shown = idx >= 0 ? (text.slice(0, idx) + "＿＿" + text.slice(idx + ans.length)) : text;
    }
    var distract = [];
    pool.forEach(function (x) {
      if (distract.length >= 12) return;
      // 干扰项同类：名言配名言片段，成语配成语，别让类型本身成为提示
      if (meaningMode && x.kind !== "idiom") return;
      if (!meaningMode && x.kind === "idiom") return;
      var p = x.kind === "idiom" ? x.text : blankPart(x.text);
      if (p !== ans && distract.indexOf(p) < 0) distract.push(p);
    });
    var opts = shuffle([ans].concat(shuffle(distract).slice(0, 3)));
    return { shown: shown, answer: ans, options: opts, meaningMode: meaningMode };
  }
  function makeOrder(item) {
    var text = String(item.text || "");
    var segs = [];
    var buf = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      buf += ch;
      if (/[，。！？、；：,!?;:]$/.test(ch) || buf.length >= 4) { segs.push(buf); buf = ""; }
    }
    if (buf) segs.push(buf);
    if (segs.length < 2) segs = text.split("");
    var order = segs.map(function (_, i) { return i; });
    return { segs: segs, shuffled: shuffle(order), picked: [] };
  }

  /* ---------------- 一轮流程 ---------------- */
  function startSession(items, mode) {
    if (!items || !items.length) return;
    state = {
      items: items.slice(0, settings.batch),
      mode: mode || "new",
      stage: "read", idx: 0, pass: 0, results: []
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
    syncNow();
  }
  function renderStep() {
    if (!state) return;
    var s = state;
    var item = s.items[s.idx];
    if (!item) { finish(); return; }
    var labels = { read: "读两遍", recall: "先想原句", cloze: "挖空选词", order: "排序成句" };
    els.memPhase.textContent = s.mode === "review" ? ("复习 · " + labels[s.stage]) : labels[s.stage];
    els.memProgress.textContent = (s.idx + 1) + " / " + s.items.length +
      (s.stage === "read" ? (" · 第 " + (s.pass + 1) + " 遍") : "");
    els.memDots.innerHTML = "";
    ["read", "recall", "cloze", "order"].forEach(function (k) {
      var d = document.createElement("span");
      d.className = "mem-dot" + (k === s.stage ? " is-on" : "");
      els.memDots.appendChild(d);
    });
    ["memReadPanel", "memRecallPanel", "memClozePanel", "memOrderPanel", "memDonePanel"]
      .forEach(function (id) { els[id].hidden = true; });
    if (s.stage === "read") renderRead(item);
    else if (s.stage === "recall") renderRecall(item);
    else if (s.stage === "cloze") renderCloze(item);
    else if (s.stage === "order") renderOrder(item);
  }
  function renderRead(item) {
    els.memReadPanel.hidden = false;
    els.memCardText.textContent = item.text;
    els.memCardHint.textContent = item.meaning || item.source || (item.kind === "idiom" ? "成语" : "名言警句");
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
      if (state.pass < PASS_TIMES) { renderStep(); return; }
      state.stage = "recall";
      state.idx = 0;
      state.pass = 0;
    }
    renderStep();
  }
  function renderRecall(item) {
    els.memRecallPanel.hidden = false;
    els.memRecallTheme.textContent = item.theme || (item.kind === "idiom" ? "成语" : "名言警句");
    els.memRecallMeaning.textContent = item.meaning || item.source || item.text;
    els.memRecallText.textContent = item.text;
    els.memRecallText.hidden = true;
    els.memRecallReveal.hidden = false;
    els.memRecallNext.hidden = true;
    els.memRecallReveal.onclick = function () {
      els.memRecallText.hidden = false;
      els.memRecallReveal.hidden = true;
      els.memRecallNext.hidden = false;
      speak(item.text);
    };
    els.memRecallNext.onclick = function () {
      stopSpeak();
      state.idx++;
      if (state.idx >= state.items.length) { state.stage = "cloze"; state.idx = 0; }
      renderStep();
    };
  }
  function renderCloze(item) {
    els.memClozePanel.hidden = false;
    var prompt = els.memClozePanel.querySelector(".mem-prompt");
    if (prompt) prompt.textContent = item.kind === "idiom" ? "看意思，选成语" : "把空补上";
    var q = makeCloze(item, bank);
    state.current = q;
    els.memClozeText.textContent = q.shown;
    els.memClozeText.classList.toggle("is-meaning", !!q.meaningMode);
    els.memClozeHint.textContent = item.meaning || item.source || "";
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
        mark(item.id, ok, "cloze", item);
        state.results.push(ok);
        els.memClozeFeedback.textContent = ok ? "对了" : ("答案是「" + q.answer + "」");
        els.memClozeFeedback.className = "mem-feedback " + (ok ? "ok" : "no");
        Array.prototype.forEach.call(els.memOptions.children, function (x) { x.disabled = true; });
        speak(item.text);
        var cur = state;
        setTimeout(function () {
          if (state !== cur) return;
          state.idx++;
          if (state.idx >= state.items.length) { state.stage = "order"; state.idx = 0; }
          renderStep();
        }, ok ? 700 : 1300);
      });
      els.memOptions.appendChild(b);
    });
  }
  function renderOrder(item) {
    els.memOrderPanel.hidden = false;
    state.current = makeOrder(item);
    els.memOrderFeedback.textContent = item.meaning || "";
    els.memOrderFeedback.className = "mem-feedback";
    drawOrder();
  }
  function drawOrder() {
    var q = state.current;
    els.memOrderSlots.innerHTML = "";
    q.picked.forEach(function (i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "mem-tile is-picked"; b.textContent = q.segs[i];
      b.addEventListener("click", function () { q.picked.pop(); drawOrder(); });
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
    mark(item.id, ok, "order", item);
    state.results.push(ok);
    els.memOrderFeedback.textContent = (ok ? "拼对了 · " : ("原句是：" + item.text + " · ")) + (item.meaning || "");
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
    ["memReadPanel", "memRecallPanel", "memClozePanel", "memOrderPanel"].forEach(function (id) { els[id].hidden = true; });
    els.memDonePanel.hidden = false;
    els.memPhase.textContent = "完成";
    els.memProgress.textContent = "";
    els.memDots.innerHTML = "";
    els.memDoneLine.textContent = "这一轮答对 " + right + " / " + total + " 题";
    els.memDoneSub.textContent = right === total
      ? "全对，隔天再来一遍就更牢了。"
      : "错的地方明天会排进复习，再来一次就行。";
    syncNow();
  }

  /* ---------------- 主页：记一记 + 词库 + 记录 ---------------- */
  function filtered() {
    return bank.filter(function (it) {
      if (filter.kind !== "all" && it.kind !== filter.kind) return false;
      if (filter.theme !== "all" && it.theme !== filter.theme) return false;
      return true;
    });
  }
  function updatePick() {
    var list = filtered();
    var n = Math.min(list.length, settings.batch);
    if (els.memPickTitle) els.memPickTitle.textContent = "已选 " + list.length + " 条，这一轮记 " + n + " 条";
    if (els.memStartBtn) {
      els.memStartBtn.disabled = list.length < 1;
      els.memStartBtn.textContent = list.length < 1 ? "先选内容" : "开始记一记";
    }
  }
  function renderThemes() {
    if (!els.memThemeChips) return;
    els.memThemeChips.innerHTML = "";
    ["all"].concat(themes).forEach(function (t) {
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
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
  }
  function setQuoteStatus(text) {
    if (els.quoteStatus) els.quoteStatus.textContent = text;
  }
  function bankFiltered() {
    var kw = trim(els.quoteSearch && els.quoteSearch.value).toLowerCase();
    return bank.filter(function (it) {
      if (qFilter && it.theme !== qFilter) return false;
      if (!kw) return true;
      return [it.text, it.source, it.meaning, it.theme].some(function (v) {
        return String(v || "").toLowerCase().indexOf(kw) >= 0;
      });
    });
  }
  function renderBank() {
    if (!els.quoteResults) return;
    if (!els.quoteThemes) return;
    els.quoteThemes.innerHTML = "";
    ["", "all"].concat(themes).forEach(function (t) {
      if (t === "all") return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "quote-theme" + ((t || "") === qFilter ? " is-on" : "");
      b.textContent = t || "全部";
      b.addEventListener("click", function () {
        qFilter = t || "";
        qLimit = 40;
        renderBank();
      });
      els.quoteThemes.appendChild(b);
    });
    var list = bankFiltered();
    els.quoteResults.innerHTML = "";
    list.slice(0, qLimit).forEach(function (it) {
      var p = progress[it.id];
      var card = document.createElement("div");
      card.className = "idea-card quote-card";

      var head = document.createElement("div");
      head.className = "quote-card-head";
      var badge = document.createElement("span");
      badge.className = "quote-kind";
      badge.textContent = it.kind === "idiom" ? "成语" : "名言";
      head.appendChild(badge);
      var theme = document.createElement("span");
      theme.className = "quote-theme-tag";
      theme.textContent = it.theme || "";
      head.appendChild(theme);
      if (p) {
        var learned = document.createElement("span");
        learned.className = "quote-learned";
        learned.textContent = "学过 " + (p.seen || 0) + " 次";
        head.appendChild(learned);
      }
      card.appendChild(head);

      var text = document.createElement("div");
      text.className = "idea-card-text quote-card-text";
      text.textContent = it.text;
      card.appendChild(text);

      var meta = document.createElement("div");
      meta.className = "idea-card-meta quote-card-meta";
      meta.textContent = it.meaning || it.source || "";
      card.appendChild(meta);
      if (it.kind === "quote" && it.source && it.meaning) {
        var src = document.createElement("div");
        src.className = "quote-source";
        src.textContent = it.source;
        card.appendChild(src);
      }

      var acts = document.createElement("div");
      acts.className = "quote-card-acts";
      var c1 = document.createElement("button");
      c1.type = "button"; c1.className = "btn-outline";
      c1.textContent = "复制";
      c1.addEventListener("click", function () {
        copyText(it.text);
        setQuoteStatus("已复制。");
      });
      var c2 = document.createElement("button");
      c2.type = "button"; c2.className = "btn-outline";
      c2.textContent = "连解释一起复制";
      c2.addEventListener("click", function () {
        copyText(it.text + "\n" + (it.meaning || "") + (it.source ? "\n——" + it.source : ""));
        setQuoteStatus("已连解释一起复制。");
      });
      acts.appendChild(c1); acts.appendChild(c2);
      card.appendChild(acts);
      els.quoteResults.appendChild(card);
    });
    if (!list.length) {
      var empty = document.createElement("div");
      empty.className = "quote-empty";
      empty.textContent = "词库里没有匹配的条目，换个词试试。";
      els.quoteResults.appendChild(empty);
    } else if (list.length > qLimit) {
      var more = document.createElement("button");
      more.type = "button";
      more.className = "btn-outline quote-more";
      more.textContent = "再看 40 条（还有 " + (list.length - qLimit) + " 条）";
      more.addEventListener("click", function () { qLimit += 40; renderBank(); });
      els.quoteResults.appendChild(more);
    }
    setQuoteStatus("共 " + list.length + " 条，当前显示 " + Math.min(list.length, qLimit) + " 条。");
  }
  function renderRecords() {
    if (!els.memRecordList) return;
    var learned = Object.keys(progress).length;
    var mastered = Object.keys(progress).filter(function (k) { return (progress[k].box || 0) >= 4; }).length;
    if (els.memRecordStat) els.memRecordStat.textContent = "已学 " + learned + " 条 · 熟练 " + mastered + " 条 · 今天待复习 " + dueList().length + " 条";
    els.memRecordList.innerHTML = "";
    if (!logs.length) {
      var e = document.createElement("div");
      e.className = "quote-empty";
      e.textContent = "还没有学习记录。做完一轮就会出现在这里。";
      els.memRecordList.appendChild(e);
      return;
    }
    logs.slice(0, 12).forEach(function (v) {
      var row = document.createElement("div");
      row.className = "mem-record" + (v.ok ? " is-ok" : " is-no");
      var left = document.createElement("div");
      left.className = "mem-record-main";
      left.textContent = v.text || "";
      var right = document.createElement("div");
      right.className = "mem-record-meta";
      right.textContent = (v.ok ? "答对" : "答错") + " · " +
        (v.kind === "idiom" ? "成语" : "名言") + " · " + stamp(v.at);
      row.appendChild(left); row.appendChild(right);
      els.memRecordList.appendChild(row);
    });
  }
  function refreshHome() {
    if (els.memCount) els.memCount.textContent = "词库 " + bank.length + " 条";
    var due = dueList();
    if (due.length) {
      if (els.memDue) els.memDue.hidden = false;
      if (els.memReviewBtn) els.memReviewBtn.hidden = false;
      if (els.memReviewInlineBtn) els.memReviewInlineBtn.hidden = false;
      if (els.memDueTitle) els.memDueTitle.textContent = "有 " + due.length + " 条要复习";
      if (els.memDueDesc) els.memDueDesc.textContent = "昨天及以前学过的，先过一遍再学新的。";
      if (els.sideDueTag) els.sideDueTag.hidden = false;
    } else {
      if (els.memDue) els.memDue.hidden = true;
      if (els.memReviewBtn) els.memReviewBtn.hidden = true;
      if (els.memReviewInlineBtn) els.memReviewInlineBtn.hidden = true;
      if (els.sideDueTag) els.sideDueTag.hidden = true;
    }
    updatePick();
    renderBank();
    renderRecords();
    updateSyncNote();
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
    if (els.memBatchRange) {
      els.memBatchRange.value = String(settings.batch);
      if (els.memBatchValue) els.memBatchValue.textContent = String(settings.batch);
      els.memBatchRange.addEventListener("input", function () {
        settings.batch = clampBatch(els.memBatchRange.value);
        els.memBatchValue.textContent = String(settings.batch);
        saveLocal();
        updatePick();
        scheduleSync();
      });
    }
    if (els.memStartBtn) {
      els.memStartBtn.addEventListener("click", function () {
        startSession(shuffle(filtered()), "new");
      });
    }
    function review() { startSession(shuffle(dueList()), "review"); }
    if (els.memReviewBtn) els.memReviewBtn.addEventListener("click", review);
    if (els.memReviewInlineBtn) els.memReviewInlineBtn.addEventListener("click", review);
    if (els.quoteSearch) {
      els.quoteSearch.addEventListener("input", function () { qLimit = 40; renderBank(); });
    }
    refreshHome();
  }

  /* ---------------- 全屏事件 ---------------- */
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
    if (els.memOrderReset) {
      els.memOrderReset.addEventListener("click", function () {
        if (!state || !state.current || state.stage !== "order") return;
        state.current.picked = [];
        drawOrder();
      });
    }
  }

  async function boot() {
    els = {
      memCount: $("memCount"), memDue: $("memDue"), memDueTitle: $("memDueTitle"),
      memDueDesc: $("memDueDesc"), memReviewBtn: $("memReviewBtn"),
      memReviewInlineBtn: $("memReviewInlineBtn"), memKindChips: $("memKindChips"),
      memThemeChips: $("memThemeChips"), memPickTitle: $("memPickTitle"),
      memStartBtn: $("memStartBtn"), sideDueTag: $("sideDueTag"),
      memBatchRange: $("memBatchRange"), memBatchValue: $("memBatchValue"),
      memSyncNote: $("memSyncNote"), memRecordStat: $("memRecordStat"),
      memRecordList: $("memRecordList"),
      quoteSearch: $("quoteSearch"), quoteThemes: $("quoteThemes"),
      quoteStatus: $("quoteStatus"), quoteResults: $("quoteResults"),
      memMask: $("memMask"), memPhase: $("memPhase"), memProgress: $("memProgress"),
      memSoundBtn: $("memSoundBtn"), memExitBtn: $("memExitBtn"), memDots: $("memDots"),
      memReadPanel: $("memReadPanel"), memCard: $("memCard"), memCardText: $("memCardText"),
      memCardHint: $("memCardHint"), memReadTip: $("memReadTip"),
      memReplayBtn: $("memReplayBtn"), memNextBtn: $("memNextBtn"),
      memRecallPanel: $("memRecallPanel"), memRecallTheme: $("memRecallTheme"),
      memRecallMeaning: $("memRecallMeaning"), memRecallText: $("memRecallText"),
      memRecallReveal: $("memRecallReveal"), memRecallNext: $("memRecallNext"),
      memClozePanel: $("memClozePanel"), memClozeText: $("memClozeText"), memClozeHint: $("memClozeHint"),
      memOptions: $("memOptions"), memClozeFeedback: $("memClozeFeedback"),
      memOrderPanel: $("memOrderPanel"), memOrderSlots: $("memOrderSlots"),
      memOrderBank: $("memOrderBank"), memOrderFeedback: $("memOrderFeedback"),
      memOrderReset: $("memOrderReset"), memDonePanel: $("memDonePanel"),
      memDoneLine: $("memDoneLine"), memDoneSub: $("memDoneSub"), memDoneBtn: $("memDoneBtn")
    };
    loadLocal();
    bindStage();
    bank = await loadBank();
    initHome();
    loadCloud();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
