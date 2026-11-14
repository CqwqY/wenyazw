/* 文芽作文 - 主页
   未登录：介绍页；登录后：三视图（我的作文 / 创建作文 / 账户设置）。
   电脑端左侧边栏，手机端底部三 tab，共用同一套视图切换。 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  var RESUME_KEY = "wy.resume.v1";

  /* 识别组件：cdn.jsdelivr.net 在不少网络里直接连不上，单个 CDN 会一上来就报「下载失败」。
     四个源同时试，谁先加载成功用谁；worker / core / 字库也显式指到同源可达地址，
     否则组件虽然加载了，内部默认还是会去 jsdelivr 拉 worker 而卡死。 */
  var TESS_VER = "5.1.1";
  var TESS_SOURCES = [
    { base: "https://unpkg.com/tesseract.js@" + TESS_VER, core: "https://unpkg.com/tesseract.js-core@" + TESS_VER + "/" },
    { base: "https://fastly.jsdelivr.net/npm/tesseract.js@" + TESS_VER, core: "https://fastly.jsdelivr.net/npm/tesseract.js-core@" + TESS_VER + "/" },
    { base: "https://gcore.jsdelivr.net/npm/tesseract.js@" + TESS_VER, core: "https://gcore.jsdelivr.net/npm/tesseract.js-core@" + TESS_VER + "/" },
    { base: "https://cdn.jsdelivr.net/npm/tesseract.js@" + TESS_VER, core: "https://cdn.jsdelivr.net/npm/tesseract.js-core@" + TESS_VER + "/" }
  ];
  var TESS_LANG_PATH = "https://tessdata.projectnaptha.com/4.0.0/";

  function $(id) { return document.getElementById(id); }
  var els = {
    guest: $("guestView"), guestFooter: $("guestFooter"), shell: $("appShell"),
    cta: $("homeCta"), heroNote: $("heroNote"),
    views: { essays: $("viewEssays"), create: $("viewCreate"), account: $("viewAccount") },
    sideItems: document.querySelectorAll(".side-item"),
    tabItems: document.querySelectorAll(".app-tab"),
    list: $("essayList"), essayMsg: $("essayMsg"), refresh: $("refreshEssays"),
    importTabs: $("importTabs"), importType: $("importType"), importPhoto: $("importPhoto"),
    importTitle: $("importTitle"), importBody: $("importBody"), importCount: $("importCount"),
    importSave: $("importSave"), importMsg: $("importMsg"),
    importParams: $("importParams"), paramTpl: $("paramTpl"),
    paramsMask: $("paramsMask"), paramsForm: $("paramsForm"), paramsClose: $("paramsClose"),
    paramsSave: $("paramsSave"), paramsMsg: $("paramsMsg"), paramsHint: $("paramsHint"),
    photoCapture: $("photoCapture"), photoPick: $("photoPick"),
    photoCaptureBtn: $("photoCaptureBtn"), photoPickBtn: $("photoPickBtn"),
    photoPreview: $("photoPreview"), ocrStatus: $("ocrStatus"), ocrRetry: $("ocrRetry"),
    photoTitle: $("photoTitle"), photoText: $("photoText"), photoCount: $("photoCount"),
    photoSave: $("photoSave"),
    appEmail: $("appEmail"), appUser: $("appUser"), appCredits: $("appCredits"),
    appPassword: $("appPassword"), appLogout: $("appLogout")
  };

  var currentView = "essays";
  var pending = false;
  var tessPromise = null;
  var tessReady = null;
  var lastPhoto = null;
  var ocrStage = "加载识别组件";
  var editingId = 0;
  var previewUrl = "";

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
    if (name === "account" && loggedIn()) loadAccount();
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

  function setImport(which) {
    els.importType.hidden = (which !== "type");
    els.importPhoto.hidden = (which !== "photo");
    Array.prototype.forEach.call(els.importTabs.querySelectorAll(".import-tab"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-import") === which);
    });
    setMsg(els.importMsg, "");
  }

  function bindCount(input, out) {
    if (!input || !out) return;
    input.addEventListener("input", function () { out.textContent = words(input.value) + " 字"; });
  }

  async function saveImported(title, body, src) {
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
    var btn = src === "photo" ? els.photoSave : els.importSave;
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
      if (src === "photo") {
        els.photoText.value = ""; els.photoTitle.value = "";
        els.photoCount.textContent = "0 字";
      } else {
        els.importBody.value = ""; els.importTitle.value = "";
        els.importCount.textContent = "0 字";
      }
      setView("essays");
      await loadEssays();
      setMsg(els.essayMsg, "录进来了，点「继续修改」就能回到工作台润色、评改。", "ok");
    } catch (e) {
      setMsg(els.importMsg, "保存失败：" + ((e && e.message) || "未知错误"), "error");
    } finally {
      btn.disabled = false;
    }
  }

  /* 拍摄录入：浏览器本地中文 OCR。
     四条 CDN 同时试，谁先加载成功用谁；worker / core / 字库都显式指到同源可达地址，
     否则组件加载了、内部默认还是会去不通的 jsdelivr 拉 worker 卡死。
     失败时清掉缓存的 Promise，点「重试识别」会真的重新发请求。 */
  function loadTesseract() {
    if (tessReady && window.Tesseract) return Promise.resolve(tessReady);
    if (tessPromise) return tessPromise;
    tessPromise = new Promise(function (resolve, reject) {
      var left = TESS_SOURCES.length;
      var settled = false;
      var timer = setTimeout(function () {
        fail("识别组件加载超时（15 秒），可能是网络挡住了外部 CDN");
      }, 15000);
      function fail(msg) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        tessPromise = null;
        reject(new Error(msg));
      }
      TESS_SOURCES.forEach(function (src) {
        var s = document.createElement("script");
        s.src = src.base + "/dist/tesseract.min.js";
        s.async = true;
        s.onload = function () {
          if (settled) return;
          if (!window.Tesseract) {
            left--;
            if (!left) fail("组件下载了但没初始化成功");
            return;
          }
          settled = true;
          clearTimeout(timer);
          tessReady = src;
          resolve(src);
        };
        s.onerror = function () {
          try { s.remove(); } catch (e) { /* ignore */ }
          left--;
          if (!settled && !left) fail("四条 CDN 线路都没连上，网络可能挡了外部资源");
        };
        document.head.appendChild(s);
      });
    });
    return tessPromise;
  }

  function setOcr(text) { if (els.ocrStatus) els.ocrStatus.textContent = text; }

  var OCR_PHASES = {
    "loading tesseract core": "下载识别内核",
    "initializing tesseract": "启动识别内核",
    "loading language traineddata": "下载中文字库",
    "initializing api": "准备识别",
    "recognizing text": "识别文字"
  };

  function ocrLogger(m) {
    if (!m) return;
    var label = OCR_PHASES[String(m.status || "")];
    if (!label) return;
    ocrStage = label;
    var p = (typeof m.progress === "number") ? " " + Math.round(m.progress * 100) + "%" : "";
    setOcr("正在" + label + p + "…");
  }

  function guessTitle(text) {
    var first = String(text || "").split(/\n/).map(function (t) { return t.trim(); })
      .filter(Boolean)[0] || "";
    first = first.replace(/^[《<【\[]+|[》>】\]]+$/g, "").replace(/[，。！？；：、,.!?;:]$/g, "");
    return first.slice(0, 24);
  }

  async function handlePhoto(file) {
    if (!file) return;
    lastPhoto = file;
    if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) { /* ignore */ } }
    previewUrl = URL.createObjectURL(file);
    els.photoPreview.hidden = false;
    els.photoPreview.innerHTML = "";
    var img = document.createElement("img");
    img.src = previewUrl;
    img.alt = "刚选的作文照片";
    els.photoPreview.appendChild(img);

    setMsg(els.importMsg, "");
    if (els.ocrRetry) els.ocrRetry.hidden = true;
    ocrStage = "加载识别组件";
    setOcr("正在加载识别组件（四条线路同时试）…");
    var worker = null;
    try {
      var src = await loadTesseract();
      ocrStage = "下载识别内核";
      setOcr("组件就位，正在下载识别内核与中文字库（第一次会慢一些）…");
      worker = await window.Tesseract.createWorker("chi_sim+eng", 1, {
        workerPath: src.base + "/dist/worker.min.js",
        corePath: src.core,
        langPath: TESS_LANG_PATH,
        logger: ocrLogger
      });
      ocrStage = "识别文字";
      var ret = await worker.recognize(file);
      await worker.terminate();
      worker = null;
      var text = String((ret && ret.data && ret.data.text) || "").replace(/\uFFFD+/g, "").trim();
      if (!text) {
        setOcr("这张图没认出字。可以点「重试识别」换个角度再拍一张，或把文字直接敲进下面的框里。");
        if (els.ocrRetry) els.ocrRetry.hidden = false;
        return;
      }
      els.photoText.value = text;
      els.photoCount.textContent = words(text) + " 字";
      if (!els.photoTitle.value.trim()) els.photoTitle.value = guessTitle(text);
      setOcr("识别完了。手写和照片角度会带错字，请对照原图校对一遍再保存。");
    } catch (e) {
      if (worker) { try { await worker.terminate(); } catch (x) { /* ignore */ } }
      var msg = (e && e.message) || "未知错误";
      setOcr("没做成（卡在「" + ocrStage + "」）：" + msg +
        "。可以点「重试识别」再试一次，或改用输入录入 / 直接把文字敲进下面的框里，照样能保存。");
      if (els.ocrRetry) els.ocrRetry.hidden = false;
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
  if (els.ocrRetry) {
    els.ocrRetry.addEventListener("click", function () { if (lastPhoto) handlePhoto(lastPhoto); });
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

  if (els.importTabs) {
    els.importTabs.addEventListener("click", function (e) {
      var b = e.target.closest(".import-tab");
      if (b) setImport(b.getAttribute("data-import"));
    });
  }
  bindCount(els.importBody, els.importCount);
  bindCount(els.photoText, els.photoCount);
  if (els.importSave) {
    els.importSave.addEventListener("click", function () {
      saveImported(els.importTitle.value, els.importBody.value, "type");
    });
  }
  if (els.photoSave) {
    els.photoSave.addEventListener("click", function () {
      saveImported(els.photoTitle.value, els.photoText.value, "photo");
    });
  }
  [els.photoCapture, els.photoPick].forEach(function (input) {
    if (!input) return;
    input.addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) handlePhoto(f);
      input.value = "";
    });
  });
  if (els.photoCaptureBtn) els.photoCaptureBtn.addEventListener("click", function () { els.photoCapture.click(); });
  if (els.photoPickBtn) els.photoPickBtn.addEventListener("click", function () { els.photoPick.click(); });
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
