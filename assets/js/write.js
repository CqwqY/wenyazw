/* 文芽作文 - 创建工作台 + 生成界面逻辑
 * 纯前端直连 OpenAI 兼容接口，无后端、无数据上传。
 * 首次生成走「写作引擎」；生成界面里用户提修改要求时切换为「作文修改大师」。
 */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var STORE = "wy.api.config.v1";

  var PRESETS = {
    deepseek: { base: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    moonshot: { base: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
    qwen: { base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
    openai: { base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    custom: { base: "", model: "" }
  };

  var els = {
    toggleConfig: $("toggleConfig"), configPanel: $("configPanel"),
    preset: $("cfgPreset"), base: $("cfgBase"), path: $("cfgPath"),
    key: $("cfgKey"), model: $("cfgModel"), temp: $("cfgTemp"),
    maxTokens: $("cfgMaxTokens"), remember: $("cfgRemember"),
    keyToggle: $("keyToggle"), resetCfg: $("resetCfg"), testBtn: $("testBtn"),

    wizard: $("wizard"), studio: $("studio"),
    wizardSteps: $("wizardSteps"),
    catGrid: $("catGrid"), catTip: $("catTip"),
    topic: $("topic"), topicStepTitle: $("topicStepTitle"),
    topicHint: $("topicHint"), topicExamples: $("topicExamples"),
    extra: $("extra"),
    wordNum: $("wordNum"), wordRange: $("wordRange"),
    wordMinus: $("wordMinus"), wordPlus: $("wordPlus"),
    scoringGrid: $("scoringGrid"), scoringTip: $("scoringTip"),
    wizardStatus: $("wizardStatus"), startBtn: $("startBtn"),

    backBtn: $("backBtn"), studioMeta: $("studioMeta"),
    contextList: $("contextList"), contextEmpty: $("contextEmpty"),
    chatInput: $("chatInput"), sendBtn: $("sendBtn"), stopBtn2: $("stopBtn2"),
    paperTitle: $("paperTitle"), paperBody: $("paperBody"),
    paperStat: $("paperStat"), copyBtn: $("copyBtn"), downloadBtn: $("downloadBtn"),
    acceptAllBtn: $("acceptAllBtn"), ignoreAllBtn: $("ignoreAllBtn")
  };

  /* 向导状态 */
  var selectedCat = "";
  var wordCount = 800;
  var selectedProvince = "全国卷（通用）";

  /* 运行态 */
  var controller = null;
  var fullText = "";
  var lastTitle = "作文";
  var assistantReplyEl = null;
  var currentComposition = "";   // 当前作文纯文本（标题+正文），用于修改大师上下文
  var activeCat = "";            // 本次成稿的类别快照（返回工作台改选项不影响已生成的稿）
  var activeTopic = "";          // 本次成稿的题目原题快照
  var activeProvince = "";       // 本次成稿所选省份快照
  var docTitle = "";             // 稿纸标题（纯文本）
  var docBody = "";              // 稿纸正文（纯文本，采纳批注时在这里替换）
  var annotations = [];          // 老师手批：待处理/已采纳/已忽略的批注
  var annotSeq = 0;              // 批注编号自增
  var prevAcceptedTexts = [];    // 上一轮采纳写进正文的新文字（稿纸里标黄）
  var roundAcceptedTexts = [];   // 本轮采纳产生的新文字，下一轮开始时归档为"上一轮"
  var currentEssayId = null;     // 云端作文 id（登录后自动保存）

  /* ---------------- 配置持久化 ---------------- */

  function readConfig() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { saved = {}; }
    return {
      preset: saved.preset || "deepseek",
      base: saved.base || PRESETS.deepseek.base,
      path: saved.path || "/chat/completions",
      key: saved.key || "",
      model: saved.model || PRESETS.deepseek.model,
      temp: saved.temp === undefined ? "1" : saved.temp,
      maxTokens: saved.maxTokens === undefined ? "2400" : saved.maxTokens,
      remember: saved.remember !== false
    };
  }

  function currentConfig() {
    return {
      preset: els.preset.value,
      base: els.base.value.trim(),
      path: els.path.value.trim(),
      key: els.key.value.trim(),
      model: els.model.value.trim(),
      temp: els.temp.value.trim(),
      maxTokens: els.maxTokens.value.trim(),
      remember: els.remember.checked
    };
  }

  function saveConfig() {
    var c = currentConfig();
    try {
      localStorage.setItem(STORE, JSON.stringify({
        preset: c.preset, base: c.base, path: c.path,
        key: c.remember ? c.key : "",
        model: c.model, temp: c.temp, maxTokens: c.maxTokens,
        remember: c.remember
      }));
    } catch (e) { /* 隐私模式忽略 */ }
  }

  function fillForm(c) {
    els.preset.value = c.preset;
    els.base.value = c.base;
    els.path.value = c.path;
    els.key.value = c.key;
    els.model.value = c.model;
    els.temp.value = c.temp;
    els.maxTokens.value = c.maxTokens;
    els.remember.checked = c.remember;
  }

  fillForm(readConfig());

  function setConfigOpen(open) {
    if (open) els.configPanel.removeAttribute("hidden");
    else els.configPanel.setAttribute("hidden", "");
    els.toggleConfig.setAttribute("aria-expanded", String(!!open));
    els.toggleConfig.textContent = open ? "收起配置" : "接口配置";
  }

  els.toggleConfig.addEventListener("click", function () {
    setConfigOpen(els.configPanel.hasAttribute("hidden"));
  });
  setConfigOpen(!readConfig().key);

  ["preset", "base", "path", "key", "model", "temp", "maxTokens", "remember"].forEach(function (name) {
    els[name].addEventListener("change", saveConfig);
    if (name !== "remember" && name !== "preset") {
      els[name].addEventListener("input", saveConfig);
    }
  });

  els.preset.addEventListener("change", function () {
    var p = PRESETS[els.preset.value];
    if (p && p.base) {
      els.base.value = p.base;
      els.model.value = p.model;
      saveConfig();
      setWizardStatus("已载入预设，请填写 API Key。", "");
    } else {
      setWizardStatus("自定义模式：填写完整 Base URL 与模型名。", "");
    }
  });

  els.keyToggle.addEventListener("click", function () {
    var show = els.key.type === "password";
    els.key.type = show ? "text" : "password";
    els.keyToggle.textContent = show ? "隐藏" : "显示";
  });

  els.resetCfg.addEventListener("click", function () {
    try { localStorage.removeItem(STORE); } catch (e) { /* noop */ }
    fillForm({
      preset: "deepseek", base: PRESETS.deepseek.base, path: "/chat/completions",
      key: "", model: PRESETS.deepseek.model, temp: "1",
      maxTokens: "2400", remember: true
    });
    setWizardStatus("配置已清除。", "ok");
  });

  /* ---------------- 状态 ---------------- */

  function setWizardStatus(msg, kind) {
    els.wizardStatus.textContent = msg || "";
    els.wizardStatus.className = "status-line" + (kind ? " " + kind : "");
  }

  function setPaperHint(msg) {
    if (msg) els.paperStat.textContent = msg;
  }

  /* ---------------- 向导：类别 ---------------- */

  function updateSteps() {
    var steps = els.wizardSteps.querySelectorAll("li");
    steps.forEach(function (s) { s.classList.remove("done", "active"); });
    if (selectedCat) {
      steps[0].classList.add("done");
      steps[1].classList.add("active");
    } else {
      steps[0].classList.add("active");
    }
    if (els.topic.value.trim()) steps[1].classList.add("done");
  }

  // 把该类别的输入引导（标题/placeholder/提示/示例）应用到向导
  function applyCatUI(cat) {
    var cfg = (window.WY_CATEGORY && window.WY_CATEGORY[cat]) || null;
    if (!cfg) return;
    els.topicStepTitle.textContent = cfg.stepTitle;
    var step2 = els.wizardSteps.querySelector('li[data-step="2"]');
    if (step2) {
      step2.innerHTML = "";
      var dot = document.createElement("span");
      dot.className = "dot";
      dot.textContent = "2";
      step2.appendChild(dot);
      step2.appendChild(document.createTextNode(cfg.stepShort || cfg.stepTitle));
    }
    els.topic.placeholder = cfg.placeholder;
    els.topicHint.textContent = cfg.hint;
    els.topicExamples.innerHTML = "";
    (cfg.examples || []).forEach(function (ex) {
      var btn = document.createElement("button");
      btn.className = "ex-chip";
      btn.setAttribute("type", "button");
      btn.setAttribute("data-topic", ex.value);
      btn.textContent = ex.label;
      els.topicExamples.appendChild(btn);
    });
  }

  // 半命题必须留出空缺；命题/自拟不允许出现未补的空位占位符
  function validateTopic(cat, topic) {
    // 半命题：宽松识别各种留空写法（下划线、空括号、省略号、XX 占位）
    var anyBlank = /_{2,}|＿{2,}|（\s*）|\(\s*\)|［\s*］|\[\s*\]|…{2,}|\.{3,}|[X×]{2,}/.test(topic);
    // 命题/自拟：只认明确的空括号/下划线占位，省略号不在此列，避免误伤题材描述里的标点
    var strictBlank = /_{2,}|＿{2,}|（\s*）|\(\s*\)|［\s*］|\[\s*\]/.test(topic);
    if (cat === "半命题" && !anyBlank) {
      return "半命题题目需要留出空缺（推荐用 ____），AI 才知道补哪里、补完才能定标题。可点上方的示例。";
    }
    if (cat !== "半命题" && strictBlank) {
      return (cat === "命题" ? "命题作文的题目应完整、确定，不能留空。" : "自拟题请直接写题材，不要留空位。") +
        "若题目本来就有空缺，请把类别改成「半命题」。";
    }
    return "";
  }

  els.catGrid.addEventListener("click", function (e) {
    var card = e.target.closest(".cat-card");
    if (!card) return;
    selectedCat = card.getAttribute("data-cat");
    els.catGrid.querySelectorAll(".cat-card").forEach(function (c) {
      c.classList.toggle("selected", c === card);
    });
    var cfg = window.WY_CATEGORY[selectedCat];
    els.catTip.textContent = "已选 " + selectedCat + "。" + (cfg ? cfg.tip : "");
    applyCatUI(selectedCat);
    var warn = validateTopic(selectedCat, els.topic.value.trim());
    if (warn) setWizardStatus(warn, "error");
    updateSteps();
  });

  /* ---------------- 向导：字数滚动条 ---------------- */

  function setWord(n) {
    n = Math.max(300, Math.min(2000, Math.round(n / 50) * 50));
    wordCount = n;
    els.wordNum.textContent = n;
    els.wordRange.value = n;
  }

  els.wordRange.addEventListener("input", function () { setWord(parseInt(els.wordRange.value, 10)); });
  els.wordMinus.addEventListener("click", function () { setWord(wordCount - 50); });
  els.wordPlus.addEventListener("click", function () { setWord(wordCount + 50); });
  setWord(800);

  /* ---------------- 向导：评分标准（动态生成） ---------------- */

  function buildScoringCards() {
    if (!window.WY_SCORING) return;
    els.scoringGrid.innerHTML = "";
    Object.keys(window.WY_SCORING).forEach(function (prov) {
      var btn = document.createElement("button");
      btn.className = "scoring-card" + (prov === selectedProvince ? " selected" : "");
      btn.setAttribute("data-province", prov);
      var d = window.WY_SCORING[prov];
      btn.innerHTML = '<div class="scoring-name"></div><div class="scoring-desc"></div>';
      btn.querySelector(".scoring-name").textContent = prov;
      btn.querySelector(".scoring-desc").textContent = d;
      btn.title = prov + "：" + d;
      els.scoringGrid.appendChild(btn);
    });
  }

  els.scoringGrid.addEventListener("click", function (e) {
    var card = e.target.closest(".scoring-card");
    if (!card) return;
    selectedProvince = card.getAttribute("data-province");
    els.scoringGrid.querySelectorAll(".scoring-card").forEach(function (c) {
      c.classList.toggle("selected", c === card);
    });
    var d = window.WY_SCORING[selectedProvince] || "";
    els.scoringTip.textContent = "已选：" + selectedProvince + "。" + d;
  });

  buildScoringCards();

  /* ---------------- 向导：示例题目 ---------------- */

  els.topicExamples.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-topic]");
    if (!btn) return;
    els.topic.value = btn.getAttribute("data-topic");
    els.topic.focus();
    updateSteps();
    setWizardStatus("已填入示例" + (selectedCat === "自拟" ? "题材" : "题目") + "，可直接开始生成。", "");
  });

  els.topic.addEventListener("input", updateSteps);

  /* ---------------- 两段解析：回应 + 作文 ---------------- */

  function splitTwo(text) {
    var parts = text.split(/^\s*===作文===\s*$/m);
    if (parts.length < 2) return { reply: "", comp: text };
    var reply = parts[0].replace(/^\s*===回应===\s*$/m, "").trim();
    var comp = parts.slice(1).join("===作文===").replace(/^\s+|\s+$/g, "");
    return { reply: reply, comp: comp };
  }

  // forceTitle=true 用于「===作文===」之后的作文块：按输出格式第一行必定是标题，直接剥掉首行，
  // 避免长标题（如命题作文的完整题目）被启发式误判成正文第一行。
  function splitText(text, forceTitle) {
    var src = text.replace(/\r/g, "");
    var lines = src.split("\n");
    var first = -1;
    for (var i = 0; i < lines.length && i < 3; i++) {
      if (lines[i].trim()) { first = i; break; }
    }
    if (first === -1) return { title: "", body: "" };
    var raw = lines[first].trim().replace(/^#+\s*/, "").replace(/[《》]/g, "").trim();
    if (forceTitle) {
      // 除非首行明显是个完整长句（>40 字且以句末标点收尾），一律当标题
      var looksProse = raw.length > 40 && /[。！？；.!?]$/.test(raw);
      if (!looksProse) {
        return { title: raw, body: lines.slice(first + 1).join("\n").replace(/^\n+/, "") };
      }
      return { title: "", body: src.replace(/^\n+/, "") };
    }
    // 降级（模型没按格式输出）：启发式判定，标题行短、不以句末标点收尾、且下一行是空行。
    // 允许逗号/顿号，否则「那一刻，我长大了」这类命题题目会被误判成正文。
    var nextBlank = (first + 1 >= lines.length) || !lines[first + 1].trim();
    var looksTitle = raw.length > 0 && raw.length <= 24 &&
      !/[。！？；.!?]$/.test(raw) && (nextBlank || raw.length <= 12);
    if (looksTitle) {
      return { title: raw, body: lines.slice(first + 1).join("\n").replace(/^\n+/, "") };
    }
    return { title: "", body: src.replace(/^\n+/, "") };
  }

  /* 命题作文：标题一律原样使用用户给的题目，不采信模型可能改动过的标题。
     半命题用补全后的题目、自拟用自拟题，都取模型输出的第一行。 */
  function titledParts(text, forceTitle) {
    var parts = splitText(text, forceTitle);
    var cat = activeCat || selectedCat;
    var topic = activeTopic || els.topic.value.trim();
    if (cat === "命题" && topic) {
      var given = topic.replace(/^#+\s*/, "").replace(/[《》]/g, "").trim();
      parts.title = given;
      // 模型偶尔会把题目又抄进正文首行，去掉避免重复
      var bl = parts.body.split("\n");
      if (bl.length && bl[0].trim().replace(/[《》]/g, "").trim() === given) {
        parts.body = bl.slice(1).join("\n").replace(/^\n+/, "");
      }
    }
    return parts;
  }

  /* ---------------- 稿纸渲染（初版：流动文字铺方格底纹） ---------------- */

  function render(text, streaming, forceTitle) {
    var parts = titledParts(text, forceTitle);
    lastTitle = parts.title || "作文";
    els.paperTitle.textContent = lastTitle;
    els.paperBody.textContent = "";
    els.paperBody.classList.remove("paper-empty");

    var paras = parts.body.split(/\n+/).filter(function (p) { return p.trim(); });
    if (!paras.length && streaming) paras = [""];

    paras.forEach(function (p, idx) {
      var el = document.createElement("p");
      el.textContent = p.replace(/\n/g, "");
      if (streaming && idx === paras.length - 1) {
        var caret = document.createElement("span");
        caret.className = "caret";
        el.appendChild(caret);
      }
      els.paperBody.appendChild(el);
    });
    var count = Array.from(parts.body.replace(/\s/g, "")).length;
    els.paperStat.textContent = count ? ("字数 " + count + (streaming ? " · 生成中" : " 字")) : "";
  }

  function showEmpty() {
    els.paperTitle.textContent = "作文稿纸";
    els.paperBody.textContent = "填好题目与接口，点「开始生成」，内容会逐字写在这里。";
    els.paperBody.className = "paper-body paper-empty";
    els.paperStat.textContent = "";
  }

  /* ---------------- 老师手批：朱红修改符号 + 逐条采纳 ---------------- */

  var SYMBOL_LABEL = {
    "delete": "删除号", "replace": "改正号", "insert": "增补号",
    "swap": "调序号", "comment": "眉批"
  };
  var VALID_TYPES = ["delete", "replace", "insert", "swap", "comment"];
  var annotPanelEl = null;

  function trim(s) { return String(s == null ? "" : s).trim(); }

  function pendingMarks() {
    return annotations.filter(function (m) { return m.state === "pending"; });
  }

  function markNo(n) {
    return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : "(" + n + ")";
  }

  // 在一段正文里定位所有待处理批注的片段，去掉重叠，返回可渲染的区间
  function intervalsFor(paraText, marks) {
    var list = [];
    marks.forEach(function (m) {
      var needles = m.type === "swap" ? m.anchor.split("|||") : [m.anchor];
      needles.forEach(function (raw) {
        var a = trim(raw);
        if (!a) return;
        var at = paraText.indexOf(a);
        if (at < 0) return;
        if (paraText.indexOf(a, at + a.length) >= 0) return; // 不唯一则跳过，避免标错
        list.push({ mark: m, start: at, end: at + a.length, anchor: a });
      });
    });
    list.sort(function (x, y) { return x.start - y.start; });
    var out = [], lastEnd = -1;
    list.forEach(function (it) {
      if (it.start < lastEnd) return;
      out.push(it);
      lastEnd = it.end;
    });
    return out;
  }

  // 上一轮采纳产生的新文字：在正文里定位，用于标黄
  function prevIntervals(paraText) {
    var list = [];
    prevAcceptedTexts.forEach(function (t) {
      if (!t) return;
      var at = paraText.indexOf(t);
      if (at >= 0) list.push({ start: at, end: at + t.length });
    });
    list.sort(function (a, b) { return a.start - b.start; });
    var out = [], lastEnd = -1;
    list.forEach(function (it) {
      if (it.start < lastEnd) return;
      out.push(it);
      lastEnd = it.end;
    });
    return out;
  }

  // 把一段普通文本按"上一轮改动"区间切成节点（黄底）
  function appendPlainWithHighlights(el, text) {
    var hs = prevIntervals(text);
    var p = 0;
    hs.forEach(function (h) {
      if (h.start > p) el.appendChild(document.createTextNode(text.slice(p, h.start)));
      var y = document.createElement("span");
      y.className = "ink-prev";
      y.textContent = text.slice(h.start, h.end);
      y.title = "上一轮采纳的改动";
      el.appendChild(y);
      p = h.end;
    });
    if (p < text.length) el.appendChild(document.createTextNode(text.slice(p)));
  }

  function buildMarkedParagraph(paraText, marks) {
    var el = document.createElement("p");
    var ivs = intervalsFor(paraText, marks);
    var pos = 0;
    ivs.forEach(function (it) {
      if (it.start > pos) appendPlainWithHighlights(el, paraText.slice(pos, it.start));
      var span = document.createElement("span");
      span.className = "ink-mark ink-" + it.mark.type;
      span.textContent = it.anchor;
      span.setAttribute("data-mark-id", it.mark.id);
      span.title = (SYMBOL_LABEL[it.mark.type] || "批注") + "：" + (it.mark.reason || "");
      var no = document.createElement("sup");
      no.className = "ink-no";
      no.textContent = markNo(it.mark.no);
      span.appendChild(no);
      el.appendChild(span);
      if ((it.mark.type === "replace" || it.mark.type === "insert") && it.mark.text) {
        var sug = document.createElement("span");
        sug.className = "ink-suggest";
        sug.textContent = (it.mark.type === "insert" ? "∧" : "→") + it.mark.text;
        el.appendChild(sug);
      }
      // 采纳 / 忽略按钮直接放在被改文字旁边
      var tools = document.createElement("span");
      tools.className = "ink-tools";
      var why = document.createElement("span");
      why.className = "ink-reason";
      why.textContent = it.mark.reason || SYMBOL_LABEL[it.mark.type] || "批注";
      tools.appendChild(why);
      var ok = document.createElement("button");
      ok.type = "button";
      ok.className = "ink-accept";
      ok.textContent = "采纳";
      ok.addEventListener("click", function () { applyMarkAction(it.mark.id, "accept"); });
      var no2 = document.createElement("button");
      no2.type = "button";
      no2.textContent = "忽略";
      no2.addEventListener("click", function () { applyMarkAction(it.mark.id, "ignore"); });
      tools.appendChild(ok);
      tools.appendChild(no2);
      el.appendChild(tools);
      pos = it.end;
    });
    if (pos < paraText.length) appendPlainWithHighlights(el, paraText.slice(pos));
    return el;
  }

  // 用 docTitle/docBody 重渲染稿纸（带修改符号），不依赖 fullText
  function renderAnnotated() {
    els.paperTitle.textContent = docTitle || "作文";
    els.paperBody.textContent = "";
    els.paperBody.classList.remove("paper-empty");
    var marks = pendingMarks();
    docBody.split(/\n+/).filter(function (p) { return p.trim(); }).forEach(function (p) {
      els.paperBody.appendChild(buildMarkedParagraph(p.replace(/\n/g, ""), marks));
    });
    var count = Array.from(docBody.replace(/\s/g, "")).length;
    var left = marks.length;
    els.paperStat.textContent = count
      ? ("字数 " + count + " 字" + (left ? " · " + left + " 处批注待处理" : ""))
      : "";
  }

  function replaceOnce(src, a, b) {
    var i = src.indexOf(a);
    if (i < 0) return null;
    return src.slice(0, i) + b + src.slice(i + a.length);
  }

  function applyMarkAction(id, action) {
    var m = null;
    for (var i = 0; i < annotations.length; i++) {
      if (annotations[i].id === id) { m = annotations[i]; break; }
    }
    if (!m || m.state !== "pending") return;

    if (action === "accept") {
      var next = docBody;
      if (m.type === "delete") next = replaceOnce(docBody, m.anchor, "");
      else if (m.type === "replace") next = replaceOnce(docBody, m.anchor, m.text);
      else if (m.type === "insert") next = replaceOnce(docBody, m.anchor, m.anchor + m.text);
      else if (m.type === "swap") {
        var pair = m.anchor.split("|||");
        if (pair.length === 2 && trim(pair[0]) && trim(pair[1])) {
          var A = trim(pair[0]), B = trim(pair[1]);
          var tmp = "\u0001WY_SWAP\u0001";
          var t1 = replaceOnce(docBody, A, tmp);
          if (t1 !== null) {
            var t2 = replaceOnce(t1, B, A);
            if (t2 !== null) next = t2.replace(tmp, B);
          }
        }
      }
      // comment 眉批只阅不改字
      if (next === null) {
        m.state = "invalid";
        renderAnnotPanel();
        setPaperHint("这处原文已变化，无法应用；可点「忽略」。");
        return;
      }
      docBody = next;
      currentComposition = (docTitle ? docTitle + "\n\n" : "") + docBody;
      m.state = "accepted";
      // 记录本轮改动写进正文的新文字，下一轮批注时标黄
      if (m.type === "replace" || m.type === "insert") {
        if (m.text) roundAcceptedTexts.push(m.text);
      } else if (m.type === "swap") {
        m.anchor.split("|||").forEach(function (x) { if (trim(x)) roundAcceptedTexts.push(trim(x)); });
      }
    } else {
      m.state = "ignored";
    }
    renderAnnotated();
    renderAnnotPanel();
    scheduleEssaySave();
    // 提示写进批注面板头部，避免覆盖稿纸的字数统计
    var cnt = annotPanelEl && annotPanelEl.querySelector(".annot-count");
    if (cnt) {
      var left = pendingMarks().length;
      cnt.textContent = left ? (left + " 处待处理") : "批注已处理完 · 稿纸为最终稿";
    }
  }

  function applyAll(action) {
    pendingMarks().slice().forEach(function (m) { applyMarkAction(m.id, action); });
  }

  function syncAnnotTools() {
    var has = pendingMarks().length > 0;
    if (els.acceptAllBtn) els.acceptAllBtn.hidden = !has;
    if (els.ignoreAllBtn) els.ignoreAllBtn.hidden = !has;
  }

  // 批注面板放在左侧对话区（该区本来就可滚动，不会撑高稿纸）
  function renderAnnotPanel() {
    if (els.contextEmpty) { els.contextEmpty.remove(); els.contextEmpty = null; }
    if (!annotPanelEl) {
      annotPanelEl = document.createElement("div");
      annotPanelEl.className = "annot-panel";
      els.contextList.appendChild(annotPanelEl);
    }
    annotPanelEl.innerHTML = "";
    syncAnnotTools();
    if (!annotations.length) { annotPanelEl.setAttribute("hidden", ""); return; }
    annotPanelEl.removeAttribute("hidden");

    var head = document.createElement("div");
    head.className = "annot-head";
    head.innerHTML = '<span>老师手批</span><span class="annot-count"></span>';
    head.querySelector(".annot-count").textContent = pendingMarks().length + " 处待处理";
    annotPanelEl.appendChild(head);

    var legend = document.createElement("div");
    legend.className = "annot-legend";
    legend.textContent = "点稿纸里的朱红标注，在改动旁边选「采纳 / 忽略」。黄底文字是上一轮已采纳的改动。";
    annotPanelEl.appendChild(legend);

    annotations.forEach(function (m) {
      var card = document.createElement("div");
      card.className = "annot-card state-" + m.state;
      var top = document.createElement("div");
      top.className = "annot-card-top";
      top.innerHTML = '<span class="annot-no"></span><span class="annot-sym"></span><span class="annot-state"></span>';
      top.querySelector(".annot-no").textContent = markNo(m.no);
      top.querySelector(".annot-sym").textContent = SYMBOL_LABEL[m.type] || m.type;
      top.querySelector(".annot-state").textContent =
        m.state === "accepted" ? "已采纳" : m.state === "ignored" ? "已忽略" :
        m.state === "invalid" ? "原文已变" : "";
      card.appendChild(top);

      var orig = document.createElement("div");
      orig.className = "annot-orig";
      orig.textContent = m.type === "swap" ? m.anchor.replace("|||", " ⇄ ") : m.anchor;
      card.appendChild(orig);
      if (m.text && (m.type === "replace" || m.type === "insert")) {
        var sug = document.createElement("div");
        sug.className = "annot-sug";
        sug.textContent = (m.type === "insert" ? "增补：∧" : "改为：") + m.text;
        card.appendChild(sug);
      }
      if (m.reason) {
        var why = document.createElement("div");
        why.className = "annot-reason";
        why.textContent = m.reason;
        card.appendChild(why);
      }
      if (m.state === "pending") {
        var row = document.createElement("div");
        row.className = "annot-card-actions";
        var ok = document.createElement("button");
        ok.className = "btn-mini primary";
        ok.textContent = "采纳";
        ok.addEventListener("click", function () { applyMarkAction(m.id, "accept"); });
        var no = document.createElement("button");
        no.className = "btn-mini";
        no.textContent = "忽略";
        no.addEventListener("click", function () { applyMarkAction(m.id, "ignore"); });
        row.appendChild(ok);
        row.appendChild(no);
        card.appendChild(row);
      }
      annotPanelEl.appendChild(card);
    });
  }

  /* ---------------- 对话气泡 ---------------- */

  function addUserBubble(text) {
    if (els.contextEmpty) { els.contextEmpty.remove(); els.contextEmpty = null; }
    var b = document.createElement("div");
    b.className = "bubble user";
    b.innerHTML = '<div class="bubble-label">你</div><div class="bubble-text"></div>';
    b.querySelector(".bubble-text").textContent = text;
    els.contextList.appendChild(b);
    els.contextList.scrollTop = els.contextList.scrollHeight;
  }

  function addAssistantBubble() {
    var b = document.createElement("div");
    b.className = "bubble ai";
    b.innerHTML = '<div class="bubble-label">文芽</div><div class="bubble-text"></div>';
    els.contextList.appendChild(b);
    els.contextList.scrollTop = els.contextList.scrollHeight;
    return b.querySelector(".bubble-text");
  }

  /* ---------------- 输出更新（流式驱动） ---------------- */

  function updateOutput(streaming) {
    var hasMarker = /^\s*===作文===\s*$/m.test(fullText);
    if (!hasMarker) {
      if (streaming) {
        if (assistantReplyEl) assistantReplyEl.textContent = "正在理解你的要求…";
        showEmpty();
        return;
      }
      if (assistantReplyEl) assistantReplyEl.textContent = "（模型未按两段格式输出，已作为作文呈现）";
      render(fullText, false, false);
      return;
    }
    var parts = splitTwo(fullText);
    if (assistantReplyEl) assistantReplyEl.textContent = parts.reply || "（已生成回应）";
    render(parts.comp, streaming, true);
  }

  function cacheComposition() {
    var hasMarker = /^\s*===作文===\s*$/m.test(fullText);
    var parts = splitTwo(fullText);
    var t = titledParts(parts.comp, hasMarker);
    docTitle = t.title || "作文";
    docBody = t.body;
    currentComposition = (t.title ? t.title + "\n\n" : "") + t.body;
  }

  /* ---------------- 云端作文同步（仅登录后） ---------------- */

  function authToken() {
    return (window.WY_AUTH && window.WY_AUTH.token()) || "";
  }

  function essayPayload() {
    return {
      id: currentEssayId || 0,
      title: docTitle || "作文",
      body: currentComposition || docBody,
      category: activeCat || selectedCat || "",
      province: activeProvince || selectedProvince || "",
      wordCount: Array.from(docBody.replace(/\s/g, "")).length
    };
  }

  var essaySaveTimer = null;
  function scheduleEssaySave() {
    if (!authToken()) return;
    if (essaySaveTimer) clearTimeout(essaySaveTimer);
    essaySaveTimer = setTimeout(function () {
      essaySaveTimer = null;
      saveEssayToCloud();
    }, 700);
  }

  // 静默保存：没登录就不传；失败不打断写作流程
  async function saveEssayToCloud() {
    var t = authToken();
    if (!t || !docBody.trim()) return;
    try {
      var res = await fetch("https://back.wenyazw.top/api/essays", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + t },
        body: JSON.stringify(essayPayload())
      });
      var j = await res.json();
      if (res.ok && j && j.ok && j.id) currentEssayId = j.id;
    } catch (e) { /* 离线或后端异常时静默降级，作文仍在本机 */ }
  }

  function setBusy(busy) {
    els.startBtn.disabled = busy;
    els.sendBtn.disabled = busy;
    els.stopBtn2.disabled = !busy;
    els.testBtn.disabled = busy;
    els.startBtn.textContent = busy ? "生成中…" : "开始生成";
  }

  /* ---------------- 请求 ---------------- */

  function endpoint(c) {
    var base = (c.base || "").replace(/\/+$/, "");
    var path = (c.path || "").trim() || "/chat/completions";
    if (!/^\//.test(path)) path = "/" + path;
    return base + path;
  }

  function headers(c) {
    return {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + c.key
    };
  }

  function friendlyError(res, raw) {
    var detail = "";
    try {
      var j = JSON.parse(raw);
      detail = (j.error && (j.error.message || j.error.code)) || j.message || "";
    } catch (e) { detail = raw.slice(0, 160); }
    var map = {
      400: "请求被拒绝（400），检查模型名与参数。",
      401: "API Key 无效或已过期（401）。",
      403: "无权限（403），检查密钥额度与模型权限。",
      404: "接口路径不对（404），检查 Base URL 与接口路径。",
      429: "触发限流或余额不足（429）。",
      500: "服务端错误（500），稍后重试。",
      502: "网关错误（502），稍后重试。",
      503: "服务暂不可用（503）。"
    };
    return (map[res.status] || ("接口返回 " + res.status)) + (detail ? "：" + detail : "");
  }

  function readDataLine(line, onDelta) {
    var s = line.trim();
    if (!s || s.charAt(0) === ":" || s.indexOf("data:") !== 0) return false;
    var data = s.slice(5).trim();
    if (data === "[DONE]") return true;
    var j;
    try { j = JSON.parse(data); } catch (e) { return false; }
    if (j.error) throw new Error(j.error.message || "流式返回错误");
    var choice = j.choices && j.choices[0];
    var delta = choice && (choice.delta || choice.message);
    if (delta && typeof delta.content === "string") onDelta(delta.content);
    return false;
  }

  async function consumeStream(res, onDelta) {
    var reader = res.body.getReader();
    var decoder = new TextDecoder("utf-8");
    var leftover = "";
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      leftover += decoder.decode(chunk.value, { stream: true });
      var lines = leftover.split(/\r?\n/);
      leftover = lines.pop();
      for (var i = 0; i < lines.length; i++) readDataLine(lines[i], onDelta);
    }
    if (leftover.trim()) readDataLine(leftover, onDelta);
  }

  // 本次作文的类别规则（完整文本），同时拼进 system 和 user，避免模型忽略
  function categoryRule() {
    var cat = activeCat || selectedCat;
    var cfg = window.WY_CATEGORY && window.WY_CATEGORY[cat];
    return cfg ? cfg.rule : "";
  }

  function activeCatName() { return activeCat || selectedCat; }

  function composeWriteUser() {
    var lines = [];
    lines.push("【本次作文类别】" + activeCatName());
    var rule = categoryRule();
    if (rule) lines.push(rule);
    lines.push("【题目 / 题材（用户原话，按上面的类别规则处理）】\n" + els.topic.value.trim());
    if (els.extra.value.trim()) lines.push("【额外要求】" + els.extra.value.trim());
    lines.push("【目标字数（含标点）】约 " + wordCount + " 字，正文尽量逼近，宁可少写不可硬凑。");
    var prov = activeProvince || selectedProvince;
    var sd = (window.WY_SCORING && window.WY_SCORING[prov]) || "";
    lines.push("【评分标准（" + prov + "）】" + sd);
    lines.push("\n这是首次生成，请直接输出「===作文===」和作文正文，不用写「回应」部分。严格按系统提示的写作铁律、本类别的标题与扣题规则、以及上述评分标准执行。");
    return lines.join("\n");
  }

  function composeReviseUser(req) {
    var lines = [];
    lines.push("【本次作文类别】" + activeCatName());
    var rule = categoryRule();
    if (rule) lines.push(rule + "\n- 批注同样受本类别的标题规则约束：命题不得改题；半命题不得更换已补好的词；自拟不得换成口号式标题。anchor 不要取标题。");
    lines.push("【当前作文（只批注，不要重写）】\n" + currentComposition);
    lines.push("【学生的修改要求】\n" + req);
    lines.push("\n按系统提示输出批注 JSON：只标出该改的几处，不要输出修改后的完整作文。anchor 必须逐字取自上面的正文且在正文里唯一。");
    return lines.join("\n\n");
  }

  async function runStream(systemPrompt, userContent) {
    var c = currentConfig();
    controller = new AbortController();
    fullText = "";
    setBusy(true);

    try {
      var res = await fetch(endpoint(c), {
        method: "POST",
        headers: headers(c),
        body: JSON.stringify({
          model: c.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
          ],
          stream: true,
          temperature: (function () { var t = parseFloat(c.temp); return isNaN(t) ? 1 : Math.min(2, Math.max(0, t)); })(),
          max_tokens: (function () { var m = parseInt(c.maxTokens, 10); return isNaN(m) ? 2400 : Math.min(16000, Math.max(64, m)); })()
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        var raw = await res.text();
        throw new Error(friendlyError(res, raw));
      }

      var ctype = res.headers.get("content-type") || "";
      var got = false;

      if (res.body && ctype.toLowerCase().indexOf("application/json") === -1) {
        await consumeStream(res, function (d) {
          fullText += d;
          got = true;
          updateOutput(true);
        });
      } else {
        var j = await res.json();
        if (j.error) throw new Error(j.error.message || "接口返回错误");
        var msg = j.choices && j.choices[0] && j.choices[0].message;
        fullText = (msg && msg.content) || "";
        got = true;
        updateOutput(false);
      }

      if (!got || !fullText.trim()) throw new Error("接口没有返回内容，换一个模型或检查额度。");
      updateOutput(false);
      cacheComposition();
      return true;

    } catch (e) {
      if (e && e.name === "AbortError") {
        updateOutput(false);
        cacheComposition();
        setPaperHint("已停止，保留已生成的部分。");
        return false;
      }
      var msg = (e && e.message) || "未知错误";
      if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
        msg = "请求发不出去：多为浏览器跨域被拦或网络不通。换支持 CORS 的接口，或改用本地代理。";
      }
      setPaperHint("生成失败：" + msg);
      updateOutput(false);
      return false;
    } finally {
      controller = null;
      setBusy(false);
    }
  }

  /* ---------------- 老师手批：非流式请求 + 批注解析 ---------------- */

  // 从模型输出里稳妥地抠出 JSON（容忍 ```json 包裹、前后多余文字）
  function parseAnnotJSON(raw) {
    var s = trim(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("模型没有返回批注 JSON，可能该模型不擅长结构化输出。");
    var obj;
    try { obj = JSON.parse(s.slice(a, b + 1)); }
    catch (e) { throw new Error("批注 JSON 解析失败，可换一个模型再试。"); }
    if (!obj || !Array.isArray(obj.marks)) throw new Error("批注格式不对（缺 marks 数组）。");
    return obj;
  }

  // 校验并规范化批注：丢掉 anchor 定位不到、类型不合法、缺字段的条目
  function normalizeMarks(obj) {
    var out = [];
    obj.marks.slice(0, 12).forEach(function (m) {
      if (!m || VALID_TYPES.indexOf(m.type) < 0) return;
      var anchor = trim(m.anchor), text = trim(m.text), reason = trim(m.reason);
      if (!anchor) return;
      if ((m.type === "replace" || m.type === "insert") && !text) return;
      var needles = m.type === "swap" ? anchor.split("|||").map(trim) : [anchor];
      var ok = needles.every(function (n) { return n && docBody.indexOf(n) >= 0; });
      if (!ok) return;
      out.push({
        id: ++annotSeq, no: out.length + 1, type: m.type,
        anchor: anchor, text: text, reason: reason, state: "pending"
      });
    });
    return out;
  }

  async function fetchAnnotation(systemPrompt, userContent) {
    var c = currentConfig();
    controller = new AbortController();
    setBusy(true);
    try {
      var res = await fetch(endpoint(c), {
        method: "POST",
        headers: headers(c),
        body: JSON.stringify({
          model: c.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
          ],
          stream: false,
          temperature: (function () { var t = parseFloat(c.temp); return isNaN(t) ? 0.7 : Math.min(2, Math.max(0, t)); })(),
          max_tokens: (function () { var m = parseInt(c.maxTokens, 10); return isNaN(m) ? 2400 : Math.min(16000, Math.max(256, m)); })()
        }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(friendlyError(res, await res.text()));
      var j = await res.json();
      if (j.error) throw new Error(j.error.message || "接口返回错误");
      var msg = j.choices && j.choices[0] && j.choices[0].message;
      var content = (msg && msg.content) || "";
      if (!content.trim()) throw new Error("接口没有返回内容，换一个模型或检查额度。");
      return content;
    } finally {
      controller = null;
      setBusy(false);
    }
  }

  /* ---------------- 入口 1：开始生成（写作引擎） ---------------- */

  async function startWriting() {
    if (!selectedCat) { setWizardStatus("请先选择作文类别（命题/半命题/自拟）。", "error"); return; }
    if (!els.topic.value.trim()) {
      setWizardStatus(selectedCat === "自拟" ? "请先写一段题材或范围。" : "请先写下作文题目。", "error");
      els.topic.focus(); return;
    }
    var topicWarn = validateTopic(selectedCat, els.topic.value.trim());
    if (topicWarn) { setWizardStatus(topicWarn, "error"); els.topic.focus(); return; }

    // 锁定本次成稿的类别/题目/评分标准，后续改稿都以此为准
    activeCat = selectedCat;
    activeTopic = els.topic.value.trim();
    activeProvince = selectedProvince;

    var c = currentConfig();
    if (!c.base || !c.key || !c.model) {
      setWizardStatus("请先配置接口（Base URL / API Key / 模型名），点右上角「接口配置」。", "error");
      setConfigOpen(true);
      return;
    }

    saveConfig();
    currentComposition = "";
    docTitle = ""; docBody = "";
    annotations = []; annotSeq = 0; annotPanelEl = null;
    prevAcceptedTexts = []; roundAcceptedTexts = [];
    currentEssayId = null;
    syncAnnotTools();
    if (els.contextEmpty) { els.contextEmpty.remove(); els.contextEmpty = null; }
    els.contextList.innerHTML = "";

    var summary = "类别：" + selectedCat + " ｜ 题目：" + els.topic.value.trim().slice(0, 30) +
      (els.topic.value.trim().length > 30 ? "…" : "") + " ｜ 约 " + wordCount + " 字 ｜ " + selectedProvince;
    els.studioMeta.textContent = summary;

    els.wizard.setAttribute("hidden", "");
    els.studio.removeAttribute("hidden");
    document.body.classList.add("studio-mode");

    addUserBubble(summary);
    assistantReplyEl = null;          // 首次生成：不在对话里显示「回应」
    showEmpty();
    setPaperHint("正在生成…");

    // 系统提示词 = 写作铁律 + 本类别标题/扣题规则 + 所选省份评分标准（都是完整文本）
    var prov = activeProvince || selectedProvince;
    var sd = (window.WY_SCORING && window.WY_SCORING[prov]) || "";
    var sysPrompt = window.WY_PROMPT;
    var rule = categoryRule();
    if (rule) sysPrompt += "\n\n" + rule;
    if (sd) sysPrompt += "\n\n【评分标准参照（" + prov + "）】\n" + sd;
    await runStream(sysPrompt, composeWriteUser());
    if (fullText.trim()) {
      setPaperHint(els.paperStat.textContent);
      saveEssayToCloud();
    }
  }

  /* ---------------- 入口 2：发送修改要求（老师手批，逐条采纳） ---------------- */

  async function sendRevision() {
    var req = els.chatInput.value.trim();
    if (!req) { setPaperHint("先写下你的修改要求，再发送。"); els.chatInput.focus(); return; }
    if (!currentComposition) { setPaperHint("还没有成稿，无法批改。"); return; }

    var c = currentConfig();
    if (!c.base || !c.key || !c.model) {
      setPaperHint("接口未配置，先回工作台填好。");
      return;
    }

    addUserBubble(req);
    els.chatInput.value = "";
    assistantReplyEl = addAssistantBubble();
    if (assistantReplyEl) assistantReplyEl.textContent = "正在读稿、写批注…";
    setPaperHint("批改老师正在读稿…");

    var sys = window.WY_ANNOTATOR;
    var rule = categoryRule();
    if (rule) sys += "\n\n" + rule;
    var revProv = activeProvince || selectedProvince;
    var sd = (window.WY_SCORING && window.WY_SCORING[revProv]) || "";
    if (sd) sys += "\n\n【评分标准参照（" + revProv + "）】\n" + sd;

    try {
      var raw = await fetchAnnotation(sys, composeReviseUser(req));
      var obj = parseAnnotJSON(raw);
      // 上一轮采纳的改动从这一轮起标黄；本轮新采纳的留到下一轮才标
      prevAcceptedTexts = roundAcceptedTexts.slice();
      roundAcceptedTexts = [];
      annotations = normalizeMarks(obj);
      // 新一轮批注：移除上一轮面板（正文已采纳的改动仍生效），在对话底部重建
      if (annotPanelEl) { annotPanelEl.remove(); annotPanelEl = null; }
      if (assistantReplyEl) assistantReplyEl.textContent = trim(obj.reply) || "已批注，看左侧批注逐条决定。";
      renderAnnotated();                  // 稿纸上标出朱红修改符号
      renderAnnotPanel();                 // 左侧列出可采纳/忽略的批注
      if (!annotations.length) {
        if (assistantReplyEl) assistantReplyEl.textContent =
          (trim(obj.reply) || "已批注。") + " 但这轮没有能定位到原文的批注，可换个更具体的要求再试。";
      }
    } catch (e) {
      if (e && e.name === "AbortError") {
        if (assistantReplyEl) assistantReplyEl.textContent = "已停止批改，原稿保留。";
        renderAnnotated();
        setPaperHint("已停止，原稿保留。");
        return;
      }
      var msg = (e && e.message) || "未知错误";
      if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
        msg = "请求发不出去：多为浏览器跨域被拦或网络不通。换支持 CORS 的接口，或改用本地代理。";
      }
      if (assistantReplyEl) assistantReplyEl.textContent = "批改失败：" + msg;
      setPaperHint("批改失败：" + msg);
      renderAnnotated();
    }
  }

  /* ---------------- 输出操作 ---------------- */

  function compositionText() {
    // 采纳批注后正文已变，优先用 docTitle/docBody（最终稿），而不是最初的 fullText
    if (currentComposition) return { title: docTitle, body: docBody };
    var hasMarker = /^\s*===作文===\s*$/m.test(fullText);
    var parts = splitTwo(fullText);
    return titledParts(parts.comp, hasMarker);
  }

  function plainOutput() {
    var p = compositionText();
    return (p.title ? p.title + "\n\n" : "") + p.body;
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  async function copyString(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      setPaperHint(okMsg);
    } catch (e) {
      var ok = fallbackCopy(text);
      setPaperHint(ok ? okMsg : "复制失败，请手动选中文字。");
    }
  }

  function copyText() {
    var text = plainOutput();
    if (!text.trim()) { setPaperHint("稿纸还是空的。"); return; }
    copyString(text, "作文已复制。");
  }

  function downloadText() {
    var text = plainOutput();
    if (!text.trim()) { setPaperHint("稿纸还是空的。"); return; }
    var safe = (lastTitle || "作文").replace(/[\\/:*?"<>|]/g, "").slice(0, 24);
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "文芽作文-" + safe + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setPaperHint("已下载为 txt。");
  }

  /* ---------------- 测试连接 ---------------- */

  async function testConnection() {
    var c = currentConfig();
    if (!c.base || !c.key || !c.model) {
      setWizardStatus("测试前先填齐 Base URL、API Key、模型名。", "error");
      return;
    }
    setWizardStatus("正在测试连接…", "");
    els.testBtn.disabled = true;
    try {
      var res = await fetch(endpoint(c), {
        method: "POST",
        headers: headers(c),
        body: JSON.stringify({
          model: c.model,
          messages: [{ role: "user", content: "回复两个字：可用" }],
          stream: false,
          max_tokens: 16
        })
      });
      if (!res.ok) throw new Error(friendlyError(res, await res.text()));
      setWizardStatus("连接正常，可以生成作文。", "ok");
    } catch (e) {
      var msg = (e && e.message) || "未知错误";
      if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
        msg = "跨域被拦或网络不通，该接口可能无法从浏览器直连。";
      }
      setWizardStatus("连接失败：" + msg, "error");
    } finally {
      els.testBtn.disabled = false;
    }
  }

  /* ---------------- 事件绑定 ---------------- */

  els.startBtn.addEventListener("click", startWriting);
  els.sendBtn.addEventListener("click", sendRevision);
  els.testBtn.addEventListener("click", testConnection);
  els.copyBtn.addEventListener("click", copyText);
  els.downloadBtn.addEventListener("click", downloadText);

  els.acceptAllBtn.addEventListener("click", function () { applyAll("accept"); });
  els.ignoreAllBtn.addEventListener("click", function () { applyAll("ignore"); });

  els.stopBtn2.addEventListener("click", function () {
    if (controller) controller.abort();
  });

  els.backBtn.addEventListener("click", function () {
    if (controller) controller.abort();
    els.studio.setAttribute("hidden", "");
    els.wizard.removeAttribute("hidden");
    document.body.classList.remove("studio-mode");
  });

  els.chatInput.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") sendRevision();
  });

  /* ---------------- 初始化 ---------------- */

  updateSteps();
  showEmpty();
  setBusy(false);
})();
