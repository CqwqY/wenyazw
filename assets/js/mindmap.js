/* 文芽作文 - 我的作文：思维导图视图
   结构：中心根 → 主题板块 → 作文节点；派生作文额外画一条虚线连回素材来源。

   刻意不做可拖拽自由画布：作文是要点开继续改的，节点位置乱跑只会更难找。
   连线用一层 SVG 覆盖算坐标，手机上收成缩进树（CSS 竖线），派生关系靠文字标注保底。 */
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var st = {
    host: null, svg: null, root: null, boardsEl: null,
    rows: [], boards: [], handlers: {}, collapsed: {},
    timer: 0, bound: false
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s); }
  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function fmtDate(s) {
    var d = new Date(String(s || ""));
    if (isNaN(d.getTime())) return "";
    return (d.getMonth() + 1) + "/" + d.getDate();
  }
  function boardLabel(key) {
    for (var i = 0; i < st.boards.length; i++) {
      if (st.boards[i].key === key) return st.boards[i].label;
    }
    return "暂未归类";
  }
  function boardHint(key) {
    for (var i = 0; i < st.boards.length; i++) {
      if (st.boards[i].key === key) return st.boards[i].hint || "";
    }
    return "";
  }
  function sourceList(raw) {
    try {
      var a = JSON.parse(String(raw || "[]"));
      return Array.isArray(a) ? a.map(Number).filter(function (x) { return x > 0; }).slice(0, 3) : [];
    } catch (e) { return []; }
  }

  function nodeActions(r) {
    var box = make("div", "map-node-actions");
    var defs = [
      ["open", "继续修改", "btn btn-primary"],
      ["params", "改参数", "btn-outline"],
      ["poster", "海报", "btn-outline"],
      ["delete", "删除", "btn-outline"]
    ];
    defs.forEach(function (d) {
      var b = make("button", d[2], d[1]);
      b.type = "button";
      b.setAttribute("data-act", d[0]);
      b.setAttribute("data-id", String(r.id));
      box.appendChild(b);
    });
    var wrap = make("label", "map-node-board");
    wrap.appendChild(make("span", "", "板块"));
    var sel = make("select", "map-board-select");
    sel.setAttribute("data-id", String(r.id));
    sel.setAttribute("aria-label", "改板块");
    st.boards.forEach(function (b) {
      var o = make("option", "", b.label);
      o.value = b.key;
      if (b.key === (r.board || "other")) o.selected = true;
      sel.appendChild(o);
    });
    wrap.appendChild(sel);
    box.appendChild(wrap);
    return box;
  }

  function nodeCard(r, byId) {
    var card = make("article", "map-node" + (r.parent_id ? " is-derived" : ""));
    card.setAttribute("data-id", String(r.id));
    if (r.parent_id) card.setAttribute("data-parent", String(r.parent_id));

    var top = make("div", "map-node-top");
    top.appendChild(make("h3", "", esc(r.title || "无题")));
    var d = fmtDate(r.updated_at || r.created_at);
    if (d) top.appendChild(make("span", "map-node-date", d));
    card.appendChild(top);

    var meta = make("div", "map-node-meta");
    [String(r.word_count || 0) + " 字", esc(r.category || ""), r.has_outline ? "有大纲" : ""]
      .filter(Boolean).forEach(function (t) { meta.appendChild(make("span", "", t)); });
    card.appendChild(meta);

    var sources = sourceList(r.source_ids);
    if (!sources.length && r.parent_id) sources = [Number(r.parent_id)];
    if (sources.length) {
      var line = make("div", "map-node-origin");
      line.appendChild(make("span", "map-origin-label", "派生 · 借材"));
      sources.forEach(function (id) {
        var src = byId[id];
        var chip = make("button", "map-origin-chip",
          src ? "《" + esc(src.title || "无题") + "》" : "已删除的作文");
        chip.type = "button";
        chip.setAttribute("data-focus", String(id));
        if (!src) chip.disabled = true;
        line.appendChild(chip);
      });
      card.appendChild(line);
    }
    card.appendChild(nodeActions(r));
    return card;
  }

  function boardCard(b, rows, byId) {
    var box = make("section", "map-board" + (rows.length ? "" : " is-empty"));
    box.setAttribute("data-board", b.key);
    box.style.setProperty("--board-color", b.color || "#1d7048");
    if (st.collapsed[b.key]) box.classList.add("is-collapsed");

    var head = make("button", "map-board-head");
    head.type = "button";
    head.setAttribute("data-fold", b.key);
    var dot = make("span", "map-board-dot");
    head.appendChild(dot);
    var title = make("span", "map-board-name", b.label);
    head.appendChild(title);
    head.appendChild(make("span", "map-board-count", String(rows.length) + " 篇"));
    head.appendChild(make("span", "map-fold-mark", st.collapsed[b.key] ? "+" : "−"));
    box.appendChild(head);
    box.appendChild(make("p", "map-board-hint", b.hint || ""));

    var nodes = make("div", "map-nodes");
    if (!rows.length) {
      nodes.appendChild(make("div", "map-board-void", "这个板块还没有作文"));
    } else {
      rows.forEach(function (r) { nodes.appendChild(nodeCard(r, byId)); });
    }
    box.appendChild(nodes);
    return box;
  }

  function svgPath(d, cls, color) {
    var p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("class", cls);
    if (color) p.setAttribute("stroke", color);
    st.svg.appendChild(p);
  }

  function curve(a, b) {
    var dx = Math.max(28, Math.min(90, Math.abs(b.x - a.x) * 0.45));
    return "M " + a.x + " " + a.y + " C " + (a.x + dx) + " " + a.y + ", " +
      (b.x - dx) + " " + b.y + ", " + b.x + " " + b.y;
  }

  function drawLines() {
    st.timer = 0;
    if (!st.host || !st.svg || !st.root) return;
    while (st.svg.firstChild) st.svg.removeChild(st.svg.firstChild);
    if (window.innerWidth <= 720) return;    // 手机交给 CSS 竖线

    var box = st.host.getBoundingClientRect();
    var w = st.host.clientWidth, h = st.host.clientHeight;
    st.svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    st.svg.setAttribute("width", String(w));
    st.svg.setAttribute("height", String(h));

    function edge(node, side) {
      var r = node.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return {
        x: (side === "right" ? r.right : r.left) - box.left,
        y: r.top + r.height / 2 - box.top
      };
    }

    var a = edge(st.root, "right");
    if (a) {
      var cards = st.boardsEl.querySelectorAll(".map-board");
      Array.prototype.forEach.call(cards, function (c) {
        var b = edge(c, "left");
        if (!b) return;
        var color = c.style.getPropertyValue("--board-color") || "#1d7048";
        svgPath(curve(a, b), "map-link", color);
        var dot = document.createElementNS(SVG_NS, "circle");
        dot.setAttribute("cx", String(b.x)); dot.setAttribute("cy", String(b.y));
        dot.setAttribute("r", "3"); dot.setAttribute("fill", color);
        st.svg.appendChild(dot);
      });
    }

    /* 派生关联：每个派生节点连回它借过的作文，主来源画实一点的虚线。 */
    var derived = st.host.querySelectorAll(".map-node.is-derived");
    Array.prototype.forEach.call(derived, function (n) {
      var from = edge(n, "left");
      if (!from) return;
      var ids = [];
      var parent = Number(n.getAttribute("data-parent") || 0);
      if (parent) ids.push(parent);
      var chips = n.querySelectorAll(".map-origin-chip[data-focus]");
      Array.prototype.forEach.call(chips, function (c) {
        var id = Number(c.getAttribute("data-focus"));
        if (id && ids.indexOf(id) < 0) ids.push(id);
      });
      ids.slice(0, 3).forEach(function (id, idx) {
        var target = st.host.querySelector('.map-node[data-id="' + id + '"]');
        if (!target || target === n) return;
        var to = edge(target, "left");
        if (!to) return;
        var midX = Math.min(from.x, to.x) - 16 - idx * 5;
        var d = "M " + from.x + " " + from.y + " C " + midX + " " + from.y + ", " +
          midX + " " + to.y + ", " + to.x + " " + to.y;
        svgPath(d, idx === 0 ? "map-link-derived" : "map-link-derived map-link-faint", "#c9932f");
      });
    });
  }

  /* 用 setTimeout 而不是 rAF：无头浏览器、后台标签页里 rAF 可能一直不触发，
     连线就永远画不出来。连续触发时做一次去抖即可。 */
  function scheduleDraw() {
    if (st.timer) window.clearTimeout(st.timer);
    st.timer = window.setTimeout(function () { st.timer = 0; drawLines(); }, 16);
  }

  function render(data, handlers) {
    var host = $("mindmap");
    if (!host) return;
    st.host = host;
    st.rows = (data && data.rows) || [];
    st.boards = (data && data.boards) || [];
    st.handlers = handlers || {};

    host.innerHTML = "";
    st.svg = document.createElementNS(SVG_NS, "svg");
    st.svg.setAttribute("class", "map-links");
    st.svg.setAttribute("aria-hidden", "true");
    host.appendChild(st.svg);

    var layout = make("div", "map-layout");
    var root = make("div", "map-root");
    root.appendChild(make("span", "map-root-kicker", "作文库"));
    root.appendChild(make("strong", "", "我的作文"));
    var boardCount = {};
    st.rows.forEach(function (r) { boardCount[r.board || "other"] = (boardCount[r.board || "other"] || 0) + 1; });
    var used = st.boards.filter(function (b) { return boardCount[b.key]; }).length;
    root.appendChild(make("span", "map-root-num",
      st.rows.length + " 篇 · " + used + " 个板块"));
    var derivedCount = st.rows.filter(function (r) { return r.parent_id; }).length;
    root.appendChild(make("span", "map-root-tip",
      derivedCount ? ("其中 " + derivedCount + " 篇由旧稿派生") : "每一篇都是往后能借的素材"));
    st.root = root;
    layout.appendChild(root);

    var byId = {};
    st.rows.forEach(function (r) { byId[r.id] = r; });
    var boardsEl = make("div", "map-boards");
    st.boards.forEach(function (b) {
      var list = st.rows.filter(function (r) {
        return (r.board || "other") === b.key;
      });
      /* 没作文的板块收在后面，别把有内容的板块挤下去 */
      if (!list.length) return;
      boardsEl.appendChild(boardCard(b, list, byId));
    });
    /* 空板块只留一行索引，看得见分类体系但不占地方 */
    var voidBoards = st.boards.filter(function (b) { return !boardCount[b.key]; });
    if (voidBoards.length) {
      var strip = make("div", "map-void-strip");
      strip.appendChild(make("span", "", "还空着的板块"));
      voidBoards.forEach(function (b) {
        var t = make("span", "map-void-chip", b.label);
        t.style.setProperty("--board-color", b.color || "#1d7048");
        strip.appendChild(t);
      });
      boardsEl.appendChild(strip);
    }
    st.boardsEl = boardsEl;
    layout.appendChild(boardsEl);
    host.appendChild(layout);

    if (!st.rows.length) {
      var empty = make("div", "essay-empty", "还没有作文。去「创建作文」写一篇，或把已有的作文录进来。");
      host.appendChild(empty);
    }

    if (!st.bound) {
      st.bound = true;
      window.addEventListener("resize", scheduleDraw);
      host.addEventListener("click", onClick);
      host.addEventListener("change", onChange);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleDraw);
    }
    scheduleDraw();
    window.setTimeout(scheduleDraw, 260);   // 字体/图片落地后再算一次，防连线错位
  }

  function onClick(e) {
    var fold = e.target.closest ? e.target.closest("[data-fold]") : null;
    if (fold) {
      var k = fold.getAttribute("data-fold");
      st.collapsed[k] = !st.collapsed[k];
      var card = fold.closest(".map-board");
      if (card) {
        card.classList.toggle("is-collapsed", !!st.collapsed[k]);
        fold.querySelector(".map-fold-mark").textContent = st.collapsed[k] ? "+" : "−";
      }
      scheduleDraw();
      return;
    }
    var focus = e.target.closest ? e.target.closest("[data-focus]") : null;
    if (focus) {
      var id = focus.getAttribute("data-focus");
      var target = st.host.querySelector('.map-node[data-id="' + id + '"]');
      if (target) {
        target.classList.add("is-flash");
        if (target.scrollIntoView) target.scrollIntoView({ block: "center", behavior: "smooth" });
        window.setTimeout(function () { target.classList.remove("is-flash"); }, 1600);
      }
      return;
    }
    var btn = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    var id2 = Number(btn.getAttribute("data-id"));
    var h = st.handlers;
    if (act === "open" && h.onOpen) h.onOpen(id2);
    if (act === "params" && h.onParams) h.onParams(id2);
    if (act === "poster" && h.onPoster) h.onPoster(id2);
    if (act === "delete" && h.onDelete) h.onDelete(id2);
  }

  function onChange(e) {
    var sel = e.target;
    if (!sel || !sel.classList || !sel.classList.contains("map-board-select")) return;
    if (st.handlers.onBoardChange) st.handlers.onBoardChange(Number(sel.getAttribute("data-id")), sel.value);
  }

  /* 手动重画：归类 / 派生 / 折叠之后外部可以调一次 */
  function redraw() { scheduleDraw(); }

  window.WY_MINDMAP = { render: render, redraw: redraw, boardLabel: boardLabel, boardHint: boardHint };
})();
