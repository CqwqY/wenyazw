/* 文芽作文 - 页面逻辑 */

(function () {
  "use strict";

  var WY = window.WY = window.WY || {};

  /* ---------- 工具函数 ---------- */

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function param(name) {
    var m = new RegExp("[?&]" + name + "=([^&#]*)").exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  }

  WY.esc = esc;
  WY.param = param;

  /* ---------- 导航 ---------- */

  var toggle = document.getElementById("navToggle");
  var nav = document.getElementById("nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
    });
  }

  /* ---------- 卡片渲染 ---------- */

  WY.renderEssayCards = function (el, list) {
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<div class="empty">没有找到符合条件的范文，换个筛选条件试试。</div>';
      return;
    }
    el.innerHTML = list.map(function (e) {
      return '' +
        '<a class="essay-card" href="essay.html?id=' + encodeURIComponent(e.id) + '">' +
          '<div class="essay-meta">' +
            '<span class="tag tag-brand">' + esc(e.grade) + '</span>' +
            '<span class="tag">' + esc(e.genre) + '</span>' +
            '<span class="tag">' + esc(e.theme) + '</span>' +
          '</div>' +
          '<h3>' + esc(e.title) + '</h3>' +
          '<p class="excerpt">' + esc(e.excerpt) + '</p>' +
          '<div class="essay-foot">' +
            '<span>' + esc(e.author) + '</span>' +
            '<span>' + esc(e.readTime) + ' 分钟</span>' +
          '</div>' +
        '</a>';
    }).join("");
  };

  WY.renderTipCards = function (el, list) {
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<div class="empty">暂无内容。</div>';
      return;
    }
    el.innerHTML = list.map(function (t) {
      return '' +
        '<a class="card" href="tip.html?id=' + encodeURIComponent(t.id) + '">' +
          '<div class="essay-meta" style="margin-bottom:10px">' +
            '<span class="tag tag-brand">' + esc(t.level) + '</span>' +
            '<span class="tag">' + esc(t.readTime) + ' 分钟</span>' +
          '</div>' +
          '<h3>' + esc(t.title) + '</h3>' +
          '<p style="margin-top:8px">' + esc(t.summary) + '</p>' +
        '</a>';
    }).join("");
  };

  /* ---------- 范文列表页 ---------- */

  var essayGrid = document.getElementById("essayGrid");
  if (essayGrid) {
    var state = { grade: "全部", genre: "全部", q: "" };

    var gradeChips = Array.prototype.slice.call(document.querySelectorAll("[data-grade]"));
    var genreChips = Array.prototype.slice.call(document.querySelectorAll("[data-genre]"));
    var searchInput = document.getElementById("essaySearch");

    var initGrade = param("grade");
    if (initGrade) state.grade = initGrade;

    function syncChips() {
      gradeChips.forEach(function (c) {
        c.classList.toggle("active", c.getAttribute("data-grade") === state.grade);
      });
      genreChips.forEach(function (c) {
        c.classList.toggle("active", c.getAttribute("data-genre") === state.genre);
      });
    }

    function apply() {
      var list = WY.essays.filter(function (e) {
        var okGrade = state.grade === "全部" || e.grade === state.grade;
        var okGenre = state.genre === "全部" || e.genre === state.genre;
        var okQ = !state.q ||
          (e.title + e.theme + e.genre + e.excerpt + e.author).toLowerCase()
            .indexOf(state.q.toLowerCase()) > -1;
        return okGrade && okGenre && okQ;
      });
      WY.renderEssayCards(essayGrid, list);
      var countEl = document.getElementById("essayCount");
      if (countEl) countEl.textContent = "共 " + list.length + " 篇";
    }

    gradeChips.forEach(function (c) {
      c.addEventListener("click", function () {
        state.grade = c.getAttribute("data-grade");
        syncChips();
        apply();
      });
    });

    genreChips.forEach(function (c) {
      c.addEventListener("click", function () {
        state.genre = c.getAttribute("data-genre");
        syncChips();
        apply();
      });
    });

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        state.q = searchInput.value.trim();
        apply();
      });
    }

    syncChips();
    apply();
  }

  /* ---------- 范文详情页 ---------- */

  var essayBody = document.getElementById("essayBody");
  if (essayBody) {
    var id = param("id");
    var essay = WY.essays.filter(function (e) { return e.id === id; })[0];

    if (!essay) {
      essayBody.innerHTML = '<div class="empty">这篇范文不存在。<br><br><a class="btn btn-ghost" href="essays.html">返回范文库</a></div>';
      var relSection = document.getElementById("relatedEssays");
      if (relSection && relSection.parentNode) relSection.parentNode.style.display = "none";
    } else {
      document.title = essay.title + " - 文芽作文";
      document.getElementById("essayTitle").textContent = essay.title;

      document.getElementById("essayMeta").innerHTML =
        '<span class="tag tag-brand">' + esc(essay.grade) + '</span>' +
        '<span class="tag">' + esc(essay.genre) + '</span>' +
        '<span class="tag">' + esc(essay.theme) + '</span>' +
        '<span>' + esc(essay.author) + '</span>' +
        '<span>· ' + esc(essay.readTime) + ' 分钟读完</span>';

      essayBody.innerHTML = essay.body.map(function (p) {
        return "<p>" + esc(p) + "</p>";
      }).join("") +
        '<div class="note"><strong>点评</strong>' + esc(essay.analysis) + '</div>';

      var related = WY.essays.filter(function (e) {
        return e.id !== essay.id && (e.grade === essay.grade || e.genre === essay.genre);
      }).slice(0, 3);
      var relEl = document.getElementById("relatedEssays");
      if (relEl) WY.renderEssayCards(relEl, related);
    }
  }

  /* ---------- 素材库 ---------- */

  var matList = document.getElementById("materialList");
  if (matList) {
    matList.innerHTML = WY.materials.map(function (g) {
      return '' +
        '<section class="section" style="padding:32px 0">' +
          '<div class="section-head" style="margin-bottom:18px">' +
            '<div>' +
              '<h2 style="font-size:22px">' + esc(g.topic) + '</h2>' +
              '<p>' + esc(g.note) + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="grid grid-2" style="gap:14px">' +
            g.items.map(function (s) {
              return '<div class="card" style="padding:18px 20px;font-family:var(--serif);font-size:15.5px;line-height:1.9">' + esc(s) + '</div>';
            }).join("") +
          '</div>' +
        '</section>';
    }).join("");
  }

  /* ---------- 方法列表页 ---------- */

  var tipGrid = document.getElementById("tipGrid");
  if (tipGrid) {
    WY.renderTipCards(tipGrid, WY.tips);
  }

  /* ---------- 方法详情页 ---------- */

  var tipBody = document.getElementById("tipBody");
  if (tipBody) {
    var tid = param("id");
    var tip = WY.tips.filter(function (t) { return t.id === tid; })[0];

    if (!tip) {
      tipBody.innerHTML = '<div class="empty">这篇方法不存在。<br><br><a class="btn btn-ghost" href="tips.html">返回方法列表</a></div>';
    } else {
      document.title = tip.title + " - 文芽作文";
      document.getElementById("tipTitle").textContent = tip.title;
      document.getElementById("tipMeta").innerHTML =
        '<span class="tag tag-brand">' + esc(tip.level) + '</span>' +
        '<span class="tag">' + esc(tip.readTime) + ' 分钟</span>';

      tipBody.innerHTML = tip.body.map(function (p) {
        return "<p>" + esc(p) + "</p>";
      }).join("");
    }
  }
})();
