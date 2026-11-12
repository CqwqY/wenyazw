/* 文芽作文 - 账号登录（纯前端，token 存 localStorage）
   后端地址固定为已上线的 https://back.wenyazw.top，不向访客暴露也不让其填写。 */
(function () {
  "use strict";

  var API_BASE = "https://back.wenyazw.top";
  var KEY_TOKEN = "wenyazw.auth.token";
  var KEY_USER = "wenyazw.auth.user";

  function $(id) { return document.getElementById(id); }
  var els = {
    area: $("accountArea"), mask: $("authMask"), close: $("authClose"),
    user: $("authUser"), pass: $("authPass"),
    msg: $("authMsg"), submit: $("authSubmit"), title: $("authTitle")
  };
  if (!els.area || !els.mask) return;

  var mode = "login";

  function endpoint() { return API_BASE; }

  function token() {
    try { return localStorage.getItem(KEY_TOKEN) || ""; } catch (e) { return ""; }
  }

  function setMsg(text, kind) {
    els.msg.textContent = text || "";
    els.msg.className = "auth-msg" + (kind ? " " + kind : "");
  }

  function setSession(t, username) {
    try {
      localStorage.setItem(KEY_TOKEN, t);
      localStorage.setItem(KEY_USER, username);
    } catch (e) { /* 隐私模式下可能不可写，仅本次会话有效 */ }
    renderAccount(username);
  }

  function clearSession() {
    try {
      localStorage.removeItem(KEY_TOKEN);
      localStorage.removeItem(KEY_USER);
    } catch (e) { /* ignore */ }
    renderAccount("");
  }

  function renderAccount(username) {
    els.area.innerHTML = "";
    if (!username) {
      var b = document.createElement("button");
      b.className = "btn btn-ghost";
      b.id = "loginBtn";
      b.textContent = "登录 / 注册";
      b.addEventListener("click", function () { openModal("login"); });
      els.area.appendChild(b);
      return;
    }
    var name = document.createElement("span");
    name.className = "account-name";
    name.textContent = username;
    els.area.appendChild(name);
    var out = document.createElement("button");
    out.className = "btn btn-ghost";
    out.textContent = "退出";
    out.addEventListener("click", function () {
      var t = token();
      clearSession();
      if (t) {
        fetch(endpoint() + "/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + t }
        }).catch(function () { /* 登出失败也不影响本地清理 */ });
      }
    });
    els.area.appendChild(out);
  }

  function openModal(m) {
    mode = m || "login";
    els.title.textContent = mode === "login" ? "登录文芽作文" : "注册文芽作文";
    els.submit.textContent = mode === "login" ? "登录" : "注册";
    els.pass.autocomplete = mode === "login" ? "current-password" : "new-password";
    document.querySelectorAll(".auth-tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-mode") === mode);
    });
    setMsg("");
    els.mask.removeAttribute("hidden");
    setTimeout(function () { els.user.focus(); }, 30);
  }

  function closeModal() {
    els.mask.setAttribute("hidden", "");
    setMsg("");
  }

  async function api(path, body, withToken) {
    var h = { "Content-Type": "application/json" };
    if (withToken) h.Authorization = "Bearer " + withToken;
    var res = await fetch(endpoint() + path, {
      method: "POST", headers: h, body: JSON.stringify(body || {})
    });
    var data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok || !data.ok) {
      throw new Error(data.error || ("请求失败（HTTP " + res.status + "）"));
    }
    return data;
  }

  async function submit() {
    var u = els.user.value.trim();
    var p = els.pass.value;
    if (!/^[A-Za-z0-9_]{3,24}$/.test(u)) { setMsg("用户名需 3～24 位，只能用字母、数字、下划线。", "error"); return; }
    if (p.length < 6) { setMsg("密码至少 6 位。", "error"); return; }

    els.submit.disabled = true;
    setMsg(mode === "login" ? "正在登录…" : "正在注册…", "");
    try {
      var data = await api("/api/auth/" + mode, { username: u, password: p });
      setSession(data.token, data.user);
      setMsg(mode === "login" ? "登录成功。" : "注册成功，已自动登录。", "ok");
      setTimeout(closeModal, 500);
    } catch (e) {
      var msg = (e && e.message) || "未知错误";
      if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
        msg = "暂时连不上账号服务，请稍后再试。";
      }
      setMsg(msg, "error");
    } finally {
      els.submit.disabled = false;
    }
  }

  // 登录按钮在 renderAccount 里已单独绑定 click，这里不要再委托，避免点一次触发两次
  document.querySelectorAll(".auth-tab").forEach(function (t) {
    t.addEventListener("click", function () { openModal(t.getAttribute("data-mode")); });
  });
  els.close.addEventListener("click", closeModal);
  els.mask.addEventListener("click", function (e) { if (e.target === els.mask) closeModal(); });
  els.submit.addEventListener("click", submit);
  [els.user, els.pass].forEach(function (el) {
    el.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !els.mask.hasAttribute("hidden")) closeModal();
  });

  // 已登录则向后端校验 token，失效就清掉（不阻塞页面）
  var savedUser = "";
  try { savedUser = localStorage.getItem(KEY_USER) || ""; } catch (e) { savedUser = ""; }
  renderAccount(savedUser);
  if (token()) {
    fetch(endpoint() + "/api/auth/me", {
      method: "GET", headers: { "Authorization": "Bearer " + token() }
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.ok || !d.user) { clearSession(); return; }
      renderAccount(d.user);
    }).catch(function () { /* 后端不在线时保留本地显示，不清 session */ });
  }

  // 供其它模块读取当前登录态
  window.WY_AUTH = {
    token: token,
    user: function () { try { return localStorage.getItem(KEY_USER) || ""; } catch (e) { return ""; } },
    endpoint: endpoint
  };
})();
