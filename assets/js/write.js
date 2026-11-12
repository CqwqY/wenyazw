/* 文芽作文 - 创建工作台 + 生成界面逻辑
 * 纯前端直连 OpenAI 兼容接口，无后端、无数据上传。
 * 首次生成走「写作引擎」；生成界面里用户提修改要求时切换为「作文修改大师」。
 */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var STORE = "wy.api.config.v1";

  // 安全注册：元素缺失时静默跳过，避免一个 null 把后面所有交互全部带死
  function on(el, ev, fn) {
    if (el && el.addEventListener) el.addEventListener(ev, fn);
  }

  // 脚本一旦报错，页面就会大面积“点不动”，这里直接把原因和强制刷新按钮摆到眼前
  window.addEventListener("error", function (e) {
    if (document.getElementById("wyJsErr")) return;
    var bar = document.createElement("div");
    bar.id = "wyJsErr";
    bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:999;display:flex;align-items:center;gap:12px;" +
      "padding:10px 16px;background:#8c332b;color:#fff;font-size:13px;font-family:system-ui,sans-serif";
    var msg = document.createElement("span");
    msg.textContent = "页面脚本出错，部分按钮可能失效：" + ((e && e.message) || "未知错误");
    var btn = document.createElement("button");
    btn.textContent = "强制刷新";
    btn.style.cssText = "margin-left:auto;border:0;border-radius:999px;padding:6px 16px;cursor:pointer;" +
      "background:#fff;color:#8c332b;font-size:13px";
    btn.addEventListener("click", function () {
      location.href = location.pathname + "?v=" + Date.now();
    });
    bar.appendChild(msg);
    bar.appendChild(btn);
    document.body.appendChild(bar);
  });

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
    chatMode: $("chatMode"), chatModeHint: $("chatModeHint"),
    paperTitle: $("paperTitle"), paperBody: $("paperBody"),
    paperStat: $("paperStat"), copyBtn: $("copyBtn"), downloadBtn: $("downloadBtn"),
    acceptAllBtn: $("acceptAllBtn"), ignoreAllBtn: $("ignoreAllBtn"),

    scoreToggle: $("scoreToggle"), scoreBody: $("scoreBody"), scoreChips: $("scoreChips"),
    scoreCaret: $("scoreCaret"), scoreTables: $("scoreTables"),
    criticBtn: $("criticBtn"), criticStat: $("criticStat"), criticList: $("criticList"),
    criticDock: $("criticDock"), criticDockClose: $("criticDockClose"),
    inkDock: $("inkDock"), inkDockNo: $("inkDockNo"), inkDockWhy: $("inkDockWhy"),
    inkDockAccept: $("inkDockAccept"), inkDockIgnore: $("inkDockIgnore"),
    inkDockClose: $("inkDockClose"),

    docTabs: $("docTabs"), docTabHint: $("docTabHint"),
    outlinePane: $("outlinePane"), paperPane: $("paperPane"),
    outlineTitle: $("outlineTitle"), outlineThesis: $("outlineThesis"),
    outlinePoints: $("outlinePoints"), outlineEmpty: $("outlineEmpty"),
    outlineAddBtn: $("outlineAddBtn"), outlineAiBtn: $("outlineAiBtn"),
    outlineRetryBtn: $("outlineRetryBtn"),
    writeEssayBtn: $("writeEssayBtn")
  };

  /* 向导状态 */
  var selectedCat = "";
  var wordCount = 800;
  var selectedProvinces = ["全国卷（通用）"];

  /* 运行态 */
  var controller = null;
  var fullText = "";
  var lastTitle = "作文";
  var assistantReplyEl = null;
  var currentComposition = "";   // 当前作文纯文本（标题+正文），用于修改大师上下文
  var activeCat = "";            // 本次成稿的类别快照（返回工作台改选项不影响已生成的稿）
  var activeTopic = "";          // 本次成稿的题目原题快照
  var activeProvinces = [];      // 本次成稿所选评分标准快照（可多个）
  var docTitle = "";             // 稿纸标题（纯文本）
  var docBody = "";              // 稿纸正文（纯文本，采纳批注时在这里替换）
  var annotations = [];          // 老师手批：待处理/已采纳/已忽略的批注
  var annotSeq = 0;              // 批注编号自增
  var prevAcceptedTexts = [];    // 上一轮采纳写进正文的新文字（稿纸里标黄）
  var roundAcceptedTexts = [];   // 本轮采纳产生的新文字，下一轮开始时归档为"上一轮"
  var currentEssayId = null;     // 云端作文 id（登录后自动保存）

  var outline = { title: "", thesis: "", points: [], note: "" };  // 大纲（可编辑）
  var stage = "outline";         // outline：还在改大纲；draft：正文已生成
  var chatMode = "annotate";     // annotate：手批改稿；explain：只问不改
  var criticItems = [];          // AI 评改的逐句结果
  var criticDockClosed = false;  // 用户手动收起稿纸下方的评改批注坞

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

  on(els.toggleConfig, "click", function () {
    setConfigOpen(els.configPanel.hasAttribute("hidden"));
  });
  setConfigOpen(!readConfig().key);

  ["preset", "base", "path", "key", "model", "temp", "maxTokens", "remember"].forEach(function (name) {
    els[name].addEventListener("change", saveConfig);
    if (name !== "remember" && name !== "preset") {
      els[name].addEventListener("input", saveConfig);
    }
  });

  on(els.preset, "change", function () {
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

  on(els.keyToggle, "click", function () {
    var show = els.key.type === "password";
    els.key.type = show ? "text" : "password";
    els.keyToggle.textContent = show ? "隐藏" : "显示";
  });

  on(els.resetCfg, "click", function () {
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

  on(els.catGrid, "click", function (e) {
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

  on(els.wordRange, "input", function () { setWord(parseInt(els.wordRange.value, 10)); });
  on(els.wordMinus, "click", function () { setWord(wordCount - 50); });
  on(els.wordPlus, "click", function () { setWord(wordCount + 50); });
  setWord(800);

  /* ---------------- 向导：评分标准（可多选，动态生成表格卡片） ---------------- */

  function scoringBrief(prov) {
    var s = window.WY_SCORING[prov];
    if (!s) return "";
    return "总分 " + s.total + " 分 · 维度 " + s.dims.map(function (d) { return d[0] + d[1]; }).join("/") +
      " · 分 " + s.bands.length + " 档";
  }

  function buildScoringCards() {
    if (!window.WY_SCORING) return;
    els.scoringGrid.innerHTML = "";
    Object.keys(window.WY_SCORING).forEach(function (prov) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scoring-card" + (selectedProvinces.indexOf(prov) >= 0 ? " selected" : "");
      btn.setAttribute("data-province", prov);
      var name = document.createElement("div");
      name.className = "scoring-name";
      name.textContent = prov;
      var desc = document.createElement("div");
      desc.className = "scoring-desc";
      desc.textContent = scoringBrief(prov);
      btn.appendChild(name);
      btn.appendChild(desc);
      els.scoringGrid.appendChild(btn);
    });
  }

  function syncScoringTip() {
    els.scoringTip.textContent = selectedProvinces.length
      ? "已选 " + selectedProvinces.length + " 份：" + selectedProvinces.join("、") +
        "。完整表格会注入提示词，生成界面顶部可展开查看。"
      : "至少选一份评分标准，AI 才知道该按什么尺度写。";
  }

  on(els.scoringGrid, "click", function (e) {
    var card = e.target.closest(".scoring-card");
    if (!card) return;
    var prov = card.getAttribute("data-province");
    var at = selectedProvinces.indexOf(prov);
    if (at >= 0) {
      if (selectedProvinces.length === 1) {
        setWizardStatus("至少要留一份评分标准。", "error");
        return;
      }
      selectedProvinces.splice(at, 1);
    } else {
      if (selectedProvinces.length >= 3) {
        setWizardStatus("最多同时选 3 份，选太多会稀释 AI 的注意力。", "error");
        return;
      }
      selectedProvinces.push(prov);
    }
    card.classList.toggle("selected", selectedProvinces.indexOf(prov) >= 0);
    syncScoringTip();
  });

  buildScoringCards();
  syncScoringTip();

  /* 评分区：把所选省份的表格渲染到生成界面顶部 */
  function renderScoreTables() {
    var list = activeProvinces.length ? activeProvinces : selectedProvinces;
    els.scoreChips.innerHTML = "";
    els.scoreTables.innerHTML = "";
    list.forEach(function (prov) {
      var s = window.WY_SCORING[prov];
      if (!s) return;

      var chip = document.createElement("span");
      chip.className = "score-chip";
      chip.textContent = prov + " " + s.total + "分";
      els.scoreChips.appendChild(chip);

      var box = document.createElement("div");
      box.className = "score-table-box";
      var h = document.createElement("div");
      h.className = "score-table-head";
      h.textContent = prov + "（总分 " + s.total + " 分）";
      box.appendChild(h);

      function table(cols, rows) {
        var t = document.createElement("table");
        t.className = "score-table";
        var thead = document.createElement("thead");
        var tr = document.createElement("tr");
        cols.forEach(function (c) {
          var th = document.createElement("th");
          th.textContent = c;
          tr.appendChild(th);
        });
        thead.appendChild(tr);
        t.appendChild(thead);
        var tb = document.createElement("tbody");
        rows.forEach(function (r) {
          var row = document.createElement("tr");
          r.forEach(function (cell, i) {
            var td = document.createElement("td");
            td.textContent = cell;
            if (i === 0) td.className = "score-table-key";
            row.appendChild(td);
          });
          tb.appendChild(row);
        });
        t.appendChild(tb);
        return t;
      }

      box.appendChild(table(["维度", "分值", "要求"], s.dims));
      box.appendChild(table(["档次", "分数", "要求"], s.bands));
      if (s.notes) {
        var note = document.createElement("div");
        note.className = "score-table-note";
        note.textContent = "扣分与降档：" + s.notes;
        box.appendChild(note);
      }
      els.scoreTables.appendChild(box);
    });
  }

  function setScoreOpen(open) {
    if (open) els.scoreBody.removeAttribute("hidden");
    else els.scoreBody.setAttribute("hidden", "");
    els.scoreToggle.setAttribute("aria-expanded", String(!!open));
    els.scoreCaret.textContent = open ? "收起表格" : "展开表格";
  }

  /* ---------------- 向导：示例题目 ---------------- */

  on(els.topicExamples, "click", function (e) {
    var btn = e.target.closest("[data-topic]");
    if (!btn) return;
    els.topic.value = btn.getAttribute("data-topic");
    els.topic.focus();
    updateSteps();
    setWizardStatus("已填入示例" + (selectedCat === "自拟" ? "题材" : "题目") + "，可直接开始生成。", "");
  });

  on(els.topic, "input", updateSteps);

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
      // 点符号 -> 稿纸下方固定批注条（不占行内空间、不遮正文）
      span.addEventListener("click", function (e) {
        e.stopPropagation();
        var was = span.classList.contains("active");
        clearActiveMarks();
        if (was) { hideInkDock(); return; }
        span.classList.add("active");
        showInkDock(it.mark.id);
      });
      pos = it.end;
    });
    if (pos < paraText.length) appendPlainWithHighlights(el, paraText.slice(pos));
    return el;
  }

  // 用 docTitle/docBody 重渲染稿纸（带修改符号），不依赖 fullText
  function findMark(id) {
    for (var i = 0; i < annotations.length; i++) {
      if (annotations[i].id === id) return annotations[i];
    }
    return null;
  }

  function showInkDock(markId) {
    var m = findMark(markId);
    if (!m || !els.inkDock) return;
    els.inkDock.setAttribute("data-mark-id", String(markId));
    els.inkDockNo.textContent = String(m.no);
    els.inkDockWhy.textContent = (SYMBOL_LABEL[m.type] || "批注") + "：" +
      (m.reason || "（这条没写原因）");
    els.inkDock.hidden = false;
  }

  function hideInkDock() {
    if (!els.inkDock) return;
    els.inkDock.hidden = true;
    els.inkDock.removeAttribute("data-mark-id");
  }

  function clearActiveMarks() {
    var list = els.paperBody.querySelectorAll(".ink-mark.active");
    for (var i = 0; i < list.length; i++) list[i].classList.remove("active");
  }

  /* 段落高度必须落在整格上，否则每段累积零点几像素，越往下字越歪 */
  function alignPaperGrid() {
    var body = els.paperBody;
    if (!body || body.classList.contains("paper-empty")) return;
    var cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell")) || 36;
    var cs = getComputedStyle(body);
    var padL = parseFloat(cs.paddingLeft) || 0;
    var borderBox = cs.boxSizing === "border-box";
    // 正文宽度取整格，行尾不留半格，格子线与字才对得齐
    body.style.width = "";
    var avail = body.clientWidth;
    var cols = Math.floor((borderBox ? avail - padL : avail) / cell);
    if (cols >= 4) {
      var want = cols * cell + (borderBox ? padL : 0);
      if (Math.abs(avail - want) > 0.5) body.style.width = want + "px";
    }
    var ps = body.querySelectorAll("p");
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      p.style.height = "";
      var h = p.getBoundingClientRect().height;
      var rows = Math.max(1, Math.round(h / cell));
      var want = rows * cell;
      if (Math.abs(h - want) > 0.4) p.style.height = want + "px";
      p.style.marginBottom = cell + "px";
    }
  }

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
    alignPaperGrid();
    hideInkDock();
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

  /* ---------------- 对话气泡（按角色区分） ---------------- */

  var ROLE_CLASS = {
    "你": "role-user",
    "大纲助教": "role-outline",
    "批改老师": "role-annot",
    "讲评老师": "role-explain",
    "评改": "role-critic",
    "文芽": "role-ai"
  };

  function addUserBubble(text, role) {
    if (els.contextEmpty) { els.contextEmpty.remove(); els.contextEmpty = null; }
    var b = document.createElement("div");
    b.className = "bubble user";
    var label = document.createElement("div");
    label.className = "bubble-label";
    label.textContent = role || "你";
    var t = document.createElement("div");
    t.className = "bubble-text";
    t.textContent = text;
    b.appendChild(label);
    b.appendChild(t);
    els.contextList.appendChild(b);
    els.contextList.scrollTop = els.contextList.scrollHeight;
    return t;
  }

  function addAssistantBubble(role) {
    var name = role || "文芽";
    if (els.contextEmpty) { els.contextEmpty.remove(); els.contextEmpty = null; }
    var b = document.createElement("div");
    b.className = "bubble ai " + (ROLE_CLASS[name] || "role-ai");
    var label = document.createElement("div");
    label.className = "bubble-label";
    label.textContent = name;
    var t = document.createElement("div");
    t.className = "bubble-text";
    b.appendChild(label);
    b.appendChild(t);
    els.contextList.appendChild(b);
    els.contextList.scrollTop = els.contextList.scrollHeight;
    return t;
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

  function outlineHasContent() {
    return (outline.points || []).some(function (p) { return trim(p.text) || trim(p.label); });
  }

  function outlineStore() {
    if (!outlineHasContent()) return "";
    return JSON.stringify({
      title: outline.title || "",
      thesis: outline.thesis || "",
      note: outline.note || "",
      points: (outline.points || []).map(function (p) {
        return { label: p.label || "", text: p.text || "" };
      })
    });
  }

  function essayPayload() {
    return {
      id: currentEssayId || 0,
      title: docTitle || outline.title || activeTopic || "作文",
      body: currentComposition || docBody || "",
      outline: outlineStore(),
      category: activeCat || selectedCat || "",
      province: (activeProvinces.length ? activeProvinces : selectedProvinces).join("、"),
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
    if (!t) return;
    if (!docBody.trim() && !outlineHasContent()) return;
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
    var hasOutline = (outline.points || []).some(function (p) { return trim(p.text); });
    els.writeEssayBtn.disabled = busy || !hasOutline;
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

  function provinceList() {
    var list = (activeProvinces && activeProvinces.length) ? activeProvinces : selectedProvinces;
    return list && list.length ? list : ["全国卷（通用）"];
  }

  function scoringText() {
    return (window.WY_SCORING_ALL ? window.WY_SCORING_ALL(provinceList()) : "") || "";
  }

  /* 统一包裹：作文原文：{...} / 用户提问：{...}
     花括号是为了让模型明确知道边界在哪，不会把提问当成正文的一部分。 */
  function wrapEssay() {
    return "作文原文：{\n" + (currentComposition || docBody || "（还没有正文）") + "\n}";
  }

  function wrapAsk(req) {
    return "用户提问：{\n" + req + "\n}";
  }

  function outlineJSON() {
    return JSON.stringify({
      title: outline.title || "",
      thesis: outline.thesis || "",
      points: (outline.points || []).map(function (p) { return { label: p.label || "", text: p.text || "" }; }),
      note: outline.note || ""
    }, null, 2);
  }

  function wrapOutline() {
    return "当前大纲：{\n" + outlineJSON() + "\n}";
  }

  function composeOutlineUser(isEdit, req) {
    var lines = [];
    lines.push("【本次作文类别】" + activeCatName());
    var rule = categoryRule();
    if (rule) lines.push(rule);
    lines.push("【题目 / 题材（用户原话，按上面的类别规则处理）】\n" + (activeTopic || els.topic.value.trim()));
    if (els.extra.value.trim()) lines.push("【额外要求】" + els.extra.value.trim());
    lines.push("【目标字数（含标点）】约 " + wordCount + " 字。大纲的段落数量要与这个字数匹配，不要按 300 字写大纲却要求写 1200 字。");
    var st = scoringText();
    if (st) lines.push(st);
    if (isEdit) {
      lines.push(wrapOutline());
      lines.push(wrapAsk(req));
      lines.push("\n按系统提示输出修改后的完整大纲 JSON。");
    } else {
      lines.push("\n现在只输出大纲 JSON，不要写正文。");
    }
    return lines.join("\n\n");
  }

  function composeWriteUser() {
    var lines = [];
    lines.push("【本次作文类别】" + activeCatName());
    var rule = categoryRule();
    if (rule) lines.push(rule);
    lines.push("【题目 / 题材（用户原话，按上面的类别规则处理）】\n" + (activeTopic || els.topic.value.trim()));
    if (els.extra.value.trim()) lines.push("【额外要求】" + els.extra.value.trim());
    lines.push("【目标字数（含标点）】约 " + wordCount + " 字，正文尽量逼近，宁可少写不可硬凑。");
    var st = scoringText();
    if (st) lines.push(st);
    lines.push("【本次大纲（已由用户确认，必须照着写）】\n" + outlineJSON());
    lines.push("\n这是首次生成，请直接输出「===作文===」和作文正文，不用写「回应」部分。正文必须落实上面大纲里每一段的人物、器物、动作，不得另起炉灶。严格按系统提示的写作铁律、本类别的标题与扣题规则、以及上述评分标准执行。");
    return lines.join("\n");
  }

  function composeReviseUser(req) {
    var lines = [];
    lines.push("【本次作文类别】" + activeCatName());
    var rule = categoryRule();
    if (rule) lines.push(rule + "\n- 批注同样受本类别的标题规则约束：命题不得改题；半命题不得更换已补好的词；自拟不得换成口号式标题。anchor 不要取标题。");
    var st = scoringText();
    if (st) lines.push(st);
    lines.push(wrapEssay());
    lines.push(wrapAsk(req));
    lines.push("按系统提示输出批注 JSON：只标出该改的几处，不要输出修改后的完整作文。anchor 必须逐字取自上面「作文原文」的正文，且在正文里唯一，不要取标题。");
    return lines.join("\n\n");
  }

  function composeExplainUser(req) {
    var lines = [];
    lines.push("【本次作文类别】" + activeCatName());
    var st = scoringText();
    if (st) lines.push(st);
    lines.push(wrapEssay());
    lines.push(wrapAsk(req));
    lines.push("学生这次只想弄明白问题，不想动稿。按系统提示只做讲评：不要改作文，不要给替换句，不要输出批注 JSON。");
    return lines.join("\n\n");
  }

  function composeCriticUser() {
    var lines = [];
    lines.push("【本次作文类别】" + activeCatName());
    var st = scoringText();
    if (st) lines.push(st);
    lines.push(wrapEssay());
    lines.push("用户提问：{\n按上面的尺度逐句判好坏与 AI 味，以坏为主。\n}");
    return lines.join("\n\n");
  }

  async function runStream(systemPrompt, userContent, opts) {
    opts = opts || {};
    var c = currentConfig();
    controller = new AbortController();
    fullText = "";
    setBusy(true);

    function onChunk(d) {
      fullText += d;
      if (opts.onProgress) opts.onProgress(fullText);
      else updateOutput(true);
    }

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
        await consumeStream(res, onChunk);
        got = !!fullText;
      } else {
        var j = await res.json();
        if (j.error) throw new Error(j.error.message || "接口返回错误");
        var msg = j.choices && j.choices[0] && j.choices[0].message;
        fullText = (msg && msg.content) || "";
        got = true;
        onChunk("");
      }

      if (!got || !fullText.trim()) throw new Error("接口没有返回内容，换一个模型或检查额度。");
      if (!opts.onProgress) { updateOutput(false); cacheComposition(); }
      return true;

    } catch (e) {
      if (e && e.name === "AbortError") {
        if (!opts.onProgress) { updateOutput(false); cacheComposition(); }
        setPaperHint("已停止，保留已生成的部分。");
        return false;
      }
      var msg = (e && e.message) || "未知错误";
      if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
        msg = "请求发不出去：多为浏览器跨域被拦或网络不通。换支持 CORS 的接口，或改用本地代理。";
      }
      setPaperHint("生成失败：" + msg);
      if (!opts.onProgress) updateOutput(false);
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

  /* ---------------- 大纲：解析、渲染、编辑 ---------------- */

  function newPoint(label, text) {
    return { label: label || "", text: text || "" };
  }

  function parseOutlineJSON(raw) {
    var s = trim(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("模型没有返回大纲 JSON，可点「让 AI 增补」再试一次。");
    var obj;
    try { obj = JSON.parse(s.slice(a, b + 1)); }
    catch (e) { throw new Error("大纲 JSON 解析失败，可重试或换个更擅长结构化输出的模型。"); }
    var points = Array.isArray(obj.points) ? obj.points : [];
    return {
      title: trim(obj.title),
      thesis: trim(obj.thesis),
      note: trim(obj.note),
      points: points.slice(0, 12).map(function (p) {
        if (typeof p === "string") return newPoint("", p);
        return newPoint(trim(p && p.label), trim(p && p.text));
      }).filter(function (p) { return p.text || p.label; })
    };
  }

  /* JSON 解析失败时的兜底：把普通文本大纲拆成可编辑条目，绝不让大纲区变成只能看不能动的死块 */
  function parseOutlineLoose(raw) {
    var text = trim(raw).replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "");
    text = text.replace(/^===大纲===\s*/i, "");
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var title = "";
    var thesis = "";
    var points = [];
    var labelRe = /^(?:[0-9０-９]{1,2}[.、)）]|[一二三四五六七八九十]+[、.]|（[一二三四五六七八九十0-9]+）|\([0-9]+\))\s*/;
    var labelOnly = /^(开头|起笔|起手|缘起|开端|主体|中间|发展|高潮|转折|结尾|收束|收尾|落点)[:：]?\s*$/;

    lines.forEach(function (line) {
      var m = /^(标题|题目|拟题)\s*[:：]\s*(.+)$/.exec(line);
      if (m) { title = m[2].trim(); return; }
      var t = /^(立意|主旨|内核)\s*[:：]\s*(.+)$/.exec(line);
      if (t) { thesis = t[2].trim(); return; }
      if (/^(备注|提醒|注意)\s*[:：]/.test(line)) return;

      var label = "";
      var body = line;
      var bm = /^[【\[](.{1,8})[】\]]\s*(.*)$/.exec(line);
      if (bm) { label = bm[1]; body = bm[2]; }
      else if (labelRe.test(line)) {
        body = line.replace(labelRe, "");
        var lm = /^(.{1,8}?)[:：]\s*(.+)$/.exec(body);
        if (lm) { label = lm[1]; body = lm[2]; }
      } else if (labelOnly.test(line)) {
        label = line.replace(/[:：]/g, "");
        body = "";
      }
      points.push(newPoint(label, body.trim()));
    });

    // 还拆不出来就整段塞一条，至少能编辑
    if (!points.length && text.trim()) points = [newPoint("", text.trim())];
    return { title: title, thesis: thesis, note: "", points: points.slice(0, 12) };
  }

  function parseOutlineAny(raw) {
    try { return parseOutlineJSON(raw); }
    catch (e) {
      var loose = parseOutlineLoose(raw);
      if (!loose.points.length) throw e;
      return loose;
    }
  }

  function syncOutlineFromDOM() {
    outline.title = els.outlineTitle.value;
    outline.thesis = els.outlineThesis.value;
    var rows = els.outlinePoints.querySelectorAll(".outline-point");
    var pts = [];
    rows.forEach(function (row) {
      pts.push(newPoint(row.querySelector(".op-label").value, row.querySelector(".op-text").value));
    });
    outline.points = pts;
    els.writeEssayBtn.disabled = !outline.points.some(function (p) { return trim(p.text); });
    scheduleEssaySave();
  }

  function autoGrow(ta) {
    ta.style.height = "auto";
    ta.style.height = Math.min(220, ta.scrollHeight) + "px";
  }

  function renderOutline() {
    els.outlineTitle.value = outline.title || "";
    els.outlineThesis.value = outline.thesis || "";
    els.outlinePoints.innerHTML = "";
    if (!outline.points.length) {
      var empty = document.createElement("div");
      empty.className = "outline-empty";
      empty.textContent = "还没有大纲条目。可以点「＋ 添加一段」自己写，或点「让 AI 增补」。";
      els.outlinePoints.appendChild(empty);
      els.writeEssayBtn.disabled = true;
      return;
    }
    outline.points.forEach(function (p, i) {
      els.outlinePoints.appendChild(buildOutlineRow(p, i));
    });
    els.writeEssayBtn.disabled = !outline.points.some(function (p) { return trim(p.text); });
    updateWriteBtn();
  }

  function buildOutlineRow(p, i) {
    var row = document.createElement("div");
    row.className = "outline-point";

    var head = document.createElement("div");
    head.className = "op-head";
    var no = document.createElement("span");
    no.className = "op-no";
    no.textContent = String(i + 1);
    var label = document.createElement("input");
    label.className = "op-label";
    label.value = p.label || "";
    label.placeholder = "段名";
    label.setAttribute("maxlength", "12");
    var del = document.createElement("button");
    del.type = "button";
    del.className = "op-del";
    del.textContent = "删除";
    del.addEventListener("click", function () {
      syncOutlineFromDOM();
      outline.points.splice(i, 1);
      renderOutline();
    });
    head.appendChild(no);
    head.appendChild(label);
    head.appendChild(del);

    var ta = document.createElement("textarea");
    ta.className = "op-text";
    ta.value = p.text || "";
    ta.placeholder = "这一段写谁、在哪、做什么，出现什么器物或哪句人物原话";
    ta.addEventListener("input", function () { autoGrow(ta); syncOutlineFromDOM(); });

    row.appendChild(head);
    row.appendChild(ta);
    setTimeout(function () { autoGrow(ta); }, 0);
    return row;
  }

  function setOutline(obj) {
    outline = {
      title: obj.title || outline.title || "",
      thesis: obj.thesis || "",
      note: obj.note || "",
      points: (obj.points && obj.points.length) ? obj.points : outline.points
    };
    renderOutline();
    scheduleEssaySave();
    if (outline.note) setDocHint("大纲提醒：" + outline.note);
  }

  function switchPane(name) {
    var paper = name === "paper";
    els.outlinePane.hidden = paper;
    els.paperPane.hidden = !paper;
    if (els.criticDock) {
      els.criticDock.hidden = !paper || !criticItems.length || criticDockClosed;
    }
    els.docTabs.querySelectorAll(".doc-tab").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-pane") === name);
    });
    if (paper) {
      els.docTabHint.textContent = stage === "draft"
        ? "手批的朱红符号在稿纸上，点旁边的「采纳」才动字"
        : "正文还没写，先回大纲改好再开始";
      els.paperPane.scrollTop = 0;
    } else {
      els.docTabHint.textContent = stage === "draft"
        ? "大纲可继续改，改完点「按大纲重写」"
        : "大纲可以先改、可以增补，再开始写";
    }
    if (paper) renderAnnotated();
  }

  function setDocHint(msg) {
    if (msg) els.docTabHint.textContent = msg;
  }

  /* ---------------- 从控制台回到写作台：恢复一篇云端作文 ---------------- */

  var RESUME_KEY = "wy.resume.v1";
  var API_BASE = "https://back.wenyazw.top";

  // 存下来的 body 是「标题 + 空行 + 正文」，这里拆回去
  function splitStoredEssay(text) {
    var src = String(text || "").replace(/\r/g, "").replace(/^\n+/, "");
    if (!src.trim()) return { title: "", body: "" };
    var i = src.indexOf("\n");
    var first = (i >= 0 ? src.slice(0, i) : src).trim();
    var rest = i >= 0 ? src.slice(i + 1).replace(/^\n+/, "") : "";
    var isTitle = first && first.length <= 40 && !/[。！？；.!?]$/.test(first);
    if (!isTitle) return { title: "", body: src };
    return {
      title: first.replace(/^#+\s*/, "").replace(/[《》]/g, "").trim(),
      body: rest
    };
  }

  function resumeProvinceList(str) {
    var all = String(str || "").split(/[、,，]/).map(trim).filter(Boolean);
    var ok = all.filter(function (p) { return window.WY_SCORING && window.WY_SCORING[p]; });
    return ok.length ? ok : selectedProvinces.slice();
  }

  async function fetchEssayDetail(id) {
    var t = authToken();
    if (!t || !id) return null;
    try {
      var res = await fetch(API_BASE + "/api/essays/" + encodeURIComponent(id), {
        headers: { "Authorization": "Bearer " + t }
      });
      var j = await res.json();
      if (res.ok && j && j.ok && j.essay) return j.essay;
    } catch (e) { /* 离线则交给上层提示 */ }
    return null;
  }

  function applyResumedEssay(data) {
    if (!data) return false;

    currentEssayId = data.id || null;
    activeCat = data.category || "";
    activeTopic = data.title || "";
    activeProvinces = resumeProvinceList(data.province);

    var parts = splitStoredEssay(data.body || "");
    docTitle = (data.title || parts.title || "作文").trim();
    docBody = parts.body || "";
    currentComposition = docBody.trim() ? (docTitle + "\n\n" + docBody) : "";

    var ol = null;
    try { ol = data.outline ? JSON.parse(data.outline) : null; } catch (e) { ol = null; }
    var pts = (ol && Array.isArray(ol.points)) ? ol.points : [];
    outline = {
      title: (ol && ol.title) || docTitle || "",
      thesis: (ol && ol.thesis) || "",
      note: (ol && ol.note) || "",
      points: pts.map(function (p) { return newPoint(p && p.label, p && p.text); })
    };

    stage = docBody.trim() ? "draft" : "outline";

    annotations = []; annotSeq = 0; annotPanelEl = null;
    prevAcceptedTexts = []; roundAcceptedTexts = [];
    criticItems = [];
    els.criticList.innerHTML = "";
    els.criticStat.textContent = "逐句判好坏与 AI 味，不给总分的空头评价。";
    syncAnnotTools();
    setChatMode("annotate");

    els.wizard.setAttribute("hidden", "");
    els.studio.removeAttribute("hidden");
    document.body.classList.add("studio-mode");

    els.studioMeta.textContent = [
      activeCat ? "类别：" + activeCat : "",
      "题目：" + (docTitle || "作文"),
      activeProvinces.join("、"),
      "已存档"
    ].filter(Boolean).join(" ｜ ");

    renderScoreTables();
    setScoreOpen(false);
    renderOutline();
    updateWriteBtn();

    if (els.contextEmpty) { els.contextEmpty.remove(); els.contextEmpty = null; }
    els.contextList.innerHTML = "";

    addUserBubble("从控制台打开《" + (docTitle || "作文") + "》继续改", "你");
    if (stage === "draft") {
      switchPane("paper");
      renderAnnotated();
      setDocHint("已载入云端稿 · 直接提问就是手批改稿");
      addAssistantBubble("文芽").textContent =
        "已载入《" + docTitle + "》。接着改就行：直接提要求会出朱红批注，选「只问不改」则只讲不动字。";
    } else {
      switchPane("outline");
      showEmpty();
      setDocHint("这篇只存了大纲 · 改完点「确认大纲，开始写正文」");
      addAssistantBubble("文芽").textContent =
        "这篇当时只存了大纲，还没写正文。大纲可以继续改，确认后点右下开始写。";
    }
    setPaperHint("");
    return true;
  }

  async function tryResumeEssay() {
    var q, want = "";
    try {
      q = new URLSearchParams(location.search || "");
      want = q.get("essay") || (q.get("resume") ? "1" : "");
    } catch (e) { return; }
    if (!want) return;

    var data = null;
    try {
      var raw = localStorage.getItem(RESUME_KEY);
      if (raw) {
        var box = JSON.parse(raw);
        var e0 = box && box.essay;
        if (e0 && (want === "1" || String(e0.id) === String(want))) data = e0;
      }
    } catch (e) { data = null; }
    try { localStorage.removeItem(RESUME_KEY); } catch (e) { /* ignore */ }

    if (!data) data = await fetchEssayDetail(want === "1" ? "" : want);

    try {
      if (history.replaceState) history.replaceState(null, "", location.pathname);
    } catch (e) { /* ignore */ }

    if (!data) {
      setWizardStatus("没能取回这篇作文：登录状态可能过期了，重新登录后再从控制台打开。", "error");
      return;
    }
    applyResumedEssay(data);
  }

  /* ---------------- 入口 1：开始生成（先写大纲） ---------------- */

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
    activeProvinces = selectedProvinces.slice();

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
    criticItems = [];
    outline = { title: "", thesis: "", points: [], note: "" };
    stage = "outline";
    setChatMode("annotate");
    els.criticList.innerHTML = "";
    els.criticStat.textContent = "逐句判好坏与 AI 味，不给总分的空头评价。";
    syncAnnotTools();
    if (els.contextEmpty) { els.contextEmpty.remove(); els.contextEmpty = null; }
    els.contextList.innerHTML = "";

    var summary = "类别：" + selectedCat + " ｜ 题目：" + els.topic.value.trim().slice(0, 30) +
      (els.topic.value.trim().length > 30 ? "…" : "") + " ｜ 约 " + wordCount + " 字 ｜ " + activeProvinces.join("、");
    els.studioMeta.textContent = summary;

    els.wizard.setAttribute("hidden", "");
    els.studio.removeAttribute("hidden");
    document.body.classList.add("studio-mode");

    renderScoreTables();
    setScoreOpen(false);
    renderOutline();
    switchPane("outline");
    showEmpty();
    setDocHint("正在拟大纲…");

    addUserBubble(summary, "你");
    var hint = addAssistantBubble("大纲助教");
    hint.textContent = "正在拟大纲…";
    assistantReplyEl = hint;
    setPaperHint("正在拟大纲…");

    var sys = window.WY_OUTLINE;
    var rule = categoryRule();
    if (rule) sys += "\n\n" + rule;
    var ok = await runStream(sys, composeOutlineUser(false), {
      onProgress: function (t) {
        if (assistantReplyEl) assistantReplyEl.textContent = "正在拟大纲…已写 " + t.length + " 字";
      }
    });
    setPaperHint("");
    if (!ok || !trim(fullText)) {
      if (assistantReplyEl) assistantReplyEl.textContent = "大纲没生成出来，看右上角提示；可点「让 AI 增补」重试，或检查接口配置。";
      setDocHint("大纲生成失败，可重试");
      return;
    }
    if (assistantReplyEl) {
      var got = fullText;
      var strict = true;
      try {
        try { var obj = parseOutlineJSON(got); }
        catch (e1) { strict = false; obj = parseOutlineLoose(got); }
        setOutline(obj);
        assistantReplyEl.textContent = strict
          ? "大纲拟好了，可直接改每一条，或在下面提问让我增补。确认无误点右下「确认大纲，开始写正文」。"
          : "模型这次没按 JSON 返回，已按行拆成可编辑的大纲条目，可以先改再写。";
        setDocHint("大纲可改 · 点「确认大纲，开始写正文」再出稿");
        switchPane("outline");
      } catch (e) {
        assistantReplyEl.textContent = "大纲没生成出来，点「重新拟大纲」或直接在右侧手写几条。";
        setDocHint(e.message || "大纲解析失败");
        renderOutline();
      }
    }
  }

  /* ---------------- 入口 2：按大纲写正文 ---------------- */

  async function generateEssay() {
    if (!currentConfig().key) { setPaperHint("接口未配置，先回工作台填好。"); return; }
    syncOutlineFromDOM();
    if (!outline.points.some(function (p) { return trim(p.text); })) {
      setDocHint("先写几条大纲，再让 AI 写正文。");
      return;
    }
    var c = currentConfig();
    if (!c.base || !c.key || !c.model) { setPaperHint("接口未配置，先回工作台填好。"); return; }

    if (stage === "draft" && !confirm("已经有一篇正文了，按当前大纲重写会覆盖现有稿纸（可通过重新生成前先复制保留）。继续吗？")) return;

    addUserBubble("按大纲开始写正文。", "你");
    assistantReplyEl = null;                       // 生成正文时不显示回应气泡
    switchPane("paper");
    showEmpty();
    setDocHint("正文生成中…");
    setPaperHint("正在生成…");

    var sys = window.WY_PROMPT;
    var rule = categoryRule();
    if (rule) sys += "\n\n" + rule;
    var st = scoringText();
    if (st) sys += "\n\n" + st;

    var ok = await runStream(sys, composeWriteUser());
    if (ok && docBody.trim()) {
      stage = "draft";
      updateWriteBtn();
      setChatMode(chatMode);
      switchPane("paper");
      setDocHint("正文已生成 · 左上可切回大纲");
      saveEssayToCloud();
      scheduleEssaySave();
    } else {
      setDocHint("正文没生成出来，可再点一次「按大纲开始写」");
    }
  }

  /* ---------------- 入口 3：发送（按阶段与模式分派） ---------------- */

  function setChatMode(mode) {
    chatMode = mode === "explain" ? "explain" : "annotate";
    els.chatMode.querySelectorAll(".chat-mode-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-mode") === chatMode);
      b.disabled = stage === "outline";
    });
    if (stage === "outline") {
      els.chatModeHint.textContent = "大纲阶段：提问会直接改大纲，不会动正文";
      els.chatInput.placeholder = "例：第二段换成徒弟偷偷换釉料；再加一段写验收时老师傅的反应";
    } else if (chatMode === "explain") {
      els.chatModeHint.textContent = "只讲不改：不动一个字，不出批注";
      els.chatInput.placeholder = "例：为什么结尾这句算空泛？我该怎么想这一段";
    } else {
      els.chatModeHint.textContent = "手批改稿：朱红批注逐条采纳";
      els.chatInput.placeholder = "例：把开头再写细一点 / 结尾加一句老师傅的原话";
    }
  }

  function updateWriteBtn() {
    els.writeEssayBtn.textContent = stage === "draft" ? "按大纲重写正文" : "确认大纲，开始写正文";
  }

  // 用户明确说了「别动稿」时，即使停在手批模式也走只讲不改，避免模型硬改几处交差
  function wantsExplainOnly(req) {
    var s = String(req || "").replace(/\s/g, "");
    return /不要改|别改|不用改|不许改|不要动|别动|不要重写|别重写|不需要改|先别改|只解释|只说明|只讲|只点评|只想问|只想知道/.test(s);
  }

  async function handleSend() {
    var req = els.chatInput.value.trim();
    if (!req) { setPaperHint("先写下你的问题，再发送。"); els.chatInput.focus(); return; }

    if (stage === "outline") { await askOutline(req); return; }
    if (!currentComposition && !docBody) { setPaperHint("还没有正文，先按大纲写一篇。"); return; }

    if (chatMode === "explain") { await askExplain(req); return; }
    if (wantsExplainOnly(req)) {
      await askExplain(req, "你说了不让动稿，这次只讲不改。");
      return;
    }
    await sendRevision(req);
  }

  /* 大纲阶段提问：只改大纲 */
  async function askOutline(req) {
    var c = currentConfig();
    if (!c.base || !c.key || !c.model) { setDocHint("接口未配置，先回工作台填好。"); return; }

    addUserBubble(req);
    els.chatInput.value = "";
    assistantReplyEl = addAssistantBubble("大纲助教");
    assistantReplyEl.textContent = "正在改大纲…";
    setDocHint("正在改大纲…");

    var sys = window.WY_OUTLINE_EDIT;
    var rule = categoryRule();
    if (rule) sys += "\n\n" + rule;

    try {
      var res = await fetchAnnotation(sys, composeOutlineUser(true, req));
      var obj = parseOutlineAny(res);
      setOutline(obj);
      assistantReplyEl.textContent = outline.note ? ("大纲已更新。" + outline.note) : "大纲已更新，可继续改或在右侧直接编辑。";
      setDocHint("大纲已更新 · 可直接改条目");
      switchPane("outline");
    } catch (e) {
      var msg = (e && e.message) || "未知错误";
      if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
        msg = "请求发不出去：多为浏览器跨域被拦或网络不通。";
      }
      assistantReplyEl.textContent = "大纲没改成：" + msg;
      setDocHint("大纲更新失败");
    }
  }

  /* 只问不改 */
  async function askExplain(req, pre) {
    var c = currentConfig();
    if (!c.base || !c.key || !c.model) { setDocHint("接口未配置，先回工作台填好。"); return; }
    if (!currentComposition && !docBody) { setDocHint("还没有正文，先按大纲写一篇。"); return; }

    addUserBubble(req);
    els.chatInput.value = "";
    if (pre) addAssistantBubble("讲评老师").textContent = pre;
    var bubble = addAssistantBubble("讲评老师");
    bubble.textContent = "正在读稿…";
    setDocHint("讲评中：不会改动正文");
    assistantReplyEl = null;

    var sys = window.WY_EXPLAIN;
    var rule = categoryRule();
    if (rule) sys += "\n\n" + rule;

    var ok = await runStream(sys, composeExplainUser(req), {
      onProgress: function (t) { bubble.textContent = t; }
    });
    if (ok) {
      setDocHint("讲评完成 · 稿纸未改动");
    } else {
      bubble.textContent = bubble.textContent === "正在读稿…" ? "讲评没出来，可再发一次。" : bubble.textContent;
      setDocHint("讲评中断，稿纸未改动");
    }
  }

  /* 手批改稿 */
  async function sendRevision(req) {
    var c = currentConfig();
    if (!c.base || !c.key || !c.model) {
      setPaperHint("接口未配置，先回工作台填好。");
      return;
    }

    addUserBubble(req);
    els.chatInput.value = "";
    assistantReplyEl = addAssistantBubble("批改老师");
    if (assistantReplyEl) assistantReplyEl.textContent = "正在读稿、写批注…";
    setPaperHint("批改老师正在读稿…");

    var sys = window.WY_ANNOTATOR;
    var rule = categoryRule();
    if (rule) sys += "\n\n" + rule;
    var st = scoringText();
    if (st) sys += "\n\n" + st;

    try {
      var raw = await fetchAnnotation(sys, composeReviseUser(req));
      var obj = parseAnnotJSON(raw);
      // 上一轮采纳的改动从这一轮起标黄；本轮新采纳的留到下一轮才标
      prevAcceptedTexts = roundAcceptedTexts.slice();
      roundAcceptedTexts = [];
      annotations = normalizeMarks(obj);
      // 新一轮批注：移除上一轮面板（正文已采纳的改动仍生效），在对话底部重建
      if (annotPanelEl) { annotPanelEl.remove(); annotPanelEl = null; }
      if (assistantReplyEl) assistantReplyEl.textContent = trim(obj.reply) || "已批注，看稿纸上的朱红标注逐条决定。";
      renderAnnotated();                  // 稿纸上标出朱红修改符号
      renderAnnotPanel();                 // 左侧列出可采纳/忽略的批注
      switchPane("paper");
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

  /* ---------------- AI 评改：逐句判好坏与 AI 味 ---------------- */

  function parseCriticJSON(raw) {
    var s = trim(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("评改没有返回 JSON，换个模型再试。");
    var obj;
    try { obj = JSON.parse(s.slice(a, b + 1)); }
    catch (e) { throw new Error("评改 JSON 解析失败，可重试。"); }
    var items = Array.isArray(obj.items) ? obj.items : [];
    return {
      overall: trim(obj.overall),
      items: items.slice(0, 14).map(function (it, i) {
        return {
          no: parseInt(it && it.no, 10) || (i + 1),
          sentence: trim(it && it.sentence),
          verdict: trim(it && it.verdict) === "好" ? "好" : "坏",
          reason: trim(it && it.reason),
          ai: !!(it && it.ai),
          aiWhy: trim(it && it.aiWhy),
          fix: trim(it && it.fix)
        };
      }).filter(function (it) { return it.sentence; })
    };
  }

  // 点评改条目，滚到稿纸里那句并短暂高亮
  function focusSentence(sentence) {
    var needle = trim(sentence).slice(0, 24);
    if (!needle) return;
    var paras = els.paperBody.querySelectorAll("p");
    for (var i = 0; i < paras.length; i++) {
      if ((paras[i].textContent || "").indexOf(needle) >= 0) {
        var el = paras[i];
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("para-focus");
        setTimeout(function () { el.classList.remove("para-focus"); }, 1800);
        return;
      }
    }
    setDocHint("这句在稿纸里没找到，可能已经被改掉了");
  }

  function renderCritic() {
    els.criticList.innerHTML = "";
    if (!criticItems.length) {
      if (els.criticDock) els.criticDock.hidden = true;
      return;
    }
    criticDockClosed = false;
    if (els.criticDock) els.criticDock.hidden = els.paperPane.hidden;
    var bad = criticItems.filter(function (x) { return x.verdict === "坏"; }).length;
    var aiCnt = criticItems.filter(function (x) { return x.ai; }).length;
    els.criticStat.textContent = "共 " + criticItems.length + " 句：坏 " + bad + " 句，带 AI 味 " + aiCnt + " 句";
    criticItems.forEach(function (it) {
      var card = document.createElement("div");
      card.className = "critic-card verdict-" + (it.verdict === "好" ? "good" : "bad");
      card.title = "点一下定位到稿纸里这句话";
      (function (sentence) {
        card.addEventListener("click", function () { focusSentence(sentence); });
      })(it.sentence);

      var top = document.createElement("div");
      top.className = "critic-top";
      var no = document.createElement("span");
      no.className = "critic-no";
      no.textContent = "#" + it.no;
      var verdict = document.createElement("span");
      verdict.className = "critic-verdict";
      verdict.textContent = it.verdict;
      top.appendChild(no);
      top.appendChild(verdict);
      if (it.ai) {
        var ai = document.createElement("span");
        ai.className = "critic-ai";
        ai.textContent = "AI 味";
        top.appendChild(ai);
      }
      card.appendChild(top);

      var sent = document.createElement("div");
      sent.className = "critic-sentence";
      sent.textContent = it.sentence;
      card.appendChild(sent);

      if (it.reason) {
        var why = document.createElement("div");
        why.className = "critic-reason";
        why.textContent = it.reason;
        card.appendChild(why);
      }
      if (it.aiWhy) {
        var aw = document.createElement("div");
        aw.className = "critic-aiwhy";
        aw.textContent = "AI 味：" + it.aiWhy;
        card.appendChild(aw);
      }
      if (it.fix) {
        var fx = document.createElement("div");
        fx.className = "critic-fix";
        fx.textContent = "方向：" + it.fix;
        card.appendChild(fx);
      }
      els.criticList.appendChild(card);
    });
  }

  async function runCritic() {
    if (!docBody.trim()) { setPaperHint("还没有正文，先按大纲写一篇再评改。"); return; }
    var c = currentConfig();
    if (!c.base || !c.key || !c.model) { setPaperHint("接口未配置，先回工作台填好。"); return; }

    els.criticStat.textContent = "正在逐句判…";
    els.criticList.innerHTML = "";
    criticItems = [];
    criticDockClosed = false;
    if (els.criticDock) els.criticDock.hidden = false;
    switchPane("paper");
    if (els.criticDock) els.criticDock.hidden = false;
    var bubble = addAssistantBubble("评改");
    bubble.textContent = "正在逐句判好坏与 AI 味…";

    try {
      var raw = await fetchAnnotation(window.WY_CRITIC, composeCriticUser());
      var obj = parseCriticJSON(raw);
      criticItems = obj.items;
      renderCritic();
      switchPane("paper");
      if (!criticItems.length) {
        els.criticStat.textContent = "这轮没挑出可定位的句子，可再点一次。";
        bubble.textContent = "这轮没挑出可定位的句子，再点一次「AI 评改」试试。";
        return;
      }
      var bad = criticItems.filter(function (x) { return x.verdict === "坏"; }).length;
      bubble.textContent = (obj.overall ? obj.overall + " " : "") +
        "评改完成：" + criticItems.length + " 句（坏 " + bad + " 句），批注在稿纸下方，点一条可以跳到那句。";
      setDocHint("评改 " + criticItems.length + " 条在稿纸下方 · 点条目可定位");
    } catch (e) {
      var msg = (e && e.message) || "未知错误";
      if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
        msg = "请求发不出去：多为浏览器跨域被拦或网络不通。";
      }
      bubble.textContent = "评改失败：" + msg;
      els.criticStat.textContent = "评改失败：" + msg;
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

  on(els.startBtn, "click", startWriting);
  on(els.sendBtn, "click", handleSend);
  on(els.testBtn, "click", testConnection);
  on(els.copyBtn, "click", copyText);
  on(els.downloadBtn, "click", downloadText);

  on(els.acceptAllBtn, "click", function () { applyAll("accept"); });
  on(els.ignoreAllBtn, "click", function () { applyAll("ignore"); });

  // 评分区展开/收起
  on(els.scoreToggle, "click", function () {
    setScoreOpen(els.scoreBody.hasAttribute("hidden"));
  });
  on(els.criticBtn, "click", runCritic);

  // 大纲 / 稿纸切换
  on(els.docTabs, "click", function (e) {
    var btn = e.target.closest(".doc-tab");
    if (!btn) return;
    switchPane(btn.getAttribute("data-pane"));
  });

  // 点击「大纲」时重新收集一次，避免手动改动没同步
  on(els.outlineTitle, "input", syncOutlineFromDOM);
  on(els.outlineThesis, "input", syncOutlineFromDOM);

  on(els.outlineAddBtn, "click", function () {
    syncOutlineFromDOM();
    outline.points.push(newPoint("", ""));
    renderOutline();
    var rows = els.outlinePoints.querySelectorAll(".outline-point");
    var last = rows[rows.length - 1];
    if (last) last.querySelector(".op-text").focus();
  });

  on(els.outlineRetryBtn, "click", function () {
    if (stage !== "outline" && !confirm("重新拟大纲不会动已有正文，但会覆盖当前大纲条目。继续吗？")) return;
    askOutline("请重新拟一份大纲：换一个切入角度，每段必须落到具体器物、工序或一句人物原话，删掉空泛的抒情段。");
  });

  on(els.outlineAiBtn, "click", function () {
    if (stage !== "outline") { setDocHint("正文已生成，若要重写大纲请直接在条目里改。"); return; }
    askOutline("在当前大纲基础上增补一到两段：补一处具体细节或一处人物暗中的动作，其余段落保持原样。");
  });

  on(els.writeEssayBtn, "click", generateEssay);

  // 对话模式切换
  on(els.chatMode, "click", function (e) {
    var btn = e.target.closest(".chat-mode-btn");
    if (!btn) return;
    setChatMode(btn.getAttribute("data-mode"));
  });

  on(els.criticDockClose, "click", function () {
    criticDockClosed = true;
    if (els.criticDock) els.criticDock.hidden = true;
  });

  on(els.paperBody, "click", function () { clearActiveMarks(); hideInkDock(); });

  on(els.inkDockAccept, "click", function () {
    var id = parseInt(els.inkDock.getAttribute("data-mark-id"), 10);
    hideInkDock();
    if (!isNaN(id)) applyMarkAction(id, "accept");
  });

  on(els.inkDockIgnore, "click", function () {
    var id = parseInt(els.inkDock.getAttribute("data-mark-id"), 10);
    hideInkDock();
    if (!isNaN(id)) applyMarkAction(id, "ignore");
  });

  on(els.inkDockClose, "click", function () { clearActiveMarks(); hideInkDock(); });

  on(els.stopBtn2, "click", function () {
    if (controller) controller.abort();
  });

  on(els.backBtn, "click", function () {
    if (controller) controller.abort();
    els.studio.setAttribute("hidden", "");
    els.wizard.removeAttribute("hidden");
    document.body.classList.remove("studio-mode");
  });

  on(els.chatInput, "keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSend();
  });





  /* ---------------- 初始化 ---------------- */

  updateSteps();
  showEmpty();
  setBusy(false);
  setChatMode("annotate");

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { alignPaperGrid(); });
  }
  window.addEventListener("resize", function () { alignPaperGrid(); });

  /* 从控制台跳回来时恢复那篇作文。auth.js 在本脚本之后加载，
     所以延后到 DOM 就绪再读登录态。 */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(function () { tryResumeEssay(); }, 60);
    });
  } else {
    setTimeout(function () { tryResumeEssay(); }, 60);
  }
})();
