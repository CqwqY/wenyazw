/* 文芽作文：教师控制台
   - 登录 + 邀请码升级教师（角色以服务端为准）
   - 逐篇评分走 /api/llm/task 的 score 任务，按用量扣积分
   - 汇总讲评走 review 任务（服务端只允许教师）
   - 用本地打包的 PptxGenJS 导出真正的 .pptx，可在 PowerPoint/WPS 继续编辑
   作文正文只留在内存，不写 localStorage、不落库。 */
(function () {
  "use strict";

  var API = "https://back.wenyazw.top";
  var $ = function (id) { return document.getElementById(id); };
  function auth() { return window.WY_AUTH; }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function esc(s) {
    return trim(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function setMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "tc-status" + (kind ? " tc-status-" + kind : "");
  }

  var state = { teacher: false, enabled: false, reports: [], review: null };

  /* ---------- 身份 ---------- */
  async function loadStatus() {
    if (!auth().loggedIn()) {
      $("notLogged").hidden = false;
      $("gateCard").hidden = true;
      $("teacherPanel").hidden = true;
      return;
    }
    var res, j = {};
    try {
      res = await fetch(API + "/api/teacher/status", {
        headers: { "Accept": "application/json", "Authorization": "Bearer " + auth().token() }
      });
      try { j = await res.json(); } catch (e) { /* ignore */ }
    } catch (e) {
      setMsg($("gateMsg"), "连不上服务，检查网络后再试。", "err");
      $("notLogged").hidden = true;
      $("gateCard").hidden = false;
      $("teacherPanel").hidden = true;
      return;
    }
    state.enabled = !!(j && j.enabled);
    state.teacher = !!(j && j.teacher);
    $("notLogged").hidden = true;
    /* 没授权的人只看到邀请码门，看不到工作台；已授权直接进工作台。 */
    $("gateCard").hidden = state.teacher || !state.enabled;
    $("teacherPanel").hidden = !state.teacher;
    if (!state.teacher && !state.enabled) {
      setMsg($("gateMsg"), "教师控制台还没有开放。", "err");
    }
  }

  async function applyTeacher() {
    var code = trim($("gateCode").value);
    if (!code) { setMsg($("gateMsg"), "先填邀请码。", "err"); return; }
    if (!auth().loggedIn()) { auth().open("login"); return; }
    setMsg($("gateMsg"), "正在验证…");
    var res, j = {};
    try {
      res = await fetch(API + "/api/teacher/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + auth().token() },
        body: JSON.stringify({ code: code })
      });
      try { j = await res.json(); } catch (e) { /* ignore */ }
    } catch (e) { setMsg($("gateMsg"), "网络不通，稍后再试。", "err"); return; }
    if (!res.ok || j.error) { setMsg($("gateMsg"), j.error || "验证失败。", "err"); return; }
    state.teacher = true;
    $("gateCard").hidden = true;
    $("teacherPanel").hidden = false;
    setMsg($("gateMsg"), "");
  }

  /* ---------- 评分表下拉 ---------- */
  function initProvinces() {
    var sel = $("tcProvince");
    if (!sel) return;
    var all = (window.WY_SCORING) || {};
    var keys = Object.keys(all);
    if (!keys.length) keys = ["全国卷（通用）"];
    sel.innerHTML = "";
    keys.forEach(function (k) {
      var o = document.createElement("option");
      o.value = k;
      o.textContent = k + " · " + ((all[k] && all[k].total) || 60) + " 分";
      sel.appendChild(o);
    });
    $("tableState").textContent = "已装 " + keys.length + " 张评分表";
  }

  /* ---------- 切分作文 ---------- */
  function splitEssays(raw) {
    var parts = String(raw || "").split(/^\s*={3,}\s*$/m);
    var out = [];
    parts.forEach(function (p) {
      var t = trim(p);
      if (t.length >= 20) out.push(t);
    });
    return out.slice(0, 30);
  }
  function refreshCount() {
    var n = splitEssays($("tcEssays").value).length;
    $("tcCount").textContent = n ? ("识别到 " + n + " 篇作文") : "还没识别到作文（每篇之间单独一行写 ====，正文至少 20 字）";
    $("tcCount").className = "tc-count" + (n ? " tc-count-ok" : "");
  }

  /* ---------- 站内任务 ---------- */
  async function llmTask(task, vars, maxTokens, purpose) {
    if (!auth().loggedIn()) { auth().open("login"); throw new Error("请先登录"); }
    var res, j = {};
    try {
      res = await fetch(API + "/api/llm/task", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + auth().token() },
        body: JSON.stringify({
          task: task, vars: vars, stream: false,
          temperature: 0.4, max_tokens: maxTokens || 512, purpose: purpose || "教师讲评"
        })
      });
      try { j = await res.json(); } catch (e) { /* ignore */ }
    } catch (e) {
      throw new Error("连不上模型服务，检查网络后再试。");
    }
    if (res.status === 401) { auth().open("login"); throw new Error("登录过期，请重新登录。"); }
    if (!res.ok || j.error) throw new Error(j.error || ("请求失败（HTTP " + res.status + "）"));
    var msg = j.choices && j.choices[0] && j.choices[0].message;
    var content = (msg && msg.content) || j.content || "";
    if (!trim(content)) throw new Error("模型没有返回结果，再试一次。");
    return String(content);
  }

  function parseJSON(raw) {
    var s = trim(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("返回内容不是 JSON，重试一次。");
    return JSON.parse(s.slice(a, b + 1));
  }

  /* ---------- 第一步：逐篇评分 ---------- */
  async function scoreAll() {
    var essays = splitEssays($("tcEssays").value);
    if (!essays.length) { setMsg($("tcScoreMsg"), "先贴入作文，每篇之间单独一行写 ====。", "err"); return; }
    var topic = trim($("tcTopic").value) || "（未填题目）";
    var prov = $("tcProvince").value;
    var btn = $("tcScoreBtn");
    btn.disabled = true;
    $("resultsCard").hidden = true;
    state.reports = [];
    var failed = 0;
    try {
      for (var i = 0; i < essays.length; i++) {
        setMsg($("tcScoreMsg"), "正在评第 " + (i + 1) + " / " + essays.length + " 篇…");
        var report = { overall: "", scores: [], excerpt: essays[i].slice(0, 180) };
        try {
          var raw = await llmTask("score", {
            topic: topic, prov: [prov], essay: essays[i]
          }, 512, "教师批量评分");
          var obj = parseJSON(raw);
          report.overall = trim(obj.overall);
          report.scores = Array.isArray(obj.scores) ? obj.scores.slice(0, 3) : [];
        } catch (e) {
          failed++;
          report.overall = "这篇评分失败：" + e.message;
        }
        state.reports.push(report);
      }
      renderScores();
      $("resultsCard").hidden = false;
      setMsg($("tcScoreMsg"), "评完 " + state.reports.length + " 篇" + (failed ? "，其中 " + failed + " 篇失败（失败的不扣积分）" : "") + "。可以生成讲评稿了。", failed ? "warn" : "ok");
      if (auth().refreshCredits) auth().refreshCredits();
    } finally {
      btn.disabled = false;
    }
  }

  function renderScores() {
    var tb = $("scoreRows");
    tb.innerHTML = "";
    state.reports.forEach(function (r, i) {
      var tr = document.createElement("tr");
      var total = (r.scores || []).map(function (s) {
        var full = (window.WY_SCORING && window.WY_SCORING[s.province] && window.WY_SCORING[s.province].total) || "?";
        return esc(s.province || "评分") + " " + (s.total == null ? "?" : s.total) + "/" + full;
      }).join(" · ") || "—";
      var ded = (r.scores || []).reduce(function (a, s) {
        return a.concat((s.deductions || []).map(function (d) { return esc(d.dim || "扣分") + " -" + (d.points || 0); }));
      }, []).join("、") || "无明显硬伤";
      tr.innerHTML = "<td>" + (i + 1) + "</td><td>" + esc(r.overall || "—") + "</td><td>" + total + "</td><td>" + ded + "</td>";
      tb.appendChild(tr);
    });
  }

  /* ---------- 第二步：汇总讲评稿 ---------- */
  async function makeReview() {
    if (!state.reports.length) { setMsg($("tcReviewMsg"), "先完成评分。", "err"); return; }
    var btn = $("tcReviewBtn");
    btn.disabled = true;
    setMsg($("tcReviewMsg"), "正在汇总共性问题和改法…");
    try {
      var raw = await llmTask("review", {
        topic: trim($("tcTopic").value) || "（未填题目）",
        count: state.reports.length,
        reports: state.reports
      }, 1024, "教师讲评稿");
      state.review = parseJSON(raw);
      renderReview();
      $("reviewCard").hidden = false;
      setMsg($("tcReviewMsg"), "讲评稿已生成，可以直接导出 PPTX。", "ok");
      if (auth().refreshCredits) auth().refreshCredits();
      $("reviewCard").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setMsg($("tcReviewMsg"), e.message || "生成失败。", "err");
    } finally {
      btn.disabled = false;
    }
  }

  function reviewText(r) {
    if (!r) return "";
    var lines = [];
    lines.push(r.headline || "作文讲评");
    if (r.praise) lines.push("\n【这次做得好的】\n" + (r.praise.point || "") + "：" + (r.praise.why || ""));
    if (r.issues && r.issues.length) {
      lines.push("\n【共性问题】");
      r.issues.forEach(function (x, i) {
        lines.push((i + 1) + ". " + (x.title || ""));
        lines.push("   现象：" + (x.what || ""));
        lines.push("   原因：" + (x.why || ""));
        lines.push("   改法：" + (x.fix || ""));
      });
    }
    if (r.goodLines && r.goodLines.length) {
      lines.push("\n【写得好的句子】");
      r.goodLines.forEach(function (x) { lines.push("· " + (x.text || "") + " —— " + (x.why || "")); });
    }
    if (r.drill) lines.push("\n【马上能练】\n" + (r.drill.title || "") + "：" + (r.drill.how || ""));
    if (r.closing) lines.push("\n" + r.closing);
    return lines.join("\n");
  }

  function renderReview() {
    var r = state.review || {};
    var h = [];
    h.push('<div class="tc-r-headline">' + esc(r.headline || "作文讲评") + "</div>");
    if (r.praise) {
      h.push('<div class="tc-r-block"><h3>这次做得好的</h3><p><strong>' + esc(r.praise.point || "") + "</strong> · " + esc(r.praise.why || "") + "</p></div>");
    }
    if (r.issues && r.issues.length) {
      h.push('<div class="tc-r-block"><h3>共性问题</h3>');
      r.issues.forEach(function (x, i) {
        h.push('<div class="tc-r-issue"><h4>' + (i + 1) + ". " + esc(x.title || "") + "</h4>" +
          "<p>" + esc(x.what || "") + "</p><p class=\"tc-r-why\">" + esc(x.why || "") + "</p>" +
          '<p class="tc-r-fix">' + esc(x.fix || "") + "</p></div>");
      });
      h.push("</div>");
    }
    if (r.goodLines && r.goodLines.length) {
      h.push('<div class="tc-r-block"><h3>写得好的句子</h3><ul>');
      r.goodLines.forEach(function (x) {
        h.push("<li>“" + esc(x.text || "") + "” —— " + esc(x.why || "") + "</li>");
      });
      h.push("</ul></div>");
    }
    if (r.drill) {
      h.push('<div class="tc-r-block"><h3>马上能练</h3><p><strong>' + esc(r.drill.title || "") + "</strong> · " + esc(r.drill.how || "") + "</p></div>");
    }
    if (r.closing) h.push('<div class="tc-r-closing">' + esc(r.closing) + "</div>");
    $("reviewBody").innerHTML = h.join("");
  }

  /* ---------- 导出真正的 PPTX ---------- */
  function exportPptx() {
    if (!state.review) { setMsg($("tcReviewDone"), "先生成讲评稿。", "err"); return; }
    if (typeof window.PptxGenJS !== "function") {
      setMsg($("tcReviewDone"), "PPTX 组件没加载出来，刷新页面再试。", "err");
      return;
    }
    var r = state.review;
    var topic = trim($("tcTopic").value) || "作文讲评";
    var pptx = new window.PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "文芽作文";
    pptx.subject = topic + " 讲评";
    pptx.title = topic + " · 作文讲评";
    pptx.company = "文芽作文";
    pptx.lang = "zh-CN";
    pptx.theme = {
      headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei", lang: "zh-CN"
    };
    pptx.defineSlideMaster({
      title: "WY_MASTER",
      background: { color: "F7F5EF" },
      objects: [
        { rect: { x: 0, y: 0, w: "100%", h: 0.14, fill: { color: "2E6B4F" }, line: { color: "2E6B4F" } } },
        { text: { text: "文芽作文 · 班级讲评", options: { x: 0.5, y: 7.05, w: 6, h: 0.3, fontSize: 10, color: "7A8B80" } } }
      ]
    });
    var T = { color: "1F3428", fontFace: "Microsoft YaHei" };
    var SUB = { color: "5B6B60", fontFace: "Microsoft YaHei" };

    /* 封面 */
    var s = pptx.addSlide({ masterName: "WY_MASTER" });
    s.addText("作文讲评", { x: 0.9, y: 2.2, w: 11.5, h: 1.0, fontSize: 40, bold: true, color: "2E6B4F", fontFace: "Microsoft YaHei" });
    s.addText(topic, { x: 0.9, y: 3.3, w: 11.5, h: 0.7, fontSize: 24, color: T.color, fontFace: T.fontFace });
    s.addText(trim(r.headline || ""), { x: 0.9, y: 4.2, w: 11.0, h: 0.8, fontSize: 17, color: SUB.color, fontFace: SUB.fontFace });
    s.addText("共 " + state.reports.length + " 篇 · " + new Date().toLocaleDateString("zh-CN"), {
      x: 0.9, y: 5.4, w: 8, h: 0.4, fontSize: 13, color: "8A968E", fontFace: T.fontFace
    });

    /* 值得肯定 */
    if (r.praise) {
      s = pptx.addSlide({ masterName: "WY_MASTER" });
      s.addText("先说一处做得好的", { x: 0.8, y: 0.55, w: 11, h: 0.7, fontSize: 28, bold: true, color: "2E6B4F", fontFace: T.fontFace });
      s.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.6, w: 11.7, h: 4.6, rectRadius: 0.1, fill: { color: "EAF3DE" }, line: { color: "C0DD97", pt: 1 } });
      s.addText(trim(r.praise.point || ""), { x: 1.2, y: 2.1, w: 10.9, h: 1.0, fontSize: 24, bold: true, color: "27500A", fontFace: T.fontFace });
      s.addText(trim(r.praise.why || ""), { x: 1.2, y: 3.4, w: 10.9, h: 1.6, fontSize: 18, color: "3B6D11", fontFace: T.fontFace, breakLine: false });
    }

    /* 共性问题：一条一页 */
    (r.issues || []).forEach(function (x, i) {
      s = pptx.addSlide({ masterName: "WY_MASTER" });
      s.addText("共性问题 " + (i + 1) + " / " + (r.issues || []).length, {
        x: 0.8, y: 0.5, w: 11, h: 0.4, fontSize: 13, color: "8A968E", fontFace: T.fontFace
      });
      s.addText(trim(x.title || ""), { x: 0.8, y: 1.0, w: 11.5, h: 0.9, fontSize: 30, bold: true, color: "993C1D", fontFace: T.fontFace });
      s.addText("现象", { x: 0.9, y: 2.2, w: 1.4, h: 0.4, fontSize: 15, bold: true, color: "2E6B4F", fontFace: T.fontFace });
      s.addText(trim(x.what || ""), { x: 2.3, y: 2.15, w: 10.0, h: 0.8, fontSize: 17, color: T.color, fontFace: T.fontFace });
      s.addText("为什么", { x: 0.9, y: 3.1, w: 1.4, h: 0.4, fontSize: 15, bold: true, color: "2E6B4F", fontFace: T.fontFace });
      s.addText(trim(x.why || ""), { x: 2.3, y: 3.05, w: 10.0, h: 0.8, fontSize: 17, color: T.color, fontFace: T.fontFace });
      s.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 4.2, w: 11.7, h: 2.0, rectRadius: 0.08, fill: { color: "E1F5EE" }, line: { color: "9FE1CB", pt: 1 } });
      s.addText("怎么改", { x: 1.1, y: 4.4, w: 1.6, h: 0.4, fontSize: 15, bold: true, color: "0F6E56", fontFace: T.fontFace });
      s.addText(trim(x.fix || ""), { x: 2.7, y: 4.35, w: 9.5, h: 1.5, fontSize: 18, color: "085041", fontFace: T.fontFace });
    });

    /* 好句 */
    if (r.goodLines && r.goodLines.length) {
      s = pptx.addSlide({ masterName: "WY_MASTER" });
      s.addText("写得好的句子", { x: 0.8, y: 0.55, w: 11, h: 0.7, fontSize: 28, bold: true, color: "2E6B4F", fontFace: T.fontFace });
      r.goodLines.slice(0, 4).forEach(function (x, i) {
        var y = 1.6 + i * 1.35;
        s.addText("“" + trim(x.text || "") + "”", { x: 1.0, y: y, w: 11.2, h: 0.6, fontSize: 19, italic: true, color: T.color, fontFace: T.fontFace });
        s.addText("—— " + trim(x.why || ""), { x: 1.4, y: y + 0.6, w: 10.6, h: 0.4, fontSize: 14, color: SUB.color, fontFace: T.fontFace });
      });
    }

    /* 小练习 + 收尾 */
    s = pptx.addSlide({ masterName: "WY_MASTER" });
    if (r.drill) {
      s.addText("下课前练一练", { x: 0.8, y: 0.55, w: 11, h: 0.7, fontSize: 28, bold: true, color: "2E6B4F", fontFace: T.fontFace });
      s.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.6, w: 11.7, h: 3.4, rectRadius: 0.1, fill: { color: "FAEEDA" }, line: { color: "FAC775", pt: 1 } });
      s.addText(trim(r.drill.title || ""), { x: 1.2, y: 2.0, w: 10.9, h: 0.8, fontSize: 24, bold: true, color: "633806", fontFace: T.fontFace });
      s.addText(trim(r.drill.how || ""), { x: 1.2, y: 3.0, w: 10.9, h: 1.5, fontSize: 18, color: "854F0B", fontFace: T.fontFace });
    }
    if (r.closing) {
      s.addText(trim(r.closing), { x: 0.8, y: 5.5, w: 11.7, h: 0.9, fontSize: 17, color: SUB.color, fontFace: T.fontFace });
    }

    var safeName = (topic || "作文讲评").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
    pptx.writeFile({ fileName: safeName + "·讲评.pptx" })
      .then(function () { setMsg($("tcReviewDone"), "PPTX 已下载，可用 PowerPoint / WPS 打开继续编辑。", "ok"); })
      .catch(function (e) { setMsg($("tcReviewDone"), "导出失败：" + (e && e.message ? e.message : "未知错误"), "err"); });
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    if ($("openLogin")) $("openLogin").addEventListener("click", function () { auth().open("login"); });
    if ($("gateApply")) $("gateApply").addEventListener("click", applyTeacher);
    if ($("gateCode")) $("gateCode").addEventListener("keydown", function (e) { if (e.key === "Enter") applyTeacher(); });
    if ($("tcEssays")) $("tcEssays").addEventListener("input", refreshCount);
    if ($("tcScoreBtn")) $("tcScoreBtn").addEventListener("click", scoreAll);
    if ($("tcReviewBtn")) $("tcReviewBtn").addEventListener("click", makeReview);
    if ($("tcPptxBtn")) $("tcPptxBtn").addEventListener("click", exportPptx);
    if ($("tcEditBtn")) $("tcEditBtn").addEventListener("click", function () {
      var body = $("reviewBody");
      var on = body.getAttribute("contenteditable") !== "true";
      body.setAttribute("contenteditable", on ? "true" : "false");
      $("tcEditBtn").textContent = on ? "完成编辑" : "编辑";
    });
    if ($("tcCopyBtn")) $("tcCopyBtn").addEventListener("click", async function () {
      var text = reviewText(state.review);
      if (!text) return;
      try { await navigator.clipboard.writeText(text); setMsg($("tcReviewDone"), "讲评稿文字已复制。", "ok"); }
      catch (e) { setMsg($("tcReviewDone"), "复制失败，浏览器可能不让访问剪贴板。", "err"); }
    });
  }

  function init() {
    initProvinces();
    refreshCount();
    bind();
    loadStatus();
    if (auth().onChange) auth().onChange(function () { loadStatus(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
