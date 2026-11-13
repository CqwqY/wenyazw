/* 文芽作文 - 积分页：余额、明细、兑换码 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  function $(id) { return document.getElementById(id); }
  var els = {
    notLogged: $("notLogged"), logged: $("loggedPanel"),
    balance: $("creditBalance"), heroTip: $("creditHeroTip"),
    form: $("redeemForm"), input: $("redeemInput"), redeemBtn: $("redeemBtn"),
    msg: $("redeemMsg"), log: $("creditLog"), refresh: $("refreshBtn"),
    openLogin: $("openLogin")
  };

  var lastToken = "";

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
      d.innerHTML = COIN + "<span>" + (delta > 0 ? "+" : "") + delta + "</span>";

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
      els.balance.textContent = String(j.credits);
      if (window.WY_AUTH && window.WY_AUTH.setCredits) window.WY_AUTH.setCredits(j.credits);
      if (j.costPerCall && els.heroTip) {
        els.heroTip.textContent = "每次 AI 操作消耗 " + j.costPerCall +
          " 积分 · 生成失败自动退回 · 用自己的接口不消耗";
      }
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
      setMsg("兑换成功，加 " + j.added + " 积分，现在共 " + j.credits + " 分。", "ok");
      els.input.value = "";
      els.balance.textContent = String(j.credits);
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
    }
  }

  /* 输入框：自动大写、每 4 位插一个短横，好读也好抄（后端会自动去掉分隔符） */
  els.input.addEventListener("input", function () {
    var raw = els.input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
    els.input.value = raw.replace(/(.{4})/g, "$1-").replace(/-$/, "");
  });

  els.form.addEventListener("submit", redeem);
  els.refresh.addEventListener("click", load);
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
