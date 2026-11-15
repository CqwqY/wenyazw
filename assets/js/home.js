/* 文芽作文 - 主页
   未登录：介绍页；登录后：三视图（我的作文 / 创建作文 / 账户设置）。
   电脑端左侧边栏，手机端底部三 tab，共用同一套视图切换。 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  var RESUME_KEY = "wy.resume.v1";

  function $(id) { return document.getElementById(id); }
  var els = {
    guest: $("guestView"), guestFooter: $("guestFooter"), shell: $("appShell"),
    cta: $("homeCta"), heroNote: $("heroNote"),
    views: { essays: $("viewEssays"), create: $("viewCreate"), account: $("viewAccount") },
    sideItems: document.querySelectorAll(".side-item"),
    tabItems: document.querySelectorAll(".app-tab"),
    list: $("essayList"), essayMsg: $("essayMsg"), refresh: $("refreshEssays"),
    importType: $("importType"),
    importTitle: $("importTitle"), importBody: $("importBody"), importCount: $("importCount"),
    importSave: $("importSave"), importMsg: $("importMsg"),
    importParams: $("importParams"), paramTpl: $("paramTpl"),
    paramsMask: $("paramsMask"), paramsForm: $("paramsForm"), paramsClose: $("paramsClose"),
    paramsSave: $("paramsSave"), paramsMsg: $("paramsMsg"), paramsHint: $("paramsHint"),
    appEmail: $("appEmail"), appUser: $("appUser"), appCredits: $("appCredits"),
    appPassword: $("appPassword"), appLogout: $("appLogout"),
    styleVerdict: $("styleVerdict"), styleSummary: $("styleSummary"), styleTags: $("styleTags"),
    styleEmpty: $("styleEmpty"), styleMarkList: $("styleMarkList"), styleAddMark: $("styleAddMark"),
    styleSave: $("styleSave"), styleMsg: $("styleMsg"), styleScan: $("styleScan"),
    styleReport: $("styleReport")
  };

  var currentView = "essays";
  var pending = false;
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

  /* ---------------- 视图切换 ---------------- */

  function setView(name, noHash) {
    if (!els.views[name]) name = "essays";
    currentView = name;
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
    if (name === "essays" && loggedIn()) loadEssays();
    if (name === "account" && loggedIn()) { loadAccount(); loadStyle(); }
    window.scrollTo(0, 0);
  }

  function viewFromHash() {
    var h = (location.hash || "").replace("#", "");
    return els.views[h] ? h : "essays";
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
    if (on) setView(viewFromHash(), true);
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

  function renderList(rows) {
    els.list.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("div");
      empty.className = "essay-empty";
      empty.textContent = "还没有作文。去「创建作文」写一篇，或把已有的作文录进来。";
      els.list.appendChild(empty);
      return;
    }
    rows.forEach(function (r) {
      var card = document.createElement("div");
      card.className = "essay-card";

      var meta = document.createElement("div");
      meta.className = "essay-meta";
      [fmtTime(r.updated_at || r.created_at),
        (r.word_count || 0) + " 字",
        r.category ? esc(r.category) : "",
        r.has_outline ? "有大纲" : ""].filter(Boolean).forEach(function (t) {
        var tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = t;
        meta.appendChild(tag);
      });
      card.appendChild(meta);

      var h3 = document.createElement("h3");
      h3.textContent = esc(r.title || "无题");
      card.appendChild(h3);

      var acts = document.createElement("div");
      acts.className = "essay-card-actions";

      var go = document.createElement("button");
      go.type = "button";
      go.className = "btn btn-primary";
      go.textContent = "继续修改";
      go.addEventListener("click", function () { openEssay(r.id); });
      acts.appendChild(go);

      var prm = document.createElement("button");
      prm.type = "button";
      prm.className = "btn-outline";
      prm.textContent = "改参数";
      prm.addEventListener("click", function () { openParams(r); });
      acts.appendChild(prm);

      var pst = document.createElement("button");
      pst.type = "button";
      pst.className = "btn-outline";
      pst.textContent = "作文海报";
      pst.addEventListener("click", function () { openPoster(r); });
      acts.appendChild(pst);

      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn-outline";
      del.textContent = "删除";
      del.addEventListener("click", function () { deleteEssay(r.id, r.title); });
      acts.appendChild(del);

      card.appendChild(acts);
      els.list.appendChild(card);
    });
  }

  async function loadEssays() {
    if (!loggedIn()) return;
    setMsg(els.essayMsg, "正在加载…");
    try {
      var j = await api("/api/essays");
      renderList(j.essays || []);
      setMsg(els.essayMsg, "");
    } catch (e) {
      setMsg(els.essayMsg, "加载失败：" + ((e && e.message) || "未知错误"), "error");
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
      if (els.appCredits) els.appCredits.textContent = (n === null || n === undefined) ? "—" : String(n);
    } catch (e) {
      if (els.appCredits) els.appCredits.textContent = "—";
    }
  }

  /* ---------------- 账户设置：我的文风 ----------------
     用户不选，AI 读稿定档；这里只负责展示和纠偏。 */
  var sty = { dims: [], summary: "", marks: [], anchors: [], auto: null, loaded: false, syncing: false };

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
    sty.anchors = j.anchors || [];
    sty.auto = j.auto || null;
    renderVerdict();
    renderMarks();
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
    if (e.key === "Escape" && els.paramsMask && !els.paramsMask.hasAttribute("hidden")) closeParams();
  });
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
  if (els.refresh) els.refresh.addEventListener("click", loadEssays);

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
      });
    }
  });
})();
