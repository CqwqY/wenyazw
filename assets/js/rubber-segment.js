/* RubberSegment - React Bits 组件的原生移植（零依赖，无 React / 无 motion）
   保留：点击扩张、拖拽橡皮筋、惯性甩动、挤压回弹、键盘操作、减少动效降级。
   用法：RubberSegment.mount(el, { items:[{value,label,icon?}], value, onChange, orientation, tone, size })
   - el 可以是空容器（组件会生成结构），也可以是已有 .rs 元素（只补 thumb）。 */
(function () {
  "use strict";

  var DILATE = 0.19, HANDOFF = 0.15, FLICK = 110, MAX_V = 2000;
  var DEADZONE = 4, SLOP = 10, RUBBER = 0.55;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function rubber(over, dim) { return (over * dim * RUBBER) / (dim + RUBBER * Math.abs(over)); }
  function project(v, glide) {
    var d = 1 - 0.1 * Math.pow(0.05, (glide == null ? 75 : glide) / 100);
    return ((v / 1000) * d) / (1 - d);
  }
  function velocityOf(hist, now) {
    var recent = hist.filter(function (p) { return now - p[0] <= 100; });
    if (recent.length < 2) return 0;
    var a = recent[0], b = recent[recent.length - 1];
    return b[0] - a[0] >= 8 ? ((b[1] - a[1]) / (b[0] - a[0])) * 1000 : 0;
  }
  function nearest(slots, x) {
    var best = 0;
    for (var i = 1; i < slots.length; i++) {
      var dc = Math.abs((slots[i][0] + slots[i][1]) / 2 - x);
      var db = Math.abs((slots[best][0] + slots[best][1]) / 2 - x);
      if (dc < db) best = i;
    }
    return best;
  }

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
    var glide = opt.glide == null ? 75 : opt.glide;
    var stretch = opt.stretch == null ? 100 : opt.stretch;
    var squash = opt.squash == null ? 3 : opt.squash;
    var speed = opt.speed || 1;

    el.classList.add("rs");
    el.setAttribute("role", "radiogroup");
    el.setAttribute("aria-label", opt.label || "分段选择");
    el.dataset.orientation = vertical ? "vertical" : "horizontal";
    el.dataset.equal = equal ? "true" : "false";
    el.dataset.draggable = draggable && !disabled ? "true" : "false";
    el.dataset.disabled = disabled ? "true" : "false";
    if (opt.size) el.dataset.size = opt.size;
    if (opt.tone) el.dataset.tone = opt.tone;

    /* adopt 模式：接管容器内已有的按钮（保留它们的 class / data-view / 事件绑定），
       只补 thumb 与 aria，用于侧边栏这种已被 home.js 绑定的导航。 */
    if (opt.adopt) {
      /* 只接管带 data-view 的按钮；教师控制台这类外链保持原样，不占滑块格位 */
      var adopted = el.querySelectorAll("[data-view]");
      Array.prototype.forEach.call(adopted, function (c) {
        if (!c.classList.contains("rs__item")) c.classList.add("rs__item");
      });
      Array.prototype.forEach.call(el.children, function (c) {
        if (c.classList && c.classList.contains("rs__thumb")) return;
        if (c.classList && c.classList.contains("rs__item")) return;
        if (c.style) c.style.gridRow = "1 / -1";
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
        b.innerHTML = "";
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
      items.forEach(function (it) {
        var s = document.createElement("span");
        s.className = "rs__item rs__copy";
        if (it.icon) {
          var ic = document.createElement("span");
          ic.className = "rs__icon";
          ic.innerHTML = it.icon;
          s.appendChild(ic);
        }
        var tx = document.createElement("span");
        tx.textContent = it.label;
        s.appendChild(tx);
        thumb.appendChild(s);
      });
      el.appendChild(thumb);
    }

    var buttons = Array.prototype.slice.call(el.querySelectorAll(".rs__item:not(.rs__copy)"));
    var copies = Array.prototype.slice.call(thumb.children);
    var slots = [], span = 0, idx = 0;
    var value = opt.value != null ? opt.value : (opt.defaultValue != null ? opt.defaultValue : items[0].value);
    var committed = Math.max(0, items.findIndex(function (it) { return it.value === value; }));
    var edgeA = 0, edgeB = 0;
    var raf = 0, targetA = 0, targetB = 0, velA = 0, velB = 0, animating = false;
    var drag = null, handoff = 0, gen = 0;

    function measure() {
      var box = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      var inset = parseFloat(cs.paddingLeft) || 3;
      var pTop = parseFloat(cs.paddingTop) || inset;
      var pLeft = parseFloat(cs.paddingLeft) || inset;
      slots = buttons.map(function (b) {
        var r = b.getBoundingClientRect();
        return vertical
          ? [r.top - box.top - pTop, r.bottom - box.top - pTop]
          : [r.left - box.left - pLeft, r.right - box.left - pLeft];
      });
      /* 轨道内可用长度取最后一个格子的右/下边界，
         避免 adopt 模式里外链等附加元素把容器撑大导致滑块裁切错位 */
      span = slots.length ? slots[slots.length - 1][1] : (vertical ? box.height : box.width) - inset * 2;
      jump(committed);
    }

    function paint() {
      var a = edgeA, b = edgeB;
      var s = vertical
        ? "inset(" + Math.max(0, a) + "px 0 " + Math.max(0, span - b) + "px 0 round var(--rs-thumb-radius))"
        : "inset(0 " + Math.max(0, span - b) + "px 0 " + Math.max(0, a) + "px round var(--rs-thumb-radius))";
      thumb.style.clipPath = s;
      thumb.style.webkitClipPath = s;
    }
    function jump(i) {
      var s = slots[i];
      if (!s) return;
      cancelAnimationFrame(raf); animating = false;
      edgeA = s[0]; edgeB = s[1]; velA = velB = 0;
      paint();
    }
    function tick() {
      var k = 0.22 / speed, damp = 0.72;
      var da = targetA - edgeA, db = targetB - edgeB;
      velA = (velA + da * k) * damp;
      velB = (velB + db * k) * damp;
      edgeA += velA; edgeB += velB;
      paint();
      if (Math.abs(da) > 0.4 || Math.abs(db) > 0.4 || Math.abs(velA) > 0.4 || Math.abs(velB) > 0.4) {
        raf = requestAnimationFrame(tick);
      } else { jump(committed); }
    }
    function glideTo(a, b, va, vb) {
      cancelAnimationFrame(raf);
      targetA = a; targetB = b;
      velA = clamp(va || 0, -MAX_V / 120, MAX_V / 120);
      velB = clamp(vb || 0, -MAX_V / 120, MAX_V / 120);
      animating = true;
      raf = requestAnimationFrame(tick);
    }
    function setChecked(i) {
      buttons.forEach(function (b, n) { b.setAttribute("aria-checked", n === i ? "true" : "false"); b.tabIndex = n === i ? 0 : -1; });
    }
    function commit(i) {
      if (i === committed) return;
      committed = i;
      var it = items[i];
      setChecked(i);
      if (opt.onChange) opt.onChange(it.value, i);
    }
    function land(to, v, flick, withSquash) {
      var s = slots[to];
      if (!s) return;
      var dir = Math.sign((s[0] + s[1]) / 2 - (edgeA + edgeB) / 2) || 1;
      var leadTo = dir > 0 ? s[1] : s[0];
      var trailTo = dir > 0 ? s[0] : s[1];
      var over = withSquash && squash > 0 ? dir * squash : 0;
      if (dir > 0) glideTo(leadTo - (v || 0) * 0.02, trailTo + over, 0, 0);
      else glideTo(trailTo + over, leadTo - (v || 0) * 0.02, 0, 0);
      setTimeout(function () { if (!drag && committed === to) glideTo(s[0], s[1], 0, 0); }, 160 / speed);
    }
    function travel(from, to) {
      var a = slots[from], b = slots[to];
      if (!a || !b) return;
      clearTimeout(handoff);
      if (reduce) { jump(to); return; }
      var u = stretch / 100;
      targetA = b[0] + (Math.min(a[0], b[0]) - b[0]) * u;
      targetB = b[1] + (Math.max(a[1], b[1]) - b[1]) * u;
      velA = velB = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
      handoff = setTimeout(function () { land(to, null, false, true); }, HANDOFF * 1000 / speed);
    }
    function local(e) {
      var box = el.getBoundingClientRect();
      return vertical ? e.clientY - box.top : e.clientX - box.left;
    }
    function onDown(e, i) {
      if (disabled || drag || e.button !== 0) return;
      var x = local(e);
      var inside = x >= edgeA && x <= edgeB;
      if (opt.draggable === false || !inside) { e.currentTarget.dataset.pressed = ""; }
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      drag = { id: e.pointerId, x0: x, slot: i, onThumb: draggable && inside, live: false, offset: 0, w: edgeB - edgeA, hist: [[e.timeStamp, x]] };
      if (inside) { clearTimeout(handoff); cancelAnimationFrame(raf); }
    }
    function onMove(e) {
      var d = drag;
      if (!d || e.pointerId !== d.id || !d.onThumb) return;
      var x = local(e);
      d.hist.push([e.timeStamp, x]);
      if (d.hist.length > 8) d.hist.shift();
      if (!d.live) {
        if (Math.abs(x - d.x0) < DEADZONE) return;
        d.live = true;
        d.offset = x - edgeA;
        el.dataset.held = "true";
      }
      var l = x - d.offset, maxL = span - d.w;
      if (reduce) { var c = clamp(l, 0, maxL); edgeA = c; edgeB = c + d.w; }
      else if (l < 0) { edgeA = 0; edgeB = d.w - rubber(-l, d.w); }
      else if (l > maxL) { edgeB = span; edgeA = maxL + rubber(l - maxL, d.w); }
      else { edgeA = l; edgeB = l + d.w; }
      paint();
    }
    function onUp(e) {
      var d = drag;
      if (!d || e.pointerId !== d.id) return;
      drag = null;
      delete el.dataset.held;
      if (buttons[d.slot]) delete buttons[d.slot].dataset.pressed;
      var x = local(e);
      if (!d.live) {
        if (Math.abs(x - d.x0) <= SLOP && d.slot !== committed) {
          var from = committed; commit(d.slot); travel(from, d.slot);
        }
        return;
      }
      var v = velocityOf(d.hist, e.timeStamp);
      var flick = Math.abs(v) > FLICK;
      var to = nearest(slots, (edgeA + edgeB) / 2 + project(v, glide));
      if (flick && to === committed) to = clamp(to + Math.sign(v), 0, items.length - 1);
      commit(to);
      if (reduce) jump(to); else land(to, v, flick, flick);
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
      commit(next); jump(next); buttons[next].focus();
    }

    buttons.forEach(function (b, i) {
      b.addEventListener("pointerdown", function (e) { onDown(e, i); });
      b.addEventListener("pointermove", onMove);
      b.addEventListener("pointerup", onUp);
      b.addEventListener("pointercancel", onUp);
      b.addEventListener("keydown", onKey);
    });

    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { measure(); });
      ro.observe(el);
    } else {
      window.addEventListener("resize", measure);
    }
    setChecked(committed);
    /* 首次布局可能尚未稳定（字体/主题样式异步），分三次校正滑块位置 */
    requestAnimationFrame(function () {
      measure();
      setTimeout(measure, 60);
      setTimeout(measure, 320);
      if (document.fonts) document.fonts.ready.then(measure);
    });

    return {
      el: el,
      value: function () { return items[committed] && items[committed].value; },
      set: function (v) {
        var i = items.findIndex(function (it) { return it.value === v; });
        if (i < 0 || i === committed) return;
        var from = committed; committed = i; setChecked(i); jump(i);
        if (opt.onChange) opt.onChange(v, i);
      },
      refresh: measure,
      destroy: function () { if (ro) ro.disconnect(); cancelAnimationFrame(raf); clearTimeout(handoff); }
    };
  }

  window.RubberSegment = { mount: mount, reduceMotion: reduce };
})();
