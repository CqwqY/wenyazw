/* 文芽作文 - 积分页：余额、明细、兑换码 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  function $(id) { return document.getElementById(id); }
  var els = {
    notLogged: $("notLogged"), logged: $("loggedPanel"),
    balance: $("creditBalance"),
    form: $("redeemForm"), input: $("redeemInput"), redeemBtn: $("redeemBtn"),
    msg: $("redeemMsg"), log: $("creditLog"), refresh: $("refreshBtn"),
    openLogin: $("openLogin")
  };

  /* 积分最小粒度 0.1：REAL 列做小数运算会留 13.299999999999995 这种尾巴，
     显示时一律收到 1 位小数。内部计算不动，只管显示。 */
  function fmtCredits(n) {
    if (n === null || n === undefined) return "—";
    var v = Number(n);
    if (!isFinite(v)) return "—";
    return String(Math.round(v * 10) / 10);
  }

  var lastToken = "";

  /* ---------- 充值（爱发电） ---------- */
  var pay = {
    panel: $("payPanel"), tiers: $("payTiers"), tag: $("payTag"),
    remark: $("payRemarkId"), input: $("claimInput"),
    btn: $("claimBtn"), msg: $("claimMsg")
  };
  var myName = "";

  function setClaim(t, kind) {
    if (!pay.msg) return;
    pay.msg.textContent = t || "";
    pay.msg.className = "credit-msg" + (kind ? " " + kind : "");
  }

  function remarkId() {
    return "wy_" + (myName || "你的用户名");
  }

  function syncRemark() {
    if (!pay.remark) return;
    pay.remark.textContent = remarkId();
    pay.remark.title = myName ? "点一下复制" : "用户名还没读到，刷新一下页面";
  }

  /* 档位名按位置给，不写死在价格上，改 .env 的价目表也能对上号 */
  function tierName(i, n) {
    if (n <= 1) return "畅写版";
    if (i === 0) return "轻量版";
    if (i === n - 1) return "畅写版";
    return "常用版";
  }

  function renderPlans(j) {
    if (!pay.tiers) return;
    pay.tiers.innerHTML = "";
    var list = (j && j.plans) || [];
    if (!list.length) {
      var e = document.createElement("div");
      e.className = "credit-empty";
      e.textContent = "充值档位还没配置，先用兑换码。";
      pay.tiers.appendChild(e);
      return;
    }
    var n = list.length;
    list.forEach(function (p, i) {
      var isTop = n > 1 && i === n - 1;
      var isHot = !isTop && (n >= 3 ? i === 1 : i === 0);

      var card = document.createElement("div");
      card.className = "pay-tier" + (isTop ? " is-top" : isHot ? " is-hot" : "");

      if (isTop || isHot) {
        var ribbon = document.createElement("span");
        ribbon.className = "pay-ribbon";
        ribbon.textContent = isTop ? "最划算" : "最多人选";
        card.appendChild(ribbon);
      }

      var name = document.createElement("div");
      name.className = "pay-name";
      name.textContent = tierName(i, n);

      var amount = document.createElement("div");
      amount.className = "pay-amount";
      amount.innerHTML = "<small>¥</small>" + p.amount;

      var times = document.createElement("div");
      times.className = "pay-times";
      times.innerHTML = "<b>" + p.times + "</b> 次 AI 操作";

      var save = document.createElement("div");
      save.className = "pay-save";
      save.textContent = p.bonus > 0
        ? "含赠送 " + p.bonusTimes + " 次，省 " + p.saveYuan + " 元"
        : "入门档，先少量试试";

      card.appendChild(name);
      card.appendChild(amount);
      card.appendChild(times);
      card.appendChild(save);

      var go = document.createElement("a");
      go.className = "btn btn-primary pay-go";
      if (j.enabled && j.pageUrl) {
        go.href = j.pageUrl;
        go.target = "_blank";
        go.rel = "noopener";
        go.textContent = "去爱发电";
      } else {
        go.href = "#";
        go.textContent = "通道配置中";
        go.className += " is-off";
        go.addEventListener("click", function (ev) { ev.preventDefault(); });
      }
      card.appendChild(go);
      pay.tiers.appendChild(card);
    });
    if (!j.enabled) {
      setClaim("充值通道还在配置（爱发电主页/密钥没填好），现在可以用兑换码。", "warn");
    }
  }

  async function loadPlans() {
    if (!pay.tiers) return;
    try {
      var res = await fetch(API + "/api/pay/plans");
      var j = await res.json();
      renderPlans(j);
    } catch (e) {
      pay.tiers.innerHTML = "";
      var bad = document.createElement("div");
      bad.className = "credit-empty error";
      bad.textContent = "档位读取失败，先用兑换码。";
      pay.tiers.appendChild(bad);
    }
  }

  async function loadMe() {
    try {
      var j = await api("/api/auth/me");
      myName = j.user || "";
      syncRemark();
    } catch (e) { /* 拿不到用户名就显示占位，不影响兑换 */ }
  }

  async function claim() {
    if (!pay.input || !pay.btn) return;
    var no = String(pay.input.value || "").replace(/\s/g, "");
    if (!no) { setClaim("先填爱发电订单号", "error"); pay.input.focus(); return; }
    pay.btn.disabled = true;
    pay.btn.textContent = "查询中…";
    setClaim("", "");
    try {
      var j = await api("/api/pay/claim", { method: "POST", body: { orderNo: no } });
      if (j.already) {
        setClaim("这笔订单之前已经充过了，当前余额 " + fmtCredits(j.credits) + " 分。", "warn");
      } else {
        setClaim("到账成功，加 " + fmtCredits(j.added) + " 积分，现在共 " + fmtCredits(j.credits) + " 分。", "ok");
      }
      pay.input.value = "";
      els.balance.textContent = fmtCredits(j.credits);
      if (window.WY_AUTH && window.WY_AUTH.setCredits) window.WY_AUTH.setCredits(j.credits);
      try { renderLog((await api("/api/credits")).log); } catch (e2) { /* ignore */ }
    } catch (e) {
      setClaim((e && e.message) || "认领失败", "error");
    } finally {
      pay.btn.disabled = false;
      pay.btn.textContent = "认领";
    }
  }

  function copyRemark() {
    if (!pay.remark || !myName) { syncRemark(); return; }
    var text = remarkId();
    var done = function () {
      pay.remark.classList.add("copied");
      pay.remark.textContent = "已复制 " + text;
      setTimeout(function () { pay.remark.classList.remove("copied"); syncRemark(); }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { done(); });
    } else {
      done();
    }
  }


  function token() { return (window.WY_AUTH && window.WY_AUTH.token()) || ""; }

  function setMsg(t, kind) {
    if (!els.msg) return;
    els.msg.textContent = t || "";
    els.msg.className = "credit-msg" + (kind ? " " + kind : "");
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

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function fmtTime(ms) {
    var d = new Date(Number(ms) || Date.now());
    if (isNaN(d.getTime())) return "";
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  var COIN = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="#d9a441" stroke="#a97b1f" stroke-width="1"/><circle cx="8" cy="8" r="2.6" fill="#fdf3dd"/></svg>';

  function renderLog(rows) {
    els.log.innerHTML = "";
    if (!rows || !rows.length) {
      var empty = document.createElement("div");
      empty.className = "credit-empty";
      empty.textContent = "还没有收支记录。";
      els.log.appendChild(empty);
      return;
    }
    rows.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "credit-row";

      var t = document.createElement("span");
      t.className = "credit-time";
      t.textContent = fmtTime(r.created_at);

      var why = document.createElement("span");
      why.className = "credit-reason";
      why.textContent = r.reason || "调整";
      why.title = r.reason || "调整";

      var d = document.createElement("span");
      var delta = Number(r.delta) || 0;
      d.className = "credit-delta " + (delta > 0 ? "plus" : "minus");
      d.innerHTML = COIN + "<span>" + (delta > 0 ? "+" : "") + fmtCredits(delta) + "</span>";

      row.appendChild(t);
      row.appendChild(why);
      row.appendChild(d);
      els.log.appendChild(row);
    });
  }

  async function load() {
    if (!token()) return;
    try {
      var j = await api("/api/credits");
      els.balance.textContent = fmtCredits(j.credits);
      if (window.WY_AUTH && window.WY_AUTH.setCredits) window.WY_AUTH.setCredits(j.credits);
      renderLog(j.log);
      if (els.balance.textContent === "0") {
        setMsg("积分用完了。可以输入兑换码，或回到工作台切到「自填 Key」用自己的接口。", "warn");
      }
    } catch (e) {
      els.log.innerHTML = "";
      var bad = document.createElement("div");
      bad.className = "credit-empty error";
      bad.textContent = "加载失败：" + ((e && e.message) || "未知错误");
      els.log.appendChild(bad);
    }
  }

  async function redeem(ev) {
    if (ev) ev.preventDefault();
    var code = String(els.input.value || "").trim();
    if (!code) { setMsg("先输入兑换码", "error"); els.input.focus(); return; }
    els.redeemBtn.disabled = true;
    els.redeemBtn.textContent = "兑换中…";
    setMsg("", "");
    try {
      var j = await api("/api/redeem", { method: "POST", body: { code: code } });
      setMsg("兑换成功，加 " + fmtCredits(j.added) + " 积分，现在共 " + fmtCredits(j.credits) + " 分。", "ok");
      els.input.value = "";
      els.balance.textContent = fmtCredits(j.credits);
      if (window.WY_AUTH && window.WY_AUTH.setCredits) window.WY_AUTH.setCredits(j.credits);
      // 明细刷新失败不影响「兑换成功」这个结论
      try { renderLog((await api("/api/credits")).log); } catch (e2) { /* ignore */ }
    } catch (e) {
      setMsg((e && e.message) || "兑换失败", "error");
    } finally {
      els.redeemBtn.disabled = false;
      els.redeemBtn.textContent = "兑换";
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
    if (t !== lastToken) {
      lastToken = t;
      setMsg("", "");
      load();
      loadPlans();
      loadMe();
      syncRemark();
    }
  }

  /* 输入框：自动大写、每 4 位插一个短横，好读也好抄（后端会自动去掉分隔符） */
  els.input.addEventListener("input", function () {
    var raw = els.input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
    els.input.value = raw.replace(/(.{4})/g, "$1-").replace(/-$/, "");
  });

  els.form.addEventListener("submit", redeem);
  els.refresh.addEventListener("click", load);
  if (pay.btn) pay.btn.addEventListener("click", claim);
  if (pay.input) {
    pay.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); claim(); }
    });
  }
  if (pay.remark) pay.remark.addEventListener("click", copyRemark);
  els.openLogin.addEventListener("click", function () {
    if (window.WY_AUTH && window.WY_AUTH.open) { window.WY_AUTH.open("login"); return; }
    var btn = document.querySelector("#accountArea button");
    if (btn) btn.click();
  });
  if (window.WY_AUTH && window.WY_AUTH.onChange) {
    window.WY_AUTH.onChange(function () { syncAccount(); });
  }
  window.addEventListener("storage", syncAccount);

  syncAccount();
  // auth.js 写的是 localStorage，同一标签页内靠轮询兜底
  setInterval(syncAccount, 800);
})();
