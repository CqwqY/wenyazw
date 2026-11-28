/* RubberSegment - React Bits 风格的轻量分段控件（原生零依赖）
   滑块只是一层背景 pill，真实按钮文字始终可见；位移走 CSS transform 过渡，
   拖拽时关闭过渡直接跟手，松手吸附。没有逐帧弹簧、没有文字副本、没有 clip-path 重绘。 */
(function () {
  "use strict";

  var DEADZONE = 3, RUBBER = 0.5;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function rubber(over, dim) { return (over * dim * RUBBER) / (dim + RUBBER * Math.abs(over)); }

  function mount(el, opt) {
    if (!el) return null;
    var items = (opt.items || []).map(function (it) {
      return typeof it === "string" ? { value: it, label: it } : it;
    });
    if (!items.length) return null;
    var vertical = opt.orientation === "vertical";
    var equal = opt.equalSlots !== false;
    var draggable = opt.draggable !== false;
    var disabled = !!opt.disabled;

    el.classList.add("rs");
    el.setAttribute("role", "radiogroup");
    el.setAttribute("aria-label", opt.label || "分段选择");
    el.dataset.orientation = vertical ? "vertical" : "horizontal";
    el.dataset.equal = equal ? "true" : "false";
    el.dataset.draggable = draggable && !disabled ? "true" : "false";
    el.dataset.disabled = disabled ? "true" : "false";
    el.dataset.anim = "0";
    if (opt.size) el.dataset.size = opt.size;
    if (opt.tone) el.dataset.tone = opt.tone;

    /* adopt 模式：接管已有按钮的 DOM 与事件绑定，只补一层滑块 */
    if (opt.adopt) {
      Array.prototype.forEach.call(el.querySelectorAll("[data-view]"), function (c) {
        if (!c.classList.contains("rs__item")) c.classList.add("rs__item");
      });
    }

    var oldBtns = el.querySelectorAll(".rs__item:not(.rs__copy)");
    if (!oldBtns.length) {
      el.innerHTML = "";
      items.forEach(function (it) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rs__item" + (it.className ? " " + it.className : "");
        b.dataset.value = it.value;
        if (it.dataMode) b.dataset.mode = it.dataMode;
        b.setAttribute("role", "radio");
        if (it.icon) {
          var ic = document.createElement("span");
          ic.className = "rs__icon";
          ic.innerHTML = it.icon;
          b.appendChild(ic);
        }
        var tx = document.createElement("span");
        tx.textContent = it.label;
        b.appendChild(tx);
        el.appendChild(b);
      });
    }

    var thumb = el.querySelector(".rs__thumb");
    if (!thumb) {
      thumb = document.createElement("div");
      thumb.className = "rs__thumb";
      thumb.setAttribute("aria-hidden", "true");
      el.appendChild(thumb);
    }
    /* 清掉旧版本残留的文字副本，避免重影 */
    Array.prototype.forEach.call(thumb.children, function (c) { c.remove(); });

    var buttons = Array.prototype.slice.call(el.querySelectorAll(".rs__item:not(.rs__copy)"));
    var slots = [];
    var value = opt.value != null ? opt.value : (opt.defaultValue != null ? opt.defaultValue : items[0].value);
    var committed = Math.max(0, items.findIndex(function (it) { return it.value === value; }));
    var cur = { x: 0, y: 0, w: 0, h: 0 };
    var drag = null, suppressClick = false;

    function animate(on) { el.dataset.anim = on && !reduce ? "1" : "0"; }
    function write() {
      thumb.style.width = cur.w + "px";
      thumb.style.height = cur.h + "px";
      thumb.style.transform = "translate3d(" + cur.x + "px," + cur.y + "px,0)";
    }
    function place(i, withAnim) {
      var s = slots[i];
      if (!s) return;
      animate(withAnim);
      cur.x = s[0]; cur.y = s[1]; cur.w = s[2]; cur.h = s[3];
      write();
    }
    function measure() {
      var box = el.getBoundingClientRect();
      slots = buttons.map(function (b) {
        var r = b.getBoundingClientRect();
        return [r.left - box.left, r.top - box.top, r.width, r.height];
      });
      place(committed, false);
    }
    function setChecked(i) {
      buttons.forEach(function (b, n) {
        var on = n === i;
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
        b.classList.toggle("active", on);
      });
    }
    function commit(i) {
      if (i === committed) return;
      committed = i;
      setChecked(i);
      if (opt.onChange) opt.onChange(items[i].value, i);
    }
    function nearest(pos) {
      var best = 0, bd = Infinity;
      for (var i = 0; i < slots.length; i++) {
        var d = Math.abs(slots[i][vertical ? 1 : 0] - pos);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    function onDown(e, i) {
      if (disabled || drag || e.button !== 0) return;
      var box = el.getBoundingClientRect();
      drag = {
        id: e.pointerId,
        boxTop: box.top, boxLeft: box.left,
        p0: vertical ? e.clientY - box.top : e.clientX - box.left,
        x0: cur.x, y0: cur.y, size: vertical ? cur.h : cur.w,
        moved: false
      };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    }
    function onMove(e) {
      var d = drag;
      if (!d || e.pointerId !== d.id) return;
      var p = vertical ? e.clientY - d.boxTop : e.clientX - d.boxLeft;
      var delta = p - d.p0;
      if (!d.moved) {
        if (Math.abs(delta) < DEADZONE) return;
        d.moved = true;
        animate(false);
        el.dataset.held = "true";
      }
      var base = vertical ? d.y0 : d.x0;
      var max = slots.length ? slots[slots.length - 1][vertical ? 1 : 0] : base;
      var next = base + delta;
      if (next < 0) next = -rubber(-next, d.size);
      else if (next > max) next = max + rubber(next - max, d.size);
      if (vertical) { cur.x = d.x0; cur.y = next; }
      else { cur.x = next; cur.y = d.y0; }
      write();
    }
    function onUp(e) {
      var d = drag;
      if (!d || e.pointerId !== d.id) return;
      drag = null;
      delete el.dataset.held;
      if (!d.moved) return;
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 0);
      var to = nearest(vertical ? cur.y : cur.x);
      commit(to);
      place(to, true);
    }
    function onKey(e) {
      if (disabled) return;
      var last = items.length - 1, next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(last, committed + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, committed - 1);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = last;
      if (next == null) return;
      e.preventDefault();
      if (next === committed) return;
      commit(next);
      place(next, true);
      buttons[next].focus();
    }

    var listeners = [];
    function listen(target, type, fn, capture) {
      target.addEventListener(type, fn, capture);
      listeners.push([target, type, fn, capture]);
    }
    buttons.forEach(function (b, i) {
      listen(b, "pointerdown", function (e) { onDown(e, i); });
      listen(b, "pointermove", onMove);
      listen(b, "pointerup", onUp);
      listen(b, "pointercancel", onUp);
      listen(b, "keydown", onKey);
    });
    listen(el, "click", function (e) {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { measure(); });
      ro.observe(el);
    } else {
      window.addEventListener("resize", measure);
    }
    setChecked(committed);
    measure();
    requestAnimationFrame(function () {
      measure();
      if (document.fonts) document.fonts.ready.then(measure);
    });

    return {
      el: el,
      value: function () { return items[committed] && items[committed].value; },
      set: function (v) {
        var i = items.findIndex(function (it) { return it.value === v; });
        if (i < 0 || i === committed) return;
        committed = i;
        setChecked(i);
        place(i, true);
        if (opt.onChange) opt.onChange(v, i);
      },
      refresh: measure,
      destroy: function () {
        if (ro) ro.disconnect();
        else window.removeEventListener("resize", measure);
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        listeners = [];
      }
    };
  }

  window.RubberSegment = { mount: mount, reduceMotion: reduce };
})();
