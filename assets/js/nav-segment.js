/* 把首页侧边栏 / 手机底栏升级为 RubberSegment 橡胶分段导航。
   保留原按钮 DOM 和 home.js 的点击绑定，只在上面叠加滑动块与拖拽手感。 */
(function () {
  "use strict";

  function itemsFrom(nav) {
    return Array.prototype.map.call(nav.querySelectorAll("[data-view]"), function (b) {
      var label = b.querySelector("span:not(.side-item-tag):not(.side-item-badge):not(.rs__copy)");
      var icon = b.querySelector(":scope > svg");
      /* 分段控件会在按钮里插一份标签副本，取第一个文本节点避免重复 */
      if (!label) {
        var spans = b.querySelectorAll("span");
        for (var i = 0; i < spans.length; i++) {
          if (!spans[i].classList.contains("side-item-tag") && !spans[i].classList.contains("side-item-badge")) { label = spans[i]; break; }
        }
      }
      return {
        value: b.getAttribute("data-view"),
        label: label ? label.textContent.trim() : (b.textContent || "").trim(),
        icon: icon ? icon.outerHTML : ""
      };
    });
  }

  function init() {
    if (!window.RubberSegment || !window.WY_NAV) return;
    var side = document.getElementById("sideSegment");
    var tab = document.getElementById("tabSegment");
    var hash = (location.hash || "").replace("#", "") || "home";
    var current = window.WY_NAV && document.getElementById("view" + hash.charAt(0).toUpperCase() + hash.slice(1))
      ? hash : "home";

    function onChange(v) {
      window.WY_NAV.setView(v);
    }

    if (side) {
      window.WY_SEG_SIDE = window.RubberSegment.mount(side, {
        items: itemsFrom(side), value: current, adopt: true,
        orientation: "vertical", size: "md", onChange: onChange
      });
    }
    if (tab) {
      window.WY_SEG_TAB = window.RubberSegment.mount(tab, {
        items: itemsFrom(tab), value: current, adopt: true,
        tone: "deep", size: "md", onChange: onChange
      });
    }

    /* 原按钮点击时同步滑块（点击手势也会触发分段自身 onChange，这里兜底 hash/外部调用） */
    var all = document.querySelectorAll("[data-view]");
    Array.prototype.forEach.call(all, function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-view");
        if (window.WY_SEG_SIDE) window.WY_SEG_SIDE.set(v);
        if (window.WY_SEG_TAB) window.WY_SEG_TAB.set(v);
      });
    });
    window.addEventListener("hashchange", function () {
      var v = (location.hash || "").replace("#", "") || "home";
      if (window.WY_SEG_SIDE) window.WY_SEG_SIDE.set(v);
      if (window.WY_SEG_TAB) window.WY_SEG_TAB.set(v);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 0); });
  else setTimeout(init, 0);
})();
