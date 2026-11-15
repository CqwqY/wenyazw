/* 文芽作文 - 账户控制台：列出/查看/删除/下载云端作文 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  function $(id) { return document.getElementById(id); }
  var els = {
    notLogged: $("notLogged"), logged: $("loggedPanel"),
    email: $("accountEmail"), user: $("accountUser"),
    msg: $("accountMsg"), list: $("essayList"),
    refresh: $("refreshBtn"), openLogin: $("openLogin"),
    viewMask: $("viewMask"), viewTitle: $("viewTitle"),
    viewMeta: $("viewMeta"), viewBody: $("viewBody"), viewOutline: $("viewOutline"),
    viewClose: $("viewClose"), viewClose2: $("viewClose2"),
    viewCopy: $("viewCopy"), viewDownload: $("viewDownload"), viewResume: $("viewResume"),
    authMask: $("authMask"),
    creditBalance: $("creditBalance"),
    styleBlock: $("styleBlock"), styleDims: $("styleDims"), styleMarkList: $("styleMarkList"),
    styleAddMark: $("styleAddMark"), styleSave: $("styleSave"), styleMsg: $("styleMsg"),
    styleScan: $("styleScan"), styleReport: $("styleReport")
  };

  var current = null;   // 当前打开的作文
  var lastToken = "";
  var RESUME_KEY = "wy.resume.v1";

  /* 把这篇作文交给写作页：localStorage 直传，write.html?resume=1 取走即删 */
  function handoff(essay) {
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({ essay: essay, ts: Date.now() }));
    } catch (e) {
      setMsg("浏览器存储不可用，无法带回写作页。可先下载 txt 保留内容。", "error");
      return false;
    }
    location.href = "write.html?resume=1";
    return true;
  }

  async function resumeEssay(id) {
    setMsg("正在打开这篇作文…", "");
    try {
      var j = await api("/api/essays/" + id);
      if (!j.essay) throw new Error("没有取到内容");
      handoff(j.essay);
    } catch (e) {
      setMsg("打开失败：" + ((e && e.message) || "未知错误"), "error");
    }
  }

  function resumeCurrent() {
    if (!current) return;
    handoff(current);
  }

  function token() { return (window.WY_AUTH && window.WY_AUTH.token()) || ""; }
  function setMsg(t, kind) {
    els.msg.textContent = t || "";
    els.msg.className = "account-msg" + (kind ? " " + kind : "");
  }

  async function api(path, options) {
    var opt = options || {};
    var res = await fetch(API + path, {
      method: opt.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token()
      },
      body: opt.body === undefined ? undefined : JSON.stringify(opt.body)
    });
    var j = {};
    try { j = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok || !j.ok) throw new Error(j.error || ("请求失败（HTTP " + res.status + "）"));
    return j;
  }

  // 顺手把 U+FFFD 残字（旧后端按分块拼字符串劈坏的汉字）剔掉，别把乱码摆到列表里
  function esc(s) { return String(s == null ? "" : s).replace(/\uFFFD+/g, ""); }

  function fmtTime(s) {
    if (!s) return "";
    var d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString("zh-CN", { hour12: false });
  }

  function renderList(rows) {
    els.list.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("div");
      empty.className = "essay-empty";
      empty.textContent = "还没有保存的作文。回到工作台写一篇，生成后会自动同步到这里。";
      els.list.appendChild(empty);
      return;
    }
    rows.forEach(function (r) {
      var card = document.createElement("div");
      card.className = "essay-card";
      var head = document.createElement("div");
      head.className = "essay-card-head";
      var h = document.createElement("h3");
      h.textContent = esc(r.title) || "无题";
      head.appendChild(h);
      var meta = document.createElement("span");
      meta.className = "essay-date";
      meta.textContent = fmtTime(r.updated_at);
      head.appendChild(meta);
      card.appendChild(head);

      var info = document.createElement("div");
      info.className = "essay-meta";
      var bits = [];
      if (r.category) bits.push(esc(r.category));
      if (r.province) bits.push(esc(r.province));
      bits.push((r.word_count || 0) + " 字");
      if (r.has_outline) bits.push("含大纲");
      info.textContent = bits.join(" · ");
      card.appendChild(info);

      var acts = document.createElement("div");
      acts.className = "essay-actions";
      var go = document.createElement("button");
      go.className = "btn-outline primary";
      go.textContent = "继续修改";
      go.addEventListener("click", function () { resumeEssay(r.id); });
      var view = document.createElement("button");
      view.className = "btn-outline";
      view.textContent = "查看";
      view.addEventListener("click", function () { openEssay(r.id); });
      var dl = document.createElement("button");
      dl.className = "btn-outline";
      dl.textContent = "下载";
      dl.addEventListener("click", function () { downloadEssay(r.id); });
      var del = document.createElement("button");
      del.className = "btn-outline danger";
      del.textContent = "删除";
      del.addEventListener("click", function () { deleteEssay(r.id, r.title); });
      acts.appendChild(go);
      acts.appendChild(view);
      acts.appendChild(dl);
      acts.appendChild(del);
      card.appendChild(acts);
      els.list.appendChild(card);
    });
  }

  /* 控制台只显示余额，明细与兑换在 credits.html */
  async function loadCreditBalance() {
    if (!token() || !els.creditBalance) return;
    try {
      var j = await api("/api/credits");
      if (!j || !j.ok) return;
      els.creditBalance.textContent = String(j.credits);
      if (window.WY_AUTH && window.WY_AUTH.setCredits) window.WY_AUTH.setCredits(j.credits);
    } catch (e) { /* 积分接口挂了不影响作文列表 */ }
  }

  async function loadList() {
    if (!token()) return;
    setMsg("正在加载…", "");
    loadCreditBalance();
    try {
      var j = await api("/api/essays");
      renderList(j.essays || []);
      setMsg("");
    } catch (e) {
      setMsg("加载失败：" + ((e && e.message) || "未知错误"), "error");
    }
  }

  function closeView() {
    els.viewMask.setAttribute("hidden", "");
    current = null;
  }

  async function openEssay(id) {
    setMsg("正在读取作文…", "");
    try {
      var j = await api("/api/essays/" + id);
      current = j.essay;
      els.viewTitle.textContent = esc(current.title) || "无题";
      els.viewMeta.textContent = [
        esc(current.category), esc(current.province),
        (current.word_count || 0) + " 字",
        "更新于 " + fmtTime(current.updated_at)
      ].filter(Boolean).join(" · ");
      els.viewBody.textContent = esc(current.body) || "（这篇还没有正文，只有大纲）";
      var ol = null;
      try { ol = current.outline ? JSON.parse(current.outline) : null; } catch (e) { ol = null; }
      if (ol && ol.points && ol.points.length) {
        var txt = [];
        if (ol.title) txt.push("标题：" + ol.title);
        if (ol.thesis) txt.push("立意：" + ol.thesis);
        ol.points.forEach(function (p, i) {
          txt.push((i + 1) + ". " + (p.label ? "【" + p.label + "】" : "") + (p.text || ""));
        });
        if (ol.note) txt.push("提醒：" + ol.note);
        els.viewOutline.textContent = txt.join("\n");
        els.viewOutline.removeAttribute("hidden");
      } else {
        els.viewOutline.textContent = "";
        els.viewOutline.setAttribute("hidden", "");
      }
      els.viewMask.removeAttribute("hidden");
      setMsg("");
    } catch (e) {
      setMsg("读取失败：" + ((e && e.message) || "未知错误"), "error");
    }
  }

  function downloadText(text, title) {
    var safe = (title || "作文").replace(/[\\/:*?"<>|]/g, "").slice(0, 40);
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "文芽作文-" + safe + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function downloadEssay(id) {
    try {
      var j = await api("/api/essays/" + id);
      downloadText(j.essay.body, j.essay.title);
    } catch (e) {
      setMsg("下载失败：" + ((e && e.message) || "未知错误"), "error");
    }
  }

  async function deleteEssay(id, title) {
    if (!window.confirm("确定删除《" + (title || "无题") + "》吗？删除后无法恢复。")) return;
    try {
      await api("/api/essays/" + id, { method: "DELETE" });
      if (current && current.id === id) closeView();
      setMsg("已删除。", "ok");
      await loadList();
    } catch (e) {
      setMsg("删除失败：" + ((e && e.message) || "未知错误"), "error");
    }
  }

  async function copyCurrent() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.body);
      setMsg("作文已复制。", "ok");
    } catch (e) {
      setMsg("复制失败，请在详情里手动选中文字。", "error");
    }
  }

  /* ---------------- 我的文风 ----------------
     数据全在服务端：这里只管收集和展示。未登录时不渲染，也不联网。 */
  var sty = { dims: [], prefs: {}, marks: [], anchors: [], auto: null, dirty: false, loaded: false };

  function stySetMsg(t, kind) {
    els.styleMsg.textContent = t || "";
    els.styleMsg.className = "style-msg" + (kind ? " " + kind : "");
  }

  function renderDims() {
    els.styleDims.innerHTML = "";
    sty.dims.forEach(function (d) {
      var row = document.createElement("div");
      row.className = "style-dim";

      var lab = document.createElement("div");
      lab.className = "style-dim-label";
      var nm = document.createElement("strong");
      nm.textContent = d.label;
      lab.appendChild(nm);
      if (d.hint) {
        var hi = document.createElement("span");
        hi.textContent = d.hint;
        lab.appendChild(hi);
      }

      var box = document.createElement("div");
      box.className = "style-opts";
      d.opts.forEach(function (o) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "style-opt" + (sty.prefs[d.key] === o.v ? " is-on" : "");
        b.textContent = o.name;
        b.addEventListener("click", function () {
          // 再点一次取消：不选就是「按默认写法」，这是合法状态，不是漏填
          sty.prefs[d.key] = sty.prefs[d.key] === o.v ? "" : o.v;
          if (!sty.prefs[d.key]) delete sty.prefs[d.key];
          sty.dirty = true;
          renderDims();
          stySetMsg("改完记得保存", "");
        });
        box.appendChild(b);
      });

      row.appendChild(lab);
      row.appendChild(box);
      els.styleDims.appendChild(row);
    });
  }

  function renderMarks() {
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
      inp.addEventListener("input", function () {
        sty.marks[i] = inp.value;
        sty.dirty = true;
      });
      var del = document.createElement("button");
      del.type = "button";
      del.className = "style-mark-del";
      del.setAttribute("aria-label", "删除这条");
      del.textContent = "×";
      del.addEventListener("click", function () {
        sty.marks.splice(i, 1);
        sty.dirty = true;
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
    note.textContent = "这些读数只用来看清自己现在的写法，也让评分别把「你一贯的短句」当成内容单薄。它不会让 AI 照着你现在的水平写 —— 上面勾的那几项才是要写成的样子。";
    els.styleReport.appendChild(note);
  }

  async function loadStyle() {
    if (!token()) return;
    try {
      var j = await api("/api/style");
      sty.dims = j.dims || [];
      sty.prefs = j.prefs || {};
      sty.marks = (j.marks || []).slice(0, 6);
      sty.anchors = j.anchors || [];
      sty.auto = j.auto || null;
      sty.dirty = false;
      sty.loaded = true;
      renderDims();
      renderMarks();
      renderReport();
      stySetMsg("", "");
      // 从写作台点「我的文风」过来时，直接滚到这一块
      if (location.hash === "#style" && els.styleBlock) {
        setTimeout(function () { els.styleBlock.scrollIntoView({ behavior: "smooth", block: "start" }); }, 120);
      }
    } catch (e) {
      stySetMsg("文风设置没取到：" + ((e && e.message) || "网络错误"), "error");
    }
  }

  async function saveStyle() {
    if (!token()) return;
    var marks = sty.marks.map(function (x) { return String(x || "").trim(); }).filter(Boolean);
    els.styleSave.disabled = true;
    stySetMsg("正在保存…", "");
    try {
      await api("/api/style", { method: "PUT", body: { prefs: sty.prefs, marks: marks } });
      sty.marks = marks;
      sty.dirty = false;
      renderMarks();
      stySetMsg("已保存，下次写作生效", "ok");
    } catch (e) {
      stySetMsg("保存失败：" + ((e && e.message) || "网络错误"), "error");
    }
    els.styleSave.disabled = false;
  }

  async function scanStyle() {
    if (!token()) return;
    els.styleScan.disabled = true;
    els.styleScan.textContent = "分析中…";
    try {
      var j = await api("/api/style/scan", { method: "POST", body: {} });
      sty.auto = j.auto || null;
      sty.anchors = j.anchors || [];
      renderReport();
      if (!sty.auto) stySetMsg("还没有保存过的作文，先写一篇再分析", "");
      else if (!sty.auto.enough) stySetMsg("量到 " + sty.auto.n + " 篇，攒到 3 篇再看得更准", "");
      else stySetMsg("分析完成", "ok");
    } catch (e) {
      stySetMsg("分析失败：" + ((e && e.message) || "网络错误"), "error");
    }
    els.styleScan.disabled = false;
    els.styleScan.textContent = "从我的稿子分析";
  }

  function syncAccount() {
    var t = token();
    if (!t) {
      els.notLogged.removeAttribute("hidden");
      els.logged.setAttribute("hidden", "");
      lastToken = "";
      return;
    }
    els.notLogged.setAttribute("hidden", "");
    els.logged.removeAttribute("hidden");
    els.email.textContent = (window.WY_AUTH && window.WY_AUTH.email()) || "";
    els.user.textContent = (window.WY_AUTH && window.WY_AUTH.user()) || "";
    if (t !== lastToken) {
      lastToken = t;
      loadList();
      if (els.styleDims) loadStyle();
    }
  }

  els.refresh.addEventListener("click", loadList);
  if (els.styleSave) els.styleSave.addEventListener("click", saveStyle);
  if (els.styleScan) els.styleScan.addEventListener("click", scanStyle);
  if (els.styleAddMark) els.styleAddMark.addEventListener("click", function () {
    if (sty.marks.length >= 6) return;
    sty.marks.push("");
    sty.dirty = true;
    renderMarks();
    stySetMsg("改完记得保存", "");
  });
  els.openLogin.addEventListener("click", function () {
    // auth.js 会在 accountArea 里渲染登录按钮；这里直接触发弹窗 DOM
    var loginBtn = document.querySelector("#accountArea button");
    if (loginBtn) loginBtn.click();
  });
  els.viewClose.addEventListener("click", closeView);
  els.viewClose2.addEventListener("click", closeView);
  els.viewMask.addEventListener("click", function (e) { if (e.target === els.viewMask) closeView(); });
  els.viewResume.addEventListener("click", resumeCurrent);
  els.viewCopy.addEventListener("click", copyCurrent);
  els.viewDownload.addEventListener("click", function () {
    if (current) downloadText(current.body, current.title);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !els.viewMask.hasAttribute("hidden")) closeView();
  });
  window.addEventListener("storage", syncAccount);
  // auth.js 登录后写 localStorage，轮询捕获同一标签页内的变化
  setInterval(syncAccount, 800);

  syncAccount();
})();
