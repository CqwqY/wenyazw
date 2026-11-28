/* 文芽作文 - 主页
   未登录：介绍页；登录后：三视图（我的作文 / 创建作文 / 账户设置）。
   电脑端左侧边栏，手机端底部三 tab，共用同一套视图切换。 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  var RESUME_KEY = "wy.resume.v1";

  function $(id) { return document.getElementById(id); }
  /* 积分最小粒度 0.1，REAL 列算完带浮点尾巴；显示收 1 位小数 */
  function fmtCredits(n) {
    if (n === null || n === undefined) return "—";
    var v = Number(n);
    if (!isFinite(v)) return "—";
    return String(Math.round(v * 10) / 10);
  }
  var els = {
    guest: $("guestView"), guestFooter: $("guestFooter"), shell: $("appShell"),
    cta: $("homeCta"), heroNote: $("heroNote"),
    lpTeacherLink: $("lpTeacherLink"), lpEntries: document.querySelectorAll(".lp-entry, .lp-entry-list button"),
    dashStart: $("dashStart"), dashResume: $("dashResume"),
    dashLine: $("dashHeroLine"), dashSub: $("dashHeroSub"), dashTitle: $("dashHeroTitle"),
    dashRecent: $("dashRecent"), dashTeacher: $("dashTeacher"),
    dashReviewHint: $("dashReviewHint"),
    dashAllLinks: document.querySelectorAll(".dash-link[data-action]"),
    dashPaper: $("dashPaper"), dashPaperStage: $("dashPaperStage"),
    dashPaperTitle: $("dashPaperTitle"), dashPaperBody: $("dashPaperBody"),
    dashPaperWords: $("dashPaperWords"), dashPaperTime: $("dashPaperTime"),
    dashPaperNote: $("dashPaperNote"), dashPaperOpen: $("dashPaperOpen"),
    dashEntries: document.querySelectorAll(".dash-section-more[data-go]"),
    views: {
      home: $("viewHome"), essays: $("viewEssays"), create: $("viewCreate"),
      topics: $("viewTopics"), quotes: $("viewQuotes"), account: $("viewAccount")
    },
    sideItems: document.querySelectorAll(".side-item"),
    tabItems: document.querySelectorAll(".app-tab"),
    mindmap: $("mindmap"), essayMsg: $("essayMsg"), refresh: $("refreshEssays"),
    classifyHint: $("classifyHint"), classifyText: $("classifyText"), classifyBtn: $("classifyBtn"),
    deriveOpen: $("deriveOpen"), deriveMask: $("deriveMask"), deriveClose: $("deriveClose"),
    deriveTopic: $("deriveTopic"), deriveWords: $("deriveWords"), deriveGenre: $("deriveGenre"),
    deriveGo: $("deriveGo"), deriveMsg: $("deriveMsg"),
    deriveNext: $("deriveNext"), derivePrev: $("derivePrev"),
    deriveSteps: $("deriveSteps"), deriveSummary: $("deriveSummary"),
    deriveGenres: $("deriveGenres"),
    deriveNoMatch: $("deriveNoMatch"), deriveNoMatchWhy: $("deriveNoMatchWhy"),
    deriveNewBtn: $("deriveNewBtn"), deriveSkipBtn: $("deriveSkipBtn"),
    createSmartBtn: $("createSmartBtn"),
    importType: $("importType"), importBoard: $("importBoard"),
    importTitle: $("importTitle"), importBody: $("importBody"), importCount: $("importCount"),
    importSave: $("importSave"), importMsg: $("importMsg"),
    importParams: $("importParams"), paramTpl: $("paramTpl"),
    topicStage: $("topicStage"), topicGenre: $("topicGenre"),
    topicDirection: $("topicDirection"), topicCount: $("topicCount"),
    topicGen: $("topicGen"), topicStatus: $("topicStatus"), topicResults: $("topicResults"),
    quoteSearch: $("quoteSearch"), quoteThemes: $("quoteThemes"),
    quoteStatus: $("quoteStatus"), quoteResults: $("quoteResults"),
    paramsMask: $("paramsMask"), paramsForm: $("paramsForm"), paramsClose: $("paramsClose"),
    paramsSave: $("paramsSave"), paramsMsg: $("paramsMsg"), paramsHint: $("paramsHint"),
    appEmail: $("appEmail"), appUser: $("appUser"), appCredits: $("appCredits"),
    appPassword: $("appPassword"), appLogout: $("appLogout"),
    teacherSideLink: $("teacherSideLink"), teacherAccountLink: $("teacherAccountLink"),
    styleVerdict: $("styleVerdict"), styleSummary: $("styleSummary"), styleTags: $("styleTags"),
    styleEmpty: $("styleEmpty"), styleMarkList: $("styleMarkList"), styleAddMark: $("styleAddMark"),
    styleSave: $("styleSave"), styleMsg: $("styleMsg"), styleScan: $("styleScan"),
    styleReport: $("styleReport"),
    styleRuleList: $("styleRuleList"), styleRuleEmpty: $("styleRuleEmpty")
  };

  var currentView = "home";
  var pending = false;
  var pendingDerive = false;
  var deriveStep = 1;
  var deriveGenrePick = "记叙文";
  var pendingLanding = null;
  var deriveFromCreate = false;
  var editingId = 0;

  function auth() { return window.WY_AUTH; }
  function loggedIn() { return !!(auth() && auth().loggedIn()); }
  function token() { return (auth() && auth().token()) || ""; }
  function esc(s) { return String(s == null ? "" : s).replace(/\uFFFD+/g, ""); }
  function words(s) { return Array.from(String(s || "").replace(/\s/g, "")).length; }
  function setMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "app-msg" + (kind ? " " + kind : "");
  }

  async function api(path, options) {
    var opt = options || {};
    var res;
    try {
      res = await fetch(API + path, {
        method: opt.method || "GET",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
        body: opt.body === undefined ? undefined : JSON.stringify(opt.body)
      });
    } catch (e) {
      /* CORS 预检被拒、DNS、断网都会让 fetch 抛 TypeError，
         直接把 "Failed to fetch" 甩给用户看不懂，统一翻成人话，原错留控制台排查。 */
      console.warn("[wenyazw] 请求未能发出：", path, e);
      throw new Error("暂时连不上账号服务，请检查网络后重试。");
    }
    var j = {};
    try { j = await res.json(); } catch (e) { /* 忽略非 JSON 响应 */ }
    if (!res.ok || !j.ok) throw new Error(j.error || ("请求失败（HTTP " + res.status + "）"));
    return j;
  }

  /* ---------------- 找作文题 / 找金句 ----------------
     这两个入口和「我的作文 / 创建作文 / 账户设置」并列。
     出题走站内模型，按实际用量扣积分、失败退回；
     金句只读本地名言库，不联网、不扣积分。 */
  function ideaStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "idea-status" + (kind ? " " + kind : "");
  }

  function parseIdeaJSON(raw, key) {
    var s = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("这次没按格式给结果，再生成一次试试。");
    var obj;
    try { obj = JSON.parse(s.slice(a, b + 1)); }
    catch (e) { throw new Error("结果解析失败，再生成一次试试。"); }
    var arr = Array.isArray(obj && obj[key]) ? obj[key] : [];
    if (!arr.length) throw new Error("这次没有给出内容，再生成一次试试。");
    return arr;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* 退回 execCommand */ }
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function needLogin(msg) {
    if (auth() && auth().open) auth().open("login");
    throw new Error(msg);
  }

  /* 模型接口和 write.js 走同一条 /api/llm/task；这里只发任务名和变量，提示词不下发。 */
  async function llmTask(task, vars) {
    if (!loggedIn()) needLogin("请先登录，再用站内模型出题。");
    var res;
    try {
      res = await fetch(API + "/api/llm/task", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
        body: JSON.stringify({
          task: task, vars: vars, stream: false,
          temperature: 0.7, max_tokens: 512, purpose: "找作文题"
        })
      });
    } catch (e) {
      console.warn("[wenyazw] 出题请求未能发出：", e);
      throw new Error("暂时连不上模型服务，检查网络后再试。");
    }
    var j = {};
    try { j = await res.json(); } catch (e) { /* 非 JSON 响应 */ }
    if (res.status === 401) needLogin("登录过期了，请重新登录再出题。");
    if (!res.ok || j.error) throw new Error(j.error || ("出题失败（HTTP " + res.status + "）"));
    var msg = j.choices && j.choices[0] && j.choices[0].message;
    var content = (msg && msg.content) || j.content || "";
    if (!String(content).trim()) throw new Error("模型没返回结果，再试一次。");
    return String(content);
  }

  var topicsInit = false;
  function initTopics() {
    if (topicsInit) return;
    topicsInit = true;
    var d = paramDefaults();
    fillSelect(els.topicStage, d.stages, d.stage);
    fillSelect(els.topicGenre, d.genres, d.genre);
  }

  function renderTopics(list) {
    if (!els.topicResults) return;
    els.topicResults.innerHTML = "";
    list.slice(0, 12).forEach(function (item) {
      var title = String((item && item.title) || "").trim();
      if (!title) return;
      var card = document.createElement("div");
      card.className = "idea-card topic-card";
      var text = document.createElement("div");
      text.className = "idea-card-text";
      text.textContent = title;
      card.appendChild(text);
      var bits = [];
      if (item && item.kind) bits.push(item.kind);
      if (item && item.hint) bits.push(item.hint);
      if (bits.length) {
        var meta = document.createElement("div");
        meta.className = "idea-card-meta";
        meta.textContent = bits.join(" · ");
        card.appendChild(meta);
      }
      var acts = document.createElement("div");
      acts.className = "idea-card-acts";
      var go = document.createElement("a");
      go.className = "idea-card-use is-link";
      go.href = "write.html?topic=" + encodeURIComponent(title) + "&new=1";
      go.textContent = "拿去写";
      var cp = document.createElement("button");
      cp.type = "button";
      cp.className = "idea-card-use is-alt";
      cp.textContent = "复制";
      cp.addEventListener("click", async function () {
        var ok = await copyText(title);
        ideaStatus(els.topicStatus, ok ? "题目已复制。" : "复制失败，请手动选中文字。", ok ? "ok" : "error");
      });
      acts.appendChild(go);
      acts.appendChild(cp);
      card.appendChild(acts);
      els.topicResults.appendChild(card);
    });
  }

  async function generateTopics() {
    if (!els.topicGen || els.topicGen.disabled) return;
    initTopics();
    els.topicGen.disabled = true;
    els.topicGen.textContent = "出题…";
    ideaStatus(els.topicStatus, "正在出题…", "");
    els.topicResults.innerHTML = "";
    try {
      var vars = {
        stage: els.topicStage.value,
        genre: els.topicGenre.value || "记叙文",
        direction: String(els.topicDirection.value || "").trim(),
        count: Number(els.topicCount.value) || 6
      };
      var list = parseIdeaJSON(await llmTask("topics", vars), "topics");
      renderTopics(list);
      ideaStatus(els.topicStatus, "出了 " + list.length + " 道题。挑一道直接拿去写，或复制题目。", "ok");
    } catch (e) {
      ideaStatus(els.topicStatus, (e && e.message) || "没出成题，再试一次。", "error");
    } finally {
      els.topicGen.disabled = false;
      els.topicGen.textContent = "出题";
    }
  }

  var quotesInit = false, quotesAll = [], quotesActive = "";
  function initQuotes() {
    if (quotesInit) return;
    quotesInit = true;
    var all = Array.isArray(window.WY_QUOTES) ? window.WY_QUOTES : [];
    quotesAll = all.filter(function (r) { return r && r[1]; });
    var themes = [];
    quotesAll.forEach(function (r) { if (r[0] && themes.indexOf(r[0]) < 0) themes.push(r[0]); });
    if (!els.quoteThemes) return;
    els.quoteThemes.innerHTML = "";
    function addTheme(label) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "quote-theme" + (label === "全部" ? " is-on" : "");
      b.textContent = label;
      b.addEventListener("click", function () {
        quotesActive = label === "全部" ? "" : label;
        Array.prototype.forEach.call(els.quoteThemes.children, function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
        renderQuotes();
      });
      els.quoteThemes.appendChild(b);
    }
    addTheme("全部");
    themes.forEach(addTheme);
    renderQuotes();
  }

  function renderQuotes() {
    if (!quotesInit || !els.quoteResults) return;
    var kw = String(els.quoteSearch.value || "").trim().toLowerCase();
    var list = quotesAll.filter(function (r) {
      if (quotesActive && r[0] !== quotesActive) return false;
      if (!kw) return true;
      return ((r[0] || "") + (r[1] || "") + (r[2] || "")).toLowerCase().indexOf(kw) >= 0;
    });
    // 同一句会归到多个主题；「全部」视图去重，按主题看时保留
    if (!quotesActive) {
      var seen = Object.create(null);
      list = list.filter(function (r) {
        if (seen[r[1]]) return false;
        seen[r[1]] = 1;
        return true;
      });
    }
    var shown = list.slice(0, 60);
    els.quoteResults.innerHTML = "";
    shown.forEach(function (r) {
      var card = document.createElement("div");
      card.className = "idea-card quote-card";
      var text = document.createElement("div");
      text.className = "idea-card-text quote-card-text";
      text.textContent = r[1];
      card.appendChild(text);
      var meta = document.createElement("div");
      meta.className = "idea-card-meta quote-card-meta";
      meta.textContent = "—— " + (r[2] || "佚名") + " · " + (r[0] || "");
      card.appendChild(meta);
      var acts = document.createElement("div");
      acts.className = "quote-card-acts";
      var cp = document.createElement("button");
      cp.type = "button";
      cp.className = "idea-card-use";
      cp.textContent = "复制句子";
      cp.addEventListener("click", async function () {
        var ok = await copyText(String(r[1]).trim());
        ideaStatus(els.quoteStatus, ok ? "名言已复制。" : "复制失败，请手动选中文字。", ok ? "ok" : "error");
      });
      var withSrc = document.createElement("button");
      withSrc.type = "button";
      withSrc.className = "idea-card-use is-alt";
      withSrc.textContent = "带出处";
      withSrc.addEventListener("click", async function () {
        var val = String(r[1]).trim() + " —— " + (r[2] || "佚名");
        var ok = await copyText(val);
        ideaStatus(els.quoteStatus, ok ? "名言和出处已一起复制。" : "复制失败，请手动选中文字。", ok ? "ok" : "error");
      });
      acts.appendChild(cp);
      acts.appendChild(withSrc);
      card.appendChild(acts);
      els.quoteResults.appendChild(card);
    });
    ideaStatus(els.quoteStatus, list.length
      ? ("共 " + list.length + " 条" + (list.length > shown.length ? "，显示前 " + shown.length + " 条，可继续缩小范围" : ""))
      : "没有匹配的名言，换个词或主题试试。", list.length ? "ok" : "");
  }

  /* ---------------- 作文基础参数 ----------------
     选项来自公开的 rules.js；录入区与「改参数」弹层共用一份表单模板。 */
  function paramDefaults() {
    var W = window;
    var cats = W.WY_CATEGORY ? Object.keys(W.WY_CATEGORY) : ["命题"];
    var genres = W.WY_GENRE ? Object.keys(W.WY_GENRE) : ["记叙文"];
    var stages = W.WY_STAGE_LIST || ["小学", "初中", "高中"];
    var provs = W.WY_SCORING ? Object.keys(W.WY_SCORING) : ["全国卷（通用）"];
    var st = stages.indexOf("初中") >= 0 ? "初中" : (stages[0] || "初中");
    return {
      cat: cats[0] || "命题",
      genre: genres[0] || "记叙文",
      stage: st,
      prov: provs[0] || "全国卷（通用）",
      words: (W.WY_STAGE && W.WY_STAGE[st] && W.WY_STAGE[st].words) || 600,
      cats: cats, genres: genres, stages: stages, provs: provs
    };
  }

  function fillSelect(sel, list, cur) {
    if (!sel) return;
    sel.innerHTML = "";
    list.forEach(function (name) {
      var o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      sel.appendChild(o);
    });
    if (cur && list.indexOf(cur) >= 0) sel.value = cur;
  }

  function mountParams(host) {
    if (!host || !els.paramTpl || !els.paramTpl.content) return;
    host.innerHTML = "";
    host.appendChild(els.paramTpl.content.cloneNode(true));
    var d = paramDefaults();
    fillSelect(host.querySelector('[data-p="cat"]'), d.cats, d.cat);
    fillSelect(host.querySelector('[data-p="genre"]'), d.genres, d.genre);
    fillSelect(host.querySelector('[data-p="stage"]'), d.stages, d.stage);
    fillSelect(host.querySelector('[data-p="prov"]'), d.provs, d.prov);
    var w = host.querySelector('[data-p="words"]');
    if (w) w.value = d.words;
    var st = host.querySelector('[data-p="stage"]');
    if (st && w) {
      st.addEventListener("change", function () {
        var conf = window.WY_STAGE && window.WY_STAGE[st.value];
        if (conf && conf.words) w.value = conf.words;
      });
    }
  }

  function pick(host, key) {
    var el = host && host.querySelector('[data-p="' + key + '"]');
    return el ? String(el.value || "").trim() : "";
  }

  function readParams(host) {
    var d = paramDefaults();
    return {
      cat: pick(host, "cat") || d.cat,
      genre: pick(host, "genre") || d.genre,
      stage: pick(host, "stage") || d.stage,
      prov: [pick(host, "prov") || d.prov],
      words: Math.max(100, Math.min(3000, Number(pick(host, "words")) || d.words))
    };
  }

  function writeParams(host, p) {
    if (!host) return;
    var d = paramDefaults();
    var val = function (k, list) { return list.indexOf(p[k]) >= 0 ? p[k] : d[k]; };
    var set = function (k, v) { var el = host.querySelector('[data-p="' + k + '"]'); if (el) el.value = v; };
    var cat = host.querySelector('[data-p="cat"]');
    var genre = host.querySelector('[data-p="genre"]');
    var stage = host.querySelector('[data-p="stage"]');
    var prov = host.querySelector('[data-p="prov"]');
    if (cat) { fillSelect(cat, d.cats, val("cat", d.cats)); }
    if (genre) { fillSelect(genre, d.genres, val("genre", d.genres)); }
    if (stage) { fillSelect(stage, d.stages, val("stage", d.stages)); }
    var provList = (Array.isArray(p.prov) && p.prov.length) ? p.prov : [d.prov];
    if (prov) { fillSelect(prov, d.provs, provList[0]); }
    set("words", Number(p.words) || d.words);
  }

  /* 老作文没有 params：从 category「命题 · 记叙文」和 province 里拆出来当初值 */
  function parseParams(raw, row) {
    var p = {};
    try { p = JSON.parse(String(raw || "")) || {}; } catch (e) { p = {}; }
    var d = paramDefaults();
    var catParts = String((row && row.category) || "").split("·").map(function (x) { return x.trim(); });
    var provOld = String((row && row.province) || "").split(/[、,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
    return {
      cat: p.cat || catParts[0] || d.cat,
      genre: p.genre || catParts[1] || d.genre,
      stage: p.stage || d.stage,
      prov: (Array.isArray(p.prov) && p.prov.length) ? p.prov : (provOld.length ? provOld : [d.prov]),
      words: Number(p.words) || d.words
    };
  }

  function openParams(row) {
    if (!els.paramsMask) return;
    editingId = row.id;
    writeParams(els.paramsForm, parseParams(row.params, row));
    if (els.paramsHint) {
      els.paramsHint.textContent = "《" + esc(row.title || "无题") +
        "》的基础参数。改完保存，下次进工作台就按这套参数评改、给分；正文一个字都不会动。";
    }
    setMsg(els.paramsMsg, "");
    els.paramsMask.removeAttribute("hidden");
  }

  async function saveParams() {
    if (!editingId) return;
    var p = readParams(els.paramsForm);
    els.paramsSave.disabled = true;
    setMsg(els.paramsMsg, "正在保存…");
    try {
      await api("/api/essays/" + encodeURIComponent(editingId) + "/params", {
        method: "PUT", body: { params: JSON.stringify(p) }
      });
      els.paramsMask.setAttribute("hidden", "");
      await loadEssays();
      setMsg(els.essayMsg, "参数已更新，进工作台就按新的来。", "ok");
    } catch (e) {
      setMsg(els.paramsMsg, "保存失败：" + ((e && e.message) || "未知错误"), "error");
    } finally {
      els.paramsSave.disabled = false;
    }
  }

  /* ---------------- 登录后的主页 ----------------
     统计和最近作文走 /api/essays（同一份数据，不另开接口）；
     积分读本地缓存，进主页时顺手向服务端刷一次。 */
  function fmtNum(n) {
    var v = Number(n);
    if (!isFinite(v)) return "0";
    return v >= 10000 ? (Math.round(v / 1000) / 10) + "万" : String(Math.round(v));
  }
  function fmtRecentTime(s) {
    var d = new Date(s);
    if (isNaN(d.getTime())) return "";
    var diff = Date.now() - d.getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
    if (diff < 604800000) return Math.floor(diff / 86400000) + " 天前";
    return String(s).slice(0, 10);
  }

  /* 登录主页：稿纸里的正文、字数、时间都来自真实作文，不用示例文案。 */
  var dashMotionReady = false;

  function renderPaper(rows) {
    var top = rows && rows[0];
    if (!top || !els.dashPaper) return;
    if (els.dashPaperTitle) els.dashPaperTitle.textContent = top.title || "无题";
    if (els.dashPaperWords) els.dashPaperWords.textContent = fmtNum(top.word_count || 0) + " 字";
    if (els.dashPaperTime) els.dashPaperTime.textContent = fmtRecentTime(top.updated_at);
    if (els.dashPaperOpen) {
      els.dashPaperOpen.hidden = false;
      els.dashPaperOpen.onclick = function () { openEssay(top.id); };
    }
    if (els.dashPaperNote) els.dashPaperNote.textContent = top.has_outline ? "大纲已立" : "接着写";

    var body = els.dashPaperBody;
    if (!body) return;
    body.textContent = "";
    var title = String(top.title || "").trim();
    var paras = String(top.excerpt || "").replace(/\r/g, "").split(/\n+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s && s !== title; });
    if (!paras.length) paras = ["这篇还没有正文，打开就能接着写。"];
    var marked = false;
    paras.slice(0, 3).forEach(function (p) {
      var line = document.createElement("p");
      if (!marked && p.length > 14) {
        var cut = p.length - 14;
        line.appendChild(document.createTextNode(p.slice(0, cut)));
        var mark = document.createElement("span");
        mark.className = "dash-paper-mark";
        mark.textContent = p.slice(cut);
        line.appendChild(mark);
        marked = true;
      } else {
        line.textContent = p;
      }
      body.appendChild(line);
    });
  }

  /* 取 React Bits 的三处做法，收到首屏这一个动作里：
     BlurText 的逐字模糊入场 + SpotlightCard 的指针聚光 + HoloCard 的弹簧倾斜。
     默认文案可见；只有 JS 初始化成功才拆字并加动画类。 */
  function initHeroMotion() {
    if (dashMotionReady) return;
    dashMotionReady = true;
    var dash = els.views.home;
    if (!dash) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reduce && els.dashTitle) {
      var text = els.dashTitle.textContent || "";
      els.dashTitle.textContent = "";
      Array.prototype.forEach.call(Array.from(text), function (ch, i) {
        var s = document.createElement("span");
        s.className = "hero-char";
        s.textContent = ch;
        s.style.setProperty("--d", Math.min(i * 46, 620) + "ms");
        els.dashTitle.appendChild(s);
      });
    }
    dash.classList.add("is-animated");

    var stage = els.dashPaperStage, paper = els.dashPaper;
    if (!stage || !paper || reduce) return;
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    function frame() {
      cx += (tx - cx) * 0.13;
      cy += (ty - cy) * 0.13;
      paper.style.setProperty("--tilt-x", (cy * -3.4).toFixed(2) + "deg");
      paper.style.setProperty("--tilt-y", (cx * 4.4).toFixed(2) + "deg");
      if (Math.abs(tx - cx) > 0.004 || Math.abs(ty - cy) > 0.004) raf = requestAnimationFrame(frame);
      else raf = 0;
    }
    function wake() { if (!raf) raf = requestAnimationFrame(frame); }
    stage.addEventListener("pointermove", function (e) {
      var r = stage.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      paper.style.setProperty("--mx", (e.clientX - r.left) + "px");
      paper.style.setProperty("--my", (e.clientY - r.top) + "px");
      paper.style.setProperty("--glare", "1");
      paper.style.setProperty("--lift", "-4px");
      wake();
    });
    stage.addEventListener("pointerleave", function () {
      tx = 0; ty = 0;
      paper.style.setProperty("--glare", "0");
      paper.style.setProperty("--lift", "0px");
      wake();
    });
  }

  async function loadDashboard() {
    if (!loggedIn()) return;
    if (auth() && auth().refreshCredits && auth().credits) {
      var creditText = function (n) {
        if (!els.dashLine) return;
        var parts = els.dashLine.dataset.parts || "";
        if (!parts) return;
        els.dashLine.textContent = parts + (n === null || n === undefined ? " · 积分暂不可用" : " · 可用积分 " + fmtCredits(n));
      };
      auth().refreshCredits().then(creditText);
    }
    try {
      var j = await api("/api/essays");
      var rows = (j && j.essays) || [];
      var words = rows.reduce(function (a, r) { return a + (Number(r.word_count) || 0); }, 0);
      var count = rows.length;
      if (els.dashLine) {
        var line = count
          ? "已写 " + count + " 篇 · 累计 " + fmtNum(words) + " 字 · 最近一篇 " + fmtRecentTime(rows[0].updated_at)
          : "还没有作文。给个题目，先立大纲再写正文。";
        els.dashLine.dataset.parts = line;
        els.dashLine.textContent = line + (auth() && auth().credits ? " · 可用积分 " + fmtCredits(auth().credits()) : " · 积分加载中");
      }
      if (els.dashSub) {
        els.dashSub.textContent = count
          ? "给个题目，AI 先翻旧稿；能借就借，没有就从零写。"
          : "给个题目，先拆题目、立大纲，你点头之后才写正文。";
      }
      if (els.dashResume) {
        els.dashResume.hidden = !count;
        els.dashResume.onclick = count ? function () { openEssay(rows[0].id); } : null;
      }
      dashLatestId = rows.length ? rows[0].id : null;
      if (els.dashReviewHint) {
        var dueTag = $("sideDueTag"), dueTitle = $("memDueTitle");
        var dueText = (dueTag && !dueTag.hidden && dueTitle) ? dueTitle.textContent : "";
        els.dashReviewHint.textContent = dueText ? (dueText + " →") : "过一遍昨天学过的 →";
      }
      renderPaper(rows);
      renderDashRecent(rows.slice(0, 5));
    } catch (e) {
      if (els.dashLine) els.dashLine.textContent = "写作记录暂时加载失败，去「我的作文」里刷新试试。";
      if (els.dashRecent) els.dashRecent.innerHTML = '<div class="dash-empty">作文列表暂时加载失败。</div>';
    }
  }

  function renderDashRecent(rows) {
    var box = els.dashRecent;
    if (!box) return;
    if (!rows || !rows.length) {
      box.innerHTML = '<div class="dash-empty">还没有作文。点上面的「写篇新作文」，给个题目就能开始。</div>';
      return;
    }
    box.textContent = "";
    rows.forEach(function (r) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "dash-row";
      var main = document.createElement("span");
      main.className = "dash-row-main";
      var t = document.createElement("span");
      t.className = "dash-row-title";
      t.textContent = r.title || "无题";
      var ex = document.createElement("span");
      ex.className = "dash-row-excerpt";
      var excerpt = String(r.excerpt || "").replace(/\s+/g, " ").trim();
      var rowTitle = String(r.title || "").trim();
      if (rowTitle && excerpt.indexOf(rowTitle) === 0) excerpt = excerpt.slice(rowTitle.length).trim();
      ex.textContent = excerpt.slice(0, 72) || (r.category || "点开继续写");
      main.appendChild(t);
      main.appendChild(ex);
      var meta = document.createElement("span");
      meta.className = "dash-row-meta";
      var bits = [];
      if (r.category) bits.push(String(r.category));
      if (r.word_count) bits.push(fmtNum(r.word_count) + " 字");
      if (r.updated_at) bits.push(fmtRecentTime(r.updated_at));
      meta.textContent = bits.join(" · ");
      var arrow = document.createElement("span");
      arrow.className = "dash-row-arrow";
      arrow.textContent = "→";
      meta.appendChild(arrow);
      b.appendChild(main);
      b.appendChild(meta);
      b.addEventListener("click", function () { openEssay(r.id); });
      box.appendChild(b);
    });
  }

  /* ---------------- 落地页功能入口 ----------------
     未登录点入口：先记下目标，登录成功后自动落到对应视图；
     已登录点入口：直接切视图。「写篇新作文」走新建流程，和顶部按钮一致。 */
  var LANDING_VIEW = {
    create: "create", essays: "essays", topics: "topics",
    quotes: "quotes", import: "create", style: "account",
    teacher: "home"
  };

  function goLanding(target) {
    if (target === "teacher") { location.href = "teacher.html"; return; }
    var view = LANDING_VIEW[target] || "home";
    if (!loggedIn()) {
      pendingLanding = target;
      if (auth()) auth().open("login");
      return;
    }
    setView(view);
    if (target === "import") {
      var body = els.importBody;
      if (body) window.setTimeout(function () { body.focus(); }, 0);
    }
    if (target === "style") {
      var block = $("styleBlock");
      if (block) window.setTimeout(function () { block.scrollIntoView({ block: "start" }); }, 0);
    }
  }

  Array.prototype.forEach.call(els.lpEntries, function (b) {
    b.addEventListener("click", function () { goLanding(b.getAttribute("data-go")); });
  });
  Array.prototype.forEach.call(els.dashEntries, function (b) {
    b.addEventListener("click", function () { goLanding(b.getAttribute("data-go")); });
  });

  /* 主页「全部功能」：复用各视图已有的按钮与逻辑，不另写一套业务。 */
  var dashLatestId = null;
  function goAction(action) {
    if (!loggedIn()) { if (auth()) auth().open("login"); return; }
    var clickLater = function (id) {
      window.setTimeout(function () { var el = $(id); if (el && !el.disabled) el.click(); }, 90);
    };
    switch (action) {
      case "create": setView("create"); break;
      case "import": goLanding("import"); break;
      case "resume":
        if (dashLatestId) openEssay(dashLatestId);
        else setView("create");
        break;
      case "derive": setView("essays"); clickLater("deriveOpen"); break;
      case "essays": setView("essays"); break;
      case "classify": setView("essays"); break;
      case "refresh": setView("essays"); clickLater("refreshEssays"); break;
      case "topics": setView("topics"); break;
      case "quotes": setView("quotes"); break;
      case "mem": setView("quotes"); clickLater("memStartBtn"); break;
      case "review": setView("quotes"); clickLater("memReviewBtn"); break;
      case "bank":
        setView("quotes");
        window.setTimeout(function () { var b = $("quoteSearch"); if (b) b.scrollIntoView({ block: "start" }); }, 90);
        break;
      case "style": goLanding("style"); break;
      case "credits": location.href = "credits.html"; break;
      case "password": setView("account"); clickLater("appPassword"); break;
      case "teacher": location.href = "teacher.html"; break;
      case "logout":
        if (window.confirm("确定退出登录？")) { setView("account"); clickLater("appLogout"); }
        break;
      case "studio":
        if (dashLatestId) openEssay(dashLatestId);
        else setView("create");
        break;
      default: break;
    }
  }
  Array.prototype.forEach.call(els.dashAllLinks, function (b) {
    b.addEventListener("click", function () { goAction(b.getAttribute("data-action")); });
  });

  if (els.dashStart) {
    els.dashStart.addEventListener("click", function () {
      if (!loggedIn()) { if (auth()) auth().open("login"); return; }
      setView("create");
    });
  }

  /* ---------------- 视图切换 ---------------- */

  function setView(name, noHash) {
    if (!els.views[name]) name = "essays";
    var changed = currentView !== name;
    currentView = name;
    if (name === "topics") initTopics();
    Object.keys(els.views).forEach(function (k) { els.views[k].hidden = (k !== name); });
    Array.prototype.forEach.call(els.sideItems, function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === name);
    });
    Array.prototype.forEach.call(els.tabItems, function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === name);
    });
    if (!noHash && window.history && history.replaceState) {
      try { history.replaceState(null, "", "#" + name); } catch (e) { /* ignore */ }
    }
    if (name === "home" && loggedIn()) { initHeroMotion(); loadDashboard(); }
    if (name === "essays" && loggedIn()) loadEssays();
    if (name === "account" && loggedIn()) { loadAccount(); loadStyle(); }
    // 只有真的换了视图才回到顶部，重复渲染同一视图不动滚动位置
    if (changed) window.scrollTo(0, 0);
  }

  function viewFromHash() {
    var h = (location.hash || "").replace("#", "");
    return els.views[h] ? h : "home";
  }

  /* 只把「换没换人」记下来：积分刷新也会走 onChange 广播，
     每次都重新 setView 会把它自己拉回顶部，还会和 loadAccount 互相递归。 */
  var shellOn = null;

  /* 教师控制台入口只对授权教师显示。查身份必须带上 token，
     否则服务端读不到登录账号，会把所有人都判成学生。 */
  var teacherGateCheckedFor = null;
  async function refreshTeacherGate() {
    var who = loggedIn() ? (auth().email ? auth().email() : "in") : "out";
    if (who === teacherGateCheckedFor) return;
    var show = false;
    if (loggedIn()) {
      try {
        var j = await api("/api/teacher/status");
        show = !!(j && j.teacher);
      } catch (e) { show = false; }
    }
    if (els.teacherSideLink) els.teacherSideLink.hidden = !show;
    if (els.teacherAccountLink) els.teacherAccountLink.hidden = !show;
    if (els.lpTeacherLink) els.lpTeacherLink.hidden = !show;
    if (els.dashTeacher) els.dashTeacher.hidden = !show;
    teacherGateCheckedFor = who;
  }

  function syncShell() {
    var on = loggedIn();
    document.body.classList.toggle("app-on", on);
    els.shell.hidden = !on;
    els.guest.hidden = on;
    els.guestFooter.hidden = on;
    if (els.cta) els.cta.textContent = on ? "继续写作" : "开始写作";
    if (els.heroNote) {
      els.heroNote.textContent = on
        ? "已登录。进工作台后直接写，模型由站内直连。"
        : "生成需要登录：密码登录，或邮箱验证码登录后补设密码。";
    }
    refreshTeacherGate();
    // 只有从未登录变为已登录（或首次进来）才切视图；单纯的积分更新不动滚动位置
    if (on && shellOn !== true) setView(viewFromHash(), true);
    shellOn = on;
  }

  /* ---------------- 视图一：我的作文 ---------------- */

  function fmtTime(s) {
    if (!s) return "";
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s).slice(0, 16);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" +
      ("0" + d.getDate()).slice(-2) + " " + ("0" + d.getHours()).slice(-2) + ":" +
      ("0" + d.getMinutes()).slice(-2);
  }

  function handoff(essay) {
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({ essay: essay, ts: Date.now() }));
    } catch (e) {
      setMsg(els.essayMsg, "浏览器存储不可用，没能带回工作台。", "error");
      return;
    }
    location.href = "write.html?resume=1";
  }

  /* ---------------- 视图一：思维导图 ----------------
     板块按「写了什么」分，和基础参数里的文体/类别不是一回事。
     导图只负责摆节点和连线，数据、接口、弹层都在这一层。 */
  var allRows = [];
  var boardDefs = [];
  var boardPollTimer = 0;
  var boardPolls = 0;

  function rowOf(id) {
    for (var i = 0; i < allRows.length; i++) if (allRows[i].id === id) return allRows[i];
    return null;
  }

  function fallbackBoards(rows) {
    var seen = {};
    rows.forEach(function (r) { seen[r.board || "other"] = 1; });
    var keys = Object.keys(seen);
    if (!keys.length) keys = ["other"];
    return keys.map(function (k) {
      return { key: k, label: k === "other" ? "暂未归类" : k, hint: "", color: "#1d7048" };
    });
  }

  function renderMindmap(rows, boards) {
    allRows = rows || [];
    boardDefs = (boards && boards.length) ? boards : fallbackBoards(allRows);
    if (!window.WY_MINDMAP) {
      setMsg(els.essayMsg, "导图组件没加载，刷新页面再试。", "error");
      return;
    }
    window.WY_MINDMAP.render({ rows: allRows, boards: boardDefs }, {
      onOpen: function (id) { openEssay(id); },
      onParams: function (id) { var r = rowOf(id); if (r) openParams(r); },
      onPoster: function (id) { var r = rowOf(id); if (r) openPoster(r); },
      onDelete: function (id) { var r = rowOf(id); deleteEssay(id, r ? r.title : "无题"); },
      onBoardChange: function (id, key) { changeBoard(id, key); }
    });
  }

  function updateClassifyHint(n, total) {
    if (!els.classifyHint) return;
    if (!total || !n) { els.classifyHint.hidden = true; return; }
    els.classifyHint.hidden = false;
    if (els.classifyText) {
      els.classifyText.textContent = "有 " + n + " 篇旧作文还没归到板块，先暂放在「暂未归类」。";
    }
  }

  function fillBoardSelect() {
    if (!els.importBoard || els.importBoard.getAttribute("data-filled")) return;
    boardDefs.forEach(function (b) {
      if (b.key === "other") return;
      var o = document.createElement("option");
      o.value = b.key; o.textContent = b.label;
      els.importBoard.appendChild(o);
    });
    els.importBoard.setAttribute("data-filled", "1");
  }

  async function classifyAll() {
    if (!els.classifyBtn) return;
    els.classifyBtn.disabled = true;
    setMsg(els.essayMsg, "正在把旧作文归到板块…");
    try {
      var j = await api("/api/essays/classify", { method: "POST", body: {} });
      var msg = j.message || "归类完成。";
      await loadEssays();
      setMsg(els.essayMsg, msg + " 归类只是建议，每个节点上都能自己改。", "ok");
    } catch (e) {
      setMsg(els.essayMsg, "归类失败：" + ((e && e.message) || "未知错误"), "error");
    } finally {
      els.classifyBtn.disabled = false;
    }
  }

  async function changeBoard(id, key) {
    setMsg(els.essayMsg, "正在移动…");
    try {
      var j = await api("/api/essays/" + encodeURIComponent(id) + "/board", {
        method: "PUT", body: { board: key }
      });
      await loadEssays();
      setMsg(els.essayMsg, "已移到「" + (j.label || "") + "」，之后不会再被自动归类覆盖。", "ok");
    } catch (e) {
      setMsg(els.essayMsg, "移动失败：" + ((e && e.message) || "未知错误"), "error");
    }
  }

  function hideNoMatch() {
    if (els.deriveNoMatch) els.deriveNoMatch.setAttribute("hidden", "");
    if (els.deriveSkipBtn) els.deriveSkipBtn.removeAttribute("hidden");
  }

  function showNoMatch(reason) {
    if (els.deriveNoMatchWhy) {
      els.deriveNoMatchWhy.textContent = String(reason || "旧稿里没有能撑起这个题目的场面，硬拼反而写散了。").trim().slice(0, 160);
    }
    if (els.deriveNoMatch) els.deriveNoMatch.removeAttribute("hidden");
    if (els.deriveSkipBtn) els.deriveSkipBtn.setAttribute("hidden", "");
  }

  /* 派生不下去就转正常新文流程：题目带进工作台，不让用户再敲一遍。 */
  function goNewEssay() {
    deriveFromCreate = false;
    var topic = els.deriveTopic ? els.deriveTopic.value.trim() : "";
    location.href = "write.html?new=1&topic=" + encodeURIComponent(topic);
  }

  /* 创建作文时明确不派生：跳过判断，直接进全新写作流程。 */
  function skipDerive() {
    deriveFromCreate = false;
    closeDerive();
    location.href = "write.html?new=1";
  }

  /* 创建作文入口：先登录，再进派生判断弹层。登录成功后自动续上。 */
  function openCreateSmart() {
    deriveFromCreate = true;
    if (!loggedIn()) {
      pendingDerive = true;
      if (auth()) auth().open("login");
      return;
    }
    openDerive();
  }

  /* 派生改成和创建作文一样的三步：文体 → 题目字数 → 确认。 */
  function pickedDeriveGenre() {
    var custom = els.deriveGenre ? els.deriveGenre.value.trim() : "";
    return custom || deriveGenrePick || "";
  }

  function setDeriveStep(n) {
    deriveStep = Math.max(1, Math.min(3, Number(n) || 1));
    document.querySelectorAll("#deriveMask .derive-step").forEach(function (el) {
      var s = parseInt(el.getAttribute("data-dscreen"), 10);
      if (s === deriveStep) el.removeAttribute("hidden"); else el.setAttribute("hidden", "");
    });
    if (els.deriveSteps) {
      els.deriveSteps.querySelectorAll("li").forEach(function (li) {
        var s = parseInt(li.getAttribute("data-dstep"), 10);
        if (s === deriveStep) li.classList.add("active"); else li.classList.remove("active");
        if (s < deriveStep) li.classList.add("done"); else li.classList.remove("done");
      });
    }
    if (els.derivePrev) els.derivePrev.hidden = deriveStep === 1;
    if (els.deriveNext) els.deriveNext.hidden = deriveStep === 3;
    if (els.deriveGo) els.deriveGo.hidden = deriveStep !== 3;
    if (deriveStep === 3) {
      var topic = els.deriveTopic ? els.deriveTopic.value.trim() : "";
      var words = parseInt(els.deriveWords ? els.deriveWords.value : "700", 10) || 700;
      if (els.deriveSummary) {
        /* 用 DOM 文本节点拼，不用 innerHTML：题目是用户自己填的，不能当 HTML 解析 */
        els.deriveSummary.textContent = "";
        [["文体", pickedDeriveGenre() || "跟随旧稿"],
         ["新题目", topic || "（未填）"],
         ["目标字数", words + " 字"]].forEach(function (pair) {
          var row = document.createElement("div");
          var k = document.createElement("span"); k.textContent = pair[0];
          var v = document.createElement("strong"); v.textContent = pair[1];
          row.appendChild(k); row.appendChild(v);
          els.deriveSummary.appendChild(row);
        });
      }
    }
  }

  function nextDeriveStep() {
    if (deriveStep === 1) {
      if (els.deriveGenres) {
        els.deriveGenres.querySelectorAll(".derive-genre").forEach(function (b) {
          if (b.classList.contains("active")) deriveGenrePick = b.getAttribute("data-genre") || "记叙文";
        });
      }
      setDeriveStep(2);
      return;
    }
    if (deriveStep === 2) {
      var topic = els.deriveTopic ? els.deriveTopic.value.trim() : "";
      if (!topic) { setMsg(els.deriveMsg, "先写一个新题目。", "error"); return; }
      setMsg(els.deriveMsg, "");
      setDeriveStep(3);
    }
  }

  function openDerive() {
    if (!loggedIn()) { if (auth()) auth().open("login"); return; }
    setMsg(els.deriveMsg, "");
    hideNoMatch();
    setDeriveStep(1);
    if (els.deriveMask) els.deriveMask.removeAttribute("hidden");
  }

  function closeDerive() {
    if (els.deriveMask) els.deriveMask.setAttribute("hidden", "");
  }

  async function runDerive() {
    var topic = els.deriveTopic ? els.deriveTopic.value.trim() : "";
    if (!topic) { setMsg(els.deriveMsg, "先写一个新题目。", "error"); return; }
    var n = parseInt(els.deriveWords ? els.deriveWords.value : "700", 10) || 700;
    hideNoMatch();
    els.deriveGo.disabled = true;
    setMsg(els.deriveMsg, "正在翻旧稿，先判断有没有真能撑起这个题目的素材…");
    try {
      var j = await api("/api/essays/derive", {
        method: "POST",
        body: {
          topic: topic,
          words: Math.max(300, Math.min(1600, n)),
          genre: pickedDeriveGenre()
        }
      });
      /* 挑不到素材是正常结论：不出稿、不扣分，直接给新文入口。 */
      if (j.matched === false) {
        showNoMatch(j.reason);
        setMsg(els.deriveMsg, "这次没扣分，可以直接按这个题目写新文。", "ok");
        if (auth() && auth().refreshCredits) auth().refreshCredits();
        return;
      }
      setMsg(els.deriveMsg, "派生好了《" + esc(j.title || "无题") + "》。", "ok");
      await loadEssays(true);
      var tail = (j.note ? " " + String(j.note) : "");
      setMsg(els.essayMsg, "《" + esc(j.title || "无题") + "》已进导图，金色虚线连着借过的 " +
        ((j.sourceIds || []).length || 1) + " 篇素材。" + tail, "ok");
      if (auth() && auth().refreshCredits) auth().refreshCredits();
      /* 从「创建作文」进来：判断完直接打开派生稿接着写；
         从「我的作文」导图进来：留在原地看新连的虚线。 */
      if (deriveFromCreate) {
        deriveFromCreate = false;
        var eid = j.id;
        window.setTimeout(function () {
          if (eid) location.href = "write.html?essay=" + encodeURIComponent(eid);
          else closeDerive();   // 后端没给 id 就留在原地，不跳到 ?essay=undefined
        }, 900);
      } else {
        window.setTimeout(closeDerive, 1000);
      }
    } catch (e) {
      hideNoMatch();
      setMsg(els.deriveMsg, "派生失败：" + ((e && e.message) || "未知错误"), "error");
    } finally {
      els.deriveGo.disabled = false;
    }
  }

  async function loadEssays(quiet) {
    if (!loggedIn()) return;
    if (!quiet) setMsg(els.essayMsg, "正在加载…");
    try {
      var j = await api("/api/essays");
      renderMindmap(j.essays || [], j.boards);
      updateClassifyHint(j.unboarded || 0, (j.essays || []).length);
      fillBoardSelect();
      if (!quiet) setMsg(els.essayMsg, "");
      /* 新作文是保存后异步归类的，几秒后补拉一次最多两回，
         用户不用手动刷新就能看到它自己落进哪个板块。 */
      if ((j.unboarded || 0) > 0 && boardPolls < 2 && !boardPollTimer) {
        boardPolls++;
        boardPollTimer = window.setTimeout(function () {
          boardPollTimer = 0;
          if (currentView === "essays" && loggedIn()) loadEssays(true);
        }, 4200);
      }
      if (!(j.unboarded || 0)) boardPolls = 0;
    } catch (e) {
      if (!quiet) setMsg(els.essayMsg, "加载失败：" + ((e && e.message) || "未知错误"), "error");
    }
  }

  async function openEssay(id) {
    setMsg(els.essayMsg, "正在打开这篇作文…");
    try {
      var j = await api("/api/essays/" + encodeURIComponent(id));
      if (!j.essay) throw new Error("没有取到内容");
      handoff(j.essay);
    } catch (e) {
      setMsg(els.essayMsg, "打开失败：" + ((e && e.message) || "未知错误"), "error");
    }
  }

  /* 列表卡片只有摘要，海报要正文，所以先取详情再交给海报模块 */
  function posterData(essay) {
    var p = parseParams(essay.params, essay);
    return {
      title: essay.title || "无题",
      body: essay.body || "",
      category: essay.category || "",
      province: essay.province || "",
      genre: p.genre,
      stage: p.stage,
      wordCount: essay.word_count || p.words || words(essay.body),
      date: essay.updated_at || essay.created_at
    };
  }

  async function openPoster(row) {
    if (!window.WY_POSTER) {
      setMsg(els.essayMsg, "海报组件没加载，刷新页面再试。", "error");
      return;
    }
    setMsg(els.essayMsg, "正在取这篇作文的正文…");
    try {
      var j = await api("/api/essays/" + encodeURIComponent(row.id));
      if (!j.essay) throw new Error("没有取到内容");
      setMsg(els.essayMsg, "");
      window.WY_POSTER.open(posterData(j.essay));
    } catch (e) {
      setMsg(els.essayMsg, "海报打开失败：" + ((e && e.message) || "未知错误"), "error");
    }
  }

  async function deleteEssay(id, title) {
    if (!window.confirm("删除《" + esc(title || "无题") + "》？删掉就找不回来了。")) return;
    try {
      await api("/api/essays/" + encodeURIComponent(id), { method: "DELETE" });
      setMsg(els.essayMsg, "已删除。", "ok");
      loadEssays();
    } catch (e) {
      setMsg(els.essayMsg, "删除失败：" + ((e && e.message) || "未知错误"), "error");
    }
  }

  /* ---------------- 视图二：创建作文 / 录入作文 ---------------- */

  function bindCount(input, out) {
    if (!input || !out) return;
    input.addEventListener("input", function () { out.textContent = words(input.value) + " 字"; });
  }

  async function saveImported(title, body) {
    if (!loggedIn()) {
      if (auth()) auth().open("login");
      setMsg(els.importMsg, "登录后才能保存到你的账号。", "error");
      return;
    }
    var text = String(body || "").trim();
    if (!text) {
      setMsg(els.importMsg, "正文还是空的，先把作文内容放进来。", "error");
      return;
    }
    var btn = els.importSave;
    var p = readParams(els.importParams);
    btn.disabled = true;
    setMsg(els.importMsg, "正在保存…");
    try {
      var j = await api("/api/essays", {
        method: "POST",
        body: {
          title: String(title || "").trim().slice(0, 120) || "无题",
          body: text,
          outline: "",
          category: p.cat + " · " + p.genre,
          province: p.prov.join("、"),
          params: JSON.stringify(p),
          board: els.importBoard ? els.importBoard.value : "",
          session: "",
          wordCount: words(text)
        }
      });
      setMsg(els.importMsg, "已保存到「我的作文」。", "ok");
      els.importBody.value = ""; els.importTitle.value = "";
      els.importCount.textContent = "0 字";
      setView("essays");
      await loadEssays();
      setMsg(els.essayMsg, "录进来了，点「继续修改」就能回到工作台润色、评改。", "ok");
    } catch (e) {
      setMsg(els.importMsg, "保存失败：" + ((e && e.message) || "未知错误"), "error");
    } finally {
      btn.disabled = false;
    }
  }


  /* ---------------- 视图三：账户设置 ---------------- */

  async function loadAccount() {
    if (!loggedIn()) return;
    if (els.appEmail) els.appEmail.textContent = (auth().email && auth().email()) || "—";
    if (els.appUser) els.appUser.textContent = (auth().user && auth().user()) || "";
    if (els.appPassword) {
      var has = auth() && auth().hasPassword && auth().hasPassword();
      els.appPassword.textContent = has ? "修改密码" : "设置密码（推荐）";
    }
    if (els.appCredits) els.appCredits.textContent = "…";
    try {
      var n = auth().refreshCredits ? await auth().refreshCredits() : null;
      if (els.appCredits) els.appCredits.textContent = (n === null || n === undefined) ? "—" : fmtCredits(n);
    } catch (e) {
      if (els.appCredits) els.appCredits.textContent = "—";
    }
  }

  /* ---------------- 账户设置：我的文风 ----------------
     用户不选，AI 读稿定档；这里只负责展示和纠偏。 */
  var sty = { dims: [], summary: "", marks: [], rules: [], anchors: [], auto: null, loaded: false, syncing: false };

  function stySetMsg(text, kind) {
    if (!els.styleMsg) return;
    els.styleMsg.textContent = text || "";
    els.styleMsg.className = "style-msg" + (kind ? " " + kind : "");
  }

  function renderVerdict() {
    if (!els.styleVerdict) return;
    var has = sty.dims && sty.dims.length > 0;
    els.styleVerdict.hidden = !has;
    els.styleEmpty.hidden = has;
    if (!has) return;
    els.styleSummary.textContent = sty.summary || "";
    els.styleSummary.hidden = !sty.summary;
    els.styleTags.innerHTML = "";
    sty.dims.forEach(function (d) {
      var tag = document.createElement("span");
      tag.className = "style-tag";
      if (d.say) tag.title = d.say;
      var em = document.createElement("em");
      em.textContent = d.label;
      tag.appendChild(em);
      tag.appendChild(document.createTextNode(d.name));
      els.styleTags.appendChild(tag);
    });
  }

  function renderMarks() {
    if (!els.styleMarkList) return;
    els.styleMarkList.innerHTML = "";
    sty.marks.forEach(function (t, i) {
      var row = document.createElement("div");
      row.className = "style-mark-row";
      var inp = document.createElement("input");
      inp.type = "text";
      inp.className = "style-mark-input";
      inp.maxLength = 60;
      inp.placeholder = "例：结尾别喊口号";
      inp.value = t;
      inp.addEventListener("input", function () { sty.marks[i] = inp.value; });
      var del = document.createElement("button");
      del.type = "button";
      del.className = "style-mark-del";
      del.setAttribute("aria-label", "删除这条");
      del.textContent = "×";
      del.addEventListener("click", function () {
        sty.marks.splice(i, 1);
        renderMarks();
        stySetMsg("改完记得保存", "");
      });
      row.appendChild(inp);
      row.appendChild(del);
      els.styleMarkList.appendChild(row);
    });
    els.styleAddMark.disabled = sty.marks.length >= 6;
  }

  /* 长期要求只读展示 + 删除。AI 判定错了、或者这条要求过时了，用户可以自己撤掉。 */
  function renderRules() {
    if (!els.styleRuleList) return;
    els.styleRuleList.innerHTML = "";
    if (els.styleRuleEmpty) els.styleRuleEmpty.hidden = sty.rules.length > 0;
    sty.rules.forEach(function (t, i) {
      var row = document.createElement("div");
      row.className = "style-rule-row";
      var tx = document.createElement("span");
      tx.className = "style-rule-text";
      tx.textContent = t;
      var del = document.createElement("button");
      del.type = "button";
      del.className = "style-rule-del";
      del.setAttribute("aria-label", "忘掉这条");
      del.title = "忘掉这条";
      del.textContent = "×";
      del.addEventListener("click", async function () {
        var next = sty.rules.filter(function (_, k) { return k !== i; });
        del.disabled = true;
        try {
          var j = await api("/api/style", { method: "PUT", body: { rules: next } });
          sty.rules = j.rules || next;
          renderRules();
          stySetMsg("已忘掉，下一轮起不再生效", "ok");
        } catch (e) {
          del.disabled = false;
          stySetMsg("删除失败：" + ((e && e.message) || "网络错误"), "error");
        }
      });
      row.appendChild(tx);
      row.appendChild(del);
      els.styleRuleList.appendChild(row);
    });
  }

  function renderReport() {
    if (!els.styleReport) return;
    var a = sty.auto;
    els.styleReport.innerHTML = "";
    if (!a || !a.n) {
      els.styleReport.hidden = true;
      return;
    }
    els.styleReport.hidden = false;

    var head = document.createElement("div");
    head.className = "style-report-head";
    head.textContent = a.enough
      ? "从你 " + a.n + " 篇稿子里量出来的"
      : "暂时只量到 " + a.n + " 篇，样本太少，读数仅供参考";
    els.styleReport.appendChild(head);

    if (a.enough && a.insights && a.insights.length) {
      var grid = document.createElement("div");
      grid.className = "style-insights";
      a.insights.forEach(function (it) {
        var card = document.createElement("div");
        card.className = "style-insight";
        var top = document.createElement("div");
        top.className = "si-top";
        var k = document.createElement("span");
        k.className = "si-k";
        k.textContent = it.k;
        var v = document.createElement("strong");
        v.textContent = it.v;
        var tag = document.createElement("em");
        tag.textContent = it.tag;
        top.appendChild(k);
        top.appendChild(v);
        top.appendChild(tag);
        card.appendChild(top);
        if (it.note) {
          var p = document.createElement("p");
          p.textContent = it.note;
          card.appendChild(p);
        }
        grid.appendChild(card);
      });
      els.styleReport.appendChild(grid);
    }

    if (sty.anchors && sty.anchors.length) {
      var an = document.createElement("div");
      an.className = "style-anchors";
      var t = document.createElement("div");
      t.className = "style-anchors-tip";
      t.textContent = "语感样本：下面几句是你自己写的，写作时只让 AI 学这个口气，内容不许搬";
      an.appendChild(t);
      sty.anchors.slice(0, 3).forEach(function (x) {
        var q = document.createElement("div");
        q.className = "style-anchor";
        q.textContent = "「" + x + "」";
        an.appendChild(q);
      });
      els.styleReport.appendChild(an);
    }

    var note = document.createElement("p");
    note.className = "style-report-note";
    note.textContent = "读数只用来看清自己现在的写法，也让评分别把「你一贯的短句」当成内容单薄。它不会让 AI 照着你现在的水平写。";
    els.styleReport.appendChild(note);
  }

  function applyStyle(j) {
    sty.dims = j.dims || [];
    sty.summary = (j.ai && j.ai.summary) || "";
    sty.marks = (j.marks || []).slice(0, 6);
    if (j && j.rules) sty.rules = j.rules.slice(0, 6);
    sty.anchors = j.anchors || [];
    sty.auto = j.auto || null;
    renderVerdict();
    renderMarks();
    renderRules();
    renderReport();
  }

  async function loadStyle() {
    if (!loggedIn() || !els.styleVerdict) return;
    if (sty.syncing) return;
    sty.syncing = true;
    try {
      var j = await api("/api/style");
      sty.loaded = true;
      applyStyle(j);
      stySetMsg("", "");
    } catch (e) {
      stySetMsg("文风设置没取到：" + ((e && e.message) || "网络错误"), "error");
    }
    sty.syncing = false;
  }

  async function saveStyle() {
    if (!loggedIn()) return;
    var marks = sty.marks.map(function (x) { return String(x || "").trim(); }).filter(Boolean);
    els.styleSave.disabled = true;
    stySetMsg("正在保存…", "");
    try {
      var j = await api("/api/style", { method: "PUT", body: { marks: marks } });
      sty.marks = j.marks || marks;
      renderMarks();
      stySetMsg("已保存，下次写作生效", "ok");
    } catch (e) {
      stySetMsg("保存失败：" + ((e && e.message) || "网络错误"), "error");
    }
    els.styleSave.disabled = false;
  }

  /* AI 读稿要跑一次模型，十几秒很正常，按钮期间锁住并写明在干什么 */
  async function scanStyle() {
    if (!loggedIn()) return;
    els.styleScan.disabled = true;
    els.styleScan.textContent = "正在读你的稿子…";
    stySetMsg("AI 正在读你写过的段落，通常十几秒", "");
    try {
      var j = await api("/api/style/scan", { method: "POST", body: {} });
      applyStyle(j);
      if (j.aiError) stySetMsg(j.aiError, "error");
      else if (!j.dims || !j.dims.length) stySetMsg("这次没读出结果，稍后再点一次", "");
      else stySetMsg("读完了，下次写作就按这个来", "ok");
    } catch (e) {
      stySetMsg("读完失败：" + ((e && e.message) || "网络错误"), "error");
    }
    els.styleScan.disabled = false;
    els.styleScan.textContent = "让 AI 读一遍";
  }

  /* ---------------- 事件 ---------------- */

  mountParams(els.importParams);
  mountParams(els.paramsForm);

  function closeParams() { if (els.paramsMask) els.paramsMask.setAttribute("hidden", ""); }
  if (els.paramsClose) els.paramsClose.addEventListener("click", closeParams);
  if (els.paramsSave) els.paramsSave.addEventListener("click", saveParams);
  if (els.paramsMask) {
    els.paramsMask.addEventListener("click", function (e) { if (e.target === els.paramsMask) closeParams(); });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (els.paramsMask && !els.paramsMask.hasAttribute("hidden")) closeParams();
      if (els.deriveMask && !els.deriveMask.hasAttribute("hidden")) closeDerive();
    }
  });
  if (els.classifyBtn) els.classifyBtn.addEventListener("click", classifyAll);
  if (els.deriveOpen) els.deriveOpen.addEventListener("click", function () {
    deriveFromCreate = false;
    openDerive();
  });
  if (els.createSmartBtn) els.createSmartBtn.addEventListener("click", function (e) {
    if (e) e.preventDefault();   // 保留 href 只作无 JS 降级，正常走判断流程
    openCreateSmart();
  });
  if (els.deriveClose) els.deriveClose.addEventListener("click", closeDerive);
  if (els.deriveNext) els.deriveNext.addEventListener("click", nextDeriveStep);
  if (els.derivePrev) els.derivePrev.addEventListener("click", function () { setDeriveStep(deriveStep - 1); });
  if (els.deriveGenres) {
    els.deriveGenres.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest(".derive-genre") : null;
      if (!b) return;
      els.deriveGenres.querySelectorAll(".derive-genre").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      deriveGenrePick = b.getAttribute("data-genre") || "记叙文";
    });
  }
  if (els.deriveGo) els.deriveGo.addEventListener("click", runDerive);
  if (els.deriveNewBtn) els.deriveNewBtn.addEventListener("click", goNewEssay);
  if (els.deriveSkipBtn) els.deriveSkipBtn.addEventListener("click", skipDerive);
  if (els.deriveMask) {
    els.deriveMask.addEventListener("click", function (e) { if (e.target === els.deriveMask) closeDerive(); });
  }
  if (els.deriveTopic) {
    els.deriveTopic.addEventListener("input", hideNoMatch);
    els.deriveTopic.addEventListener("keydown", function (e) { if (e.key === "Enter") runDerive(); });
  }
  if (els.styleSave) els.styleSave.addEventListener("click", saveStyle);
  if (els.styleScan) els.styleScan.addEventListener("click", scanStyle);
  if (els.styleAddMark) {
    els.styleAddMark.addEventListener("click", function () {
      if (sty.marks.length >= 6) return;
      sty.marks.push("");
      renderMarks();
      stySetMsg("改完记得保存", "");
    });
  }
  if (els.appPassword) {
    els.appPassword.addEventListener("click", function () {
      if (!loggedIn()) { if (auth()) auth().open("login"); return; }
      var has = auth() && auth().hasPassword && auth().hasPassword();
      if (auth() && auth().openPassword) auth().openPassword(has);
    });
  }

  if (els.cta) {
    els.cta.addEventListener("click", function () {
      if (loggedIn()) { location.href = "write.html"; return; }
      pending = true;
      if (auth()) auth().open("login");
    });
  }

  Array.prototype.forEach.call(els.sideItems, function (b) {
    b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
  });
  Array.prototype.forEach.call(els.tabItems, function (b) {
    b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
  });
  if (els.topicGen) els.topicGen.addEventListener("click", generateTopics);
  if (els.topicDirection) {
    els.topicDirection.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); generateTopics(); }
    });
  }
  if (els.refresh) els.refresh.addEventListener("click", function () { loadEssays(); });

  bindCount(els.importBody, els.importCount);

  if (els.importSave) {
    els.importSave.addEventListener("click", function () {
      saveImported(els.importTitle.value, els.importBody.value);
    });
  }
  if (els.appLogout) {
    els.appLogout.addEventListener("click", function () {
      if (auth() && auth().logout) auth().logout();
      else location.reload();
    });
  }

  window.addEventListener("hashchange", function () { if (loggedIn()) setView(viewFromHash(), true); });

  window.addEventListener("load", function () {
    syncShell();
    if (auth() && auth().onChange) {
      auth().onChange(function (user) {
        syncShell();
        if (user && pending) { pending = false; location.href = "write.html"; }
        if (user && pendingDerive) { pendingDerive = false; openDerive(); }
        if (user && pendingLanding) {
          var target = pendingLanding;
          pendingLanding = null;
          /* syncShell 已经切到工作台，再落到入口指定的视图 */
          goLanding(target);
        }
      });
    }
  });
})();
