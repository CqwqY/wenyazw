/* 服务条款独立页：只负责阅读与自愿确认，绝不强制弹窗。
   页面底部 #termsAction 在未登录时提示登录、已同意时显示状态、未同意时可勾选确认。
   与其他页面的 terms.js（首次强制确认弹窗）互不加载，避免"看条款先要同意条款"。 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  var VERSION = "2026-11-28-v1";
  var agreed = false;

  function auth() {
    return window.WY_AUTH || {
      loggedIn: function () { return false; }, token: function () { return ""; },
      onChange: function () {}, open: function () {}
    };
  }
  function $(id) { return document.getElementById(id); }

  function setState(text, kind) {
    var msg = $("termsMsg");
    if (!msg) return;
    msg.textContent = text || "";
    msg.className = "auth-msg" + (kind ? " " + kind : "");
  }

  function showAction(show) {
    var box = $("termsAction");
    if (box) box.hidden = !show;
  }

  function refresh() {
    var btn = $("termsSubmit");
    var cb = $("termsAgree");
    agreed = false;
    if (!auth().loggedIn()) {
      showAction(true);
      if (btn) { btn.hidden = false; btn.textContent = "登录后再确认"; }
      if (cb) cb.disabled = true;
      setState("请先登录，然后在页面底部确认使用约定。");
      return;
    }
    if (cb) cb.disabled = false;
    fetch(API + "/api/terms", { headers: { "Authorization": "Bearer " + auth().token() } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) { setState("暂时读不到约定状态，可稍后刷新重试。", "error"); return; }
        VERSION = d.version || VERSION;
        showAction(true);
        if (d.agreed) {
          agreed = true;
          if (cb) { cb.checked = true; cb.disabled = true; }
          if (btn) { btn.hidden = false; btn.textContent = "已同意 · 返回使用"; }
          setState("你已同意当前版本（" + VERSION + "），可以正常使用站内 AI。", "success");
        } else {
          if (cb) { cb.checked = false; cb.disabled = false; }
          if (btn) { btn.hidden = false; btn.textContent = "同意并使用"; }
          setState("阅读后可在这里确认；不使用站内 AI 也可以只阅读不确认。");
        }
      })
      .catch(function () { setState("连不上服务器，稍后再试。", "error"); });
  }

  function submit() {
    if (!auth().loggedIn()) { auth().open("login"); return; }
    if (agreed) { location.href = "index.html"; return; }
    var cb = $("termsAgree");
    if (!cb || !cb.checked) { setState("请先勾选同意。", "error"); return; }
    var btn = $("termsSubmit");
    if (btn) btn.disabled = true;
    setState("正在提交…");
    fetch(API + "/api/terms/agree", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + auth().token() },
      body: JSON.stringify({ version: VERSION, agree: true })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (btn) btn.disabled = false;
        if (!x.ok || !x.j.ok) { setState((x.j && x.j.error) || "提交失败，重试一下。", "error"); return; }
        setState("已同意当前版本，可以正常使用站内 AI。", "success");
        if (window.dispatchEvent) window.dispatchEvent(new CustomEvent("wy-terms-agreed", { detail: { version: VERSION } }));
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        setState("连不上服务器，稍后再试。", "error");
      });
  }

  function init() {
    var btn = $("termsSubmit");
    if (btn) btn.addEventListener("click", submit);
    auth().onChange(refresh);
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
