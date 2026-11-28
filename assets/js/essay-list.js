/* 作文列表视图：作文一多时比思维导图更好读。
   卡片网格 + 板块 RubberSegment 筛选 + 搜索 + 元信息层级。
   不接管数据加载，只消费 home.js renderMindmap 已经拿到的 allRows/boards。 */
(function () {
  "use strict";

  var mode = "list";
  var boardKey = "all";
  var query = "";
  var rows = [];
  var boards = [];
  var seg = null;
  var filterSeg = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function dateText(ts) {
    var n = Number(ts);
    if (!n) return "";
    var d = new Date(n > 1e12 ? n : n * 1000);
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }
  function boardName(key) {
    var b = boards.find(function (x) { return x.key === key; });
    return b ? b.label : (key === "other" || !key ? "暂未归类" : key);
  }
  function excerpt(text, n) {
    var s = String(text || "").replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  function filtered() {
    var q = query.trim().toLowerCase();
    return rows.filter(function (r) {
      if (boardKey !== "all" && (r.board || "other") !== boardKey) return false;
      if (!q) return true;
      var hay = [r.title, r.body, boardName(r.board), r.genre].join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function cardHtml(r) {
    var words = Number(r.words || (r.body ? r.body.replace(/\s/g, "").length : 0)) || 0;
    var score = r.score != null && r.score !== "" ? Number(r.score) : null;
    var dt = dateText(r.created_at || r.updated_at);
    var color = (boards.find(function (b) { return b.key === (r.board || "other"); }) || {}).color || "#2a8a5b";
    var meta = [];
    if (dt) meta.push(dt);
    if (words) meta.push(words + " 字");
    if (r.genre) meta.push(esc(r.genre));
    return '' +
      '<article class="essay-card" data-id="' + esc(r.id) + '">' +
        '<div class="essay-card-top">' +
          '<span class="essay-board" style="--board-color:' + esc(color) + '">' + esc(boardName(r.board)) + '</span>' +
          (score != null && !isNaN(score) ? '<span class="essay-score">' + esc(score) + '<small>分</small></span>' : '') +
        '</div>' +
        '<h3 class="essay-card-title">' + esc(r.title || "无题") + '</h3>' +
        '<p class="essay-card-excerpt">' + esc(excerpt(r.body || r.excerpt, 92)) + '</p>' +
        '<div class="essay-card-meta">' + meta.map(function (m) { return '<span>' + m + '</span>'; }).join('<i>·</i>') + '</div>' +
        '<div class="essay-card-actions">' +
          '<button type="button" class="ec-btn primary" data-act="open">打开</button>' +
          '<button type="button" class="ec-btn" data-act="params">设置</button>' +
          '<button type="button" class="ec-btn" data-act="poster">海报</button>' +
          '<button type="button" class="ec-btn danger" data-act="delete">删除</button>' +
        '</div>' +
      '</article>';
  }

  function renderFilter() {
    var box = $("essayFilter");
    if (!box) return;
    var opts = [{ value: "all", label: "全部" }].concat(boards.map(function (b) {
      return { value: b.key, label: b.label };
    }));
    if (!opts.some(function (o) { return o.value === boardKey; })) boardKey = "all";
    if (filterSeg) { filterSeg.destroy(); filterSeg = null; }
    if (window.RubberSegment) {
      filterSeg = window.RubberSegment.mount(box, {
        items: opts, value: boardKey, size: "sm", equalSlots: false,
        onChange: function (v) { boardKey = v; renderList(); }
      });
    } else {
      box.innerHTML = opts.map(function (o) {
        return '<button type="button" class="filter-chip' + (o.value === boardKey ? ' active' : '') + '" data-v="' + esc(o.value) + '">' + esc(o.label) + '</button>';
      }).join("");
      Array.prototype.forEach.call(box.querySelectorAll(".filter-chip"), function (b) {
        b.addEventListener("click", function () { boardKey = b.dataset.v; renderList(); });
      });
    }
  }

  function renderList() {
    var grid = $("essayGrid");
    var empty = $("essayEmpty");
    var count = $("essayCount");
    if (!grid) return;
    var list = filtered();
    grid.innerHTML = list.map(cardHtml).join("");
    if (empty) empty.hidden = list.length > 0;
    if (count) count.textContent = list.length + (list.length === rows.length ? " 篇" : " / " + rows.length + " 篇");
    /* 卡片错峰入场，纯 CSS，不走 JS 逐帧 */
    Array.prototype.forEach.call(grid.children, function (c, i) {
      c.style.animationDelay = Math.min(i, 12) * 24 + "ms";
    });
  }

  function setMode(next) {
    mode = next;
    var listView = $("essayListView");
    var mapView = $("mindmap");
    if (listView) listView.hidden = mode !== "list";
    if (mapView) mapView.hidden = mode !== "map";
    Array.prototype.forEach.call(document.querySelectorAll("#essayViewSwitch [data-mode], #essayViewSwitch [data-value]"), function (b) {
      var v = b.getAttribute("data-mode") || b.getAttribute("data-value");
      var on = v === mode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    if (seg && seg.set) seg.set(mode);
    if (mode === "list") renderList();
    if (mode === "map" && window.WY_MINDMAP) window.WY_MINDMAP.refresh && window.WY_MINDMAP.refresh();
  }

  function init() {
    var sw = $("essayViewSwitch");
    if (sw) {
      if (window.RubberSegment) {
        seg = window.RubberSegment.mount(sw, {
          items: [
            { value: "list", label: "列表", dataMode: "list", className: "esv", icon: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>' },
            { value: "map", label: "思维导图", dataMode: "map", className: "esv", icon: '<svg viewBox="0 0 24 24"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6.8 6.6 17 5.4M6 7.8l5 8.4M17.6 6.8 13 16.4"/></svg>' }
          ],
          value: "list", size: "sm", onChange: setMode
        });
      } else {
        Array.prototype.forEach.call(sw.querySelectorAll(".esv"), function (b) {
          b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
        });
      }
    }
    var search = $("essaySearch");
    if (search) search.addEventListener("input", function () { query = search.value || ""; if (mode === "list") renderList(); });

    var grid = $("essayGrid");
    if (grid) grid.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var card = e.target.closest(".essay-card");
      if (!card) return;
      var id = card.getAttribute("data-id");
      var act = btn.getAttribute("data-act");
      var api = window.WY_ESSAY_ACTIONS || {};
      if (act === "open" && api.open) api.open(id);
      else if (act === "params" && api.params) api.params(id);
      else if (act === "poster" && api.poster) api.poster(id);
      else if (act === "delete" && api.delete) api.delete(id);
    });
    setMode("list");
  }

  window.WY_ESSAY_LIST = {
    render: function (data) {
      rows = (data && data.rows) || [];
      boards = (data && data.boards) || [];
      renderFilter();
      renderList();
    },
    setMode: setMode
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
