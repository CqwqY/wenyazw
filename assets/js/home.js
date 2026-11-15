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

  /* 手机直出照片三五兆，传模型前先压到长边 1600：这个尺寸对识别足够了，
     再大只是白花带宽和积分（模型内部也会缩）。 */
  function compressPhoto(file, maxSide) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || 1;
          var h = img.naturalHeight || 1;
          var k = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * k));
          var ch = Math.max(1, Math.round(h * k));
          var cv = document.createElement("canvas");
          cv.width = cw;
          cv.height = ch;
          var ctx = cv.getContext("2d");
          // 透明 PNG 转 JPEG 会变黑底，先铺一层白
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
          resolve(cv.toDataURL("image/jpeg", 0.86));
        } catch (e) {
          try { URL.revokeObjectURL(url); } catch (x) { /* ignore */ }
          resolve("");
        }
      };
      img.onerror = function () {
        try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        resolve("");
      };
      img.src = url;
    });
  }

  /* ---------------- 本地识别专用：图像预处理 ----------------
     tesseract 认不准，八成不是模型不行，是照片的条件不对：
     光线不均、纸面发灰、字太小、有透视。先把它该有的条件补齐，
     再喂给识别，效果差别很大。这里只做灰度、拉伸、二值化三件事，
     不做去畸变 —— 那需要角点检测，手机拍歪的稿子先让用户重拍更实在。 */

  /* 灰度 + 对比度拉伸：按 2% 和 98% 分位取上下界，避免整片白纸拉成黑 */
  function toGrayData(img, maxSide, minSide) {
    var w = img.naturalWidth || 1;
    var h = img.naturalHeight || 1;
    var k = Math.min(1, maxSide / Math.max(w, h));
    if (minSide) k = Math.max(k, Math.min(3, minSide / Math.max(w, h)));
    var cw = Math.max(1, Math.round(w * k));
    var ch = Math.max(1, Math.round(h * k));
    var cv = document.createElement("canvas");
    cv.width = cw;
    cv.height = ch;
    var ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, cw, ch);
    var data = ctx.getImageData(0, 0, cw, ch);
    var px = data.data;
    for (var i = 0; i < px.length; i += 4) {
      var g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    return { data: data, w: cw, h: ch, cv: cv, ctx: ctx };
  }

  /* 对比度拉伸：按 2% / 98% 分位取上下界。必须在摊平光照之后做 ——
     先拉伸再摊平，暗区会被拉成死黑，除以背景也救不回来。 */
  function stretchContrast(d) {
    var px = d.data.data;
    var hist = new Array(256);
    var i;
    for (i = 0; i < 256; i++) hist[i] = 0;
    for (i = 0; i < px.length; i += 4) hist[px[i]]++;
    var total = d.w * d.h;
    var lo = 0, hi = 255, acc = 0;
    var cut = total * 0.02;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= cut) { lo = i; break; } }
    acc = 0;
    var cut2 = total * 0.98;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= cut2) { hi = i; break; } }
    if (hi - lo < 40) { lo = Math.max(0, lo - 20); hi = Math.min(255, hi + 20); }
    var span = Math.max(1, hi - lo);
    for (i = 0; i < px.length; i += 4) {
      var v = ((px[i] - lo) * 255 / span) | 0;
      if (v < 0) v = 0; else if (v > 255) v = 255;
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    d.ctx.putImageData(d.data, 0, 0);
  }

  /* Otsu 阈值：自动找前景/背景分界，比写死 128 稳得多 */
  function otsuThreshold(px) {
    var hist = new Array(256);
    var i;
    for (i = 0; i < 256; i++) hist[i] = 0;
    for (i = 0; i < px.length; i += 4) hist[px[i]]++;
    var total = px.length / 4;
    var sum = 0;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0, wB = 0, best = 0, thr = 128;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      var wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB;
      var mF = (sum - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = i; }
    }
    return thr;
  }

  function toDataUrl(cv) {
    try { return cv.toDataURL("image/jpeg", 0.92); } catch (e) { return ""; }
  }

  /* 光照归一化：把图切成十几像素宽的小块，每块取「最亮的那个像素」当这一块的纸色。
     取最大值而不是平均值 —— 平均值会被块里的字拉低，除完背景字就发白了（试过，糊）。
     然后每个像素除以自己那块的纸色，半边暗半边亮的照片就摊平了。 */
  function flattenLight(d, w, h) {
    var px = d.data.data;
    var block = Math.max(8, Math.round(Math.min(w, h) / 12));
    var bw = Math.ceil(w / block);
    var bh = Math.ceil(h / block);
    var maxv = new Uint8Array(bw * bh);
    var x, y, bi, v;
    for (y = 0; y < h; y++) {
      var rowOff = ((y / block) | 0) * bw;
      for (x = 0; x < w; x++) {
        v = px[(y * w + x) * 4];
        bi = rowOff + ((x / block) | 0);
        if (v > maxv[bi]) maxv[bi] = v;
      }
    }
    for (y = 0; y < h; y++) {
      var rOff = ((y / block) | 0) * bw;
      for (x = 0; x < w; x++) {
        bi = rOff + ((x / block) | 0);
        var bgv = maxv[bi];
        if (bgv < 24) bgv = 24;          // 整块都是黑的（墨污、手指）：别把它当纸色，否则一片惨白
        var i = (y * w + x) * 4;
        var nv = (px[i] * 255 / bgv) | 0;
        if (nv > 255) nv = 255;
        px[i] = px[i + 1] = px[i + 2] = nv;
      }
    }
    d.ctx.putImageData(d.data, 0, 0);
  }

  /* 出两版：摊平光照+拉伸过的（多数照片用这版），以及原图（纸就很干净时反而更准）。
     不自己二值化 —— 硬切阈值会把笔画切碎，tesseract 内部本来就会做一遍。 */
  function buildOcrVariants(img) {
    var out = [];
    try {
      var g = toGrayData(img, 2000, 1400);
      flattenLight(g, g.w, g.h);
      stretchContrast(g);
      out.push({ name: "flat", url: toDataUrl(g.cv) });
    } catch (e) { /* canvas 或内存受限时只留原图 */ }
    return out;
  }

  /* 打分：中文字与中文标点算正分，乱码字符扣分。
     同一张图的两版结果，谁分高用谁，不用猜。 */
  function scoreOcrText(t) {
    var s = String(t || "").replace(/\s/g, "");
    if (!s) return 0;
    var cjk = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
    var punct = (s.match(/[，。！？；：、“”‘’（）《》…—]/g) || []).length;
    var junk = (s.match(/[^\u4e00-\u9fa5\u3000-\u303f\uff00-\uffefA-Za-z0-9]/g) || []).length;
    return cjk + punct * 0.5 - junk * 1.6;
  }

  /* 主路：站内视觉模型。登录才用，一次 1 积分。
     本地 tesseract 认印刷体都勉强、认手写基本是乱码，只当没登录或服务挂了的兜底。 */
  async function ocrRemote(file) {
    var dataUrl = await compressPhoto(file, 1600);
    if (!dataUrl) return { ok: false, message: "这张图打不开，换一张再试" };
    /* 自己带超时：等 45 秒才回退本地，用户早以为卡死了。
       22 秒没回话就直接走本地识别，别让人干等。 */
    var ctrl = new AbortController();
    var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) { /* ignore */ } }, 22000);
    try {
      var res = await fetch(API + "/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
        body: JSON.stringify({ image: dataUrl }),
        signal: ctrl.signal
      });
      var j = {};
      try { j = await res.json(); } catch (e) { /* 非 JSON 响应 */ }
      if (res.ok && j.ok) return { ok: true, text: String(j.text || "").trim() };
      return { ok: false, message: j.error || ("识别服务返回 " + res.status) };
    } catch (e) {
      var aborted = e && e.name === "AbortError";
      return { ok: false, message: aborted ? "等太久没回话" : "识别服务连不上" };
    } finally {
      clearTimeout(timer);
    }
  }

  function fillOcr(text, tip) {
    els.photoText.value = text;
    els.photoCount.textContent = words(text) + " 字";
    if (!els.photoTitle.value.trim()) els.photoTitle.value = guessTitle(text);
    setOcr(tip);
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

    /* 一、先走云端识别：认得准，代价是一积分 */
    if (loggedIn()) {
      ocrStage = "上传照片";
      setOcr("正在上传照片，用站内模型识别（消耗 1 积分）…");
      var r = await ocrRemote(file);
      if (r.ok && r.text) {
        fillOcr(r.text, "识别完了。这是模型的转写，请对照原图把认错、漏掉的地方改一遍再保存。");
        return;
      }
      if (r.ok && !r.text) {
        setOcr("这一页没认出字。换一张拍清楚些的（正对纸面、别反光），或把文字直接敲进下面的框里。");
        if (els.ocrRetry) els.ocrRetry.hidden = false;
        return;
      }
      setOcr("云端识别没成功（" + r.message + "），改用本地识别试试…");
    } else {
      setOcr("没登录，先用本地识别（精度有限）。登录后走站内模型，准得多。");
    }

    /* 二、本地兜底：没登录、或云端没跑通时用。
       先把图处理成灰度拉伸与二值化两版，各认一遍，挑分高的那份。 */
    ocrStage = "加载识别组件";
    var worker = null;
    try {
      setOcr("正在准备本地识别（第一次要下字库，会慢一些）…");
      var src = await loadTesseract();
      ocrStage = "下载识别内核";
      worker = await window.Tesseract.createWorker("chi_sim+eng", 1, {
        workerPath: src.base + "/dist/worker.min.js",
        corePath: src.core,
        langPath: TESS_LANG_PATH,
        logger: ocrLogger
      });
      // 整页当一块处理：默认的自动分栏会把作文的行拆得乱七八糟
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1"
        });
      } catch (e) { /* 老版本没有这个接口，不影响识别 */ }

      ocrStage = "处理图片";
      setOcr("正在调整亮度对比度，再送去识别…");
      var img = await new Promise(function (resolve) {
        var im = new Image();
        im.onload = function () { resolve(im); };
        im.onerror = function () { resolve(null); };
        im.src = previewUrl;
      });
      var variants = img ? buildOcrVariants(img) : [];
      if (!variants.length) variants = [{ name: "raw", url: previewUrl }];

      var best = null;
      for (var vi = 0; vi < variants.length; vi++) {
        ocrStage = "识别文字";
        setOcr("正在识别文字（第 " + (vi + 1) + " 遍 / 共 " + variants.length + " 遍）…");
        var ret = await worker.recognize(variants[vi].url);
        var txt = String((ret && ret.data && ret.data.text) || "").replace(/\uFFFD+/g, "").trim();
        var sc = scoreOcrText(txt);
        if (!best || sc > best.score) best = { text: txt, score: sc };
      }
      /* 处理过的这版认出来不像话（纸本来就干净、或者是我把光调坏了），
         再拿原图认一遍。分数低才多跑这一趟，正常照片不多花时间。 */
      if (best && best.score < 40) {
        ocrStage = "识别文字";
        setOcr("第一遍结果不太理想，换原图再认一遍…");
        var ret2 = await worker.recognize(previewUrl);
        var txt2 = String((ret2 && ret2.data && ret2.data.text) || "").replace(/\uFFFD+/g, "").trim();
        var sc2 = scoreOcrText(txt2);
        if (sc2 > best.score) best = { text: txt2, score: sc2 };
      }
      await worker.terminate();
      worker = null;

      var text = (best && best.text) || "";
      if (!text) {
        setOcr("这张图没认出字。手写稿本地识别基本认不出来，建议用手机相机的「扫描/文字识别」转成文字再粘进来，或者直接把文字敲进下面的框。");
        if (els.ocrRetry) els.ocrRetry.hidden = false;
        return;
      }
      fillOcr(text, "本地识别完了。打印稿一般能对个七七八八，手写的错字会很多，请对照原图逐句改。");
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
