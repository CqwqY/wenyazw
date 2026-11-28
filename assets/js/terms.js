/* 文芽作文 - 服务条款确认（全站共享）
   职责：
   1) 静默查询 /api/terms 状态，不因为"打开页面/阅读条款"就弹窗；
   2) 只在真正调用站内 AI 被后端 403 terms_required 拦下时弹窗；
   3) 同意后写 /api/terms/agree。
   依赖 auth.js 暴露的 window.WY_AUTH；页面需有 #termsMask 弹窗 DOM，
   没有就自动创建一个（这样各页不用重复写结构）。 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  var VERSION = "2026-11-28-v1";
  var checking = false;
  var modal = null;
  var agreed = false;

  function auth() {
    return window.WY_AUTH || {
      loggedIn: function () { return false; }, token: function () { return ""; },
      onChange: function () {}
    };
  }

  function $(id) { return document.getElementById(id); }

  function buildModal() {
    if ($("termsMask")) return $("termsMask");
    var mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.id = "termsMask";
    mask.hidden = true;
    mask.innerHTML =
      '<div class="modal-card terms-modal" role="dialog" aria-modal="true" aria-labelledby="termsModalTitle">' +
      '  <div class="modal-head"><h2 id="termsModalTitle">先看一眼使用约定</h2></div>' +
      '  <div class="terms-modal-body">' +
      '    <p>开始用站内 AI 之前，请读一下<a href="terms.html" target="_blank" rel="noopener">服务条款与免责声明</a>。</p>' +
      '    <ul>' +
      '      <li>AI 会出错，生成内容请自己核对；不保证适合你的考试要求。</li>' +
      '      <li>把 AI 成品当自己的作业提交是否合规，由你和学校判断。</li>' +
      '      <li>站内模型按用量扣积分，失败全额退回；积分不折现。</li>' +
      '      <li>未满 18 周岁请在监护人知情下使用。</li>' +
      '    </ul>' +
      '    <label class="terms-check"><input type="checkbox" id="termsModalAgree"><span>我已读完并同意以上条款</span></label>' +
      '    <div class="auth-msg" id="termsModalMsg"></div>' +
      '  </div>' +
      '  <div class="modal-actions">' +
      '    <button class="btn btn-primary" id="termsModalOk" type="button">同意并使用</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(mask);
    $("termsModalOk").addEventListener("click", agree);
    return mask;
  }

  function showModal() {
    modal = buildModal();
    var cb = $("termsModalAgree");
    if (cb) cb.checked = false;
    var msg = $("termsModalMsg");
    if (msg) { msg.textContent = ""; msg.className = "auth-msg"; }
    modal.removeAttribute("hidden");
  }

  function hideModal() {
    if (modal) modal.setAttribute("hidden", "");
  }

  function setMsg(text, kind) {
    var msg = $("termsModalMsg");
    if (!msg) return;
    msg.textContent = text || "";
    msg.className = "auth-msg" + (kind ? " " + kind : "");
  }

  function agree() {
    var cb = $("termsModalAgree");
    if (!cb || !cb.checked) { setMsg("请先勾选同意。", "error"); return; }
    var btn = $("termsModalOk");
    if (btn) btn.disabled = true;
    setMsg("正在提交…");
    fetch(API + "/api/terms/agree", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + auth().token() },
      body: JSON.stringify({ version: VERSION, agree: true })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        btn && (btn.disabled = false);
        if (!x.ok || !x.j.ok) { setMsg((x.j && x.j.error) || "提交失败，重试一下。", "error"); return; }
        agreed = true;
        hideModal();
        if (window.dispatchEvent) window.dispatchEvent(new CustomEvent("wy-terms-agreed", { detail: { version: VERSION } }));
      })
      .catch(function (e) {
        btn && (btn.disabled = false);
        setMsg("连不上服务器，稍后再试。", "error");
      });
  }

  function check(force) {
    if (!auth().loggedIn()) return Promise.resolve(false);
    if (checking) return Promise.resolve(false);
    checking = true;
    return fetch(API + "/api/terms", {
      headers: { "Authorization": "Bearer " + auth().token() }
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        checking = false;
        if (!x.ok || !x.j.ok) return false;
        VERSION = x.j.version || VERSION;
        agreed = !!x.j.agreed;
        return agreed;
      })
      .catch(function () { checking = false; return false; });
  }

  /* 拦截 403 terms_required：不吞掉原响应，只是额外弹窗 */
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    return origFetch.apply(window, arguments).then(function (res) {
      if (res.status === 403) {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        if (url.indexOf("/api/terms") < 0) {
          res.clone().json().then(function (j) {
            if (j && j.error === "terms_required") {
              if (j.termsVersion) VERSION = j.termsVersion;
              showModal();
            }
          }).catch(function () { /* 不是 JSON，忽略 */ });
        }
      }
      return res;
    });
  };

  auth().onChange(function () { check(true); });
  window.WY_TERMS = {
    check: check,
    agreed: function () { return agreed; },
    version: function () { return VERSION; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { check(true); });
  } else {
    check(true);
  }
})();
