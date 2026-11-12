/* 文芽作文 - 账号登录（邮箱验证码，无密码；token 存 localStorage）
   后端地址固定为已上线的 https://back.wenyazw.top，不向访客暴露也不让其填写。 */
(function () {
  "use strict";

  var API_BASE = "https://back.wenyazw.top";
  var KEY_TOKEN = "wenyazw.auth.token";
  var KEY_USER = "wenyazw.auth.user";
  var KEY_EMAIL = "wenyazw.auth.email";

  function $(id) { return document.getElementById(id); }
  var els = {
    area: $("accountArea"), mask: $("authMask"), close: $("authClose"),
    user: $("authUser"), userField: $("authUserField"),
    email: $("authEmail"), code: $("authCode"),
    sendCode: $("sendCodeBtn"), codeHint: $("codeHint"),
    msg: $("authMsg"), submit: $("authSubmit"), title: $("authTitle")
  };
  if (!els.area || !els.mask) return;

  var mode = "login";
  var countdown = 0;
  var countdownTimer = null;

  function endpoint() { return API_BASE; }

  function token() {
    try { return localStorage.getItem(KEY_TOKEN) || ""; } catch (e) { return ""; }
  }

  function setMsg(text, kind) {
    els.msg.textContent = text || "";
    els.msg.className = "auth-msg" + (kind ? " " + kind : "");
  }

  function setSession(t, username, email) {
    try {
      localStorage.setItem(KEY_TOKEN, t);
      localStorage.setItem(KEY_USER, username);
      localStorage.setItem(KEY_EMAIL, email || "");
    } catch (e) { /* 隐私模式下可能不可写 */ }
    renderAccount(username);
  }

  function clearSession() {
    try {
      localStorage.removeItem(KEY_TOKEN);
      localStorage.removeItem(KEY_USER);
      localStorage.removeItem(KEY_EMAIL);
    } catch (e) { /* ignore */ }
    renderAccount("");
  }

  function renderAccount(username) {
    els.area.innerHTML = "";
    if (!username) {
      var b = document.createElement("button");
      b.className = "btn btn-ghost";
      b.textContent = "登录 / 注册";
      b.addEventListener("click", function () { openModal("login"); });
      els.area.appendChild(b);
      return;
    }
    var consoleLink = document.createElement("a");
    consoleLink.className = "account-console";
    consoleLink.href = "account.html";
    consoleLink.textContent = "控制台";
    els.area.appendChild(consoleLink);
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

  function stopCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    countdown = 0;
  }

  function renderSendBtn() {
    if (countdown > 0) {
      els.sendCode.disabled = true;
      els.sendCode.textContent = countdown + " 秒后重发";
    } else {
      els.sendCode.disabled = false;
      els.sendCode.textContent = "发送验证码";
    }
  }

  function startCountdown() {
    stopCountdown();
    countdown = 60;
    renderSendBtn();
    countdownTimer = setInterval(function () {
      countdown--;
      if (countdown <= 0) stopCountdown();
      renderSendBtn();
    }, 1000);
  }

  function openModal(m) {
    mode = m || "login";
    els.title.textContent = mode === "login" ? "登录文芽作文" : "注册文芽作文";
    els.submit.textContent = mode === "login" ? "登录" : "注册";
    els.userField.hidden = (mode === "login");
    document.querySelectorAll(".auth-tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-mode") === mode);
    });
    els.codeHint.textContent = "验证码 10 分钟内有效，每个邮箱 60 秒可重发一次。";
    setMsg("");
    els.mask.removeAttribute("hidden");
    setTimeout(function () { (mode === "login" ? els.email : els.user).focus(); }, 30);
  }

  function closeModal() {
    els.mask.setAttribute("hidden", "");
    setMsg("");
    stopCountdown();
    renderSendBtn();
  }

  async function api(path, body, withToken, method) {
    var h = { "Content-Type": "application/json" };
    if (withToken) h.Authorization = "Bearer " + withToken;
    var res = await fetch(endpoint() + path, {
      method: method || "POST", headers: h,
      body: body === undefined ? undefined : JSON.stringify(body || {})
    });
    var data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok || !data.ok) {
      throw new Error(data.error || ("请求失败（HTTP " + res.status + "）"));
    }
    return data;
  }

  async function sendCode() {
    var email = els.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMsg("请先填写有效的邮箱地址。", "error"); els.email.focus(); return;
    }
    els.sendCode.disabled = true;
    setMsg("正在发送验证码…", "");
    try {
      await api("/api/auth/send-code", { email: email, purpose: mode });
      setMsg("验证码已发送到 " + email + "，请查收（可能在垃圾箱）。", "ok");
      els.codeHint.textContent = "收不到？检查垃圾箱，或 60 秒后重发。";
      startCountdown();
      els.code.focus();
    } catch (e) {
      var msg = (e && e.message) || "未知错误";
      if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
        msg = "暂时连不上账号服务，请稍后再试。";
      }
      setMsg(msg, "error");
      renderSendBtn();
    }
  }

  async function submit() {
    var email = els.email.value.trim();
    var code = els.code.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMsg("请填写有效的邮箱地址。", "error"); els.email.focus(); return;
    }
    if (!/^\d{6}$/.test(code)) {
      setMsg("请填写邮件里的 6 位数字验证码。", "error"); els.code.focus(); return;
    }
    var body = { email: email, code: code };
    if (mode === "register") {
      var u = els.user.value.trim();
      if (!/^[A-Za-z0-9_]{3,24}$/.test(u)) {
        setMsg("用户名需 3～24 位，只能用字母、数字、下划线。", "error"); els.user.focus(); return;
      }
      body.username = u;
    }

    els.submit.disabled = true;
    setMsg(mode === "login" ? "正在登录…" : "正在注册…", "");
    try {
      var data = await api("/api/auth/" + mode, body);
      setSession(data.token, data.user, data.email);
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
  els.sendCode.addEventListener("click", sendCode);
  els.submit.addEventListener("click", submit);
  els.code.addEventListener("input", function () {
    els.code.value = els.code.value.replace(/\D/g, "").slice(0, 6);
  });
  [els.user, els.email, els.code].forEach(function (el) {
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
    }).catch(function () { /* 后端不在线时保留本地显示 */ });
  }

  // 供其它模块读取当前登录态
  window.WY_AUTH = {
    token: token,
    user: function () { try { return localStorage.getItem(KEY_USER) || ""; } catch (e) { return ""; } },
    email: function () { try { return localStorage.getItem(KEY_EMAIL) || ""; } catch (e) { return ""; } },
    endpoint: endpoint
  };
})();
