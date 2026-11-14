/* 文芽作文 - 主页
   未登录：介绍页；登录后：三视图（我的作文 / 创建作文 / 账户设置）。
   电脑端左侧边栏，手机端底部三 tab，共用同一套视图切换。 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  var RESUME_KEY = "wy.resume.v1";
  var TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

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
    photoCapture: $("photoCapture"), photoPick: $("photoPick"),
    photoCaptureBtn: $("photoCaptureBtn"), photoPickBtn: $("photoPickBtn"),
    photoPreview: $("photoPreview"), ocrStatus: $("ocrStatus"),
    photoTitle: $("photoTitle"), photoText: $("photoText"), photoCount: $("photoCount"),
    photoSave: $("photoSave"),
    appEmail: $("appEmail"), appUser: $("appUser"), appCredits: $("appCredits"),
    appLogout: $("appLogout")
  };

  var currentView = "essays";
  var pending = false;
  var tessPromise = null;
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
    var res = await fetch(API + path, {
      method: opt.method || "GET",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token() },
      body: opt.body === undefined ? undefined : JSON.stringify(opt.body)
    });
    var j = {};
    try { j = await res.json(); } catch (e) { /* 忽略非 JSON 响应 */ }
    if (!res.ok || !j.ok) throw new Error(j.error || ("请求失败（HTTP " + res.status + "）"));
    return j;
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
        ? "已登录。进工作台后先确认接口配置，再点开始生成。"
        : "生成需要登录，邮箱验证码即可，不设密码。";
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
    btn.disabled = true;
    setMsg(els.importMsg, "正在保存…");
    try {
      var j = await api("/api/essays", {
        method: "POST",
        body: {
          title: String(title || "").trim().slice(0, 120) || "无题",
          body: text,
          outline: "",
          category: "命题·" + (src === "photo" ? "拍摄录入" : "输入录入"),
          province: "",
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

  /* 拍摄录入：浏览器本地中文 OCR，字库首次加载会慢一点，识别结果一律交给用户校对 */
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!tessPromise) {
      tessPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = TESS_URL;
        s.onload = function () { window.Tesseract ? resolve(window.Tesseract) : reject(new Error("识别组件没加载成功")); };
        s.onerror = function () { reject(new Error("识别组件下载失败，检查网络后重试")); };
        document.head.appendChild(s);
      });
    }
    return tessPromise;
  }

  function setOcr(text) { if (els.ocrStatus) els.ocrStatus.textContent = text; }

  function guessTitle(text) {
    var first = String(text || "").split(/\n/).map(function (t) { return t.trim(); })
      .filter(Boolean)[0] || "";
    first = first.replace(/^[《<【\[]+|[》>】\]]+$/g, "").replace(/[，。！？；：、,.!?;:]$/g, "");
    return first.slice(0, 24);
  }

  async function handlePhoto(file) {
    if (!file) return;
    if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) { /* ignore */ } }
    previewUrl = URL.createObjectURL(file);
    els.photoPreview.hidden = false;
    els.photoPreview.innerHTML = "";
    var img = document.createElement("img");
    img.src = previewUrl;
    img.alt = "刚选的作文照片";
    els.photoPreview.appendChild(img);

    setMsg(els.importMsg, "");
    setOcr("正在准备识别组件…");
    try {
      var T = await loadTesseract();
      setOcr("正在下载中文字库（第一次会慢一些），然后开始识别…");
      var worker = await T.createWorker("chi_sim+eng", 1, {
        logger: function (m) {
          if (m && m.status === "recognizing text" && typeof m.progress === "number") {
            setOcr("正在识别文字 " + Math.round(m.progress * 100) + "%…");
          }
        }
      });
      var ret = await worker.recognize(file);
      await worker.terminate();
      var text = String((ret && ret.data && ret.data.text) || "").replace(/\uFFFD+/g, "").trim();
      if (!text) {
        setOcr("这张图没认出字。可以换个角度再拍一张，或把文字直接敲进下面的框里。");
        return;
      }
      els.photoText.value = text;
      els.photoCount.textContent = words(text) + " 字";
      if (!els.photoTitle.value.trim()) els.photoTitle.value = guessTitle(text);
      setOcr("识别完了。手写和照片角度会带错字，请对照原图校对一遍再保存。");
    } catch (e) {
      setOcr("识别没成功：" + ((e && e.message) || "未知错误") +
        "。可以改用「输入录入」，或把照片里的文字敲进下面的框里，照样能保存。");
    }
  }

  /* ---------------- 视图三：账户设置 ---------------- */

  async function loadAccount() {
    if (!loggedIn()) return;
    if (els.appEmail) els.appEmail.textContent = (auth().email && auth().email()) || "—";
    if (els.appUser) els.appUser.textContent = (auth().user && auth().user()) || "";
    if (els.appCredits) els.appCredits.textContent = "…";
    try {
      var n = auth().refreshCredits ? await auth().refreshCredits() : null;
      if (els.appCredits) els.appCredits.textContent = (n === null || n === undefined) ? "—" : String(n);
    } catch (e) {
      if (els.appCredits) els.appCredits.textContent = "—";
    }
  }

  /* ---------------- 事件 ---------------- */

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
