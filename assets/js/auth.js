/* 文芽作文 - 账号登录
   两种方式：邮箱/用户名 + 密码，或邮箱 6 位验证码（老账号补设密码前的通道）。
   没有密码的账号登录后自动提示补设；已设密码的可以在账户设置里修改。
   token 存 localStorage；后端地址固定为 https://back.wenyazw.top。 */
(function () {
  "use strict";

  var API_BASE = "https://back.wenyazw.top";
  var KEY_TOKEN = "wenyazw.auth.token";
  var KEY_USER = "wenyazw.auth.user";
  var KEY_EMAIL = "wenyazw.auth.email";
  var KEY_CREDITS = "wenyazw.auth.credits";

  function $(id) { return document.getElementById(id); }
  var els = {
    area: $("accountArea"), mask: $("authMask"), close: $("authClose"),
    title: $("authTitle"), msg: $("authMsg"), submit: $("authSubmit"),
    main: $("authMain"), pwSet: $("authPwSet"),
    subTabs: $("authSubTabs"),
    pwPane: $("authPwPane"), codePane: $("authCodePane"),
    account: $("authAccount"), password: $("authPassword"),
    user: $("authUser"), userField: $("authUserField"),
    email: $("authEmail"), code: $("authCode"),
    sendCode: $("sendCodeBtn"), codeHint: $("codeHint"),
    regPw: $("authRegPassword"), regPwField: $("authRegPwField"),
    pwSetHint: $("pwSetHint"), pwOldField: $("pwOldField"), pwOld: $("pwOld"),
    pwNew: $("pwNew"), pwNew2: $("pwNew2"),
    pwSetMsg: $("pwSetMsg"), pwSetSubmit: $("pwSetSubmit"), pwSetSkip: $("pwSetSkip")
  };
  if (!els.mask || !els.main || !els.pwSet) return;   // 页面没有新版弹窗就不接管

  var foot = els.mask.querySelector(".auth-foot");
  var mode = "login";        // login | register
  var way = "password";      // password | code（仅登录）
  var stage = "main";        // main | setpw
  var pwHasOld = false;      // 修改已有密码时要验原密码
  var hasPassword = false;
  var needPassword = false;
  var countdown = 0;
  var countdownTimer = null;
  var listeners = [];

  function notify(username) {
    listeners.forEach(function (fn) {
      try { fn(username || ""); } catch (e) { /* 单个订阅出错不影响其它 */ }
    });
  }

  function endpoint() { return API_BASE; }

  function token() {
    try { return localStorage.getItem(KEY_TOKEN) || ""; } catch (e) { return ""; }
  }

  function setMsg(text, kind) {
    els.msg.textContent = text || "";
    els.msg.className = "auth-msg" + (kind ? " " + kind : "");
  }
  function setPwMsg(text, kind) {
    els.pwSetMsg.textContent = text || "";
    els.pwSetMsg.className = "auth-msg" + (kind ? " " + kind : "");
  }

  function setCredits(n) {
    try {
      if (n === null || n === undefined) localStorage.removeItem(KEY_CREDITS);
      else localStorage.setItem(KEY_CREDITS, String(n));
    } catch (e) { /* ignore */ }
    var c = credits();
    if (c !== null && els.area) {
      var el = els.area.querySelector(".account-credits");
      if (el) el.textContent = "积分 " + c;
    }
    listeners.forEach(function (fn) {
      try { fn(user()); } catch (e) { /* ignore */ }
    });
  }

  function credits() {
    try {
      var v = localStorage.getItem(KEY_CREDITS);
      return v === null ? null : Number(v);
    } catch (e) { return null; }
  }

  function user() { try { return localStorage.getItem(KEY_USER) || ""; } catch (e) { return ""; } }

  function setSession(t, username, email, credit) {
    try {
      localStorage.setItem(KEY_TOKEN, t);
      localStorage.setItem(KEY_USER, username);
      localStorage.setItem(KEY_EMAIL, email || "");
    } catch (e) { /* 隐私模式下可能不可写 */ }
    if (credit !== undefined && credit !== null) setCredits(credit);
    renderAccount(username);
  }

  function clearSession() {
    try {
      localStorage.removeItem(KEY_TOKEN);
      localStorage.removeItem(KEY_USER);
      localStorage.removeItem(KEY_EMAIL);
      localStorage.removeItem(KEY_CREDITS);
    } catch (e) { /* ignore */ }
    hasPassword = false;
    needPassword = false;
    renderAccount("");
  }

  function renderAccount(username) {
    if (!els.area) { notify(username || ""); return; }
    els.area.innerHTML = "";
    if (!username) {
      var b = document.createElement("button");
      b.className = "btn btn-ghost";
      b.textContent = "登录 / 注册";
      b.addEventListener("click", function () { openModal("login"); });
      els.area.appendChild(b);
      notify("");
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
    var cr = credits();
    if (cr !== null) {
      var cEl = document.createElement("a");
      cEl.className = "account-credits";
      cEl.href = "credits.html";
      cEl.textContent = "积分 " + cr;
      cEl.title = "查看积分明细与兑换码";
      els.area.appendChild(cEl);
    }
    var out = document.createElement("button");
    out.className = "btn btn-ghost";
    out.textContent = "退出";
    out.addEventListener("click", logout);
    els.area.appendChild(out);
    notify(username);
  }

  function logout() {
    var t = token();
    clearSession();
    if (t) {
      fetch(endpoint() + "/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + t }
      }).catch(function () { /* 登出失败也不影响本地清理 */ });
    }
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

  /* 按 mode / way / stage 决定哪些字段可见 */
  function render() {
    var isLogin = mode === "login";
    var onPw = isLogin && way === "password";
    els.title.textContent = stage === "setpw"
      ? (pwHasOld ? "修改密码" : "给账号加个密码")
      : (isLogin ? "登录文芽作文" : "注册文芽作文");
    els.submit.textContent = isLogin ? "登录" : "注册";
    els.main.hidden = (stage === "setpw");
    els.pwSet.hidden = (stage !== "setpw");
    if (foot) foot.hidden = (stage === "setpw");
    els.subTabs.hidden = !isLogin;
    els.pwPane.hidden = !onPw;
    els.codePane.hidden = onPw;
    els.userField.hidden = isLogin;
    els.regPwField.hidden = isLogin;
    els.pwOldField.hidden = !pwHasOld;
    document.querySelectorAll(".auth-tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-mode") === mode);
    });
    document.querySelectorAll(".auth-subtab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-way") === way);
    });
  }

  function openModal(m) {
    mode = (m === "register") ? "register" : "login";
    way = "password";
    stage = "main";
    els.codeHint.textContent = "验证码 10 分钟内有效，每个邮箱 60 秒可重发一次。";
    setMsg("");
    setPwMsg("");
    render();
    els.mask.removeAttribute("hidden");
    setTimeout(function () {
      if (mode === "login" && way === "password") els.account.focus();
      else if (mode === "register") els.user.focus();
      else els.email.focus();
    }, 30);
  }

  function closeModal() {
    els.mask.setAttribute("hidden", "");
    setMsg("");
    setPwMsg("");
    stage = "main";
    render();
    stopCountdown();
    renderSendBtn();
  }

  function showSetPw(withOld) {
    stage = "setpw";
    pwHasOld = !!withOld;
    els.pwNew.value = "";
    els.pwNew2.value = "";
    els.pwOld.value = "";
    setPwMsg("");
    els.pwSetHint.textContent = withOld
      ? "修改密码需要输入原密码。改完以后用邮箱或用户名都能登录。"
      : "给账号加个密码，以后用邮箱或用户名就能直接登录，不用等邮件。不想设可以跳过。";
    render();
    els.mask.removeAttribute("hidden");
    setTimeout(function () { (withOld ? els.pwOld : els.pwNew).focus(); }, 30);
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

  function friendly(e) {
    var msg = (e && e.message) || "未知错误";
    if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
      msg = "暂时连不上账号服务，请稍后再试。";
    }
    return msg;
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
      setMsg(friendly(e), "error");
      renderSendBtn();
    }
  }

  async function submit() {
    if (stage === "setpw") return;
    var isLogin = mode === "login";
    var body, path;

    if (isLogin && way === "password") {
      var account = els.account.value.trim();
      var pw = els.password.value;
      if (!account) { setMsg("请填写邮箱或用户名。", "error"); els.account.focus(); return; }
      if (!pw) { setMsg("请填写密码。", "error"); els.password.focus(); return; }
      body = { account: account, password: pw };
      path = "/api/auth/login";
    } else {
      var email = els.email.value.trim();
      var code = els.code.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setMsg("请填写有效的邮箱地址。", "error"); els.email.focus(); return;
      }
      if (!/^\d{6}$/.test(code)) {
        setMsg("请填写邮件里的 6 位数字验证码。", "error"); els.code.focus(); return;
      }
      if (isLogin) {
        body = { email: email, code: code };
        path = "/api/auth/login";
      } else {
        var u = els.user.value.trim();
        if (!/^[A-Za-z0-9_]{3,24}$/.test(u)) {
          setMsg("用户名需 3～24 位，只能用字母、数字、下划线。", "error"); els.user.focus(); return;
        }
        body = { username: u, email: email, code: code };
        if (els.regPw.value) {
          if (els.regPw.value.length < 6 || els.regPw.value.length > 64) {
            setMsg("密码需 6～64 位。", "error"); els.regPw.focus(); return;
          }
          body.password = els.regPw.value;
        }
        path = "/api/auth/register";
      }
    }

    els.submit.disabled = true;
    setMsg(isLogin ? "正在登录…" : "正在注册…", "");
    try {
      var data = await api(path, body);
      setSession(data.token, data.user, data.email, data.credits);
      hasPassword = !!data.hasPassword;
      needPassword = !!data.needPassword;
      if (data.needPassword) {
        setMsg("登录成功。先给账号补个密码吧。", "ok");
        showSetPw(false);
        return;
      }
      setMsg(isLogin ? "登录成功。" : "注册成功，已自动登录。", "ok");
      setTimeout(closeModal, 500);
    } catch (e) {
      setMsg(friendly(e), "error");
    } finally {
      els.submit.disabled = false;
    }
  }

  async function savePassword() {
    var p1 = els.pwNew.value;
    var p2 = els.pwNew2.value;
    if (p1.length < 6 || p1.length > 64) {
      setPwMsg("新密码需 6～64 位。", "error"); els.pwNew.focus(); return;
    }
    if (p1 !== p2) {
      setPwMsg("两次输入的新密码不一样。", "error"); els.pwNew2.focus(); return;
    }
    var body = { password: p1 };
    if (pwHasOld) body.oldPassword = els.pwOld.value;
    els.pwSetSubmit.disabled = true;
    setPwMsg("正在保存…", "");
    try {
      await api("/api/auth/password/set", body, token());
      hasPassword = true;
      needPassword = false;
      setPwMsg("密码已保存，下次可以用邮箱或用户名登录。", "ok");
      setTimeout(closeModal, 700);
    } catch (e) {
      setPwMsg(friendly(e), "error");
    } finally {
      els.pwSetSubmit.disabled = false;
    }
  }

  document.querySelectorAll(".auth-tab").forEach(function (t) {
    t.addEventListener("click", function () { openModal(t.getAttribute("data-mode")); });
  });
  document.querySelectorAll(".auth-subtab").forEach(function (t) {
    t.addEventListener("click", function () {
      way = t.getAttribute("data-way") === "code" ? "code" : "password";
      setMsg("");
      render();
    });
  });
  els.close.addEventListener("click", closeModal);
  els.mask.addEventListener("click", function (e) { if (e.target === els.mask) closeModal(); });
  els.sendCode.addEventListener("click", sendCode);
  els.submit.addEventListener("click", submit);
  els.pwSetSubmit.addEventListener("click", savePassword);
  els.pwSetSkip.addEventListener("click", closeModal);
  els.code.addEventListener("input", function () {
    els.code.value = els.code.value.replace(/\D/g, "").slice(0, 6);
  });
  [els.account, els.password, els.user, els.email, els.code, els.regPw].forEach(function (el) {
    if (!el) return;
    el.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  });
  [els.pwOld, els.pwNew, els.pwNew2].forEach(function (el) {
    if (!el) return;
    el.addEventListener("keydown", function (e) { if (e.key === "Enter") savePassword(); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !els.mask.hasAttribute("hidden")) closeModal();
  });

  var savedUser = "";
  try { savedUser = localStorage.getItem(KEY_USER) || ""; } catch (e) { savedUser = ""; }
  renderAccount(savedUser);
  render();
  if (token()) {
    fetch(endpoint() + "/api/auth/me", {
      method: "GET", headers: { "Authorization": "Bearer " + token() }
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.ok || !d.user) { clearSession(); return; }
      hasPassword = !!d.hasPassword;
      needPassword = !!d.needPassword;
      renderAccount(d.user);
    }).catch(function () { /* 后端不在线时保留本地显示 */ });
  }

  window.WY_AUTH = {
    token: token,
    user: user,
    email: function () { try { return localStorage.getItem(KEY_EMAIL) || ""; } catch (e) { return ""; } },
    endpoint: endpoint,
    loggedIn: function () { return !!token(); },
    credits: credits,
    setCredits: setCredits,
    hasPassword: function () { return hasPassword; },
    needPassword: function () { return needPassword; },
    refreshCredits: function () {
      if (!token()) return Promise.resolve(null);
      return fetch(endpoint() + "/api/credits", { headers: { "Authorization": "Bearer " + token() } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (d && d.ok && typeof d.credits === "number") { setCredits(d.credits); return d.credits; }
          return null;
        })
        .catch(function () { return null; });
    },
    open: openModal,
    openPassword: function (withOld) {
      if (!loggedInNow()) { openModal("login"); return; }
      showSetPw(!!withOld);
    },
    close: closeModal,
    logout: logout,
    onChange: function (fn) { if (typeof fn === "function") listeners.push(fn); }
  };

  function loggedInNow() { return !!token(); }
})();
