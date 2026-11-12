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
    creditBalance: $("creditBalance"), creditLog: $("creditLog")
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

  function esc(s) { return String(s == null ? "" : s); }

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

  function fmtCreditTime(ms) {
    var d = new Date(Number(ms) || Date.now());
    var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
  }

  async function loadCredits() {
    if (!token() || !els.creditBalance) return;
    try {
      var j = await api("/api/credits");
      if (!j || !j.ok) return;
      els.creditBalance.textContent = "积分 " + j.credits;
      if (window.WY_AUTH && window.WY_AUTH.setCredits) window.WY_AUTH.setCredits(j.credits);
      var log = j.log || [];
      if (!log.length) { els.creditLog.hidden = true; return; }
      els.creditLog.hidden = false;
      els.creditLog.innerHTML = "";
      log.slice(0, 10).forEach(function (row) {
        var item = document.createElement("div");
        item.className = "credit-row";
        var t = document.createElement("span");
        t.className = "credit-time";
        t.textContent = fmtCreditTime(row.created_at);
        var why = document.createElement("span");
        why.className = "credit-reason";
        why.textContent = row.reason || "调整";
        var d = document.createElement("span");
        d.className = "credit-delta " + (row.delta > 0 ? "plus" : "minus");
        d.textContent = (row.delta > 0 ? "+" : "") + row.delta;
        item.appendChild(t);
        item.appendChild(why);
        item.appendChild(d);
        els.creditLog.appendChild(item);
      });
    } catch (e) { /* 积分接口挂了不影响作文列表 */ }
  }

  async function loadList() {
    if (!token()) return;
    setMsg("正在加载…", "");
    loadCredits();
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
    if (t !== lastToken) { lastToken = t; loadList(); }
  }

  els.refresh.addEventListener("click", loadList);
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
