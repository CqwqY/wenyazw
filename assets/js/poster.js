/* 文芽作文 - 作文海报
   把一篇作文排成竖版森绿主题图片，纯前端 Canvas 绘制后导出 PNG。
   不引入任何外部图片，画布不会被跨域污染；字体沿用站内已加载的霞鹜文楷 / 宋体，
   没加载成功就退回系统字体，海报照样能出。
   两处入口共用本模块：作文列表卡片（先取详情）、写作工作台（直接用内存里的稿子）。 */
(function () {
  "use strict";

  var W = 1080, H = 1520;            /* H 在 render 里按正文长度动态改写 */
  var CARD_X = 76, CARD_Y = 206, CARD_W = 928;
  var PAD = 64;
  var SERIF = '"Songti SC", "Noto Serif SC", "SimSun", Georgia, serif';
  var HAND = '"LXGW WenKai", "Kaiti SC", "KaiTi", ' + SERIF;
  var SANS = '"PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

  var mask = null, imgEl = null, msgEl = null, dlBtn = null;
  var currentUrl = "", currentName = "文芽作文-海报.png", opened = false;

  function $(id) { return document.getElementById(id); }
  function txt(s) { return String(s == null ? "" : s).replace(/\uFFFD/g, ""); }
  function words(s) { return Array.from(txt(s).replace(/\s/g, "")).length; }

  function fmtDate(v) {
    var d = v ? new Date(v) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var p = function (n) { return n < 10 ? "0" + n : String(n); };
    return d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate());
  }

  function safeName(s) {
    var t = txt(s).replace(/[\\/:*?"<>|\r\n]/g, "").trim().slice(0, 24) || "无题";
    return "文芽作文-" + t + "-海报.png";
  }

  function rr(c, x, y, w, h, r) {
    var k = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + k, y);
    c.lineTo(x + w - k, y); c.quadraticCurveTo(x + w, y, x + w, y + k);
    c.lineTo(x + w, y + h - k); c.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
    c.lineTo(x + k, y + h); c.quadraticCurveTo(x, y + h, x, y + h - k);
    c.lineTo(x, y + k); c.quadraticCurveTo(x, y, x + k, y);
    c.closePath();
  }

  /* 中文按字断行，不用词边界；换行符单独成段 */
  function wrap(c, text, maxW) {
    var out = [], line = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === "\n") { out.push(line); line = ""; continue; }
      if (line && c.measureText(line + ch).width > maxW) { out.push(line); line = ch; }
      else line += ch;
    }
    out.push(line);
    return out;
  }

  function metaLine(d) {
    var bits = [];
    if (d.genre) bits.push(txt(d.genre));
    if (d.stage) bits.push(txt(d.stage));
    if (d.category && txt(d.category).indexOf(txt(d.genre)) < 0) bits.push(txt(d.category));
    if (d.province) bits.push(txt(d.province));
    /* 字数统一由底部「全文共 X 字」按正文实算，这里不重复写，免得两个来源打架 */
    bits.push(fmtDate(d.date));
    return bits.filter(Boolean).join(" · ").slice(0, 60);
  }

  /* 云端存的 body 是「标题 + 空行 + 正文」，工作台传的是纯正文，两者都要能画 */
  function bodyText(d) {
    var raw = txt(d.body).replace(/\r/g, "").replace(/^\n+/, "");
    var title = txt(d.title).replace(/[《》]/g, "").trim();
    var i = raw.indexOf("\n");
    if (i > 0) {
      var first = raw.slice(0, i).trim().replace(/^#+\s*/, "").replace(/[《》]/g, "");
      if (first && first.length <= 40 && (!title || first === title)) {
        raw = raw.slice(i + 1).replace(/^\n+/, "");
      }
    }
    return raw.trim();
  }

  function drawBrand(c) {
    /* 白底圆角徽标里画一株芽，和站点图标呼应 */
    rr(c, 76, 68, 92, 92, 26);
    c.fillStyle = "#f2f9f3"; c.fill();
    c.strokeStyle = "#1d7048"; c.lineWidth = 5; c.lineCap = "round";
    c.beginPath(); c.moveTo(122, 142); c.lineTo(122, 108); c.stroke();
    c.fillStyle = "#1d7048";
    c.beginPath();
    c.moveTo(122, 114); c.quadraticCurveTo(94, 106, 100, 88);
    c.quadraticCurveTo(116, 88, 122, 114); c.fill();
    c.beginPath();
    c.moveTo(122, 114); c.quadraticCurveTo(150, 106, 144, 88);
    c.quadraticCurveTo(128, 88, 122, 114); c.fill();

    c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.fillStyle = "#f2f9f3";
    c.font = "700 50px " + SERIF;
    c.fillText("文芽作文", 190, 118);
    c.fillStyle = "#b7d4c2";
    c.font = "22px " + SANS;
    c.fillText("WENYA ZUOWEN", 192, 150);

    c.textAlign = "right";
    rr(c, 786, 94, 218, 52, 26);
    c.fillStyle = "rgba(242,249,243,.12)"; c.fill();
    c.strokeStyle = "rgba(242,249,243,.36)"; c.lineWidth = 2; c.stroke();
    c.fillStyle = "#f2f9f3";
    c.font = "24px " + SANS;
    c.fillText("AI 写作工作台", 982, 128);
    c.textAlign = "left";
  }

  function drawBackground(c) {
    var g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#123f2c"); g.addColorStop(1, "#0c2e20");
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    var glow = c.createRadialGradient(880, 80, 20, 880, 80, 720);
    glow.addColorStop(0, "rgba(88,169,123,.22)"); glow.addColorStop(1, "rgba(88,169,123,0)");
    c.fillStyle = glow; c.fillRect(0, 0, W, H);

    c.strokeStyle = "rgba(242,249,243,.045)"; c.lineWidth = 1;
    for (var x = 54; x < W; x += 54) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (var y = 54; y < H; y += 54) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  }

  function drawSproutWatermark(c, cardH) {
    c.save();
    c.globalAlpha = .04;
    c.fillStyle = "#1d7048";
    c.font = "700 200px " + SERIF;
    c.textAlign = "right"; c.textBaseline = "bottom";
    /* 放在纸卡偏下、底部信息条之上，作淡淡的背景，不压字 */
    c.fillText("文", CARD_X + CARD_W - 28, CARD_Y + cardH - 150);
    c.restore();
  }

  function drawPaper(c, d, cardH, lay) {
    c.save();
    c.shadowColor = "rgba(9,38,26,.5)"; c.shadowBlur = 60; c.shadowOffsetY = 24;
    rr(c, CARD_X, CARD_Y, CARD_W, cardH, 28);
    c.fillStyle = "#fffdf8"; c.fill();
    c.restore();
    rr(c, CARD_X, CARD_Y, CARD_W, cardH, 28);
    c.strokeStyle = "#c7d8c8"; c.lineWidth = 2; c.stroke();

    /* 纸卡顶部一道绿色书脊 */
    c.save();
    rr(c, CARD_X, CARD_Y, CARD_W, cardH, 28); c.clip();
    var bar = c.createLinearGradient(CARD_X, 0, CARD_X + CARD_W, 0);
    bar.addColorStop(0, "#1d7048"); bar.addColorStop(1, "#9acdb0");
    c.fillStyle = bar; c.fillRect(CARD_X, CARD_Y, CARD_W, 7);
    c.restore();

    drawSproutWatermark(c, cardH);

    var left = CARD_X + PAD, maxW = CARD_W - PAD * 2;
    var title = txt(d.title).replace(/[《》]/g, "").trim() || "无题";

    /* 标题过长就缩字号，不硬截 */
    var size = 62;
    c.font = "700 " + size + "px " + SERIF;
    while (c.measureText(title).width > maxW && size > 34) {
      size -= 4; c.font = "700 " + size + "px " + SERIF;
    }
    if (c.measureText(title).width > maxW) {
      while (c.measureText(title + "…").width > maxW && title.length > 1) title = title.slice(0, -1);
      title += "…";
    }
    c.fillStyle = "#17261d"; c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.fillText(title, left, CARD_Y + 132);

    var meta = metaLine(d);
    c.fillStyle = "#5e7165"; c.font = "24px " + SANS;
    if (c.measureText(meta).width > maxW) {
      while (c.measureText(meta + "…").width > maxW && meta.length > 1) meta = meta.slice(0, -1);
      meta += "…";
    }
    c.fillText(meta, left, CARD_Y + 182);

    c.strokeStyle = "#c7d8c8"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(left, CARD_Y + 214); c.lineTo(left + maxW, CARD_Y + 214); c.stroke();

    /* 正文：整篇排完，不再截断。纸卡高度由 render 按全文行数算好，随正文变长。 */
    c.font = "30px " + HAND;
    c.fillStyle = "#17261d";
    var y = CARD_Y + 282;
    for (var k = 0; k < lay.lines.length; k++) {
      c.fillText(lay.lines[k], left, y);
      y += 58;
    }

    /* 底部信息：实算全文字数，不再有「节选」说法 */
    c.fillStyle = "#5e7165"; c.font = "23px " + SANS;
    c.textAlign = "left";
    c.fillText("全文共 " + lay.total + " 字", left, CARD_Y + cardH - 46);
    c.textAlign = "right";
    c.fillStyle = "#1d7048"; c.font = "600 23px " + SANS;
    c.fillText("文芽作文 · 手批", CARD_X + CARD_W - PAD, CARD_Y + cardH - 46);
    c.textAlign = "left";
  }

  function drawFooter(c, d, footerY) {
    rr(c, CARD_X, footerY, CARD_W, 104, 24);
    c.fillStyle = "#1d7048"; c.fill();
    c.textBaseline = "alphabetic"; c.textAlign = "left";
    c.fillStyle = "#f2f9f3"; c.font = "700 40px " + SANS;
    c.fillText("wenyazw.top", CARD_X + 36, footerY + 66);
    c.fillStyle = "rgba(242,249,243,.78)"; c.font = "24px " + SANS;
    c.fillText("不替你写，只陪你改", CARD_X + 330, footerY + 63);

    var author = "";
    try { author = localStorage.getItem("wenyazw.auth.user") || ""; } catch (e) { }
    var tag = author ? ("作者 · " + author) : "文芽作文";
    tag = tag.slice(0, 10);
    c.font = "600 22px " + SANS;
    var tw = c.measureText(tag).width + 44;
    rr(c, CARD_X + CARD_W - 36 - tw, footerY + 28, tw, 48, 24);
    c.fillStyle = "#f2f9f3"; c.fill();
    c.textAlign = "center"; c.fillStyle = "#123f2c";
    c.fillText(tag, CARD_X + CARD_W - 36 - tw / 2, footerY + 60);
    c.textAlign = "left";
  }

  /* 先按当前字体把整篇正文断行、量出总高度，供 render 决定画布与纸卡尺寸 */
  function layoutBody(c, d) {
    var body = bodyText(d);
    var paras = body.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!paras.length) paras = ["（这篇还没有正文）"];
    c.font = "30px " + HAND;
    var lineH = 58, segGap = 18, lines = [], bodyPx = 0;
    for (var i = 0; i < paras.length; i++) {
      if (i > 0) bodyPx += segGap;
      var seg = wrap(c, "　　" + paras[i], CARD_W - PAD * 2);
      for (var j = 0; j < seg.length; j++) { lines.push(seg[j]); bodyPx += lineH; }
    }
    return { lines: lines, bodyPx: bodyPx, total: words(body) };
  }

  function render(d) {
    return new Promise(function (resolve, reject) {
      try {
        var probe = document.createElement("canvas").getContext("2d");
        var lay = layoutBody(probe, d);
        /* 画布高度随全文长度变长：纸卡顶到正文 + 底部信息留白，再接页脚与边距 */
        var headerH = 282, footerPad = 96;
        var cardH = headerH + lay.bodyPx + footerPad;
        var footerGap = 44, footerH = 104, bottomMargin = 56;
        H = CARD_Y + cardH + footerGap + footerH + bottomMargin;

        var canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        var c = canvas.getContext("2d");
        if (!c) throw new Error("浏览器不支持画布");
        drawBackground(c);
        drawBrand(c);
        drawPaper(c, d, cardH, lay);
        drawFooter(c, d, H - bottomMargin - footerH);

        var done = function (url) { resolve(url); };
        if (canvas.toBlob) {
          canvas.toBlob(function (blob) {
            if (!blob) { try { done(canvas.toDataURL("image/png")); } catch (e) { reject(e); } return; }
            done(URL.createObjectURL(blob));
          }, "image/png");
        } else {
          done(canvas.toDataURL("image/png"));
        }
      } catch (e) { reject(e); }
    });
  }

  function setMsg(text, kind) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.className = "app-msg" + (kind ? " " + kind : "");
  }

  function buildUI() {
    if (mask) return;
    mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.id = "posterMask";
    mask.setAttribute("hidden", "");
    mask.innerHTML =
      '<div class="modal-card poster-modal" role="dialog" aria-modal="true" aria-labelledby="posterTitle">' +
        '<div class="modal-head"><h2 id="posterTitle">作文海报</h2>' +
        '<button class="modal-close" id="posterClose" aria-label="关闭">×</button></div>' +
        '<div class="poster-preview" id="posterPreview"><span class="poster-loading">正在生成海报…</span></div>' +
        '<div class="poster-actions">' +
          '<button class="btn btn-primary" id="posterDownload" type="button" disabled>下载 PNG</button>' +
          '<span class="poster-tip">手机上也可以长按图片保存</span>' +
        '</div>' +
        '<div class="app-msg" id="posterMsg"></div>' +
      '</div>';
    document.body.appendChild(mask);
    dlBtn = $("posterDownload");
    msgEl = $("posterMsg");

    $("posterClose").addEventListener("click", close);
    mask.addEventListener("click", function (e) { if (e.target === mask) close(); });
    dlBtn.addEventListener("click", function () {
      if (!currentUrl) return;
      var a = document.createElement("a");
      a.href = currentUrl; a.download = currentName;
      document.body.appendChild(a); a.click(); a.remove();
      setMsg("已开始下载。若浏览器没弹出保存，长按上方图片也能存下来。", "ok");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && opened) close();
    });
  }

  function close() {
    if (!mask) return;
    opened = false;
    mask.setAttribute("hidden", "");
    if (currentUrl && currentUrl.indexOf("blob:") === 0) {
      try { URL.revokeObjectURL(currentUrl); } catch (e) { }
    }
    currentUrl = "";
  }

  /* 字体是站内的 Web Font；等它就绪再画，最多等 3 秒，不让它拖住生成 */
  function fontsReady() {
    return new Promise(function (resolve) {
      var t = setTimeout(resolve, 3000);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { clearTimeout(t); resolve(); }, function () { clearTimeout(t); resolve(); });
      } else { clearTimeout(t); resolve(); }
    });
  }

  async function open(data) {
    var d = data || {};
    buildUI();
    close();
    opened = true;
    mask.removeAttribute("hidden");
    var box = $("posterPreview");
    box.innerHTML = '<span class="poster-loading">正在生成海报…</span>';
    dlBtn.disabled = true;
    setMsg("");
    currentName = safeName(d.title);

    try {
      await fontsReady();
      if (!opened) return;                       // 用户在等字体时关掉了弹层
      var url = await render(d);
      if (!opened) {
        if (url.indexOf("blob:") === 0) { try { URL.revokeObjectURL(url); } catch (e) { } }
        return;
      }
      currentUrl = url;
      imgEl = document.createElement("img");
      imgEl.src = url;
      imgEl.alt = "《" + (txt(d.title) || "无题") + "》的作文海报预览";
      box.innerHTML = "";
      box.appendChild(imgEl);
      dlBtn.disabled = false;
      setMsg("海报已生成，点「下载 PNG」保存到本机。", "ok");
    } catch (e) {
      console.warn("[wenyazw] 海报生成失败：", e);
      box.innerHTML = '<span class="poster-loading">海报没能生成</span>';
      setMsg("海报生成失败：" + ((e && e.message) || "未知错误") + "。可以先用「下载 txt」把正文存下来。", "error");
    }
  }

  window.WY_POSTER = { open: open, close: close };
})();
