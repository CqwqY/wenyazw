/* 文芽作文 - 积分账单页 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  function $(id) { return document.getElementById(id); }
  var els = {
    notLogged: $("notLogged"), logged: $("loggedPanel"),
    balance: $("billBalance"), stats: $("billStats"),
    list: $("billList"), refresh: $("billRefresh"), openLogin: $("openLogin")
  };
  var filter = "all";
  var rows = [];

  function auth() {
    return window.WY_AUTH || {
      loggedIn: function () { return false; }, token: function () { return ""; },
      open: function () {}, onChange: function () {}
    };
  }
  function fmt(n) {
    var v = Number(n);
    if (!isFinite(v)) return "0";
    return String(Math.round(v * 10) / 10);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function day(ts) {
    var d = new Date(Number(ts) || Date.now());
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }
  function time(ts) {
    var d = new Date(Number(ts) || Date.now());
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function kind(reason) {
    var r = String(reason || "");
    if (/退回/.test(r)) return "refund";
    if (/充值|爱发电|兑换码/.test(r)) return "income";
    return "spend";
  }

  function renderStats() {
    var spend = 0, income = 0;
    rows.forEach(function (r) {
      var v = Number(r.delta) || 0;
      if (v < 0) spend += -v; else income += v;
    });
    els.stats.innerHTML =
      '<div class="bill-stat"><span>收入合计</span><strong>+' + fmt(income) + '</strong></div>' +
      '<div class="bill-stat"><span>支出合计</span><strong>-' + fmt(spend) + '</strong></div>' +
      '<div class="bill-stat"><span>记录条数</span><strong>' + rows.length + '</strong></div>';
  }

  function renderList() {
    var list = rows.filter(function (r) {
      var k = kind(r.reason);
      if (filter === "spend") return (Number(r.delta) || 0) < 0;
      if (filter === "income") return (Number(r.delta) || 0) > 0;
      return true;
    });
    if (!list.length) {
      els.list.innerHTML = '<div class="credit-empty">这个筛选下还没有记录。</div>';
      return;
    }
    var html = "", lastDay = "";
    list.forEach(function (r) {
      var d = day(r.created_at);
      if (d !== lastDay) {
        if (lastDay) html += "</div>";
        lastDay = d;
        html += '<div class="bill-group"><h3>' + esc(d) + '</h3>';
      }
      var v = Number(r.delta) || 0;
      var k = kind(r.reason);
      html += '<div class="bill-row">' +
        '<div class="bill-row-main">' +
          '<span class="bill-kind bill-kind-' + k + '">' +
            (k === "refund" ? "退回" : k === "income" ? "收入" : "支出") + '</span>' +
          '<div><div class="bill-reason">' + esc(r.reason) + '</div>' +
          '<div class="bill-sub">' + esc(time(r.created_at)) + (r.ip ? " · " + esc(r.ip) : "") + '</div></div>' +
        '</div>' +
        '<strong class="bill-delta ' + (v >= 0 ? "pos" : "neg") + '">' +
          (v >= 0 ? "+" : "-") + fmt(Math.abs(v)) + '</strong>' +
      '</div>';
    });
    html += "</div>";
    els.list.innerHTML = html;
  }

  function load() {
    if (!auth().loggedIn()) return;
    els.list.innerHTML = '<div class="credit-empty">正在加载…</div>';
    fetch(API + "/api/bill", { headers: { "Authorization": "Bearer " + auth().token() } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || !x.j.ok) {
          els.list.innerHTML = '<div class="credit-empty">加载失败，点刷新重试。</div>';
          return;
        }
        rows = x.j.log || [];
        els.balance.textContent = fmt(x.j.credits);
        if (auth().setCredits) auth().setCredits(x.j.credits);
        renderStats();
        renderList();
      })
      .catch(function () { els.list.innerHTML = '<div class="credit-empty">连不上服务器，稍后再试。</div>'; });
  }

  document.querySelectorAll(".bill-filter").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".bill-filter").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      filter = b.getAttribute("data-filter") || "all";
      renderList();
    });
  });
  if (els.refresh) els.refresh.addEventListener("click", load);
  if (els.openLogin) els.openLogin.addEventListener("click", function () { auth().open("login"); });

  auth().onChange(function () {
    if (auth().loggedIn()) {
      els.notLogged.setAttribute("hidden", "");
      els.logged.removeAttribute("hidden");
      load();
    } else {
      els.logged.setAttribute("hidden", "");
      els.notLogged.removeAttribute("hidden");
    }
  });
  if (auth().loggedIn()) {
    els.notLogged.setAttribute("hidden", "");
    els.logged.removeAttribute("hidden");
    load();
  } else {
    els.logged.setAttribute("hidden", "");
    els.notLogged.removeAttribute("hidden");
  }
})();
