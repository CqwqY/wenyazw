/* 全站轻量动效：React Bits 风格 FadeContent + SpotlightCard 的原生实现。
   零依赖，只在可见区域触发一次，尊重 prefers-reduced-motion。 */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 滚动渐显：给 .motion-in 元素在首次进入视口时加 .is-in */
  function initFade() {
    if (reduce || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(document.querySelectorAll(".motion-in"), function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { threshold: .08, rootMargin: "0px 0px -30px 0px" });
    Array.prototype.forEach.call(document.querySelectorAll(".motion-in"), function (el) { io.observe(el); });
  }

  /* 指针聚光：给 .spotlight 元素设置 --sx/--sy，CSS 画径向光斑 */
  function initSpotlight() {
    if (reduce) return;
    Array.prototype.forEach.call(document.querySelectorAll(".spotlight"), function (card) {
      if (card.dataset.spotBound) return;
      card.dataset.spotBound = "1";
      var pending = 0, px = 0, py = 0;
      card.addEventListener("pointermove", function (e) {
        px = e.clientX; py = e.clientY;
        if (pending) return;
        pending = requestAnimationFrame(function () {
          pending = 0;
          var r = card.getBoundingClientRect();
          card.style.setProperty("--sx", ((px - r.left) / r.width * 100).toFixed(1) + "%");
          card.style.setProperty("--sy", ((py - r.top) / r.height * 100).toFixed(1) + "%");
        });
      });
      card.addEventListener("pointerleave", function () {
        card.style.setProperty("--sx", "50%");
        card.style.setProperty("--sy", "50%");
      });
    });
  }

  function init() { initFade(); initSpotlight(); }

  window.WY_MOTION = { refresh: init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
