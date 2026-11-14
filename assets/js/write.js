/* 文芽作文 - 创建工作台 + 生成界面逻辑
 * 纯前端直连 OpenAI 兼容接口，无后端、无数据上传。
 * 首次生成走「写作引擎」；生成界面里提修改要求、认可评改、流程改稿都走「整篇重写」。
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
    site: { base: "", model: "auto" },   // 站内模型：走自己的后端，消耗积分
    deepseek: { base: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    moonshot: { base: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
    qwen: { base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
    openai: { base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    custom: { base: "", model: "" }
  };

  /* 站内模型网关地址：与账号后端同一个域，前端不再填 key */
  function siteBase() {
    var ep = (window.WY_AUTH && window.WY_AUTH.endpoint && window.WY_AUTH.endpoint()) || "https://back.wenyazw.top";
    return String(ep).replace(/\/+$/, "") + "/api/llm";
  }
  function authToken() {
    return (window.WY_AUTH && window.WY_AUTH.token && window.WY_AUTH.token()) || "";
  }
  function isSiteMode(c) {
    return (c && c.preset === "site") || els.preset.value === "site";
  }

  var els = {
    toggleConfig: $("toggleConfig"), configPanel: $("configPanel"),
    preset: $("cfgPreset"), base: $("cfgBase"), path: $("cfgPath"),
    key: $("cfgKey"), model: $("cfgModel"), temp: $("cfgTemp"),
    maxTokens: $("cfgMaxTokens"), remember: $("cfgRemember"),
    keyToggle: $("keyToggle"), resetCfg: $("resetCfg"), testBtn: $("testBtn"),
    cfgCredits: $("cfgCredits"), siteNote: $("siteNote"),
    fieldBase: $("fieldBase"), fieldKey: $("fieldKey"),
    fieldModel: $("fieldModel"), fieldPath: $("fieldPath"),

    wizard: $("wizard"), studio: $("studio"),
    gateBar: $("gateBar"), gateLoginBtn: $("gateLoginBtn"),
    wizardSteps: $("wizardSteps"),
    catGrid: $("catGrid"), catTip: $("catTip"),
    genreGrid: $("genreGrid"), genreTip: $("genreTip"),
    topic: $("topic"), topicStepTitle: $("topicStepTitle"),
    topicHint: $("topicHint"), topicExamples: $("topicExamples"),
    extra: $("extra"),
    wordNum: $("wordNum"), wordRange: $("wordRange"),
    wordMinus: $("wordMinus"), wordPlus: $("wordPlus"),
    scoringGrid: $("scoringGrid"), scoringTip: $("scoringTip"),
    stageGrid: $("stageGrid"), stageTip: $("stageTip"),
    wizardStatus: $("wizardStatus"), startBtn: $("startBtn"),

    backBtn: $("backBtn"), studioMeta: $("studioMeta"),
    contextList: $("contextList"), contextEmpty: $("contextEmpty"),
    chatInput: $("chatInput"), sendBtn: $("sendBtn"), stopBtn2: $("stopBtn2"),
    chatMode: $("chatMode"), chatModeHint: $("chatModeHint"),
    paperTitle: $("paperTitle"), paperBody: $("paperBody"),
    paperStat: $("paperStat"), copyBtn: $("copyBtn"), downloadBtn: $("downloadBtn"),
    acceptAllBtn: $("acceptAllBtn"), ignoreAllBtn: $("ignoreAllBtn"),

    scoreToggle: $("scoreToggle"), scoreChips: $("scoreChips"),
    scoreCaret: $("scoreCaret"), scoreTables: $("scoreTables"),
    criticBtn: $("criticBtn"), scoreBtn: $("scoreBtn"), criticStat: $("criticStat"), criticList: $("criticList"),
    criticScore: $("criticScore"),
    criticDock: $("criticDock"), criticDockClose: $("criticDockClose"),
    criticApplyBtn: $("criticApplyBtn"), criticEmpty: $("criticEmpty"),
    debateRounds: $("debateRounds"), debateCost: $("debateCost"),
    debateAutoApply: $("debateAutoApply"),
    debateLog: $("debateLog"), debateSetup: $("debateSetup"),
    modelPill: $("modelPill"), modelPillName: $("modelPillName"),
    modelMenu: $("modelMenu"), modelMenuList: $("modelMenuList"),
    modelPickWrap: $("modelPickWrap"),
    runBar: $("runBar"), runText: $("runText"), runSub: $("runSub"),
    paperNotes: $("paperNotes"), undoRewriteBtn: $("undoRewriteBtn"), diffBtn: $("diffBtn"),
    drawerNoteList: $("drawerNoteList"), drawerNoteEmpty: $("drawerNoteEmpty"),
    drawerDotNotes: $("drawerDotNotes"),

    drawerHandle: $("drawerHandle"), drawerBadge: $("drawerBadge"),
    workDrawer: $("workDrawer"),
    drawerTabs: $("drawerTabs"), drawerClose: $("drawerClose"),
    drawerPanes: {
      critic: $("drawerPaneCritic"), notes: $("drawerPaneNotes"),
      flow: $("drawerPaneFlow"), score: $("drawerPaneScore"), history: $("drawerPaneHistory")
    },
    drawerDotCritic: $("drawerDotCritic"), drawerDotFlow: $("drawerDotFlow"), drawerDotHistory: $("drawerDotHistory"),
    drawerPaneHistory: $("drawerPaneHistory"),
    historyList: $("historyList"), historyEmpty: $("historyEmpty"), historyIntro: $("historyIntro"),

    docTabs: $("docTabs"), docTabHint: $("docTabHint"),
    outlinePane: $("outlinePane"), paperPane: $("paperPane"),
    outlineTitle: $("outlineTitle"), outlineThesis: $("outlineThesis"),
    outlinePoints: $("outlinePoints"), outlineEmpty: $("outlineEmpty"),
    outlineAddBtn: $("outlineAddBtn"), outlineAiBtn: $("outlineAiBtn"),
    outlineRetryBtn: $("outlineRetryBtn"),
    flowAuto: $("flowAuto"), flowRounds: $("flowRounds"), flowCostHint: $("flowCostHint"),
    flowBtn: $("flowBtn"), flowDock: $("flowDock"), flowStat: $("flowStat"),
    flowSteps: $("flowSteps"), flowStopBtn: $("flowStopBtn"),
    flowRoundsDrawer: $("flowRoundsDrawer"), flowCostDrawer: $("flowCostDrawer"),
    flowRerunBtn: $("flowRerunBtn"), flowSetupNote: $("flowSetupNote"),
    flowEmpty: $("flowEmpty"),
    writeEssayBtn: $("writeEssayBtn")
  };

  /* 流程作文状态 */
  var flowActive = false;
  var flowAbort = false;
  var flowRounds = 2;                // 轮次单一真值：向导和抽屉共用，运行中改即时生效

  /* 两评讨论状态：甲（主评）与乙（复核）逐轮谈，谈完的定稿里只有"坐实"的条目能交给重写 */
  var DEBATE_STORE = "wy.debate.v1";
  var debateRounds = 1;              // 讨论轮数，0 表示关闭（单评一次）
  var debateLog = [];                // 每轮：乙的质疑 + 甲的表态

  /* 右侧工作窗抽屉状态：稿纸布局不受抽屉影响 */
  var drawerOpen = false;
  var drawerTab = "critic";
  var drawerAutoSuppressed = false;   // 用户手动收起过之后不再自动弹出打扰

  /* 向导状态 */
  var selectedCat = "";
  var selectedGenre = "记叙文";
  var wordCount = 800;
  var selectedProvinces = ["全国卷（通用）"];

  /* 运行态 */
  var controller = null;
  var fullText = "";
  var streamIsEssay = false;     // 当前流式请求是否为「生成/重写作文」（JSON 输出，需按 JSON 解析）
  var lastTitle = "作文";
  var assistantReplyEl = null;
  var currentComposition = "";   // 当前作文纯文本（标题+正文），用于修改大师上下文
  var activeCat = "";            // 本次成稿的类别快照（返回工作台改选项不影响已生成的稿）
  var activeGenre = "记叙文";     // 本次成稿的文体快照（记叙文/议论文/散文/小小说/随笔）
  var activeTopic = "";          // 本次成稿的题目原题快照
  var activeProvinces = [];      // 本次成稿所选评分标准快照（可多个）
  var activeStage = "";          // 本次成稿学段快照
  var docTitle = "";             // 稿纸标题（纯文本）
  var docBody = "";              // 稿纸正文（纯文本，采纳批注时在这里替换）
  var annotations = [];          // 老师手批：待处理/已采纳/已忽略的批注
  var annotSeq = 0;              // 批注编号自增
  var prevAcceptedTexts = [];    // 上一轮采纳写进正文的新文字（稿纸里标黄）
  var currentEssayId = null;     // 云端作文 id（登录后自动保存）

  var outline = { title: "", thesis: "", points: [], note: "" };  // 大纲（可编辑）
  var stage = "outline";         // outline：还在改大纲；draft：正文已生成
  var chatMode = "annotate";     // annotate：手批改稿；explain：只问不改
  var criticItems = [];          // AI 评改的逐句结果
  var criticScores = [];         // AI 评改给出的分数（每份评分标准一条）
  var criticSeq = 0;             // 评改条目自增 id（用于稿纸标记与卡片互跳）
  var undoStack = [];            // 整篇重写前的快照，供「恢复上一版」逐版退回
  var lastNoteBody = "";         // 上次渲染旁批时对应的正文；正文一变就清对不上的旧旁批

  /* ---------------- 历史版本：存下每一次更改 ----------------
     每次生成初稿、整篇重写、流程迭代、恢复上一版、恢复历史版本都存一版快照。
     版本账本跟「这一篇」走：登录后按云端 essayId 分账，没登录按本机 compositionId 分账，
     换一篇作文就换一份账本，互不串。 */
  var VER_PREFIX = "wy.versions.v1.";
  var COMP_KEY = "wy.compositionId.v1";
  var compositionId = null;
  var versions = [];

  function setCompositionId(id) {
    compositionId = id;
    try { localStorage.setItem(COMP_KEY, id); } catch (e) { /* 存不下就算了 */ }
  }
  function compId() {
    if (compositionId) return compositionId;
    try { compositionId = localStorage.getItem(COMP_KEY); } catch (e) { compositionId = null; }
    if (!compositionId) {
      compositionId = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      setCompositionId(compositionId);
    }
    return compositionId;
  }
  // 之前只认 compositionId，打开另一篇存档还读同一份历史，列表里就窜出别的作文
  function verOwnerId() { return currentEssayId ? ("e" + currentEssayId) : compId(); }
  function versionKey() { return VER_PREFIX + verOwnerId(); }
  function loadVersions() {
    try {
      var a = JSON.parse(localStorage.getItem(versionKey()) || "[]");
      versions = Array.isArray(a) ? a : [];
    } catch (e) { versions = []; }
  }
  function persistVersions() {
    try { localStorage.setItem(versionKey(), JSON.stringify(versions)); } catch (e) { /* 隐私模式忽略 */ }
  }
  function resetVersions() { versions = []; persistVersions(); }
  // 本机草稿第一次存到云端：把草稿阶段攒的版本搬到这篇 essay 名下，别丢
  function adoptVersionsForEssay(id) {
    if (!id || !versions.length) return;
    var to = VER_PREFIX + "e" + id;
    try {
      var old = JSON.parse(localStorage.getItem(to) || "[]");
      if (Array.isArray(old) && old.length) return;   // 云上已经有一份，不覆盖
      localStorage.setItem(to, JSON.stringify(versions));
    } catch (e) { /* 存不下就只在内存里留着 */ }
  }
  function plainLen(t) { return String(t || "").replace(/\s/g, "").length; }
  function criticScoresSummary() {
    return (criticScores || []).map(function (s) { return s.province + " " + s.total + "/" + s.full; }).join(" · ");
  }
  function commitVersion(label, score) {
    if (!docTitle.trim() && !docBody.trim()) return;
    versions.push({
      id: "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      ts: Date.now(),
      title: docTitle || "作文",
      body: docBody,
      label: label || "修改",
      words: plainLen(docBody),
      score: score || criticScoresSummary() || ""
    });
    if (versions.length > 60) versions.shift();
    persistVersions();
    if (els.historyList) renderHistoryList();
    updateDiffBtn();
    syncDrawerDots();
  }
  function resetComposition() {
    compositionId = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setCompositionId(compositionId);
    resetVersions();
  }

  /* ---------------- 写作会话持久化 ----------------
     聊天上下文、AI 评改结果、旁批批注、锁定句、正文大纲、学段地区类别、流程步骤
     全部按「这篇作文」存在本机，刷新或下次从控制台打开还能接着看。
     登录过就按 essayId 存，没登录按本机 compositionId 存，换一篇互不串。 */

  var SESSION_PREFIX = "wy.session.v1.";

  function sessionKey() {
    return SESSION_PREFIX + (currentEssayId ? ("e" + currentEssayId) : compId());
  }

  function chatSnapshot() {
    var out = [];
    if (!els.contextList) return out;
    Array.prototype.forEach.call(els.contextList.children, function (b) {
      if (!b.classList || !b.classList.contains("bubble")) return;
      var lab = b.querySelector(".bubble-label"), tx = b.querySelector(".bubble-text");
      out.push({
        user: b.classList.contains("user"),
        cls: b.className,
        role: lab ? lab.textContent : "",
        text: tx ? tx.textContent : ""
      });
    });
    return out;
  }

  function flowSnapshot() {
    var out = [];
    if (!els.flowSteps) return out;
    Array.prototype.forEach.call(els.flowSteps.children, function (n) {
      out.push({ text: n.textContent || "", cls: n.className || "" });
    });
    return out;
  }

  function sessionData() {
    return {
      ts: Date.now(),
      essayId: currentEssayId || 0,
      title: docTitle || "",
      body: docBody || "",
      stage: stage,
      outline: outlineStore(),
      category: categoryStore(),
      province: (activeProvinces.length ? activeProvinces : selectedProvinces).join("、"),
      chat: chatSnapshot(),
      flow: flowSnapshot(),
      critic: {
        items: criticItems,
        scores: criticScores,
        stat: els.criticStat ? els.criticStat.textContent : "",
        debate: { rounds: debateRounds, log: debateLog }   // 两评讨论的记录也存下来
      },
      notes: annotations,
      annotSeq: annotSeq,
      locks: lockedTexts,
      mode: chatMode
    };
  }

  /* 传云端的那份去掉正文/大纲/类别这些已经有独立列的字段，只留"现场"，
     免得同一篇正文在库里存两遍。 */
  function cloudSession() {
    var d = sessionData();
    delete d.title; delete d.body; delete d.outline;
    delete d.category; delete d.province;
    d.essayId = 0;                       // 由数据库行 id 决定，不必自报
    return JSON.stringify(d);
  }

  function saveSessionNow() {
    try {
      localStorage.setItem(sessionKey(), JSON.stringify(sessionData()));
    } catch (e) { /* 存不下（隐私模式/超配额）就算了，不影响写作 */ }
  }

  var sessionTimer = null;
  var cloudSessionTimer = null;
  function scheduleSessionSave() {
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = setTimeout(function () { sessionTimer = null; saveSessionNow(); }, 600);
    // 同时把现场推到云端（跟着作文行存），换设备/清缓存也能接回来
    if (authToken()) {
      if (cloudSessionTimer) clearTimeout(cloudSessionTimer);
      cloudSessionTimer = setTimeout(function () { cloudSessionTimer = null; saveEssayToCloud(); }, 2500);
    }
  }

  function readSession() {
    try {
      var raw = localStorage.getItem(sessionKey());
      if (!raw) return null;
      var d = JSON.parse(raw);
      return d && typeof d === "object" ? d : null;
    } catch (e) { return null; }
  }

  function paintChat(list) {
    if (!els.contextList || !list || !list.length) return;
    els.contextList.innerHTML = "";
    if (els.contextEmpty) { els.contextEmpty.remove(); els.contextEmpty = null; }
    list.forEach(function (m) {
      if (!m || !trim(m.text)) return;
      var b = document.createElement("div");
      b.className = m.cls || (m.user ? "bubble user" : "bubble ai role-ai");
      var label = document.createElement("div");
      label.className = "bubble-label";
      label.textContent = m.role || (m.user ? "你" : "文芽");
      var t = document.createElement("div");
      t.className = "bubble-text";
      t.textContent = m.text;
      b.appendChild(label);
      b.appendChild(t);
      els.contextList.appendChild(b);
    });
    els.contextList.scrollTop = els.contextList.scrollHeight;
  }

  function paintFlow(list) {
    if (!els.flowSteps || !list || !list.length || els.flowSteps.children.length) return;
    list.forEach(function (s) {
      if (!s || !s.text) return;
      var n = document.createElement("div");
      n.className = s.cls || "flow-step";
      n.textContent = s.text;
      els.flowSteps.appendChild(n);
    });
  }

  /* 把存下来的会话铺回界面。正文/大纲只在当前为空时补，避免覆盖云端更新的稿子。 */
  function restoreSession(d) {
    if (!d) return false;
    var touched = false;

    if (!docBody.trim() && d.body) {
      docTitle = d.title || "作文";
      docBody = d.body;
      currentComposition = d.title ? (d.title + "\n\n" + d.body) : d.body;
      stage = d.stage === "draft" ? "draft" : "outline";
      touched = true;
    }
    if (d.outline && !outlineHasContent()) {
      try {
        var ol = JSON.parse(d.outline) || {};
        outline = {
          title: ol.title || docTitle || "",
          thesis: ol.thesis || "",
          note: ol.note || "",
          points: (ol.points || []).map(function (p) { return newPoint(p && p.label, p && p.text); })
        };
        touched = true;
      } catch (e) { /* 坏数据跳过 */ }
    }
    if (d.category && !activeCat) {
      var pc = parseCategoryStore(d.category);
      activeCat = pc.cat || "";
      activeGenre = pc.genre;
      // 存的文体缺了或被脏字符吃掉：按大纲结构回推
      if (!pc.hasGenre) {
        var pcGuess = guessGenreFrom(String(d.outline || "") + "\n" + String(d.body || ""));
        if (pcGuess) activeGenre = pcGuess;
      }
    }
    if (d.province && !activeProvinces.length) activeProvinces = resumeProvinceList(d.province);

    if (Array.isArray(d.notes) && d.notes.length && !annotations.length) {
      annotations = d.notes;
      annotSeq = d.annotSeq || annotations.length;
    }
    if (Array.isArray(d.locks) && d.locks.length && !lockedTexts.length) {
      lockedTexts = d.locks;
      try { localStorage.setItem(LOCK_STORE, JSON.stringify(lockedTexts)); } catch (e2) { /* ignore */ }
    }
    if (d.critic && Array.isArray(d.critic.items) && d.critic.items.length && !criticItems.length) {
      criticItems = d.critic.items;
      criticScores = Array.isArray(d.critic.scores) ? d.critic.scores : [];
      criticSeq = criticItems.reduce(function (m, it) { return Math.max(m, it.id || 0); }, criticSeq);
      if (d.critic.debate) {
        if (typeof d.critic.debate.rounds === "number") setDebateRounds(d.critic.debate.rounds, true);
        debateLog = Array.isArray(d.critic.debate.log) ? d.critic.debate.log : [];
      }
    }
    if (Array.isArray(d.chat) && d.chat.length) paintChat(d.chat);
    if (Array.isArray(d.flow) && d.flow.length) paintFlow(d.flow);
    if (d.mode) setChatMode(d.mode);

    if (criticItems.length) {
      renderCritic();
      if (d.critic && d.critic.stat && els.criticStat) els.criticStat.textContent = d.critic.stat;
    } else if (touched && docBody.trim()) {
      renderAnnotated();
    }
    syncDrawerDots();
    return true;
  }

  // 页面打开时：没有 ?essay 也把上次的写作现场接回来（稿纸 + 对话 + 评改 + 旁批）
  function trySessionRestore() {
    if (els.studio.hasAttribute("hidden") === false) return false;   // 已经在写作台（resume 走过了）
    var d = readSession();
    if (!d) return false;
    if (!d.body && !(d.chat && d.chat.length)) return false;
    els.wizard.setAttribute("hidden", "");
    els.studio.removeAttribute("hidden");
    document.body.classList.add("studio-mode");
    if (d.title) docTitle = d.title;
    restoreSession(d);
    renderOutline();
    switchPane(stage === "draft" ? "paper" : "outline");
    setPaperHint("已恢复上次的写作现场（对话、评改、旁批都在）");
    setDocHint(stage === "draft" ? "正文已恢复 · 可继续改" : "大纲已恢复");
    return true;
  }

  /* 从控制台打开一篇存档作文时，把这同一条作文自己的现场接回来：
     对话、评改结果、旁批、锁句。本机有就用本机的（更新），没有就用云端随稿存的那份，换设备也不丢。
     正文和大纲以云端为准（可能在别的设备改过），所以这里只铺 UI，不覆盖稿子。 */
  function hydrateEssaySession(cloudRaw) {
    var d = readSession();
    if (d && d.essayId && currentEssayId && String(d.essayId) !== String(currentEssayId)) d = null;
    if (!d && cloudRaw) {
      try { d = JSON.parse(cloudRaw); } catch (e) { d = null; }
    }
    if (!d) return false;

    if (Array.isArray(d.chat) && d.chat.length) paintChat(d.chat);

    if (d.critic && Array.isArray(d.critic.items) && d.critic.items.length && !criticItems.length) {
      criticItems = d.critic.items;
      criticScores = Array.isArray(d.critic.scores) ? d.critic.scores : [];
      criticSeq = criticItems.reduce(function (m, it) { return Math.max(m, it.id || 0); }, criticSeq);
      if (els.criticStat && d.critic.stat) els.criticStat.textContent = d.critic.stat;
      if (d.critic.debate) {
        if (typeof d.critic.debate.rounds === "number") setDebateRounds(d.critic.debate.rounds, true);
        debateLog = Array.isArray(d.critic.debate.log) ? d.critic.debate.log : [];
      }
    }
    if (Array.isArray(d.notes) && d.notes.length && !annotations.length) {
      annotations = d.notes;
      annotSeq = d.annotSeq || annotations.length;
    }
    if (Array.isArray(d.locks) && d.locks.length && !lockedTexts.length) {
      lockedTexts = d.locks;
      saveLocked();
    }
    if (Array.isArray(d.flow) && d.flow.length) paintFlow(d.flow);
    if (d.mode) setChatMode(d.mode);
    return true;
  }

  /* ---------------- 历史版本：GitHub 式更改查看 ----------------
     每次生成 / 重写 / 恢复都 commitVersion 快照；版本按 compositionId 存 localStorage，刷新仍在。
     列表新→旧；点版本看它与上一版相比的改动（段落级 LCS 对齐，再做段落内字符级 LCS，inline 渲染）。 */

  function timeAgo(ts) {
    var d = Math.max(0, Date.now() - ts);
    var s = Math.floor(d / 1000);
    if (s < 60) return s + " 秒前";
    var m = Math.floor(s / 60);
    if (m < 60) return m + " 分钟前";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " 小时前";
    var day = Math.floor(h / 24);
    if (day < 30) return day + " 天前";
    var dt = new Date(ts);
    return (dt.getMonth() + 1) + "月" + dt.getDate() + "日";
  }

  function splitParas(t) {
    return String(t || "").replace(/\r/g, "").split(/\n+/)
      .map(function (p) { return p.replace(/\n/g, ""); })
      .filter(function (p) { return p.trim().length; });
  }

  // 段落级 LCS：返回 [{t:'eq',a,b} | {t:'del',a} | {t:'add',b}]
  function diffParas(a, b) {
    var n = a.length, m = b.length;
    if (!n) return b.map(function (x, i) { return { t: "add", b: i }; });
    if (!m) return a.map(function (x, i) { return { t: "del", a: i }; });
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
    for (var i2 = n - 1; i2 >= 0; i2--) {
      for (var j2 = m - 1; j2 >= 0; j2--) {
        dp[i2][j2] = (a[i2] === b[j2]) ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
      }
    }
    var ops = [], i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push({ t: "eq", a: i, b: j }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "del", a: i }); i++; }
      else { ops.push({ t: "add", b: j }); j++; }
    }
    while (i < n) { ops.push({ t: "del", a: i }); i++; }
    while (j < m) { ops.push({ t: "add", b: j }); j++; }
    return ops;
  }

  // 字符级 LCS：返回合并后的 [{t:'eq'|'del'|'add', s}]
  function charDiff(a, b) {
    a = String(a || ""); b = String(b || "");
    var n = a.length, m = b.length;
    if (!n) return b ? [{ t: "add", s: b }] : [];
    if (!m) return a ? [{ t: "del", s: a }] : [];
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
    for (var i2 = n - 1; i2 >= 0; i2--) {
      for (var j2 = m - 1; j2 >= 0; j2--) {
        dp[i2][j2] = (a.charAt(i2) === b.charAt(j2)) ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
      }
    }
    var ops = [], i = 0, j = 0;
    while (i < n && j < m) {
      if (a.charAt(i) === b.charAt(j)) { ops.push({ t: "eq", s: a.charAt(i) }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "del", s: a.charAt(i) }); i++; }
      else { ops.push({ t: "add", s: b.charAt(j) }); j++; }
    }
    while (i < n) { ops.push({ t: "del", s: a.charAt(i) }); i++; }
    while (j < m) { ops.push({ t: "add", s: b.charAt(j) }); j++; }
    return ops;
  }

  function diffStat(aBody, bBody) {
    var ops = diffParas(splitParas(aBody), splitParas(bBody));
    var add = 0, del = 0;
    ops.forEach(function (o) { if (o.t === "add") add++; else if (o.t === "del") del++; });
    return "增 " + add + " · 删 " + del;
  }

  function renderHistoryList() {
    if (!els.historyList) return;
    var list = versions.slice().reverse();   // 新→旧
    if (!list.length) {
      if (els.historyEmpty) els.historyEmpty.hidden = false;
      if (els.historyIntro) els.historyIntro.hidden = true;
      els.historyList.innerHTML = "";
      return;
    }
    if (els.historyEmpty) els.historyEmpty.hidden = true;
    if (els.historyIntro) els.historyIntro.hidden = false;
    els.historyList.innerHTML = "";
    list.forEach(function (v, idx) {
      var prev = idx < list.length - 1 ? list[idx + 1] : null;   // 列表新→旧，后一项是它上一版
      var li = document.createElement("div");
      li.className = "history-item";

      var head = document.createElement("div");
      head.className = "history-head";
      var lab = document.createElement("span");
      lab.className = "history-label";
      lab.textContent = v.label || "修改";
      var tm = document.createElement("span");
      tm.className = "history-time";
      tm.textContent = timeAgo(v.ts);
      head.appendChild(lab); head.appendChild(tm);

      var meta = document.createElement("div");
      meta.className = "history-meta";
      meta.textContent = (v.words || 0) + " 字" + (v.score ? " · " + v.score : "");

      var act = document.createElement("div");
      act.className = "history-act";
      var diffBtn = document.createElement("button");
      diffBtn.className = "history-btn";
      diffBtn.disabled = !prev;
      diffBtn.textContent = prev ? ("查看与上一版的改动（" + diffStat(prev.body, v.body) + "）") : "首版（无对比）";
      diffBtn.onclick = function () { renderHistoryDiff(prev, v); };
      var restBtn = document.createElement("button");
      restBtn.className = "history-btn ghost";
      restBtn.textContent = "恢复到此版";
      restBtn.onclick = function () { restoreVersion(v.id); };
      act.appendChild(diffBtn); act.appendChild(restBtn);

      li.appendChild(head); li.appendChild(meta); li.appendChild(act);
      els.historyList.appendChild(li);
    });
  }

  // 两段够不够像「同一段的改写」：逐字 LCS 命中比例，太低就别硬做 inline 交错，
  // 否则两段不相干的文字会被拼成一句读不通的乱码。
  function paraSimilarity(a, b) {
    a = String(a || ""); b = String(b || "");
    if (!a.length || !b.length) return 0;
    var ops = charDiff(a, b), hit = 0;
    ops.forEach(function (o) { if (o.t === "eq") hit += o.s.length; });
    return hit / Math.max(a.length, b.length);
  }

  /* 历史版本 diff：绿增红删照旧，但每个改动块前面多一个复选框，默认全勾。
     点「只采纳勾选的」就按勾选拼出一版新稿：勾了的用新版的段落，没勾的保持上一版原样，
     不必整版全盘接收。 */
  function renderHistoryDiff(prevV, curV) {
    if (!els.historyList) return;
    var box = document.createElement("div");
    box.className = "history-diff";
    var h = document.createElement("div");
    h.className = "history-diff-head";
    h.textContent = "改动对照：上一版 → 本版";
    var lg = document.createElement("div");
    lg.className = "history-diff-legend";
    var lAdd = document.createElement("span");
    lAdd.className = "lg-add";
    lAdd.textContent = "绿色 = 新增";
    var lDel = document.createElement("span");
    lDel.className = "lg-del";
    lDel.textContent = "红色 = 删除";
    var lPick = document.createElement("span");
    lPick.className = "lg-pick";
    lPick.textContent = "勾选框 = 这段改不改";
    lg.appendChild(lAdd);
    lg.appendChild(lDel);
    lg.appendChild(lPick);
    box.appendChild(h);
    box.appendChild(lg);

    var pa = splitParas(prevV.body), pb = splitParas(curV.body);
    var ops = diffParas(pa, pb);
    var body = document.createElement("div");
    body.className = "history-diff-body";
    var units = [];          // 每一块改动：d=上一版的段，a=本版的段，on=是否采纳
    var plan = [];           // 拼新稿的顺序：eq 段直接用上一版，unit 看勾没勾

    function addEq(txt) {
      var p = document.createElement("p");
      p.className = "diff-eq";
      p.textContent = txt;
      body.appendChild(p);
    }

    function unitBox() {
      var u = { d: [], a: [], on: true };
      u.el = document.createElement("div");
      u.el.className = "diff-unit";
      var pick = document.createElement("label");
      pick.className = "diff-pick";
      pick.title = "取消勾选就保留上一版的这段";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.onchange = function () {
        u.on = cb.checked;
        u.el.classList.toggle("off", !cb.checked);
        syncMergeBtn();
      };
      pick.appendChild(cb);
      u.el.appendChild(pick);
      u.body = document.createElement("div");
      u.body.className = "diff-unit-body";
      u.el.appendChild(u.body);
      u.cb = cb;
      return u;
    }

    function paraInto(host, cls, txt) {
      var p = document.createElement("p");
      p.className = cls;
      p.textContent = txt;
      host.appendChild(p);
    }

    function inlineInto(host, aTxt, bTxt) {
      var p = document.createElement("p");
      p.className = "diff-add";
      charDiff(aTxt, bTxt).forEach(function (c) {
        if (c.t === "eq") p.appendChild(document.createTextNode(c.s));
        else {
          var sp = document.createElement("span");
          sp.className = c.t === "add" ? "diff-ins" : "diff-del-inline";
          sp.textContent = c.s;
          p.appendChild(sp);
        }
      });
      host.appendChild(p);
    }

    var i = 0;
    while (i < ops.length) {
      var o = ops[i];
      if (o.t === "eq") {
        addEq(pa[o.a]);
        plan.push({ t: "eq", i: o.a });
        i++;
        continue;
      }
      // 把连续的一整块删除/新增收起来，再按顺序一对一配：
      // 够像同一段改写的做逐字对照，不像的各出一行（红删、绿增）
      var dels = [], adds = [];
      while (i < ops.length && ops[i].t !== "eq") {
        if (ops[i].t === "del") dels.push(ops[i].a);
        else adds.push(ops[i].b);
        i++;
      }
      var groupN = Math.max(dels.length, adds.length);
      for (var g = 0; g < groupN; g++) {
        var aTxt = g < dels.length ? pa[dels[g]] : null;
        var bTxt = g < adds.length ? pb[adds[g]] : null;
        var u = unitBox();
        if (aTxt != null) u.d.push(dels[g]);
        if (bTxt != null) u.a.push(adds[g]);
        if (aTxt != null && bTxt != null && paraSimilarity(aTxt, bTxt) >= 0.55) inlineInto(u.body, aTxt, bTxt);
        else {
          if (aTxt != null) paraInto(u.body, "diff-del", aTxt);
          if (bTxt != null) paraInto(u.body, "diff-add", bTxt);
        }
        body.appendChild(u.el);
        plan.push({ t: "unit", u: units.length });
        units.push(u);
      }
    }
    box.appendChild(body);

    // 底部：勾选统计 + 只采纳勾选的部分
    var foot = document.createElement("div");
    foot.className = "diff-foot";
    var stat = document.createElement("span");
    stat.className = "diff-foot-stat";
    var applyBtn = document.createElement("button");
    applyBtn.className = "btn btn-primary diff-apply";
    applyBtn.type = "button";
    var allBtn = document.createElement("button");
    allBtn.className = "history-btn ghost";
    allBtn.type = "button";
    allBtn.textContent = "全选";
    allBtn.onclick = function () {
      var allOn = units.every(function (u) { return u.on; });
      units.forEach(function (u) { u.on = !allOn; u.cb.checked = !allOn; u.el.classList.toggle("off", allOn); });
      allBtn.textContent = allOn ? "全选" : "全不选";
      syncMergeBtn();
    };
    function syncMergeBtn() {
      var on = units.filter(function (u) { return u.on; }).length;
      stat.textContent = units.length ? ("共 " + units.length + " 处改动，勾了 " + on + " 处") : "两版没有差别";
      applyBtn.disabled = !units.length;
      applyBtn.textContent = on === units.length
        ? "整版采纳这一版"
        : (on ? "只采纳勾选的 " + on + " 处" : "都没勾，等于不改");
    }
    applyBtn.onclick = function () {
      applyPartialMerge(prevV, curV, units, plan, pa, pb);
    };
    foot.appendChild(stat);
    foot.appendChild(allBtn);
    foot.appendChild(applyBtn);
    box.appendChild(foot);
    syncMergeBtn();

    var back = document.createElement("button");
    back.className = "history-btn ghost";
    back.textContent = "← 返回版本列表";
    back.onclick = renderHistoryList;
    box.appendChild(back);

    els.historyList.innerHTML = "";
    els.historyList.appendChild(box);
    if (els.historyEmpty) els.historyEmpty.hidden = true;
    if (els.historyIntro) els.historyIntro.hidden = true;
  }

  /* 按勾选拼出一版：勾了的段落用本版，没勾的保留上一版，然后存成一个新版本。
     这样「AI 改坏了三段、有两段确实更好」时可以只留好的那两段。 */
  function applyPartialMerge(prevV, curV, units, plan, pa, pb) {
    pa = pa || splitParas(prevV.body);
    pb = pb || splitParas(curV.body);
    var out = [];
    plan.forEach(function (p) {
      if (p.t === "eq") { out.push(pa[p.i]); return; }
      var u = units[p.u];
      if (!u) return;
      if (u.on) u.a.forEach(function (k) { out.push(pb[k]); });
      else u.d.forEach(function (k) { out.push(pa[k]); });
    });
    var body = out.join("\n\n");
    if (!body.trim()) { setDocHint("勾成这样正文就空了，至少留一段。"); return; }
    var on = units.filter(function (u) { return u.on; }).length;
    if (!units.length) return;

    var snap = essaySnapshot();
    undoStack.push(snap);
    if (undoStack.length > 5) undoStack.shift();
    syncUndoBtn();

    docTitle = curV.title && trim(curV.title) ? curV.title : docTitle;
    docBody = body;
    currentComposition = (docTitle ? docTitle + "\n\n" : "") + docBody;
    clearNotesAfterRewrite();        // 正文换了，旧批注与评改作废
    renderAnnotated();
    saveEssayToCloud();
    scheduleEssaySave();

    var label = (on === units.length)
      ? ("采纳「" + (curV.label || "修改") + "」整版")
      : ("部分采纳「" + (curV.label || "修改") + "」· " + on + "/" + units.length + " 处");
    commitVersion(label, curV.score || "");
    var msg = (on === units.length ? "已整版采纳" : "已采纳 " + on + " 处改动") +
      "，存成一版新的历史记录；不满意可「恢复上一版」。";
    setPaperHint(msg);
    setDocHint(msg);
    renderHistoryList();
  }

  function restoreVersion(id) {
    var v = null;
    versions.forEach(function (x) { if (x.id === id) v = x; });
    if (!v) return;
    docTitle = v.title || "作文";
    docBody = v.body;
    currentComposition = (v.title ? v.title + "\n\n" : "") + v.body;
    renderAnnotated();
    commitVersion("恢复到「" + (v.label || "修改") + "」版");
    setPaperHint("已恢复到 " + (v.label || "修改") + " 版（可再退回）");
    setDocHint("已恢复历史版本");
  }

  /* 工具条上的「改动对照」：只有两版以上才出现，点了直接看最新一版相对上一版改了什么 */
  function updateDiffBtn() {
    if (!els.diffBtn) return;
    els.diffBtn.hidden = versions.length < 2;
  }

  function openLatestDiff() {
    if (versions.length < 2) {
      setPaperHint("还没有可比对的上一版，改一次稿就会自动存版本。");
      return;
    }
    setDrawer(true, "history");
    renderHistoryDiff(versions[versions.length - 2], versions[versions.length - 1]);
  }

  /* ---------------- 模型切换：就在对话框下面 ----------------
     一个菜单里放两组：站内（服务器给的那串模型，免密钥）和自定义接口（自己填的地址与模型名）。
     自定义模型名能就地改，不用回工作台翻配置；切来切去也不会把填好的自定义配置弄丢。 */

  var MODEL_PICK = "wy.model.pick.v1";     // 站内选中的模型名，空 = 跟随自动
  var MODEL_LIST = "wy.model.list.v1";     // 上次拿到的站内模型清单，离线也能列
  var CUSTOM_CFG = "wy.custom.cfg.v1";     // 自定义接口的档案：切到站内也不会被冲掉
  var modelPick = "";
  var modelList = [];

  function customCfgDefault() {
    return {
      preset: "deepseek",
      base: PRESETS.deepseek.base,
      path: "/chat/completions",
      key: "",
      model: PRESETS.deepseek.model
    };
  }

  function customCfgFromForm() {
    return {
      preset: els.preset.value === "site" ? loadCustomCfg().preset : els.preset.value,
      base: els.base.value.trim(),
      path: els.path.value.trim(),
      key: els.key.value.trim(),
      model: els.model.value.trim()
    };
  }

  /* 自定义接口档案：优先用单独存的那份；从来没有过的话，退回默认（deepseek） */
  function loadCustomCfg() {
    var out = customCfgDefault();
    try {
      var raw = localStorage.getItem(CUSTOM_CFG);
      var o = raw ? JSON.parse(raw) : null;
      if (o && typeof o === "object") {
        if (typeof o.preset === "string" && o.preset && o.preset !== "site") out.preset = o.preset;
        if (typeof o.base === "string" && o.base) out.base = o.base;
        if (typeof o.path === "string" && o.path) out.path = o.path;
        if (typeof o.key === "string") out.key = o.key;
        if (typeof o.model === "string" && o.model) out.model = o.model;
        return out;
      }
    } catch (e) { /* 坏数据就当没有 */ }
    // 老用户：盘上还没有档案，但当前配置本来就是自定义，直接拿来当档案
    var saved = readConfig();
    if (saved.preset && saved.preset !== "site") {
      out.preset = saved.preset;
      out.base = saved.base;
      out.path = saved.path;
      out.key = saved.key;
      out.model = saved.model;
    }
    return out;
  }

  function saveCustomCfg(o) {
    if (!o) return;
    // 用户没勾「记住 Key」时，档案里也不留 Key，别绕开这个选项偷偷存下来
    var keep = o;
    if (els.remember && !els.remember.checked) {
      keep = { preset: o.preset, base: o.base, path: o.path, key: "", model: o.model };
    }
    try { localStorage.setItem(CUSTOM_CFG, JSON.stringify(keep)); } catch (e) { /* 隐私模式忽略 */ }
  }

  /* 站内 / 自定义 之间切：切走之前先把自定义配置存档案，切回来再填回去 */
  function setPresetMode(mode) {
    if (mode === "site") {
      if (els.preset.value !== "site") saveCustomCfg(customCfgFromForm());
      els.preset.value = "site";
    } else {
      var cfg = loadCustomCfg();
      lastCustomCfg = null;
      els.preset.value = (cfg.preset && cfg.preset !== "site") ? cfg.preset : "deepseek";
      els.base.value = cfg.base;
      els.path.value = cfg.path;
      els.key.value = cfg.key;
      els.model.value = cfg.model;
    }
    syncPresetUI();
    saveConfig();
    syncModelPill();
  }

  function loadModelPick() {
    try { modelPick = localStorage.getItem(MODEL_PICK) || ""; } catch (e) { modelPick = ""; }
    try {
      var raw = localStorage.getItem(MODEL_LIST);
      var a = raw ? JSON.parse(raw) : null;
      if (Array.isArray(a)) {
        modelList = a.filter(function (x) { return typeof x === "string" && trim(x); });
      }
    } catch (e) { modelList = []; }
  }

  function saveModelPick(m) {
    modelPick = m || "";
    try { localStorage.setItem(MODEL_PICK, modelPick); } catch (e) { /* 隐私模式忽略 */ }
    syncModelPill();
  }

  /* 真正写进请求体的模型名：站内选了空就交回 auto，由服务器按备用链挑 */
  function pickedModel(c) {
    c = c || currentConfig();
    if (c.preset !== "site") return c.model;
    return modelPick || "auto";
  }

  function modelLabel() {
    var c = currentConfig();
    if (c.preset !== "site") return c.model || "未填模型名";
    return modelPick || "跟随自动";
  }

  function syncModelPill() {
    if (!els.modelPillName) return;
    var site = currentConfig().preset === "site";
    els.modelPillName.textContent = modelLabel();
    els.modelPill.title = site ? "切换站内模型，或改用自定义接口" : "用的是自定义接口的模型，点开可以改";
    if (els.modelPill) els.modelPill.classList.toggle("on-custom", !site);
  }

  /* 菜单里的一行：on 决定打不打勾 */
  function modelRow(name, desc, on, action, cls) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "model-item" + (on ? " on" : "") + (cls ? " " + cls : "");
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", String(!!on));
    var n = document.createElement("span");
    n.className = "model-item-name";
    n.textContent = name;
    b.appendChild(n);
    if (desc) {
      var d = document.createElement("span");
      d.className = "model-item-desc";
      d.textContent = desc;
      b.appendChild(d);
    }
    var ck = document.createElement("span");
    ck.className = "model-item-check";
    ck.textContent = on ? "✓" : "";
    b.appendChild(ck);
    b.onclick = action;
    return b;
  }

  function modelGroup(title, note) {
    var g = document.createElement("div");
    g.className = "model-group";
    g.textContent = title;
    if (note) {
      var t = document.createElement("span");
      t.className = "model-group-note";
      t.textContent = note;
      g.appendChild(t);
    }
    return g;
  }

  function useSiteModel(m) {
    saveModelPick(m);
    if (currentConfig().preset !== "site") setPresetMode("site");
    closeModelMenu();
    setDocHint(m ? ("已切到站内模型 " + m + "，下一次请求就用它") : "模型跟随服务器自动挑");
  }

  /* 自定义模型的关键动作：改名字（同时切到自定义接口） */
  function useCustomModel(name) {
    var v = trim(name);
    if (!v) { setDocHint("自定义模型名不能是空的。"); return; }
    var cfg = loadCustomCfg();
    cfg.model = v;
    // 在配置面板里正填着的地址 / Key 一并带进档案，免得只改了模型名、其余还是旧的
    if (els.preset.value !== "site") {
      cfg.preset = els.preset.value;
      cfg.base = els.base.value.trim() || cfg.base;
      cfg.path = els.path.value.trim() || cfg.path;
      cfg.key = els.key.value.trim() || cfg.key;
    }
    saveCustomCfg(cfg);
    setPresetMode("custom");
    els.model.value = v;
    saveConfig();
    syncModelPill();
    closeModelMenu();
    setDocHint("已用自定义接口的模型 " + v + (cfg.key ? "" : "，但还没填 Key，记得去「接口配置」补上"));
  }

  function renderModelMenu() {
    if (!els.modelMenuList) return;
    els.modelMenuList.innerHTML = "";
    var site = currentConfig().preset === "site";
    var cfg = loadCustomCfg();

    /* ---- 站内 ---- */
    els.modelMenuList.appendChild(modelGroup("站内模型", "免密钥 · 每次 1 积分"));
    els.modelMenuList.appendChild(modelRow("跟随自动", "服务器按备用链挑第一个能用的", site && !modelPick, function () {
      useSiteModel("");
    }));
    modelList.forEach(function (m) {
      els.modelMenuList.appendChild(modelRow(m, "", site && modelPick === m, function () {
        useSiteModel(m);
      }));
    });
    if (!modelList.length) {
      var tip = document.createElement("p");
      tip.className = "model-menu-empty";
      tip.textContent = "没读到站内模型清单（没登录，或服务器还是旧版）。选「跟随自动」照样能用。";
      els.modelMenuList.appendChild(tip);
    }

    /* ---- 自定义 ---- */
    els.modelMenuList.appendChild(modelGroup("自定义接口", cfg.key ? "用自己的 Key · 不扣积分" : "还没填 Key"));
    els.modelMenuList.appendChild(modelRow(cfg.model || "（未填）", "点一下切到自定义接口", !site, function () {
      useCustomModel(cfg.model);
    }));

    var ed = document.createElement("div");
    ed.className = "model-edit";
    var inp = document.createElement("input");
    inp.className = "input model-edit-input";
    inp.type = "text";
    inp.value = cfg.model || "";
    inp.placeholder = "填模型名，如 deepseek-chat";
    inp.setAttribute("aria-label", "自定义模型名");
    inp.spellcheck = false;
    var ok = document.createElement("button");
    ok.type = "button";
    ok.className = "model-edit-save";
    ok.textContent = "用这个";
    function submit() { useCustomModel(inp.value); }
    ok.onclick = submit;
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
      e.stopPropagation();     // 别让回车冒泡去发对话
    });
    ed.appendChild(inp);
    ed.appendChild(ok);
    els.modelMenuList.appendChild(ed);

    var toCfg = modelRow("去接口配置", "改地址、路径与 Key", false, function () {
      closeModelMenu();
      setConfigOpen(true);
    }, "model-item-link");
    els.modelMenuList.appendChild(toCfg);
  }

  async function loadModelList(force) {
    if (modelList.length && !force) return modelList;
    var tok = authToken();
    if (!tok) return modelList;
    try {
      var res = await fetch(siteBase() + "/models", { headers: { "Authorization": "Bearer " + tok } });
      if (!res.ok) return modelList;
      var j = await res.json();
      var arr = Array.isArray(j.models) ? j.models : null;
      if (arr && arr.length) {
        modelList = arr.filter(function (x) { return typeof x === "string" && x; });
        try { localStorage.setItem(MODEL_LIST, JSON.stringify(modelList)); } catch (e) { /* ignore */ }
        if (modelPick && modelList.indexOf(modelPick) < 0) saveModelPick("");   // 旧选择已不在清单里
      }
    } catch (e) { /* 离线就用缓存清单 */ }
    return modelList;
  }

  function openModelMenu() {
    if (!els.modelMenu) return;
    // 手机上工作窗几乎盖满屏，菜单在它下面会被压住：先收抽屉再看模型
    if (isMobile() && drawerOpen) closeDrawer(true);
    renderModelMenu();
    els.modelMenu.removeAttribute("hidden");
    if (els.modelPill) els.modelPill.setAttribute("aria-expanded", "true");
    loadModelList(true).then(function () {
      if (els.modelMenu && !els.modelMenu.hasAttribute("hidden")) renderModelMenu();
    });
  }

  function closeModelMenu() {
    if (!els.modelMenu) return;
    els.modelMenu.setAttribute("hidden", "");
    if (els.modelPill) els.modelPill.setAttribute("aria-expanded", "false");
  }

  function toggleModelMenu() {
    if (els.modelMenu && els.modelMenu.hasAttribute("hidden")) openModelMenu();
    else closeModelMenu();
  }

  /* ---------------- 配置持久化 ---------------- */

  function readConfig() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { saved = {}; }
    return {
      preset: saved.preset || "site",
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
    if (els.preset.value === "site") {
      return {
        preset: "site",
        base: siteBase(),
        path: "/chat/completions",
        key: authToken(),          // 站内模式用登录 token 当凭据，真正的中转站密钥只在服务器
        model: "auto",             // 服务器按回退链自己挑
        temp: els.temp.value.trim(),
        maxTokens: els.maxTokens.value.trim(),
        remember: true
      };
    }
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

  function rawConfig() {
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
    var c = rawConfig();
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

  var lastCustomCfg = null;
  function syncPresetUI(silent) {
    if (typeof syncModelPill === "function") setTimeout(syncModelPill, 0);
    var site = els.preset.value === "site";
    if (site) {
      // 字段还是自定义那套值时，说明刚从自定义切过来：先落进档案，别让站内地址把它冲掉
      if (!silent && els.base.value && els.base.value !== siteBase()) {
        lastCustomCfg = {
          base: els.base.value, path: els.path.value,
          key: els.key.value, model: els.model.value
        };
        if (typeof saveCustomCfg === "function") {
          var keep = loadCustomCfg();
          saveCustomCfg({
            preset: keep.preset,
            base: lastCustomCfg.base || keep.base,
            path: lastCustomCfg.path || keep.path,
            key: lastCustomCfg.key,
            model: lastCustomCfg.model || keep.model
          });
        }
      }
      els.base.value = siteBase();
      els.path.value = "/chat/completions";
      els.model.value = "auto";
      els.key.value = "";
    } else if (lastCustomCfg) {
      els.base.value = lastCustomCfg.base;
      els.path.value = lastCustomCfg.path;
      els.key.value = lastCustomCfg.key;
      els.model.value = lastCustomCfg.model;
      lastCustomCfg = null;
    } else if (typeof loadCustomCfg === "function") {
      // 刷新后从站内切回自定义：表单里还是站内地址，得用档案填回来
      var cfg = loadCustomCfg();
      if (els.base.value === siteBase() || !els.base.value) {
        els.base.value = cfg.base;
        els.path.value = cfg.path;
        els.key.value = cfg.key;
        els.model.value = cfg.model;
      }
    }
    [els.base, els.path, els.model, els.key].forEach(function (el) { el.disabled = site; });
    // 站内模式把这些字段整块藏掉：地址、路径、模型名、Key 都不让用户看见也不用管。
    // 找不到 id 时退回到「输入框所在的 .field」，这样即使 HTML 是旧缓存（没有 id）也能藏住。
    [["fieldBase", els.base], ["fieldKey", els.key], ["fieldModel", els.model], ["fieldPath", els.path]]
      .forEach(function (pair) {
        var f = document.getElementById(pair[0]) || (pair[1] && pair[1].closest ? pair[1].closest(".field") : null);
        if (f) f.hidden = site;
      });
    if (els.keyToggle) els.keyToggle.disabled = site;
    // 站内模式不需要「记住 Key」，隐藏掉免得误解；测试连接会扣 1 分，按钮上写明
    var rememberWrap = els.remember && els.remember.closest("label");
    // 这行 label 上有内联 display:flex，光加 hidden 属性压不住，得直接改 display
    if (rememberWrap) rememberWrap.style.display = site ? "none" : "flex";
    if (els.testBtn) els.testBtn.textContent = site ? "测试站内模型" : "测试连接";
    if (els.cfgCredits) els.cfgCredits.hidden = !site;
    if (els.siteNote) els.siteNote.hidden = !site;
    refreshCreditLine();
    syncCostBadges();
  }

  /* 站内模式下，凡是会扣分的按钮都挂一个角标（CSS 画，避免改 textContent 时被清掉） */
  var COST_BTN_KEYS = [
    "startBtn", "outlineAiBtn", "outlineRetryBtn", "writeEssayBtn",
    "sendBtn", "criticBtn", "scoreBtn", "criticApplyBtn", "flowBtn", "flowRerunBtn", "testBtn"
  ];
  function syncCostBadges() {
    var site = els.preset.value === "site";
    var logged = !!(window.WY_AUTH && window.WY_AUTH.loggedIn && window.WY_AUTH.loggedIn());
    COST_BTN_KEYS.forEach(function (k) {
      var el = els[k];
      if (!el) return;
      el.classList.add("cost-btn");
      if (!el.getAttribute("data-cost")) el.setAttribute("data-cost", "1");
    });
    syncCriticCostBadge();
    if (document.body) document.body.classList.toggle("cost-on", site && logged);
  }

  /* 失败提示统一补一句「积分退回去了」，免得用户以为白扣 */
  function withRefund(msg, refunded) {
    if (!refunded || els.preset.value !== "site") return msg;
    return msg + "（这次的 1 积分已自动退回）";
  }

  function syncCreditsUI() {
    if (els.preset.value !== "site") return;
    if (!(window.WY_AUTH && window.WY_AUTH.refreshCredits)) return;
    window.WY_AUTH.refreshCredits().then(function (n) {
      refreshCreditLine();
      if (n === 0) setWizardStatus("积分用完了：去控制台看明细，或切到自填接口继续写。", "error");
    });
  }

  function refreshCreditLine() {
    if (!els.cfgCredits) return;
    var n = window.WY_AUTH && window.WY_AUTH.credits ? window.WY_AUTH.credits() : null;
    var txt = n === null ? "剩余积分：登录后显示" : ("剩余积分 " + n + " · 每次操作消耗 1 积分");
    els.cfgCredits.textContent = txt;
  }

  fillForm(readConfig());
  syncPresetUI(true);        // 首次渲染别把表单默认值当成用户填的自定义配置存进档案

  /* auth.js 在 write.js 之后加载，初始化时还拿不到登录态与积分，这里补两次 */
  function hookAuthCredits() {
    if (window.WY_AUTH && window.WY_AUTH.onChange) {
      window.WY_AUTH.onChange(function () { refreshCreditLine(); syncCreditsUI(); syncCostBadges(); });
      return true;
    }
    return false;
  }
  if (!hookAuthCredits()) {
    var hookTimer = setInterval(function () {
      if (hookAuthCredits()) clearInterval(hookTimer);
    }, 120);
    setTimeout(function () { clearInterval(hookTimer); }, 4000);
  }
  window.addEventListener("load", function () { refreshCreditLine(); syncCostBadges(); });

  function setConfigOpen(open) {
    if (open) els.configPanel.removeAttribute("hidden");
    else els.configPanel.setAttribute("hidden", "");
    els.toggleConfig.setAttribute("aria-expanded", String(!!open));
    els.toggleConfig.textContent = open ? "收起配置" : "接口配置";
    // 每次展开都按当前预设重算一次，手机上 select 偶尔不触发 change 也能兜住
    if (open) syncPresetUI();
  }

  on(els.toggleConfig, "click", function () {
    setConfigOpen(els.configPanel.hasAttribute("hidden"));
  });
  // 手机上配置面板一展开就是整屏，默认收起，需要时点「接口配置」再开
  setConfigOpen(!readConfig().key && window.innerWidth > 760);

  ["preset", "base", "path", "key", "model", "temp", "maxTokens", "remember"].forEach(function (name) {
    els[name].addEventListener("change", saveConfig);
    if (name !== "remember" && name !== "preset") {
      els[name].addEventListener("input", saveConfig);
    }
  });

  on(els.preset, "change", function () {
    if (els.preset.value === "site") {
      syncPresetUI();
      saveConfig();
      setWizardStatus("站内模型：登录后直接用，每次操作消耗 1 积分。", "");
      return;
    }
    syncPresetUI();
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
    lastCustomCfg = null;
    fillForm({
      preset: "site", base: "", path: "/chat/completions",
      key: "", model: "auto", temp: "1",
      maxTokens: "2400", remember: true
    });
    syncPresetUI();
    setWizardStatus("配置已清除，回到站内模型。", "ok");
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
    // 1 类别 / 2 文体 / 3 题目 / 4 字数 / 5 额外要求
    if (selectedCat) steps[0].classList.add("done");
    else steps[0].classList.add("active");
    if (selectedGenre) steps[1].classList.add("done");
    else steps[1].classList.add("active");
    if (els.topic.value.trim()) {
      steps[2].classList.add("done");
      steps[3].classList.add("done");
    } else if (selectedCat) {
      steps[2].classList.add("active");
    }
  }

  // 把该类别的输入引导（标题/placeholder/提示/示例）应用到向导
  function applyCatUI(cat) {
    var cfg = (window.WY_CATEGORY && window.WY_CATEGORY[cat]) || null;
    if (!cfg) return;
    els.topicStepTitle.textContent = cfg.stepTitle;
    var step3 = els.wizardSteps.querySelector('li[data-step="3"]');
    if (step3) {
      step3.innerHTML = "";
      var dot = document.createElement("span");
      dot.className = "dot";
      dot.textContent = "3";
      step3.appendChild(dot);
      step3.appendChild(document.createTextNode(cfg.stepShort || cfg.stepTitle));
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

  /* ---------------- 向导：文体（不同文体走不同提示词规则） ---------------- */

  function syncGenreTip() {
    var g = window.WY_GENRE && window.WY_GENRE[selectedGenre];
    els.genreTip.textContent = g ? (g.tip || "") : "";
  }

  function buildGenreCards() {
    if (!els.genreGrid || !window.WY_GENRE) return;
    els.genreGrid.innerHTML = "";
    Object.keys(window.WY_GENRE).forEach(function (key) {
      var g = window.WY_GENRE[key];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "genre-card" + (key === selectedGenre ? " selected" : "");
      btn.setAttribute("data-genre", key);

      var head = document.createElement("div");
      head.className = "genre-head";
      var name = document.createElement("span");
      name.className = "genre-name";
      name.textContent = g.name || key;
      var tag = document.createElement("span");
      tag.className = "genre-tag";
      tag.textContent = g.tag || "";
      head.appendChild(name);
      head.appendChild(tag);

      var desc = document.createElement("div");
      desc.className = "genre-desc";
      desc.textContent = g.desc || "";

      btn.appendChild(head);
      btn.appendChild(desc);
      els.genreGrid.appendChild(btn);
    });
    syncGenreTip();
  }

  on(els.genreGrid, "click", function (e) {
    var card = e.target.closest(".genre-card");
    if (!card) return;
    selectedGenre = card.getAttribute("data-genre");
    els.genreGrid.querySelectorAll(".genre-card").forEach(function (c) {
      c.classList.toggle("selected", c === card);
    });
    syncGenreTip();
    updateSteps();
  });

  buildGenreCards();

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
    return "总分 " + s.total + " 分 · " + s.dims.map(function (d) { return d[0]; }).join("/") +
      " · " + s.bands.length + " 档";
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

  /* ---------------- 学段选择（单选，决定字数/文体/立意尺度） ---------------- */

  var STAGE_STORE = "wy.stage.v1";
  var selectedStage = "初中";
  try {
    var savedStage = localStorage.getItem(STAGE_STORE);
    if (savedStage && window.WY_STAGE && window.WY_STAGE[savedStage]) selectedStage = savedStage;
  } catch (e) { /* 隐私模式读不了就算了 */ }

  function buildStageCards() {
    if (!window.WY_STAGE_LIST || !els.stageGrid) return;
    els.stageGrid.innerHTML = "";
    window.WY_STAGE_LIST.forEach(function (stg) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stage-chip" + (stg === selectedStage ? " selected" : "");
      btn.setAttribute("data-stage", stg);
      btn.textContent = stg;
      els.stageGrid.appendChild(btn);
    });
    if (els.stageTip) els.stageTip.textContent = window.WY_STAGE[selectedStage].words +
      " 字左右 · " + (selectedStage === "小学" ? "记叙文为主" : selectedStage === "初中" ? "记叙文为主，可议" : "记叙、议论并行") +
      "；学段要求会与评分标准一起注入 AI。";
  }

  on(els.stageGrid, "click", function (e) {
    var chip = e.target.closest(".stage-chip");
    if (!chip) return;
    var stg = chip.getAttribute("data-stage");
    if (!stg || !window.WY_STAGE[stg]) return;
    selectedStage = stg;
    try { localStorage.setItem(STAGE_STORE, stg); } catch (e2) { /* 存不了就仅本次生效 */ }
    buildStageCards();
  });

  buildStageCards();

  /* ---------------- 右侧工作窗（贴边悬浮卡片） ----------------
     评卷、流程进度、评分标准表格全部收进这里。零嵌入：position fixed、
     不插进 .doc-body、不铺满视口、不加遮罩、不改 body 宽度或滚动，
     稿纸的高度、格线宽度、字格数始终不变；稿纸在抽屉打开时照样能点能选字。
     关闭只走拉手 / 头部「收起」/ Esc，不做「点外部关闭」，避免跟自绘选字打架。 */
  function drawerTabName(name) {
    return name === "flow" || name === "score" || name === "notes" || name === "history" ? name : "critic";
  }

  function syncDrawerDots() {
    var criticNew = !!(criticItems.length || criticScores.length);
    var flowNew = !!(els.flowSteps && els.flowSteps.children.length);
    var notesNew = pendingMarks().length + criticItems.filter(function (x) {
      return !x.agreed && x.verdict === "坏";
    }).length;
    if (els.drawerDotCritic) els.drawerDotCritic.hidden = !criticNew || (drawerOpen && drawerTab === "critic");
    if (els.drawerDotNotes) els.drawerDotNotes.hidden = !notesNew || (drawerOpen && drawerTab === "notes");
    if (els.drawerDotFlow) els.drawerDotFlow.hidden = !flowNew || (drawerOpen && drawerTab === "flow") || flowActive;
    if (els.drawerDotHistory) els.drawerDotHistory.hidden = !(versions.length > 0) || (drawerOpen && drawerTab === "history");
    // 拉手角标：有待处理的朱红批注、流程进行中，或没看过的评改结果
    var n = pendingMarks().length;
    var tip = flowActive ? "流程进行中" : "";
    if (els.drawerBadge) {
      var show = !drawerOpen && (n > 0 || (criticNew && drawerTab !== "critic") || flowActive);
      els.drawerBadge.hidden = !show;
      if (show) {
        els.drawerBadge.textContent = flowActive ? "…" : (n ? String(n) : "·");
        els.drawerBadge.title = tip || (n ? n + " 处批注待处理" : "有新的评改结果");
      }
    }
  }

  function setDrawerTab(name) {
    drawerTab = drawerTabName(name);
    Object.keys(els.drawerPanes).forEach(function (k) {
      var p = els.drawerPanes[k];
      if (p) p.hidden = k !== drawerTab;
    });
    if (els.drawerTabs) {
      els.drawerTabs.querySelectorAll(".drawer-tab").forEach(function (b) {
        var on = b.getAttribute("data-drawer") === drawerTab;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", String(on));
      });
    }
    if (drawerTab === "score") renderScoreTables();
    if (drawerTab === "notes") renderDrawerNotes();
    if (drawerTab === "history") renderHistoryList();
    syncScoreToggle();
    syncDrawerDots();
  }

  // 抽屉 tab 与顶部评分摘要行状态保持一致
  function syncScoreToggle() {
    var scoreShown = drawerOpen && drawerTab === "score";
    if (els.scoreToggle) els.scoreToggle.setAttribute("aria-expanded", String(scoreShown));
    if (els.scoreCaret) els.scoreCaret.textContent = scoreShown ? "收起表格" : "查看表格";
  }

  function setDrawer(open, tab, auto) {
    if (auto && drawerAutoSuppressed) return;
    drawerOpen = !!open;
    if (open && tab) setDrawerTab(tab);
    if (els.workDrawer) els.workDrawer.hidden = !drawerOpen;
    if (els.drawerHandle) {
      els.drawerHandle.classList.toggle("is-open", drawerOpen);
      els.drawerHandle.setAttribute("aria-expanded", String(drawerOpen));
      els.drawerHandle.setAttribute("aria-label", drawerOpen ? "收起工作窗" : "拉出工作窗");
    }
    document.body.classList.toggle("drawer-open", drawerOpen);
    syncScoreToggle();
    syncDrawerDots();
  }

  function closeDrawer(manual) {
    if (manual) drawerAutoSuppressed = true;
    setDrawer(false);
  }

  // 评卷卡片与空态互斥；抽屉里不随「大纲/稿纸」切换消失
  function syncCriticDock(force) {
    var has = !!force || !!(criticItems.length || criticScores.length);
    if (els.criticDock) els.criticDock.hidden = !has;
    if (els.criticEmpty) els.criticEmpty.hidden = has;
    syncDrawerDots();
  }

  function syncFlowDock(force) {
    var has = !!force || !!(els.flowSteps && els.flowSteps.children.length) || flowActive;
    if (els.flowDock) els.flowDock.hidden = !has;
    if (els.flowEmpty) els.flowEmpty.hidden = has;
    syncDrawerDots();
  }

  /* 评分区：把所选省份的表格渲染到生成界面顶部摘要 + 抽屉里的完整表格 */
  function renderScoreTables() {
    var list = activeProvinces.length ? activeProvinces : selectedProvinces;
    els.scoreChips.innerHTML = "";
    els.scoreTables.innerHTML = "";
    var gchip = document.createElement("span");
    gchip.className = "score-chip";
    gchip.textContent = "学段 " + stageNow();
    els.scoreChips.appendChild(gchip);

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
      if (s.deduct && s.deduct.length) {
        var COIN = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="2.6" fill="currentColor"/></svg>';
        var wrap = document.createElement("div");
        wrap.className = "score-deduct";
        s.deduct.forEach(function (d) {
          var it = document.createElement("span");
          it.className = "deduct-item";
          if (d[1] > 0) it.classList.add("bonus");
          it.appendChild(document.createTextNode(d[0] + " "));
          var v = document.createElement("span");
          v.className = "deduct-val";
          var num = d[2] ? String(d[2]) : String(Math.abs(d[1]));
          if (d[1] > 0) num = "+" + num;
          else if (d[1] < 0) num = "-" + num;
          v.innerHTML = COIN + "<span>" + num + "</span>";
          it.appendChild(v);
          wrap.appendChild(it);
        });
        box.appendChild(wrap);
      } else if (s.notes) {
        var note = document.createElement("div");
        note.className = "score-table-note";
        note.textContent = "评分细则：" + s.notes;
        box.appendChild(note);
      }
      els.scoreTables.appendChild(box);
    });
  }

  function setScoreOpen(open) {
    if (open) setDrawer(true, "score");
    else if (drawerTab === "score") setDrawer(false);
    els.scoreToggle.setAttribute("aria-expanded", String(!!open));
    els.scoreCaret.textContent = open ? "收起表格" : "查看表格";
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

  /* 作文以 JSON 输出：从模型返回里抠出 {title, body} 对象，外壳任何客套话（"好的，以下是修改后的作文："之类）
     一律忽略。这是比解析 ===作文=== 文本更安全的方式——模型再啰嗦也不会把回答写进正文。 */
  function parseCompositionJSON(raw) {
    var s = trim(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    var a = s.indexOf("{");
    if (a < 0) throw new Error("模型没有返回作文 JSON，换一个模型再试。");
    // 从第一个 { 起做括号配对，找到与之匹配的最外层 }：正文里的花括号不会干扰
    var depth = 0, inStr = false, esc = false, end = -1;
    for (var i = a; i < s.length; i++) {
      var ch = s.charAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === "\"") inStr = false;
      } else {
        if (ch === "\"") inStr = true;
        else if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
      }
    }
    if (end < 0) throw new Error("作文 JSON 解析失败，换一个模型再试。");
    var obj;
    try { obj = JSON.parse(s.slice(a, end + 1)); }
    catch (e) { throw new Error("作文 JSON 解析失败，换一个模型再试。"); }
    var title = trim(obj && obj.title) || "";
    var body = trim(obj && obj.body) || "";
    if (!body) throw new Error("作文 JSON 里没有正文，换一个模型再试。");
    return { title: title, body: body };
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

  /* ---------------- 稿纸渲染（正文也要一字一格，与批注态同一套管线） ---------------- */

  /* 段内容写进已经建好的 p：逐字切格 + 行首禁则。流式时末尾追加光标。
     用 el.__txt 记住上一帧的文本，流式反复调用时只有真正变了的段落才重画。 */
  function fillPaperPara(el, txt, withCaret) {
    el.textContent = "";
    el.appendChild(charSpans(txt));
    groupPunctIn(el);
    if (withCaret) {
      var caret = document.createElement("span");
      caret.className = "caret";
      el.appendChild(caret);
    }
    el.__txt = txt;
  }

  var paperAlignRaf = 0;

  function render(text, streaming, forceTitle) {
    var parts = titledParts(text, forceTitle);
    lastTitle = parts.title || "作文";
    els.paperTitle.textContent = lastTitle;
    els.paperBody.classList.remove("paper-empty");

    var paras = parts.body.split(/\n+/).filter(function (p) { return p.trim(); });
    if (!paras.length && streaming) paras = [""];

    var old = els.paperBody.querySelectorAll("p");
    for (var i = paras.length; i < old.length; i++) old[i].parentNode.removeChild(old[i]);

    for (var j = 0; j < paras.length; j++) {
      var txt = paras[j].replace(/\n/g, "");
      var atTail = streaming && j === paras.length - 1;
      var el = old[j];
      if (!el) {
        el = document.createElement("p");
        els.paperBody.appendChild(el);
      }
      // 段落文本变了，或者光标该出现/该消失，才重画这一段
      if (el.__txt !== txt || !!el.querySelector(".caret") !== atTail) {
        fillPaperPara(el, txt, atTail);
      }
    }

    var count = Array.from(parts.body.replace(/\s/g, "")).length;
    els.paperStat.textContent = count ? ("字数 " + count + (streaming ? " · 生成中" : " 字")) : "";

    // 段落高度取整格：流式期间每来一个字就量一遍太贵，收尾再对齐
    if (streaming) {
      if (!paperAlignRaf) {
        paperAlignRaf = requestAnimationFrame(function () { paperAlignRaf = 0; alignPaperGrid(); });
      }
    } else {
      if (paperAlignRaf) { cancelAnimationFrame(paperAlignRaf); paperAlignRaf = 0; }
      alignPaperGrid();
    }
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

  /* 每个字符单独一个定宽格：中文标点、英文数字的字宽和汉字不同，
     靠 letter-spacing 拼步长必然越走越歪，只能一字一格硬定住。 */
  function charSpans(text) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var s = document.createElement("span");
      s.className = "ch";
      s.textContent = ch === " " ? "\u00a0" : ch;
      frag.appendChild(s);
    }
    return frag;
  }

  /* 行首禁则：这些符号不能出现在某行第一个格子里（会跑到上一行末尾挤一格）。
     做法是把「字 + 紧跟的标点」包成一个不可拆的 .chu 单位，换行时整对一起走。 */
  var NO_LINE_START = "，。、；：？！）〕〉》」』】·…—～,.;:?!)]}%”’";

  function isNoLineStart(ch) {
    return !!ch && NO_LINE_START.indexOf(ch) >= 0;
  }

  function lastChIn(node) {
    if (node.nodeType === 1) {
      if (node.classList.contains("ch")) return node;
      var all = node.querySelectorAll(".ch");
      return all.length ? all[all.length - 1] : null;
    }
    return null;
  }

  function groupPunctIn(el) {
    var kids = Array.prototype.slice.call(el.childNodes);
    var prevCh = null;
    kids.forEach(function (node) {
      if (node.nodeType !== 1) { prevCh = null; return; }
      if (node.classList.contains("ch")) {
        var txt = node.textContent;
        if (prevCh && isNoLineStart(txt)) {
          // prevCh 可能在子容器（锁定/批注标记）里：把配对单位挂进它所在的层，
          // 让标点跟着前一个字走，不然跨容器边界的句号会掉到下一行行首。
          var host = prevCh.parentNode;
          var unit = document.createElement("span");
          unit.className = "chu";
          if (host === el) el.insertBefore(unit, prevCh);
          else host.appendChild(unit);
          unit.appendChild(prevCh);
          unit.appendChild(node);
          prevCh = null;       // 一个单位最多两个字，避免整句不可拆
          return;
        }
        prevCh = node;
        return;
      }
      // 容器（黄标、批注、评改标记）：先处理内部，再决定是否承接后面的标点
      groupPunctIn(node);
      prevCh = lastChIn(node) || prevCh;
    });
    return el;
  }

  // 把一段普通文本按"上一轮改动"区间切成节点（黄底）
  function appendPlainWithHighlights(el, text) {
    var hs = prevIntervals(text);
    var p = 0;
    hs.forEach(function (h) {
      if (h.start > p) el.appendChild(document.createTextNode(text.slice(p, h.start)));
      var y = document.createElement("span");
      y.className = "ink-prev";
      y.title = "AI 已改过的文字";
      y.appendChild(charSpans(text.slice(h.start, h.end)));
      el.appendChild(y);
      p = h.end;
    });
    if (p < text.length) el.appendChild(charSpans(text.slice(p)));
  }

  /* AI 评改的句子也要落回原文位置：用更淡的虚线和角标标在原句上，
     与朱红批注符号互不冲突（同一处已被批注占用时，评改标记让位）。

     AI 从原文摘句子时常会改标点/空格，或摘跨段长句，导致精确 indexOf 落空而整句标不出。
     所以匹配分三级：整句精确 → 归一化（忽略空白与全角/半角标点）→ 归一化前 14 字兜底；
     模糊兜底不再因"重复出现"放弃，宁可标第一处也要让学生看见，别整篇零高亮。 */
  // 比对时一律去掉标点与空白，只比文字：AI 摘句改成空格/半角标点/漏标点都能对上
  var CRITIC_PUNCT = /[，。、；：！？（）【】《》“”‘’「」『』—－…·,.;:!?()\[\]{}"'`~@#$%^&*_+=\/\\|<>-]/;
  // 归一化并保留"归一化字符 → 原索引"的映射，便于匹配后换算回原文区间
  function criticNormWithMap(str) {
    var out = "", idxs = [];
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (ch === "\u3000" || /\s/.test(ch) || CRITIC_PUNCT.test(ch)) continue;
      out += ch;
      idxs.push(i);
    }
    return { text: out, idxs: idxs };
  }

  function criticIntervalsIn(paraText) {
    var list = [];
    var pNorm = null;
    criticItems.forEach(function (it) {
      var full = trim(it.sentence);
      if (!full) return;
      var start = -1, end = -1;
      // 1) 整句精确
      var a = paraText.indexOf(full);
      if (a >= 0) { start = a; end = a + full.length; }
      // 2) 归一化匹配（忽略空格与标点全角/半角差异）
      if (start < 0) {
        if (!pNorm) pNorm = criticNormWithMap(paraText);
        var fNorm = criticNormWithMap(full);
        if (fNorm.text) {
          var at = pNorm.text.indexOf(fNorm.text);
          if (at >= 0) { start = pNorm.idxs[at]; end = pNorm.idxs[at + fNorm.text.length - 1] + 1; }
        }
      }
      // 3) 归一化前 14 字兜底（跨段长句也至少标出开头那一截）
      if (start < 0) {
        if (!pNorm) pNorm = criticNormWithMap(paraText);
        var fHead = criticNormWithMap(full).text.slice(0, 14);
        if (fHead) {
          var at2 = pNorm.text.indexOf(fHead);
          if (at2 >= 0) { start = pNorm.idxs[at2]; end = pNorm.idxs[at2 + fHead.length - 1] + 1; }
        }
      }
      if (start < 0) return;
      list.push({ start: start, end: end, item: it });
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

  /* ---------------- 锁句：学生认定要留的句子，AI 不许改也不许批注 ----------------
     存在 lockedTexts 里，渲染时包成 .lock-mark，同时注入提示词、并在评改/批注两条路上过滤。 */
  var lockedTexts = [];
  var LOCK_STORE = "wy.locked.v1";

  function normLock(s) {
    return String(s || "").replace(/[\s\u3000]/g, "").replace(/[\u2460-\u2473]/g, "");
  }

  function loadLocked() {
    try {
      var a = JSON.parse(localStorage.getItem(LOCK_STORE) || "[]");
      lockedTexts = Array.isArray(a) ? a.filter(function (x) { return typeof x === "string" && x; }) : [];
    } catch (e) { lockedTexts = []; }
  }

  function saveLocked() {
    try { localStorage.setItem(LOCK_STORE, JSON.stringify(lockedTexts)); } catch (e) { /* 存不下就算了 */ }
    scheduleSessionSave();     // 锁句也算现场的一部分，跟着会话一起存
  }

  function isLocked(text) {
    var t = normLock(text);
    if (!t) return false;
    return lockedTexts.some(function (x) { return normLock(x).indexOf(t) >= 0 || t.indexOf(normLock(x)) >= 0; });
  }

  // 在一段正文里找出被锁住的区间（同段、唯一匹配才算，跨段的不标）
  function lockIntervalsIn(paraText) {
    var list = [], out = [], lastEnd = -1;
    lockedTexts.forEach(function (raw) {
      var needle = normLock(raw);
      if (needle.length < 2) return;
      var a = paraText.indexOf(needle);
      if (a < 0) return;
      if (paraText.indexOf(needle, a + needle.length) >= 0) return;
      list.push({ start: a, end: a + needle.length });
    });
    list.sort(function (x, y) { return x.start - y.start; });
    list.forEach(function (it) {
      if (it.start < lastEnd) return;
      out.push(it);
      lastEnd = it.end;
    });
    return out;
  }

  function lockText(t) {
    var v = normLock(t);
    if (v.length < 4) { setDocHint("选长一点再锁，四个字以上"); return; }
    if (v.length > 80) { setDocHint("一次锁一句，最多 80 字"); return; }
    if (isLocked(v)) { setDocHint("这句已经锁住了"); return; }
    lockedTexts.push(v);
    saveLocked();
    renderAnnotated();
    setDocHint("已锁住这一句，AI 不会改也不会批它。点正文里的这句可以解锁。");
  }

  function unlockText(t) {
    var v = normLock(t);
    lockedTexts = lockedTexts.filter(function (x) { return normLock(x).indexOf(v) < 0; });
    saveLocked();
    renderAnnotated();
    setDocHint("已解锁");
  }

  /* 容器（锁定 / 评改标记）末尾紧跟的标点要一起吞进来。
     否则标点留在容器外面，换行时会被推到下一行行首——行首禁则管不到跨容器的边界。 */
  function extendOverPunct(text, end) {
    var k = 0;
    while (end < text.length && k < 2 && isNoLineStart(text.charAt(end))) {
      end++;
      k++;
    }
    return end;
  }

  // 一段纯文本：先切锁定区间，再切评改区间，区间内部再切"上一轮改动"的黄底
  function appendRichText(el, text) {
    var livs = lockIntervalsIn(text);
    if (!livs.length) { appendCriticText(el, text); return; }
    var p = 0;
    livs.forEach(function (c) {
      var st = Math.max(c.start, p);
      var en = extendOverPunct(text, c.end);
      if (st >= en) return;
      var piece = text.slice(st, en);
      if (st > p) appendCriticText(el, text.slice(p, st));
      var sp = document.createElement("span");
      sp.className = "lock-mark";
      sp.title = "已锁住：AI 不许改、也不许批注。点一下解锁";
      sp.appendChild(charSpans(piece));
      sp.addEventListener("click", function (e) {
        e.stopPropagation();
        unlockText(piece);
      });
      el.appendChild(sp);
      p = en;
    });
    if (p < text.length) appendCriticText(el, text.slice(p));
  }

  function appendCriticText(el, text) {
    var civs = criticIntervalsIn(text);
    var p = 0;
    civs.forEach(function (c) {
      var st = Math.max(c.start, p);
      var en = extendOverPunct(text, c.end);
      if (st >= en) return;
      if (st > p) appendPlainWithHighlights(el, text.slice(p, st));
      var sp = document.createElement("span");
      sp.className = "critic-mark " + (c.item.verdict === "好" ? "cm-good" : "cm-bad") +
        (c.item.agreed === "yes" ? " cm-agreed" : c.item.agreed === "no" ? " cm-denied" : "");
      sp.appendChild(charSpans(text.slice(st, en)));
      sp.setAttribute("data-critic-id", String(c.item.id));
      sp.setAttribute("data-critic-no", String(c.item.no));
      sp.title = "AI 评改 #" + c.item.no + "（" + c.item.verdict + "）：" + (c.item.reason || "");
      (function (item, node) {
        node.addEventListener("click", function (e) {
          e.stopPropagation();
          showCriticPop(item, node);
          focusCriticCard(item.id);
        });
      })(c.item, sp);
      el.appendChild(sp);
      p = en;
    });
    if (p < text.length) appendPlainWithHighlights(el, text.slice(p));
  }

  /* ---------------- 点评判句 → 悬浮小卡（非弹窗、不遮稿纸） ----------------
     fixed 定位挂在句子旁边，不加遮罩、不进排版流、不改稿纸几何；
     点别处 / Esc / 滚动即收。卡片只解释这一句为什么被判成好坏，
     要「认可 / 不认可」再去右侧抽屉，避免小卡上堆一排按钮。 */

  var criticPopEl = null, criticPopId = null;

  function ensureCriticPop() {
    if (criticPopEl && document.body.contains(criticPopEl)) return criticPopEl;
    var d = document.createElement("div");
    d.className = "critic-pop";
    d.hidden = true;
    d.addEventListener("click", function (e) { e.stopPropagation(); });
    document.body.appendChild(d);
    criticPopEl = d;
    return d;
  }

  function hideCriticPop() {
    if (criticPopEl) criticPopEl.hidden = true;
    if (els.paperBody) {
      var m = els.paperBody.querySelector(".critic-mark.pop-on");
      if (m) m.classList.remove("pop-on");
    }
    criticPopId = null;
  }

  function popLine(label, text, cls) {
    var p = document.createElement("p");
    p.className = "critic-pop-row" + (cls ? " " + cls : "");
    var b = document.createElement("b");
    b.textContent = label;
    p.appendChild(b);
    p.appendChild(document.createTextNode(text));
    return p;
  }

  function placeCriticPop(pop, anchor) {
    pop.style.visibility = "hidden";
    pop.hidden = false;
    pop.style.left = "0px";
    pop.style.top = "0px";
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var r = anchor.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.min(Math.max(8, r.left - 4), Math.max(8, vw - w - 8));
    var top = r.top - h - 10;
    if (top < 8) top = Math.min(r.bottom + 10, Math.max(8, vh - h - 8));
    pop.style.left = Math.round(left) + "px";
    pop.style.top = Math.round(top) + "px";
    pop.style.visibility = "";
  }

  function showCriticPop(item, anchor) {
    if (!item) return;
    var pop = ensureCriticPop();
    if (criticPopId === item.id && !pop.hidden) { hideCriticPop(); return; }
    hideCriticPop();
    pop.innerHTML = "";

    var head = document.createElement("div");
    head.className = "critic-pop-head";
    var no = document.createElement("span");
    no.className = "critic-pop-no " + (item.verdict === "好" ? "good" : "bad");
    no.textContent = "#" + item.no;
    var vd = document.createElement("span");
    vd.className = "critic-pop-verdict " + (item.verdict === "好" ? "good" : "bad");
    vd.textContent = item.verdict === "好" ? "这句写得好" : (item.hard ? "硬伤 · " + item.hard : "小毛病");
    head.appendChild(no);
    head.appendChild(vd);
    if (item.ai) {
      var t = document.createElement("span");
      t.className = "critic-pop-tag";
      t.textContent = "有 AI 味";
      head.appendChild(t);
    }
    pop.appendChild(head);

    if (item.sentence) {
      var q = document.createElement("p");
      q.className = "critic-pop-quote";
      q.textContent = "「" + item.sentence.slice(0, 64) + "」";
      pop.appendChild(q);
    }
    if (item.reason) pop.appendChild(popLine("为什么：", item.reason));
    if (item.ai && item.aiWhy) pop.appendChild(popLine("AI 味：", item.aiWhy, "warn"));
    if (item.fix) pop.appendChild(popLine("可以改成：", item.fix, "fix"));

    var foot = document.createElement("div");
    foot.className = "critic-pop-foot";
    var more = document.createElement("button");
    more.type = "button";
    more.className = "critic-pop-more";
    more.textContent = "在右侧看全部评语";
    more.onclick = function () {
      hideCriticPop();
      setDrawer(true, "critic");
      focusCriticCard(item.id);
    };
    foot.appendChild(more);
    pop.appendChild(foot);

    placeCriticPop(pop, anchor);

    if (els.paperBody) {
      var m = els.paperBody.querySelector('.critic-mark[data-critic-id="' + item.id + '"]');
      if (m) m.classList.add("pop-on");
    }
    criticPopId = item.id;
  }

  /* 批注锚点所在的段落序号，渲染旁批时用来对齐行位置 */
  var markPara = {};
  /* AI 评改句所在的段落序号，评改也走右栏旁批 */
  var criticPara = {};

  function buildMarkedParagraph(paraText, marks, paraIndex) {
    var el = document.createElement("p");
    if (typeof paraIndex === "number") el.setAttribute("data-para", String(paraIndex));
    var ivs = intervalsFor(paraText, marks);
    if (typeof paraIndex === "number") {
      criticIntervalsIn(paraText).forEach(function (c) { criticPara[c.item.id] = paraIndex; });
    }
    var pos = 0;
    ivs.forEach(function (it) {
      if (it.start > pos) appendRichText(el, paraText.slice(pos, it.start));
      var span = document.createElement("span");
      span.className = "ink-mark ink-" + it.mark.type;
      span.appendChild(charSpans(it.anchor));
      span.setAttribute("data-mark-id", it.mark.id);
      span.title = (SYMBOL_LABEL[it.mark.type] || "批注") + "：" + (it.mark.reason || "");
      if (typeof paraIndex === "number") markPara[it.mark.id] = paraIndex;
      var no = document.createElement("sup");
      no.className = "ink-no";
      no.textContent = markNo(it.mark.no);
      span.appendChild(no);
      el.appendChild(span);
      // 建议文字不进稿纸格子（会占宽、把后面的字挤错格），只在下方批注条和左侧卡片里给
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
    if (pos < paraText.length) appendRichText(el, paraText.slice(pos));
    groupPunctIn(el);   // 行首禁则：标点不许单独落到下一行开头
    return el;
  }

  // 用 docTitle/docBody 重渲染稿纸（带修改符号），不依赖 fullText
  function findMark(id) {
    for (var i = 0; i < annotations.length; i++) {
      if (annotations[i].id === id) return annotations[i];
    }
    return null;
  }

  /* ---------------- 右侧旁批栏 ----------------
     点稿纸上的朱红符号 → 右侧对应的旁批条目点亮，理由、建议、采纳/忽略都在那里，
     不动正文、不遮字。 */

  function noteEl(markId) {
    if (!els.paperNotes) return null;
    return els.paperNotes.querySelector('.note[data-mark-id="' + markId + '"]');
  }

  function showInkDock(markId) {
    var m = findMark(markId);
    if (!m) return;
    var n = noteEl(markId);
    if (!n) return;
    n.classList.add("active");
    var paper = n.closest(".paper");
    if (paper) {
      var pr = paper.getBoundingClientRect();
      var nr = n.getBoundingClientRect();
      if (nr.top < pr.top + 6 || nr.bottom > pr.bottom - 6) {
        n.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function hideInkDock() {
    if (!els.paperNotes) return;
    var list = els.paperNotes.querySelectorAll(".note.active");
    for (var i = 0; i < list.length; i++) list[i].classList.remove("active");
  }

  function clearActiveMarks() {
    var list = els.paperBody.querySelectorAll(".ink-mark.active");
    for (var i = 0; i < list.length; i++) list[i].classList.remove("active");
    hideInkDock();
  }

  /* ---------------- 右栏条目：手批一条 ---------------- */
  function buildMarkNote(m) {
    var note = document.createElement("div");
    note.className = "note note-" + m.type;
    note.setAttribute("data-mark-id", String(m.id));

    var head = document.createElement("div");
    head.className = "note-head";
    var no = document.createElement("span");
    no.className = "note-no";
    no.textContent = markNo(m.no);
    var typ = document.createElement("span");
    typ.className = "note-type";
    typ.textContent = SYMBOL_LABEL[m.type] || "批注";
    head.appendChild(no);
    head.appendChild(typ);
    note.appendChild(head);

    var why = document.createElement("div");
    why.className = "note-why";
    why.textContent = m.reason || "（这条没写原因）";
    note.appendChild(why);

    if (m.text && (m.type === "replace" || m.type === "insert")) {
      var sug = document.createElement("div");
      sug.className = "note-sug";
      sug.textContent = (m.type === "insert" ? "增补：" : "改为：") + m.text;
      note.appendChild(sug);
    }

    var acts = document.createElement("div");
    acts.className = "note-acts";
    var ok = document.createElement("button");
    ok.type = "button";
    ok.className = "note-accept";
    ok.textContent = "采纳";
    ok.addEventListener("click", function (e) {
      e.stopPropagation();
      applyMarkAction(m.id, "accept");
    });
    var no2 = document.createElement("button");
    no2.type = "button";
    no2.className = "note-ignore";
    no2.textContent = "忽略";
    no2.addEventListener("click", function (e) {
      e.stopPropagation();
      applyMarkAction(m.id, "ignore");
    });
    acts.appendChild(ok);
    acts.appendChild(no2);
    note.appendChild(acts);

    note.addEventListener("click", function () {
      clearActiveMarks();
      note.classList.add("active");
      var sp = els.paperBody.querySelector('.ink-mark[data-mark-id="' + m.id + '"]');
      if (sp) sp.classList.add("active");
    });
    return note;
  }

  /* ---------------- 右栏条目：AI 评改一句 ---------------- */
  function buildCriticNote(it) {
    var note = document.createElement("div");
    note.className = "note note-critic " + (it.verdict === "好" ? "nc-good" : "nc-bad") +
      (it.soft ? " nc-soft" : "") +
      (it.settled === false ? " nc-dispute" : "") +
      (it.agreed === "yes" ? " nc-yes" : it.agreed === "no" ? " nc-no" : "");
    note.setAttribute("data-critic-id", String(it.id));

    var head = document.createElement("div");
    head.className = "note-head";
    var no = document.createElement("span");
    no.className = "note-no";
    no.textContent = "#" + it.no;
    var verdict = document.createElement("span");
    verdict.className = "note-verdict";
    verdict.textContent = it.verdict;
    head.appendChild(no);
    head.appendChild(verdict);
    if (it.hard) {
      var hk = document.createElement("span");
      hk.className = "note-hard";
      hk.textContent = it.hard;
      head.appendChild(hk);
    }
    if (it.soft) {
      var sf = document.createElement("span");
      sf.className = "note-soft";
      sf.textContent = "理由不具体";
      head.appendChild(sf);
    }
    if (it.settled === false) {
      var dsp = document.createElement("span");
      dsp.className = "note-dispute";
      dsp.textContent = "两评未谈拢";
      head.appendChild(dsp);
    }
    if (it.ai) {
      var ai = document.createElement("span");
      ai.className = "note-ai";
      ai.textContent = "AI 味";
      head.appendChild(ai);
    }
    if (it.agreed === "yes" || it.agreed === "no") {
      var flag = document.createElement("span");
      flag.className = "note-flag";
      flag.textContent = it.agreed === "yes" ? "已认可" : "已否决";
      head.appendChild(flag);
    }
    note.appendChild(head);

    var why = document.createElement("div");
    why.className = "note-why";
    why.textContent = it.reason || (it.verdict === "好" ? "这句没问题，留着。" : "（这条没写原因）");
    note.appendChild(why);

    if (it.aiWhy) {
      var aw = document.createElement("div");
      aw.className = "note-why nc-sub";
      aw.textContent = "AI 味：" + it.aiWhy;
      note.appendChild(aw);
    }
    if (it.fix) {
      var fx = document.createElement("div");
      fx.className = "note-sug";
      fx.textContent = "方向：" + it.fix;
      note.appendChild(fx);
    }
    if (it.dispute && it.dispute.why) {
      var dp = document.createElement("div");
      dp.className = "note-why nc-sub nc-dispute-why";
      dp.textContent = (it.settled === false ? "另一评不同意：" : "复核时提过：") + it.dispute.why +
        (it.dispute.reply ? "（主评：" + it.dispute.reply + "）" : "");
      note.appendChild(dp);
    }

    var acts = document.createElement("div");
    acts.className = "note-acts nc-acts";
    var yes = document.createElement("button");
    yes.type = "button";
    yes.className = "note-accept" + (it.agreed === "yes" ? " on" : "");
    yes.textContent = "认可";
    if (it.soft) {
      yes.disabled = true;
      yes.title = "这条没说清具体毛病，不交给整篇重写";
    } else if (it.settled === false) {
      yes.disabled = true;
      yes.title = "两评还没谈拢，不交给整篇重写";
    }
    yes.addEventListener("click", function (e) { e.stopPropagation(); setCriticAgree(it.id, "yes"); });
    var deny = document.createElement("button");
    deny.type = "button";
    deny.className = "note-ignore" + (it.agreed === "no" ? " on" : "");
    deny.textContent = "不认可";
    deny.addEventListener("click", function (e) { e.stopPropagation(); setCriticAgree(it.id, "no"); });
    acts.appendChild(yes);
    acts.appendChild(deny);
    note.appendChild(acts);

    note.addEventListener("click", function () {
      focusSentence(it.sentence);
      note.classList.add("active");
    });
    return note;
  }

  /* 抽屉「旁批」页：手机端是旁批的唯一落点，桌面端额外给一个按正文顺序的列表视图。
     卡片复用右栏那套构建函数，去掉绝对定位，按锚点在正文里的位置排好序。 */
  function noteAnchorPos(s) {
    var t = trim(String(s || "")).split("|||")[0].slice(0, 30);
    var i = t ? docBody.indexOf(t) : -1;
    return i < 0 ? 999999 : i;
  }

  function renderDrawerNotes() {
    var host = els.drawerNoteList;
    if (!host) return;
    host.innerHTML = "";
    var items = [];
    pendingMarks().forEach(function (m) {
      items.push({ kind: "mark", m: m, at: noteAnchorPos(m.anchor) });
    });
    criticItems.forEach(function (it) {
      items.push({ kind: "critic", it: it, at: noteAnchorPos(it.sentence) });
    });
    items.sort(function (a, b) {
      if (a.at !== b.at) return a.at - b.at;
      return (a.kind === "mark" ? 0 : 1) - (b.kind === "mark" ? 0 : 1);
    });
    items.forEach(function (o) {
      var note = o.kind === "mark" ? buildMarkNote(o.m) : buildCriticNote(o.it);
      note.style.top = "";
      note.classList.add("drawer-note");
      host.appendChild(note);
    });
    if (els.drawerNoteEmpty) els.drawerNoteEmpty.hidden = items.length > 0;
    syncDrawerDots();
  }

  /* 把待处理批注与 AI 评改按所在段落一起排进右栏，同段/相邻的依次下移，不互相盖住 */
  function renderMarginNotes() {
    var host = els.paperNotes;
    if (!host) return;
    if (typeof syncPaperBadge === "function") syncPaperBadge();
    renderDrawerNotes();
    // 手机端旁批全部收进右侧工作窗，稿纸下方不再挂卡片列表
    if (isMobile()) {
      host.innerHTML = "";
      host.style.height = "";
      return;
    }
    host.innerHTML = "";
    var marks = pendingMarks();
    if (!marks.length && !criticItems.length) {
      host.style.height = "";
      return;
    }

    var items = [];
    marks.forEach(function (m) {
      var idx = markPara[m.id];
      if (typeof idx !== "number") return;
      var p = els.paperBody.querySelector('p[data-para="' + idx + '"]');
      if (!p) return;
      items.push({ kind: "mark", m: m, p: p, sp: null });
    });
    criticItems.forEach(function (it) {
      var idx = criticPara[it.id];
      if (typeof idx !== "number") return;
      var p = els.paperBody.querySelector('p[data-para="' + idx + '"]');
      if (!p) return;
      var sp = els.paperBody.querySelector('.critic-mark[data-critic-id="' + it.id + '"]');
      items.push({ kind: "critic", it: it, p: p, sp: sp });
    });
    if (!items.length) { host.style.height = ""; return; }

    var hostTop = host.getBoundingClientRect().top;
    items.forEach(function (it) {
      // 评改条目对齐到那句所在的字，比对齐段首更准
      var base = it.sp ? it.sp.getBoundingClientRect().top : it.p.getBoundingClientRect().top;
      it.top = base - hostTop;
    });
    items.sort(function (a, b) {
      if (a.top !== b.top) return a.top - b.top;
      return (a.kind === "mark" ? 0 : 1) - (b.kind === "mark" ? 0 : 1);
    });

    var lastBottom = -999;
    items.forEach(function (it) {
      var note = it.kind === "mark" ? buildMarkNote(it.m) : buildCriticNote(it.it);
      var top = Math.max(0, it.top);
      if (top < lastBottom + 6) top = lastBottom + 6;
      note.style.top = top + "px";
      host.appendChild(note);
      lastBottom = top + note.offsetHeight;
    });

    var bodyH = els.paperBody.offsetHeight;
    host.style.height = Math.max(bodyH, lastBottom) + "px";
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

  /* 正文一变，上一版稿件上的朱红批注、逐句评改、分数就全都不作数了。
     以「锚点还能不能在新正文里逐字找到」为准逐条清掉，避免旧旁批挂到新句子上。
     这是兜底：整篇重写会显式全清，恢复云稿 / 流程回滚 / 手动改字走这里。 */
  function normAnchor(s) {
    return String(s || "").replace(/\s/g, "");
  }

  function pruneStaleNotes() {
    if (!lastNoteBody) { lastNoteBody = docBody; return 0; }
    if (lastNoteBody === docBody) return 0;
    lastNoteBody = docBody;
    var flat = normAnchor(docBody);
    var dropped = 0;

    if (annotations.length) {
      var keep = annotations.filter(function (m) {
        var a = normAnchor(m.type === "swap" ? String(m.anchor).split("|||")[0] : m.anchor);
        return !!a && flat.indexOf(a) >= 0;
      });
      dropped += annotations.length - keep.length;
      annotations = keep;
    }
    if (prevAcceptedTexts.length) {
      prevAcceptedTexts = prevAcceptedTexts.filter(function (t) {
        var a = normAnchor(t);
        return !!a && flat.indexOf(a) >= 0;
      });
    }
    if (criticItems.length) {
      var keepC = criticItems.filter(function (it) {
        var a = normAnchor(it.sentence);
        return !!a && flat.indexOf(a) >= 0;
      });
      dropped += criticItems.length - keepC.length;
      criticItems = keepC;
    }
    // 分数是对整篇给的，正文一变就作废，免得流程里拿旧分数比大小
    if (criticScores.length) { criticScores = []; dropped += 1; }

    if (!annotations.length && annotPanelEl) { annotPanelEl.remove(); annotPanelEl = null; }
    syncAnnotTools();
    renderCriticScores();
    syncCriticApply();
    syncCriticDock();
    syncDrawerDots();
    if (dropped && els.criticStat) {
      els.criticStat.textContent = "正文已变，清掉 " + dropped + " 条对不上的旧旁批/旧评分；需要请重新评改。";
    }
    scheduleSessionSave();     // 清理结果要落盘，否则刷新又被旧的脏批注带回来
    return dropped;
  }

  /* 整篇重写前后的稿件快照：连同锁句、批注、评改一起存，恢复后不重跑清理 */
  function essaySnapshot() {
    return {
      title: docTitle, body: docBody, comp: currentComposition,
      locked: lockedTexts.slice(),
      notes: annotations.slice(), critic: criticItems.slice(),
      scores: criticScores.slice(), yellow: prevAcceptedTexts.slice()
    };
  }

  function restoreEssaySnapshot(snap) {
    docTitle = snap.title;
    docBody = snap.body;
    currentComposition = snap.comp || ((snap.title ? snap.title + "\n\n" : "") + snap.body);
    lockedTexts = snap.locked.slice();
    annotations = snap.notes.slice();
    criticItems = snap.critic.slice();
    criticScores = snap.scores.slice();
    prevAcceptedTexts = snap.yellow.slice();
    saveLocked();
    lastNoteBody = docBody;          // 快照是配套的，不触发「正文变了」清理
    renderAnnotated();
    renderAnnotPanel();
    renderCriticScores();
    syncCriticApply();
    syncCriticDock();
    syncAnnotTools();
    syncDrawerDots();
    syncUndoBtn();
    saveEssayToCloud();
    scheduleEssaySave();
  }

  // 整张稿纸都换了：旧批注、旧评改、旧分数、旧黄标一律作废
  function clearNotesAfterRewrite() {
    annotations = [];
    criticItems = [];
    criticScores = [];
    prevAcceptedTexts = [];
    if (annotPanelEl) { annotPanelEl.remove(); annotPanelEl = null; }
    lastNoteBody = docBody;
    syncAnnotTools();
    renderCriticScores();
    syncCriticApply();
    syncCriticDock();
    syncDrawerDots();
    if (els.criticStat) {
      els.criticStat.textContent = "已重写整篇，上一版的评分与旁批已清空；需要请重新评改。";
    }
    scheduleSessionSave();
  }

  function syncUndoBtn() {
    if (els.undoRewriteBtn) els.undoRewriteBtn.hidden = !undoStack.length;
  }

  function renderAnnotated() {
    pruneStaleNotes();
    els.paperTitle.textContent = docTitle || "作文";
    els.paperBody.textContent = "";
    els.paperBody.classList.remove("paper-empty");
    // 正文改动后，已经对不上的锁自动作废，免得一直挂在提示词里。
    // 正文还没加载时不能清，否则一进页面就把上次存的锁全删了。
    if (lockedTexts.length && docBody.trim()) {
      var bodyFlat = normLock(docBody);
      var alive = lockedTexts.filter(function (t) { return bodyFlat.indexOf(normLock(t)) >= 0; });
      if (alive.length !== lockedTexts.length) { lockedTexts = alive; saveLocked(); }
    }
    markPara = {};
    criticPara = {};
    var marks = pendingMarks();
    docBody.split(/\n+/).filter(function (p) { return p.trim(); }).forEach(function (p, idx) {
      els.paperBody.appendChild(buildMarkedParagraph(p.replace(/\n/g, ""), marks, idx));
    });
    var count = Array.from(docBody.replace(/\s/g, "")).length;
    var left = marks.length;
    els.paperStat.textContent = count
      ? ("字数 " + count + " 字" + (left ? " · " + left + " 处批注待处理" : ""))
      : "";
    alignPaperGrid();
    renderMarginNotes();
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
      // 锁住的句子一律不许动：模型可能给了超出学生要求范围的 anchor
      var anchors = m.type === "swap" ? m.anchor.split("|||") : [m.anchor];
      for (var ai = 0; ai < anchors.length; ai++) {
        if (isLocked(anchors[ai])) {
          setPaperHint("这处你已经锁住了，AI 不许改。要改先解锁再批。");
          return;
        }
      }
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
      // 采纳当场就标黄，不必等下一轮批注才看得见 AI 动过哪里
      if (m.type === "replace" || m.type === "insert") {
        if (m.text) prevAcceptedTexts.push(m.text);
      } else if (m.type === "swap") {
        m.anchor.split("|||").forEach(function (x) { if (trim(x)) prevAcceptedTexts.push(trim(x)); });
      }
      // 黄标只留最近 40 处，防止一路采纳把整篇染黄
      if (prevAcceptedTexts.length > 40) prevAcceptedTexts = prevAcceptedTexts.slice(-40);
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
    "评卷甲": "role-critic",
    "评卷乙": "role-critic-b",
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
    scheduleSessionSave();
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
    noteChatReply();
    scheduleSessionSave();
    return t;
  }

  /* ---------------- 输出更新（流式驱动） ---------------- */

  function updateOutput(streaming) {
    if (streamIsEssay) {
      if (streaming) {
        if (assistantReplyEl) assistantReplyEl.textContent = "正在生成正文…已写 " + Array.from(trim(fullText)).length + " 字";
        showEmpty();
        return;
      }
      if (assistantReplyEl) assistantReplyEl.textContent = (docTitle && docTitle !== "作文") ? ("「" + docTitle + "」已生成") : "正文已生成";
      return;
    }
    // 非作文流兜底（outline/explain 走 onProgress，正常不会到这）：保留旧逻辑
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
    // 作文一律按 JSON 解析：title 单独成字段，正文纯文本，不再靠首行启发式，也不受 AI 客套话污染
    var t = parseCompositionJSON(fullText);
    docTitle = t.title || "作文";
    docBody = t.body;
    currentComposition = (t.title ? t.title + "\n\n" : "") + t.body;
    // 收稿后统一走批注态管线：锁句、黄标、批注符号才画得出来
    if (docBody.trim() && els.paperPane && !els.paperPane.hidden) renderAnnotated();
  }

  /* ---------------- 云端作文同步（仅登录后） ---------------- */

  function authToken() {
    return (window.WY_AUTH && window.WY_AUTH.token()) || "";
  }

  function outlineHasContent() {
    return (outline.points || []).some(function (p) { return trim(p.text) || trim(p.label); });
  }

  /* 后端老版本按 TCP 分块拼字符串，会把跨块的中文劈成 U+FFFD（如「议论文」→「议论\uFFFD\uFFFD\uFFFD」）。
     前端能删的残字一律先删掉，认不出的文体再按枚举兜底，绝不能因为脏字符就掉回记叙文。 */
  function stripBadChars(str) {
    return String(str == null ? "" : str).replace(/\uFFFD+/g, "");
  }

  // 文体名容错：精确 → 包含 → 前两个字一致，任一条命中都算认出
  function matchGenre(str) {
    var raw = stripBadChars(str).trim();
    if (!raw) return "";
    var dict = window.WY_GENRE;
    if (!dict) return "";
    if (dict[raw]) return raw;
    var keys = Object.keys(dict), hit = "";
    keys.forEach(function (k) {
      if (!hit && (raw.indexOf(k) >= 0 || k.indexOf(raw) >= 0)) hit = k;
    });
    if (hit) return hit;
    keys.forEach(function (k) {
      if (!hit && k.slice(0, 2) === raw.slice(0, 2)) hit = k;
    });
    return hit;
  }

  // 类别与文体一起写进作文的 category 字段（形如「命题 · 议论文」），从控制台恢复时再拆开
  function categoryStore() {
    var cat = stripBadChars(activeCat || selectedCat || "").trim();
    var g = matchGenre(genreName()) || "记叙文";
    return (cat && g) ? (cat + " · " + g) : (cat || g || "");
  }

  function parseCategoryStore(str) {
    var s = stripBadChars(str);
    var parts = s.split("·").map(function (x) { return trim(x); });
    var cat = (parts[0] || "").split("｜")[0].trim();
    var g = matchGenre(parts[1] || "");
    return {
      cat: cat,
      genre: g || "记叙文",
      hasGenre: !!g          // 存的时候到底有没有文体这一半，没有就允许后面按大纲推断
    };
  }

  /* 老稿子的文体字段可能整段丢失（早期版本只存类别）。这时按大纲结构回推：
     有「分论点 / 论点 / 论据 / 论证」这类骨架就按议论文，别一律当记叙文。 */
  function guessGenreFrom(text) {
    var s = stripBadChars(String(text || ""));
    if (!s.trim()) return "";
    var argWords = ["分论点", "中心论点", "论点", "论据", "论证", "引论", "让步", "辩证"];
    var hits = 0;
    argWords.forEach(function (w) { if (s.indexOf(w) >= 0) hits++; });
    var storyWords = ["那天", "后来", "妈妈说", "我走进", "记得那", "忽然"];
    var story = 0;
    storyWords.forEach(function (w) { if (s.indexOf(w) >= 0) story++; });
    if (hits >= 2 && hits > story) return "议论文";
    return "";
  }

  function outlineStore() {    if (!outlineHasContent()) return "";
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
      category: categoryStore(),
      province: (activeProvinces.length ? activeProvinces : selectedProvinces).join("、"),
      session: cloudSession(),
      wordCount: Array.from(docBody.replace(/\s/g, "")).length
    };
  }

  var essaySaveTimer = null;
  function scheduleEssaySave() {
    scheduleSessionSave();
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
      if (res.ok && j && j.ok && j.id) {
        currentEssayId = j.id;
        adoptVersionsForEssay(j.id);   // 版本账本从草稿改名到这篇 essay
        if (els.historyList) renderHistoryList();
      }
    } catch (e) { /* 离线或后端异常时静默降级，作文仍在本机 */ }
  }

  /* ---------------- 运行时反馈：边框绿色流光 + 过程状态 ----------------
     只在「真的在跑」时出现：请求刚发出去是连接中，收到第一个字变输出中，
     旁边挂着已经用了几秒、写出多少字；结束就淡出，不留痕迹。 */

  var runAt = 0;
  var runTimer = null;
  var runChars = 0;
  var runLive = false;

  function runNodes() {
    return { bar: els.runBar, text: els.runText, sub: els.runSub };
  }

  function runPaint() {
    if (!runLive) return;
    var e = runNodes();
    if (!e.sub) return;
    var sec = (Date.now() - runAt) / 1000;
    var txt = (runChars > 0 ? runChars + " 字 · " : "") + sec.toFixed(1) + " 秒";
    // 一直没吐字又不是刚发出去：多半卡在排队或网关，明说一句，别让人干等
    if (!runChars && sec > 12) txt += " · 还在等服务器";
    e.sub.textContent = txt;
  }

  /* 哪儿在更新就在哪儿亮：左边对话区常亮，右边优先框住当前看得见的稿纸 */
  function runGlowTargets() {
    var out = [];
    var chat = document.querySelector(".chat-panel");
    if (chat) out.push(chat);
    var paper = document.getElementById("paperPane");
    var doc = document.querySelector(".doc-wrap");
    var box = (paper && !paper.hasAttribute("hidden")) ? paper : doc;
    if (box) out.push(box);
    return out;
  }

  /* 开始：拉出状态条，给正在看的两个面板套上流光边框 */
  function runBegin(label) {
    runLive = true;
    runAt = Date.now();
    runChars = 0;
    var e = runNodes();
    if (e.text) e.text.textContent = label || "连接中";
    if (e.sub) e.sub.textContent = "";
    if (e.bar) { e.bar.hidden = false; e.bar.classList.add("on"); }
    document.body.classList.add("run-on");
    runGlowTargets().forEach(function (n) { n.classList.add("run-glow"); });
    if (runTimer) clearInterval(runTimer);
    runTimer = setInterval(runPaint, 250);
    runPaint();
  }

  /* 一次操作可能连发好几个请求（两评讨论要 3 个以上）：
     由最外层负责拉出与收起，内层只改文案，避免状态条一闪一闪。 */
  function runOwn(label) {
    if (runLive) { runPhase(label); return false; }
    runBegin(label);
    return true;
  }

  function runRelease(owned) {
    if (owned) runEnd();
  }

  function runPhase(label) {
    if (!runLive) return;
    var e = runNodes();
    if (e.text && label) e.text.textContent = label;
    runPaint();
  }

  function runCount(n) {
    if (!runLive) return;
    runChars = n || 0;
    runPaint();
  }

  /* 结束：先撤流光，再把状态条淡出；出错、停止、正常结束都走这里 */
  function runEnd() {
    runLive = false;
    if (runTimer) { clearInterval(runTimer); runTimer = null; }
    var e = runNodes();
    if (e.bar) {
      e.bar.classList.remove("on");
      setTimeout(function () { if (!runLive && e.bar) e.bar.hidden = true; }, 260);
    }
    document.body.classList.remove("run-on");
    document.querySelectorAll(".run-glow").forEach(function (n) { n.classList.remove("run-glow"); });
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
    if (res.status === 402) {
      var msg402 = "";
      try { msg402 = (JSON.parse(raw).error || ""); } catch (e) { msg402 = ""; }
      return msg402 || "积分用完了。可以换成自己的模型接口，或去控制台看积分明细。";
    }
    if (res.status === 429) {
      var msg429 = "";
      try { msg429 = (JSON.parse(raw).error || ""); } catch (e) { msg429 = ""; }
      return msg429 || "请求太频繁，稍等一会儿再试。";
    }
    if (res.status === 401) return "登录已过期，请重新登录后再用站内模型。";
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

  // 不同文体的大纲骨架不一样：议论文要论点分论点，小小说要伏笔反转，不能都按「开头—转折—结尾」排
  function genreOutlineNote() {
    var g = genreName();
    if (g === "议论文") {
      return "【大纲形态】议论文按「引论—分论点—让步—结论」组织，每条 label 用「引论」「分论点一」「让步」「结论」这类字样；每条 text 写清这一段用哪个具体论据、论证到哪一步，不写场景、不写动作、不写抒情。段落数 4～5 段即可。";
    }
    if (g === "小小说") {
      return "【大纲形态】小小说按「场景—冲突—伏笔—反转—收束」组织，每条 text 写清发生什么动作或哪句对话推动，伏笔要指名是哪个物件或哪句话，不写抒情与心理。";
    }
    if (g === "散文") {
      return "【大纲形态】散文的大纲围绕那件作为线索的实物或地点走，每条 text 写清这一段写它的哪种状态、牵出谁或哪件旧事，允许跳跃但要写清由头。";
    }
    if (g === "随笔") {
      return "【大纲形态】随笔从一件具体小事起头，中段可以岔开去谈旧事或见闻，最后回到起头的那件事；每条 text 写清这一段的见闻与由此生出的那一两句议论。";
    }
    return "【大纲形态】记叙文按事情的时间顺序走，每条 text 写清谁、在哪、做什么、出现什么器物，两三句写实，不写心情。";
  }


  // 本次作文的文体规则（完整文本）。类别管标题怎么处理，文体管全篇怎么组织。
  function genreRule() {
    var g = activeGenre || selectedGenre;
    var cfg = window.WY_GENRE && window.WY_GENRE[g];
    return cfg ? cfg.rule : "";
  }

  function genreName() { return activeGenre || selectedGenre || "记叙文"; }

  // 文体一行提示，放进 user 里再点一次，防止模型只记住骨架忘了文体
  function genreLine() {
    return "【本次作文文体】" + genreName() + "。全篇必须按系统提示里的「本次文体」规则组织，"
      + "该条款与通用铁律冲突时以文体规则为准。";
  }

  // 把「广东」这类短名对到评分表真实 key（如「广东（中考）」）：
  // 否则取不到该省标准，会错回退成「全国卷（通用）」60 分制
  function resolveProvinceKey(p) {
    p = trim(p);
    if (!p) return "";
    var all = window.WY_SCORING || {};
    if (all[p]) return p;
    var hit = "";
    Object.keys(all).forEach(function (k) {
      if (hit) return;
      if (k.indexOf(p) >= 0 || p.indexOf(k) >= 0) hit = k;
    });
    return hit;
  }

  function provinceList() {
    var list = (activeProvinces && activeProvinces.length) ? activeProvinces : selectedProvinces;
    var out = [];
    (list || []).forEach(function (p) {
      var k = resolveProvinceKey(p) || p;
      if (k && out.indexOf(k) < 0) out.push(k);
    });
    return out.length ? out : ["全国卷（通用）"];
  }

  function stageNow() { return activeStage || selectedStage || "初中"; }

  function scoringText() {
    var s = (window.WY_SCORING_ALL ? window.WY_SCORING_ALL(provinceList()) : "") || "";
    var g = window.WY_STAGE_RULE ? window.WY_STAGE_RULE(stageNow()) : "";
    return (s + (g ? (s ? "\n\n" : "") + g : "")).trim();
  }

  /* 统一包裹：作文原文：{...} / 用户提问：{...}
     花括号是为了让模型明确知道边界在哪，不会把提问当成正文的一部分。 */
  function wrapEssay() {
    return "作文原文：{\n" + (currentComposition || docBody || "（还没有正文）") + "\n}";
  }

  /* 学生锁住的句子：既不许改，也不许批注，评改时连"坏"都不许判 */
  function wrapLocked() {
    if (!lockedTexts.length) return "";
    return "【已锁住，绝对不许改动、不许批注】{\n" +
      lockedTexts.map(function (t, i) { return (i + 1) + ". " + t; }).join("\n") +
      "\n}\n（这几句是学生自己认定要留的：anchor 不许取它们、不许跨越它们出批注、也不许判它们坏。" +
      "要出批注只能指向这几句以外的原文；如果这一轮的要求正好落在锁住的句子上，reply 里说明一句，不要动手。）";
  }

  function wrapAsk(req) {
    return "用户提问：{\n" + req + "\n}\n" +
      "（以上是学生这次的原话，是他这一轮唯一要做的事。逐条照办，一条不许漏；" +
      "他没有提到的地方不要改，可以提意见，不要顺手改、不要自己想当然加一份方案、不要换成你认为更好的写法。）";
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
    lines.push(genreLine());
    var rule = categoryRule();
    if (rule) lines.push(rule);
    lines.push("【题目 / 题材（用户原话，按上面的类别规则处理）】\n" + (activeTopic || els.topic.value.trim()));
    if (els.extra.value.trim()) {
      lines.push("【额外要求（用户原话，硬指令）】{\n" + els.extra.value.trim() + "\n}\n" +
        "（这几条是他明确要的，逐条照办；他没提的不要自己加，不要扩大成别的写法。）");
    }
    lines.push(genreOutlineNote());
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
    lines.push(genreLine());
    var rule = categoryRule();
    if (rule) lines.push(rule);
    lines.push("【题目 / 题材（用户原话，按上面的类别规则处理）】\n" + (activeTopic || els.topic.value.trim()));
    if (els.extra.value.trim()) {
      lines.push("【额外要求（用户原话，硬指令）】{\n" + els.extra.value.trim() + "\n}\n" +
        "（这几条是他明确要的，逐条照办；他没提的不要自己加，不要扩大成别的写法。）");
    }
    lines.push("【目标字数（含标点）】约 " + wordCount + " 字，正文尽量逼近，宁可少写不可硬凑。");
    var st = scoringText();
    if (st) lines.push(st);
    lines.push("【本次大纲（已由用户确认，必须照着写）】\n" + outlineJSON());
    lines.push("\n这是首次生成，请按系统提示的 JSON 格式输出：一个 {title, body} 对象，title 是标题、body 是完整正文（段落间用空行隔开）。不要写「回应」部分，不要写任何 JSON 之外的文字。正文必须落实上面大纲里每一段的人物、器物、动作，不得另起炉灶。严格按系统提示的写作铁律、本类别的标题与扣题规则、以及上述评分标准执行。");
    return lines.join("\n");
  }

  function composeReviseUser(req) {
    var lines = [];
    lines.push("【本次作文类别】" + activeCatName());
    lines.push(genreLine());
    var rule = categoryRule();
    if (rule) lines.push(rule + "\n- 批注同样受本类别的标题规则约束：命题不得改题；半命题不得更换已补好的词；自拟不得换成口号式标题。anchor 不要取标题。");
    var st = scoringText();
    if (st) lines.push(st);
    lines.push(wrapEssay());
    lines.push(wrapLocked());
    lines.push(wrapAsk(req));
    lines.push("按系统提示输出批注 JSON：只标出该改的几处，不要输出修改后的完整作文。anchor 必须逐字取自上面「作文原文」的正文，且在正文里唯一，不要取标题。");
    lines.push("注意：学生上文的要求是硬指令，按他的原话逐条照办（改哪句、改成什么、删还是加），不要用写作铁律当理由拒绝、也不许只做一半或换成你自己更喜欢的写法。");
    return lines.join("\n\n");
  }

  /* 整篇重写：锁句的要求跟「只出手批」不同 —— 不是不许碰，而是必须逐字原样留在新稿里 */
  function wrapLockedRewrite() {
    if (!lockedTexts.length) return "";
    return "【已锁住的句子：必须逐字原样保留在新稿里】{\n" +
      lockedTexts.map(function (t, i) { return (i + 1) + ". " + t; }).join("\n") +
      "\n}\n（这几句是学生自己认定要留的：一个字不许改、不许删、不许拆开、不许换成同义说法。" +
      "重写其它段落时要算好上下文，别让它们接不上前后文。）";
  }

  function composeRewriteUser(req) {
    var lines = [];
    lines.push("【本次作文类别】" + activeCatName());
    lines.push(genreLine());
    var rule = categoryRule();
    if (rule) lines.push(rule);
    var st = scoringText();
    if (st) lines.push(st);
    lines.push("【本次大纲（段落任务必须照着写）】\n" + outlineJSON());
    lines.push(wrapEssay());
    lines.push(wrapLockedRewrite());
    lines.push("学生本轮的修改要求：{\n" + req + "\n}\n" +
      "（这是本轮唯一要解决的问题，逐条照办，一条不许漏；要求没提到的段落尽量沿用原文写住的句子，不要顺手润色一遍。）");
    lines.push("请从头重写一版完整作文，按系统提示的 JSON 格式输出：一个 {\"title\":\"...\", \"body\":\"...\"} 对象，title 是标题、body 是完整正文（段落间用空行隔开）。不要输出批注 JSON、修改清单、说明文字或 Markdown，不要写任何 JSON 之外的文字。");
    return lines.join("\n\n");
  }

  function composeExplainUser(req) {
    var lines = [];
    lines.push("【本次作文类别】" + activeCatName());
    lines.push(genreLine());
    var st = scoringText();
    if (st) lines.push(st);
    var wr = window.WY_WRITING_RULES;
    if (wr) lines.push("【讲评尺度（写作规范，讲评时以此为准）】\n" + wr);
    lines.push(wrapEssay());
    lines.push(wrapAsk(req));
    lines.push("学生这次只想弄明白问题，不想动稿。按系统提示只做讲评：不要改作文，不要给替换句，不要输出批注 JSON。");
    return lines.join("\n\n");
  }

  // 评改/讨论共用的上下文头：类别、文体、评分标准、写作规范
  /* 评改、讨论要看的上下文：作者提过的要求、已经采纳的批注、锁句、上一版分数。
     不是把整段对话搬过去，只取最近几条原话，免得提示词被撑爆、也免得模型被旧要求带偏。 */
  function wrapTalkContext() {
    var out = [];
    var asks = [];
    chatSnapshot().forEach(function (b) {
      if (!b.user) return;
      var t = trim(b.text).replace(/\s+/g, " ");
      if (t) asks.push(t.slice(0, 180));
    });
    if (asks.length) {
      var tail = asks.slice(-5);
      out.push("【作者提过的修改要求（最近 " + tail.length + " 条，判断时顺着他要的方向，别反着改）】");
      tail.forEach(function (t) { out.push("- " + t); });
    }
    var got = annotations.filter(function (m) { return m.state === "accepted"; });
    if (got.length) {
      out.push("【已经采纳进正文的批注（这些地方改过了，别再当老问题重提）】");
      got.slice(-6).forEach(function (m) {
        var txt = trim(m.note || m.text || "");
        if (txt) out.push("- " + txt.slice(0, 120));
      });
    }
    if (lockedTexts.length) {
      out.push("【作者锁住的句子（一个字都不许动，也不许判它坏）】");
      lockedTexts.slice(-8).forEach(function (t) { out.push("- " + trim(t)); });
    }
    if (criticScores.length) {
      out.push("【上一版评分】" + criticScores.map(function (x) {
        return x.province + " " + x.total + "/" + x.full + (x.band ? "（" + x.band + "）" : "") +
          (x.why ? "，失分在：" + x.why : "");
      }).join("；"));
    }
    return out.join("\n");
  }

  function criticContextLines() {
    var lines = [];
    lines.push("【本次作文类别】" + activeCatName());
    lines.push(genreLine());
    var st = scoringText();
    if (st) lines.push(st);
    var wr = window.WY_WRITING_RULES;
    if (wr) lines.push("【评判尺度（写作规范，评判时以此为准，与上面给分规则并用）】\n" + wr);
    var talk = wrapTalkContext();
    if (talk) lines.push(talk);
    return lines;
  }

  function composeCriticUser() {
    var lines = criticContextLines();
    lines.push(wrapEssay());
    lines.push(wrapLocked());
    lines.push("用户提问：{\n按上面的尺度逐句判好坏与 AI 味。只判确实有硬伤的，挑不出就不要凑数，也不许把学生的朴素写法当成缺点。\n}");
    return lines.join("\n\n");
  }

  async function runStream(systemPrompt, userContent, opts) {
    opts = opts || {};
    streamIsEssay = (opts.mode === "essay");
    var c = currentConfig();
    controller = new AbortController();
    fullText = "";
    setBusy(true);
    var runOwned = runOwn("连接中");
    var runSawText = false;

    function onChunk(d) {
      fullText += d;
      if (fullText && !runSawText) { runSawText = true; runPhase("输出中"); }
      if (fullText) runCount(fullText.length);
      if (opts.onProgress) opts.onProgress(fullText);
      else updateOutput(true);
    }

    try {
      var res = await fetch(endpoint(c), {
        method: "POST",
        headers: headers(c),
        body: JSON.stringify({
          model: pickedModel(c),
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
        runPhase("整理中");
        onChunk("");
      }

      if (!got || !fullText.trim()) throw new Error("接口没有返回内容，换一个模型或检查额度。");
      if (!opts.onProgress) {
        if (streamIsEssay) {
          try { cacheComposition(); }   // 按 JSON 解析并设置正文，失败则拒收、保留原稿
          catch (e2) {
            var em = (e2 && e2.message) || "作文解析失败";
            setPaperHint("生成失败：" + em);
            if (assistantReplyEl) assistantReplyEl.textContent = "生成失败：" + em;
            return false;
          }
        } else {
          updateOutput(false); cacheComposition();
        }
      }
      return true;

    } catch (e) {
      if (e && e.name === "AbortError") {
        if (!opts.onProgress && !streamIsEssay) { updateOutput(false); cacheComposition(); }
        setPaperHint("已停止，保留已生成的部分。");
        return false;
      }
      var msg = (e && e.message) || "未知错误";
      if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
        msg = "请求发不出去：多为浏览器跨域被拦或网络不通。换支持 CORS 的接口，或改用本地代理。";
      }
      setPaperHint("生成失败：" + withRefund(msg, !fullText.trim()));
      if (!opts.onProgress) updateOutput(false);
      return false;

    } finally {
      controller = null;
      setBusy(false);
      runRelease(runOwned);
      syncCreditsUI();
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

  /* ---------------- 批注文本清洗 ----------------
     AI 常犯三类错：给替换文字套引号、把「改为：」这类说明写进 text、
     以及在句中替换时凭空多带一个句号。这里统一收口，宁可丢弃也不污染正文。 */

  function countChar(s, ch) {
    var n = 0;
    for (var i = 0; i < s.length; i++) if (s.charAt(i) === ch) n++;
    return n;
  }

  // 中文语境下的英文标点转全角，成对的直引号转中文引号
  function normalizePunct(s) {
    var t = String(s || "");
    t = t.replace(/"([^"]*)"/g, "\u201c$1\u201d");
    t = t.replace(/'([^']*)'/g, "\u2018$1\u2019");
    t = t.replace(/([\u4e00-\u9fa5\u201d\u2019])\s*,\s*/g, "$1\uff0c");
    t = t.replace(/([\u4e00-\u9fa5\u201d\u2019])\s*;\s*/g, "$1\uff1b");
    t = t.replace(/([\u4e00-\u9fa5\u201d\u2019])\s*:\s*/g, "$1\uff1a");
    t = t.replace(/([\u4e00-\u9fa5\u201d\u2019])\s*\?\s*/g, "$1\uff1f");
    t = t.replace(/([\u4e00-\u9fa5\u201d\u2019])\s*!\s*/g, "$1\uff01");
    t = t.replace(/([\u4e00-\u9fa5\u201d\u2019])\s*\.\s*(?=[\u4e00-\u9fa5\u201c\u2018]|$)/g, "$1\u3002");
    return t;
  }

  // 剥掉模型写进 text 的说明文字和外层引号（可能同时存在，剥两轮）
  function stripMetaText(raw) {
    var t = trim(raw);
    var PREFIX = /^(?:改为|改成|应改为|应该改成|建议改为|建议改成|替换为|换成为|换成|修改为|原句改为|改作)\s*[:：]?\s*/;
    var WRAPS = [["\u201c", "\u201d"], ["\u300c", "\u300d"], ["\u300e", "\u300f"], ['"', '"'], ["'", "'"]];
    var TAIL = /[（(]\s*(?:此处|这里|此处可|可换|建议|说明|注|理由|原因是)[^）)]*[）)]\s*$/;

    function unwrap(t) {
      for (var i = 0; i < WRAPS.length; i++) {
        var a = WRAPS[i][0], b = WRAPS[i][1];
        if (t.length > 2 && t.charAt(0) === a && t.charAt(t.length - 1) === b) {
          var inner = t.slice(1, -1);
          if (inner.indexOf(a) < 0 && inner.indexOf(b) < 0) return inner;
        }
      }
      return t;
    }

    for (var round = 0; round < 2; round++) {
      var before = t;
      t = trim(unwrap(t));
      t = t.replace(PREFIX, "");
      t = t.replace(/^[\u2192\u2190\->=\s]+/, "");
      t = t.replace(TAIL, "");
      t = trim(t);
      if (t === before) break;
    }
    return t;
  }

  /* 让替换文字与原文标点接得上：anchor 在句中就不许多出句号，anchor 带句末标点就得跟着带 */
  function fitPunct(anchor, text) {
    if (!text) return text;
    var at = docBody.indexOf(anchor);
    if (at < 0) return text;
    var after = docBody.charAt(at + anchor.length);
    var stop = /[\u3002\uff01\uff1f\u2026]/;
    var aStop = stop.test(anchor.slice(-1));
    var tStop = stop.test(text.slice(-1));
    if (aStop) {
      if (!tStop && anchor.length > 1) return text + anchor.slice(-1);
      return text;
    }
    if (after === "" || after === "\n") {
      // anchor 正好到段末：text 带不带句末标点都合理，保持模型原意
      return text;
    }
    if (stop.test(after)) {
      // 原文后面紧跟句末标点，text 不要再重复一个
      if (tStop && text.slice(-1) === after) return text.slice(0, -1);
      if (tStop) return text.replace(stop, "");
      return text;
    }
    if (/[\uff0c\u3001\uff1b\uff1a]/.test(after)) {
      if (tStop) return text.replace(/[\u3002\uff01\uff1f\u2026]+$/, "");
      return text;
    }
    // 后面还接着字：句中的替换，结尾不许带句末标点
    if (tStop) return text.replace(/[\u3002\uff01\uff1f\u2026]+$/, "");
    return text;
  }

  // 引号必须成对，否则会把残句写进正文
  function quotesBalanced(s) {
    return countChar(s, "\u201c") === countChar(s, "\u201d") &&
           countChar(s, "\u300c") === countChar(s, "\u300d");
  }

  var annotDropped = 0;   // 本次被丢掉的批注条数（含缺字段、标点/引号不合法）

  // 校验并规范化批注：丢掉 anchor 定位不到、类型不合法、缺字段的条目
  function normalizeMarks(obj) {
    var out = [];
    annotDropped = 0;
    function drop() {
      annotDropped++;
    }
    obj.marks.slice(0, 12).forEach(function (m) {
      if (!m || VALID_TYPES.indexOf(m.type) < 0) { drop("类型不合法", m && m.anchor); return; }
      var anchor = trim(m.anchor), reason = trim(m.reason);
      var text = trim(m.text);
      if (!anchor) { drop("缺 anchor", ""); return; }
      if (m.type === "replace" || m.type === "insert") {
        text = trim(normalizePunct(stripMetaText(text)));
        if (!text) { drop("text 为空或全是说明", anchor); return; }
        // 整段重写、套话说明残留、引号残缺，一律不要
        if (text.length > Math.max(80, anchor.length * 3)) { drop("text 过长", anchor); return; }
        if (!quotesBalanced(text)) { drop("引号不配对", anchor); return; }
        text = fitPunct(anchor, text);
        if (!text) { drop("标点清理后为空", anchor); return; }
        // 改完和原文一模一样，等于没改
        if (m.type === "replace" && text === anchor) { drop("与原文相同", anchor); return; }
        if (m.type === "insert" && anchor.indexOf(text) >= 0) { drop("增补内容已存在", anchor); return; }
      }
      var needles = m.type === "swap" ? anchor.split("|||").map(trim) : [anchor];
      var ok = needles.every(function (n) { return n && docBody.indexOf(n) >= 0; });
      if (!ok) { drop("原文找不到", anchor); return; }
      // anchor 必须唯一，否则可能标错地方
      if (m.type !== "swap" && docBody.indexOf(anchor) !== docBody.lastIndexOf(anchor)) { drop("原文不唯一", anchor); return; }
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
    var runOwned = runOwn("连接中");
    try {
      var res = await fetch(endpoint(c), {
        method: "POST",
        headers: headers(c),
        body: JSON.stringify({
          model: pickedModel(c),
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
      runPhase("等回复");
      var j = await res.json();
      if (j.error) throw new Error(j.error.message || "接口返回错误");
      var msg = j.choices && j.choices[0] && j.choices[0].message;
      var content = (msg && msg.content) || "";
      if (content) { runPhase("整理中"); runCount(content.length); }
      if (!content.trim()) throw new Error("接口没有返回内容，换一个模型或检查额度。");
      return content;
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      // 非流式请求失败，后端会把这次扣的分退回来
      throw new Error(withRefund((e && e.message) || "请求失败", true));
    } finally {
      controller = null;
      setBusy(false);
      runRelease(runOwned);
      syncCreditsUI();
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
    // 评卷卡片已经在右侧抽屉里，切大纲不该把结果藏掉
    syncCriticDock();
    els.docTabs.querySelectorAll(".doc-tab").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-pane") === name);
    });
    if (paper) {
      els.docTabHint.textContent = stage === "draft"
        ? "提修改要求会从头重写整篇；可点「恢复上一版」退回"
        : "正文还没写，先回大纲改好再开始";
      els.paperPane.scrollTop = 0;
    } else {
      els.docTabHint.textContent = stage === "draft"
        ? "大纲可继续改，改完点「按大纲重写」"
        : "大纲可以先改、可以增补，再开始写";
    }
    if (paper) renderAnnotated();
    // 手机端：切 pane 就等于切底部视图，两边状态保持一致
    if (isMobile() && !els.studio.hasAttribute("hidden")) setMView(name);
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
    var ok = [];
    all.forEach(function (p) {
      var k = resolveProvinceKey(p);   // 「广东」→「广东（中考）」，保住 50 分制
      if (k && ok.indexOf(k) < 0) ok.push(k);
    });
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

    var prevId = currentEssayId;
    currentEssayId = data.id || null;
    // 版本账本按 essayId 分：换了一篇就重新读自己那份，别把上一篇的版本摆在列表里
    if (String(prevId || "") !== String(currentEssayId || "")) loadVersions();
    var parsedCat = parseCategoryStore(data.category);
    activeCat = parsedCat.cat || "";
    activeGenre = parsedCat.genre;
    activeTopic = data.title || "";
    activeProvinces = resumeProvinceList(data.province);
    activeStage = "";   // 旧稿没有存学段，回退到当前所选学段

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

    // 老稿子没存到文体（或存成了乱码）：按大纲骨架回推，别把议论文当记叙文
    if (!parsedCat.hasGenre) {
      var gGuess = guessGenreFrom(JSON.stringify(outline) + "\n" + docBody);
      if (gGuess) activeGenre = gGuess;
    }

    stage = docBody.trim() ? "draft" : "outline";

    annotations = []; annotSeq = 0; annotPanelEl = null;
    prevAcceptedTexts = [];
    criticItems = [];
    criticScores = [];
    debateLog = [];                  // 上一篇的讨论记录不许跟过来
    undoStack = []; syncUndoBtn();
    if (els.criticList) els.criticList.innerHTML = "";
    if (els.debateLog) { els.debateLog.innerHTML = ""; els.debateLog.hidden = true; }
    els.criticStat.textContent = "逐句判好坏与 AI 味，不给总分的空头评价。";
    syncAnnotTools();
    setChatMode("annotate");

    els.wizard.setAttribute("hidden", "");
    els.studio.removeAttribute("hidden");
    document.body.classList.add("studio-mode");

    els.studioMeta.textContent = [
      activeCat ? "类别：" + activeCat : "",
      "文体：" + activeGenre,
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

    // 这篇以前写过的话，把对话/评改/旁批/锁句接回来（本机没有就用云端随稿存的那份）
    if (hydrateEssaySession(data.session) && criticItems.length) renderCritic();

    addUserBubble("从控制台打开《" + (docTitle || "作文") + "》继续改", "你");
    if (stage === "draft") {
      switchPane("paper");
      renderAnnotated();
      setDocHint("已载入云端稿 · 直接提问就是整篇重写");
      addAssistantBubble("文芽").textContent =
        "已载入《" + docTitle + "》。接着改就行：直接提要求会从头重写整篇，选「只问不改」则只讲不动字。";
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

  /* ---------------- 登录门槛：生成必须先登录 ----------------
     页面本身上来就能看，但点「开始生成」会拦下并弹登录框；登录成功后自动续上这次生成。 */

  var pendingStart = false;

  function loginReady() {
    return !!(window.WY_AUTH && window.WY_AUTH.loggedIn());
  }

  function syncGate() {
    if (els.gateBar) els.gateBar.hidden = loginReady();
  }

  // 工作台里拦下：状态栏说明原因 + 弹登录框，登录成功后续跑
  function requireLoginForStart() {
    pendingStart = true;
    setWizardStatus("生成作文需要先登录：登录后会自动接着生成，作文与大纲也会存进你的账号。", "error");
    if (window.WY_AUTH) window.WY_AUTH.open("login");
    return false;
  }

  // 已经在生成界面里（例如 token 中途失效）
  function requireLoginInline() {
    setDocHint("需要登录才能生成，请先登录。");
    setPaperHint("未登录");
    if (window.WY_AUTH) window.WY_AUTH.open("login");
    return false;
  }

  /* ---------------- 入口 1：开始生成（先写大纲） ---------------- */

  async function startWriting() {
    if (!loginReady()) { requireLoginForStart(); return; }
    if (flowActive) { setWizardStatus("流程作文正在进行中，先停下来再重开。", "error"); return; }
    var flowFromWizard = !!(els.flowAuto && els.flowAuto.checked);
    if (flowFromWizard && !confirm(
      "流程作文：先拟大纲、写正文，再最多 " + flowRoundLimit() +
      " 轮「评分 → 只改硬伤 → 复评」，约 " + (flowBudget(false) + 1) +
      " 次 AI 调用，每次消耗 1 积分。\n分数不升会回退到最好的一版；中途可停止。继续？"
    )) return;
    if (!selectedCat) { setWizardStatus("请先选择作文类别（命题/半命题/自拟）。", "error"); return; }
    if (!els.topic.value.trim()) {
      setWizardStatus(selectedCat === "自拟" ? "请先写一段题材或范围。" : "请先写下作文题目。", "error");
      els.topic.focus(); return;
    }
    var topicWarn = validateTopic(selectedCat, els.topic.value.trim());
    if (topicWarn) { setWizardStatus(topicWarn, "error"); els.topic.focus(); return; }

    // 锁定本次成稿的类别/文体/题目/评分标准，后续改稿都以此为准
    activeCat = selectedCat;
    activeGenre = selectedGenre || "记叙文";
    activeTopic = els.topic.value.trim();
    activeProvinces = selectedProvinces.slice();
    activeStage = selectedStage;

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
    prevAcceptedTexts = [];
    currentEssayId = null;
    resetComposition();          // 新作文换一份版本账本，别接着上一篇的历史往下写
    loadVersions();
    if (els.historyList) renderHistoryList();
    updateDiffBtn();
    criticItems = [];
    criticScores = [];
    outline = { title: "", thesis: "", points: [], note: "" };
    stage = "outline";
    setChatMode("annotate");
    if (els.criticList) els.criticList.innerHTML = "";
    els.criticStat.textContent = "逐句判好坏与 AI 味，不给总分的空头评价。";
    syncAnnotTools();
    if (els.contextEmpty) { els.contextEmpty.remove(); els.contextEmpty = null; }
    els.contextList.innerHTML = "";

    var summary = "类别：" + selectedCat + " ｜ 文体：" + activeGenre + " ｜ 题目：" + els.topic.value.trim().slice(0, 30) +
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
    var gr = genreRule();
    if (gr) sys += "\n\n" + gr;
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
    // 流程作文：大纲已就绪，直接接着写正文 → 评分 → 改 → 复评（预算已在开跑前确认过）
    if (flowFromWizard && outline.points.some(function (p) { return trim(p.text); })) {
      runFlow({ confirmed: true });
    }
  }

  /* ---------------- 入口 2：按大纲写正文 ---------------- */

  async function generateEssay() {
    if (!loginReady()) { requireLoginInline(); return; }
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
    var gr = genreRule();
    if (gr) sys += "\n\n" + gr;
    var rule = categoryRule();
    if (rule) sys += "\n\n" + rule;
    var st = scoringText();
    if (st) sys += "\n\n" + st;

    var wasDraft = (stage === "draft");
    var ok = await runStream(sys, composeWriteUser(), { mode: "essay" });
    if (ok && docBody.trim()) {
      stage = "draft";
      updateWriteBtn();
      setChatMode(chatMode);
      switchPane("paper");
      setDocHint("正文已生成 · 左上可切回大纲");
      saveEssayToCloud();
      scheduleEssaySave();
      commitVersion(wasDraft ? "重新生成" : "初稿");
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
      els.chatModeHint.textContent = "讨论改稿：说一句就是发起一次讨论，两评选完由 AI 定改不改";
      els.chatInput.placeholder = "例：把开头再写细一点 / 结尾这句是不是空泛 / 控制在 600 字";
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
    // 手批模式：说一句话就是发起一次讨论。先评分、再两评互挑、谈完由 AI 定改不改、改多大。
    addUserBubble(summarizeAsk(req));
    els.chatInput.value = "";
    await runCritic(req, { fromChat: true });
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
    var gr = genreRule();
    if (gr) sys += "\n\n" + gr;
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
    var gr = genreRule();
    if (gr) sys += "\n\n" + gr;
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

  // 一句长要求（例如从评改汇总结过来的）在对话里只展示开头，全文照样发给模型
  function summarizeAsk(req) {
    var t = trim(req).replace(/\s+/g, " ");
    return t.length > 90 ? t.slice(0, 90) + "…（共 " + Array.from(trim(req)).length + " 字）" : t;
  }

  /* 整篇重写：提要求 / 认可评改 / 流程改稿统一走这里。
     模型交回一版完整新稿，整张稿纸一起换，不再出逐条朱红批注。
     改前快照进 undoStack，随时可用「恢复上一版」退回；锁句丢失或字数骤降直接拒收新稿。 */
  async function rewriteEssay(req, opts) {
    opts = opts || {};
    var c = currentConfig();
    if (!c.base || !c.key || !c.model) {
      setPaperHint("接口未配置，先回工作台填好。");
      return false;
    }
    if (!docBody.trim()) { setPaperHint("还没有正文，先按大纲写一篇。"); return false; }

    var snap = essaySnapshot();
    // 分数要在清批注之前抓下来：改完正文分数卡就作废了，但历史版本里得留着这次拿了几分
    var verScore = opts.versionScore !== undefined ? opts.versionScore : criticScoresSummary();
    if (opts.silentBubble) {
      assistantReplyEl = null;
    } else {
      addUserBubble(summarizeAsk(req));
      els.chatInput.value = "";
      assistantReplyEl = addAssistantBubble("批改老师");
      if (assistantReplyEl) assistantReplyEl.textContent = "正在从头重写整篇…";
    }
    setPaperHint("正在从头重写整篇…");
    setDocHint("整篇重写中 · 改好会整张稿纸一起换");
    switchPane("paper");

    var sys = window.WY_REWRITE || window.WY_PROMPT;
    var gr = genreRule();
    if (gr) sys += "\n\n" + gr;
    var rule = categoryRule();
    if (rule) sys += "\n\n" + rule;
    var st = scoringText();
    if (st) sys += "\n\n" + st;

    var ok = await runStream(sys, composeRewriteUser(req), { mode: "essay" });
    var plain = function (t) { return String(t || "").replace(/\s/g, "").length; };
    // 大改允许重搭结构，字数掉得多一点不拦；小改还是按住 0.6 的线
    var minRatio = typeof opts.minRatio === "number" ? opts.minRatio : 0.6;
    var reason = "";
    if (!ok || !docBody.trim()) reason = "没拿到完整新稿";
    else if (docBody === snap.body) reason = "新稿和原稿完全一样";
    else if (plain(docBody) < plain(snap.body) * minRatio) reason = "新稿字数掉得太多";
    else if (snap.locked.length) {
      // 用改前的快照做基准：稿纸重绘会顺手把对不上的锁句清掉，不能用当前 lockedTexts
      var flat = normLock(docBody);
      var lost = snap.locked.filter(function (t) { return flat.indexOf(normLock(t)) < 0; });
      if (lost.length) reason = "新稿丢了你锁住的 " + lost.length + " 句";
    }

    if (reason) {
      restoreEssaySnapshot(snap);
      var fail = reason + "，已恢复原稿。";
      setPaperHint(fail);
      setDocHint(fail);
      if (assistantReplyEl) assistantReplyEl.textContent = fail;
      return false;
    }

    // 整篇都换了：上一版的旁批、评改、分数、黄标全部作废
    clearNotesAfterRewrite();
    undoStack.push(snap);
    if (undoStack.length > 5) undoStack.shift();
    syncUndoBtn();
    renderAnnotated();
    saveEssayToCloud();
    scheduleEssaySave();

    var done = "已从头重写整篇 · 字数 " + plain(docBody) + " · 可看「改动对照」或「恢复上一版」";
    setPaperHint(done);
    setDocHint(done);
    commitVersion(opts.versionLabel || "重写", verScore);
    if (assistantReplyEl) {
      assistantReplyEl.textContent = "已重写一版完整新稿（" + plain(docBody) + " 字）。旧旁批已清空。";
    }
    return true;
  }

  /* ---------------- AI 评改：逐句判好坏与 AI 味 ---------------- */

  // 评改分数：以本地评分标准为真值（满分、维度上限、档次区间都从 WY_SCORING 取），
  // 模型给的分数只作参考，越界一律夹回范围内，避免出现 45/60 却标「一类」这种矛盾。
  function bandOf(std, total) {
    var bands = std.bands || [];
    for (var i = 0; i < bands.length; i++) {
      var m = String(bands[i][1]).match(/(\d+)\s*[-–—~]\s*(\d+)/);
      if (m && total >= parseInt(m[1], 10) && total <= parseInt(m[2], 10)) return bands[i][0];
    }
    return "";
  }

  function normalizeScores(raw) {
    var arr = Array.isArray(raw) ? raw : [];
    var wanted = provinceList();
    var all = window.WY_SCORING || {};
    var out = [];
    arr.forEach(function (r, i) {
      if (!r) return;
      var prov = resolveProvinceKey(r.province) || trim(r.province);
      if (!all[prov]) {
        var hit = "";
        wanted.forEach(function (p) {
          if (hit) return;
          if (prov && (prov.indexOf(p) >= 0 || p.indexOf(prov) >= 0)) hit = p;
        });
        // 评分表 key 可能带学段后缀（如「广东（中考）」），而 AI 只回「广东」；
        // 再按表里真实的 key 模糊对一次，避免错回退成「全国卷（通用）」60 分制
        if (!hit) {
          Object.keys(all).forEach(function (k) {
            if (hit) return;
            if (prov && (k.indexOf(prov) >= 0 || prov.indexOf(k) >= 0)) hit = k;
          });
        }
        prov = hit || wanted[i] || wanted[0] || "";
      }
      var std = all[prov];
      if (!std) return;
      var full = Number(std.total) || 60;
      var total = Math.round(Number(r.total));
      if (isNaN(total)) return;
      total = Math.max(0, Math.min(full, total));
      var dims = [];
      (std.dims || []).forEach(function (d) {
        var name = d[0], cap = parseInt(d[1], 10);
        if (isNaN(cap)) return;          // 「降档条款」这类不参与赋分
        var got = null;
        (Array.isArray(r.dims) ? r.dims : []).forEach(function (x) {
          if (got === null && trim(x && x.name) === name) got = x;
        });
        var v = got ? Math.round(Number(got.score)) : NaN;
        if (isNaN(v)) v = Math.round(total * cap / full);
        dims.push({ name: name, score: Math.max(0, Math.min(cap, v)), full: cap });
      });
      out.push({
        province: prov,
        total: total,
        full: full,
        band: bandOf(std, total) || trim(r.band),   // 档次必须真的含这个分数，算得出来就以算的为准
        dims: dims,
        why: trim(r.why)
      });
    });
    return out;
  }

  /* 判「坏」必须有可指认的毛病。模型说不清是哪一类，就不准把这条交给 AI 改，
     免得它凭"不像我写的"把正常人话改坏。 */
  var HARD_KINDS = {
    kongfan: "空泛",
    taohua: "套话",
    paili: "排比堆砌",
    wanmei: "强行圆满",
    bingju: "病句或常识错",
    paoti: "跑题",
    shuijiao: "注水"
  };

  function hardLabel(raw) {
    var k = trim(raw).toLowerCase();
    if (!k) return "";
    if (HARD_KINDS[k]) return HARD_KINDS[k];
    for (var key in HARD_KINDS) {
      if (HARD_KINDS[key] === k) return HARD_KINDS[key];
    }
    return "";
  }

  function parseCriticJSON(raw) {
    var s = trim(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("评改没有返回 JSON，换个模型再试。");
    var obj;
    try { obj = JSON.parse(s.slice(a, b + 1)); }
    catch (e) { throw new Error("评改 JSON 解析失败，可重试。"); }
    return criticFromObject(obj);
  }

  // 把评审 JSON 对象归一成内部结构；单评与讨论定稿共用，避免两套字段口径
  function criticFromObject(obj) {
    obj = obj || {};
    var items = Array.isArray(obj.items) ? obj.items : [];
    return {
      overall: trim(obj.overall),
      scores: normalizeScores(obj.scores),
      items: items.slice(0, 14).map(function (it, i) {
        var verdict = trim(it && it.verdict) === "好" ? "好" : "坏";
        var hard = hardLabel(it && it.hard);
        return {
          id: ++criticSeq,
          no: parseInt(it && it.no, 10) || (i + 1),
          sentence: trim(it && it.sentence),
          verdict: verdict,
          hard: hard,
          soft: verdict === "坏" && !hard,
          reason: trim(it && it.reason),
          ai: !!(it && it.ai),
          aiWhy: trim(it && it.aiWhy),
          fix: trim(it && it.fix),
          agreed: ""   // "" 未表态 / "yes" 我认可 / "no" 不认可
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

  function criticById(id) {
    for (var i = 0; i < criticItems.length; i++) if (criticItems[i].id === id) return criticItems[i];
    return null;
  }

  function syncCriticApply() {
    if (!els.criticApplyBtn) return;
    var n = criticItems.filter(function (x) { return x.agreed === "yes"; }).length;
    els.criticApplyBtn.disabled = n === 0;
    els.criticApplyBtn.textContent = n ? ("按认可的 " + n + " 条重写整篇") : "按认可的问题重写整篇";
  }

  // 点稿纸上的评改标记 -> 点亮右栏对应旁批
  function focusCriticCard(id) {
    if (!els.paperNotes) return;
    var note = els.paperNotes.querySelector('.note-critic[data-critic-id="' + id + '"]');
    if (!note) return;
    var list = els.paperNotes.querySelectorAll(".note.active");
    for (var i = 0; i < list.length; i++) list[i].classList.remove("active");
    note.classList.add("active");
    var paper = note.closest(".paper");
    if (paper) {
      var pr = paper.getBoundingClientRect();
      var nr = note.getBoundingClientRect();
      if (nr.top < pr.top + 6 || nr.bottom > pr.bottom - 6) note.scrollIntoView({ block: "nearest" });
    }
  }

  function setCriticAgree(id, val) {
    var it = criticById(id);
    if (!it) return;
    if (val === "yes" && it.settled === false) {
      setDocHint("这条两评还没谈拢（另一方仍反对），先别交给重写。真觉得该改，就在下面直接说要改成什么。");
      return;
    }
    if (val === "yes" && it.soft) {
      setDocHint("这条没说明具体毛病，不给它派活。真觉得该改，可以在下面直接说要改成什么。");
      return;
    }
    it.agreed = it.agreed === val ? "" : val;
    renderCritic();
    setDocHint(it.agreed === "yes" ? ("已认可 #" + it.no + "，可继续挑，最后按这些重写整篇")
      : it.agreed === "no" ? ("已否决 #" + it.no + "，这条不会交给 AI") : "已取消表态");
  }

  function renderCriticScores() {
    if (!els.criticScore) return;
    els.criticScore.innerHTML = "";
    if (!criticScores.length) { els.criticScore.hidden = true; return; }
    els.criticScore.hidden = false;

    criticScores.forEach(function (s) {
      var card = document.createElement("div");
      card.className = "cs-card";

      var prov = document.createElement("div");
      prov.className = "cs-prov";
      prov.textContent = s.province;
      card.appendChild(prov);

      var total = document.createElement("div");
      total.className = "cs-total";
      var strong = document.createElement("strong");
      strong.textContent = String(s.total);
      var full = document.createElement("span");
      full.textContent = "/" + s.full;
      total.appendChild(strong);
      total.appendChild(full);
      card.appendChild(total);

      if (s.band) {
        var band = document.createElement("div");
        band.className = "cs-band";
        band.textContent = s.band;
        card.appendChild(band);
      }

      if (s.dims && s.dims.length) {
        var dims = document.createElement("div");
        dims.className = "cs-dims";
        s.dims.forEach(function (d) {
          var it = document.createElement("span");
          it.className = "cs-dim";
          it.textContent = d.name + " " + d.score + "/" + d.full;
          dims.appendChild(it);
        });
        card.appendChild(dims);
      }

      if (s.why) {
        var why = document.createElement("div");
        why.className = "cs-why";
        why.textContent = s.why;
        card.appendChild(why);
      }

      els.criticScore.appendChild(card);
    });
  }

  function renderCritic() {
    scheduleSessionSave();
    if (els.criticList) els.criticList.innerHTML = "";
    renderCriticScores();
    renderDebateLog();       // 讨论记录与评改结果一起刷新，刷新页面也还在
    if (!criticItems.length && !criticScores.length) {
      syncCriticDock();
      syncCriticApply();
      renderAnnotated();
      return;
    }
    syncCriticDock();
    // 出结果时自动拉出；流程进行中留在「流程作文」页，别抢当前 tab
    if (!flowActive) setDrawer(true, "critic", true);
    var bad = criticItems.filter(function (x) { return x.verdict === "坏"; }).length;
    var softCnt = criticItems.filter(function (x) { return x.soft; }).length;
    var aiCnt = criticItems.filter(function (x) { return x.ai; }).length;
    var openCnt = criticItems.filter(function (x) { return x.settled === false; }).length;
    var picked = criticItems.filter(function (x) { return x.agreed === "yes"; }).length;
    var scoreTxt = criticScores.map(function (s) {
      return s.province + " " + s.total + "/" + s.full + (s.band ? "（" + s.band + "）" : "");
    }).join(" · ");
    els.criticStat.textContent = (scoreTxt ? scoreTxt + " ｜ " : "") +
      (criticItems.length
        ? ("共 " + criticItems.length + " 句：坏 " + bad + " 句，带 AI 味 " + aiCnt + " 句" +
          (softCnt ? " · 其中 " + softCnt + " 条没说清具体毛病，已标灰、不给改" : "") +
          (openCnt ? " · " + openCnt + " 条两评没谈拢，已标灰、不给改" : ""))
        : "这次没挑出确实有毛病的句子，说明写得住。") +
      (picked ? " · 已认可 " + picked + " 条"
        : (criticItems.length ? " · 「旁批」页里逐条点「认可」，再按这些重写整篇" : ""));
    syncCriticApply();
    // 逐句结果全部走右栏旁批，坞里只留评分与汇总
    renderAnnotated();
  }

  // 把讨论定下的结论拼成一次修改要求，交给整篇重写。幅度由 AI 定：小改只动坐实那几句，大改允许重搭
  function criticReqText(mode, revision) {
    revision = revision || lastRevision || {};
    var big = mode === "大改" || revision.action === "大改";
    var picked = criticItems.filter(function (x) { return x.agreed === "yes"; });
    if (!picked.length && !big) return "";
    var lines = [];
    if (big) {
      lines.push("这次讨论的结论是这篇要大改" + (revision.why ? "：" + revision.why : "。") +
        "请从头重写一版完整作文，允许调整段落顺序、重写整段、换开头结尾、合并或拆分段。");
      if (revision.scope) lines.push("要动的部分：" + revision.scope + "。上面没点到的部分也别整段照抄，该动就动。");
      lines.push("必须做到：结构立得住、题意不走、删掉空泛与套话与口号式升华、把坐实的问题逐条解决。");
      lines.push("不许丢的：原文里具体的人、物件、场景、动作、数字要带过去，别换成空词；主题与文体不变；字数不低于原来的七成。");
    } else {
      lines.push("下面这些是讨论里坐实的问题，一共 " + picked.length + " 条。请照它们从头重写一版完整作文：把这些地方改到位，其余段落尽量沿用原文写住的句子。");
      lines.push("只解决这 " + picked.length + " 条，不要顺手把没问题的句子改一遍，也不要另找问题凑数。");
    }
    if (criticScores.length) {
      lines.push("这一版评卷给分：" + criticScores.map(function (s) {
        return s.province + " " + s.total + "/" + s.full + (s.band ? "（" + s.band + "）" : "") +
          (s.why ? "，失分在：" + s.why : "");
      }).join("；") + "。先解决失分最多的地方，分数才能上来。");
    }
    if (picked.length) lines.push("要改的地方：");
    picked.forEach(function (it, i) {
      lines.push((i + 1) + ". 原句：" + it.sentence);
      if (it.reason) lines.push("   问题：" + it.reason);
      if (it.aiWhy) lines.push("   AI 味：" + it.aiWhy);
      if (it.fix) lines.push("   方向：" + it.fix);
    });
    lines.push("注意：上面这些只是给你看的说明，不要写进正文；交回的是一篇完整作文，不是替换句清单。");
    return lines.join("\n");
  }

  /* ---------------- 讨论 + 评分：一个流程跑完 ----------------
     一次讨论 = 甲评分 → 乙复核 → 甲表态定稿（含改稿幅度） → 按幅度改或不改。
     轮数只是「最多谈几轮」，乙挑不出东西就当轮收工，不必硬凑到上限。
     改不改、改多大由甲在定稿里自己定，不由程序卡死条数。 */

  var DEBATE_MAX = 12;                      // 上限放宽，谈得动就谈，谈不动提前收
  var DEBATE_AUTO_STORE = "wy.debate.auto.v1";
  var debateAutoApply = true;               // 总开关：允许 AI 讨论完自己决定要不要动稿
  var runningAsk = "";                      // 这一轮触发的作者原话，拼进三条提示词
  var lastRevision = null;                  // 甲定稿时给的改稿幅度 {action, why, scope}
  var discussNo = 0;                        // 这篇作文谈过几次

  function debateCost() {
    // 每轮最多 2 次；乙当轮挑不出东西就少一次
    return debateRounds > 0 ? (1 + debateRounds * 2) : 1;
  }

  /* 评改按钮上的积分角标：轮数一改就变成真实的调用次数，别一直写死 1 */
  function syncCriticCostBadge() {
    if (els.criticBtn) els.criticBtn.setAttribute("data-cost", String(debateCost()));
    if (els.scoreBtn) els.scoreBtn.setAttribute("data-cost", "1");
    if (els.criticApplyBtn) els.criticApplyBtn.setAttribute("data-cost", "1");
  }

  function syncDebateCost() {
    if (!els.debateCost) return;
    var auto = debateAutoApply ? "，改不改由 AI 定" : "，只讨论不动稿";
    els.debateCost.textContent = debateRounds > 0
      ? ("最多 " + debateCost() + " 次调用，每次 1 积分" + auto + "；乙挑不出就提前收")
      : "单评一次，只给分不改稿（要改就填 1 以上）";
  }

  function setDebateRounds(n, silent) {
    var v = parseInt(n, 10);
    if (isNaN(v)) v = debateRounds;         // 输入框清空时不乱跳，等它填回来
    v = Math.max(0, Math.min(DEBATE_MAX, v));
    debateRounds = v;
    try { localStorage.setItem(DEBATE_STORE, String(v)); } catch (e) { /* 隐私模式就算了 */ }
    if (els.debateRounds) els.debateRounds.value = String(v);
    syncDebateCost();
    syncCriticCostBadge();
    // 初始化时不能顺手落盘：会话还没恢复就读出来再写回去，会把上次的正文冲掉
    if (!silent) scheduleSessionSave();
  }

  function loadDebateRounds() {
    var v = 1;
    try {
      var raw = localStorage.getItem(DEBATE_STORE);
      if (raw !== null && raw !== "") v = parseInt(raw, 10);
    } catch (e) { /* ignore */ }
    if (isNaN(v)) v = 1;
    setDebateRounds(v, true);
  }

  function setDebateAuto(on, silent) {
    debateAutoApply = !!on;
    try { localStorage.setItem(DEBATE_AUTO_STORE, debateAutoApply ? "1" : "0"); } catch (e) { /* ignore */ }
    if (els.debateAutoApply) els.debateAutoApply.checked = debateAutoApply;
    syncDebateCost();
    syncCriticCostBadge();
    if (!silent) scheduleSessionSave();
  }

  function loadDebateAuto() {
    var on = true;
    try {
      var raw = localStorage.getItem(DEBATE_AUTO_STORE);
      if (raw === "0") on = false;
    } catch (e) { /* ignore */ }
    setDebateAuto(on, true);
  }

  function jsonObjectIn(raw, failMsg) {
    var s = trim(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error(failMsg);
    try { return JSON.parse(s.slice(a, b + 1)); }
    catch (e) { throw new Error(failMsg); }
  }

  // 给模型看的精简版评审：去掉内部字段（id/agreed/soft），只留它要判的东西
  function slimReview(rev) {
    return {
      overall: (rev && rev.overall) || "",
      scores: ((rev && rev.scores) || []).map(function (s) {
        return { province: s.province, total: s.total, band: s.band, dims: s.dims || [], why: s.why || "" };
      }),
      items: ((rev && rev.items) || []).map(function (it) {
        return {
          no: it.no, sentence: it.sentence, verdict: it.verdict, hard: it.hard || "",
          reason: it.reason || "", ai: !!it.ai, aiWhy: it.aiWhy || "", fix: it.fix || ""
        };
      })
    };
  }

  function parseDebateB(raw) {
    var o = jsonObjectIn(raw, "复核方没有返回 JSON，可再试一次。");
    var dis = Array.isArray(o.disputes) ? o.disputes : [];
    var missed = Array.isArray(o.missed) ? o.missed : [];
    var list = dis.slice(0, 6).map(function (d) {
      return {
        no: parseInt(d && d.no, 10) || 0,
        sentence: trim(d && d.sentence),
        kind: trim(d && d.kind) || "误判",
        why: trim(d && d.why),
        ask: trim(d && d.ask)
      };
    }).filter(function (d) { return d.sentence || d.why; });
    return {
      stance: trim(o.stance) || (list.length ? "部分同意" : "同意"),
      disputes: list,
      missed: missed.slice(0, 4).map(function (m) {
        return {
          sentence: trim(m && m.sentence),
          hard: hardLabel(m && m.hard),
          reason: trim(m && m.reason),
          fix: trim(m && m.fix)
        };
      }).filter(function (m) { return m.sentence; }),
      scoreNote: trim(o.scoreNote),
      reviseNote: trim(o.reviseNote)
    };
  }

  // 改稿幅度：AI 自己定，只认三个值；给了别的（或没给）按「小改」兜底
  function parseRevision(raw) {
    var r = raw && typeof raw === "object" ? raw : {};
    var a = trim(r.action);
    if (a !== "不改" && a !== "小改" && a !== "大改") a = "";
    return { action: a, why: trim(r.why), scope: trim(r.scope) };
  }

  function parseDebateA(raw) {
    var o = jsonObjectIn(raw, "主评回应没有返回 JSON，可再试一次。");
    var reps = Array.isArray(o.replies) ? o.replies : [];
    return {
      review: criticFromObject(o),
      revision: parseRevision(o.revision),
      replies: reps.slice(0, 10).map(function (r) {
        var st = trim(r && r.stance);
        if (st !== "坚持" && st !== "撤回" && st !== "折中") st = "折中";
        return {
          no: parseInt(r && r.no, 10) || 0,
          sentence: trim(r && r.sentence),
          stance: st,
          why: trim(r && r.why)
        };
      })
    };
  }

  // 比对句子用归一化文本（去标点空格），模型抄句子时改了标点也能对上
  function debateKey(s) {
    return criticNormWithMap(trim(String(s || ""))).text.slice(0, 40);
  }

  /* 定稿后判定哪些条目"坐实"：
     乙这轮还反对、甲又坚持 -> 未坐实（不许交给重写）
     乙反对、甲撤回 -> 条目已不在清单里，自然消失
     乙反对、甲折中 -> 算谈拢（理由已按乙方要求改过）
     乙没提名 -> 两边一致，坐实 */
  function markDebateSettled(review, lastB, replies) {
    var dis = {};
    ((lastB && lastB.disputes) || []).forEach(function (d) {
      var k = debateKey(d.sentence);
      if (k) dis[k] = d;
    });
    var repByNo = {}, repByKey = {};
    (replies || []).forEach(function (r) {
      if (r.no) repByNo[r.no] = r;
      var k = debateKey(r.sentence);
      if (k) repByKey[k] = r;
    });
    var open = 0;
    (review.items || []).forEach(function (it) {
      var k = debateKey(it.sentence);
      var d = dis[k];
      var r = repByKey[k] || repByNo[it.no];
      if (d && r && r.stance === "坚持") {
        it.settled = false;
        it.dispute = { kind: d.kind, why: d.why, reply: r.why || "" };
        open++;
      } else if (d) {
        it.settled = true;
        it.dispute = { kind: d.kind, why: d.why, reply: (r && r.why) || "", compromised: true };
      } else {
        it.settled = true;
      }
    });
    return open;
  }

  function debateHistoryText() {
    if (!debateLog.length) return "";
    var out = [];
    debateLog.forEach(function (r) {
      var dis = (r.b.disputes || []).map(function (d) {
        return "  · #" + d.no + " " + d.kind + "：" + d.why;
      });
      var reps = (r.replies || []).map(function (x) {
        return "  · #" + x.no + " " + x.stance + "：" + x.why;
      });
      out.push("第 " + r.round + " 轮\n乙方质疑：\n" + (dis.join("\n") || "  · 无") +
        "\n甲方表态：\n" + (reps.join("\n") || "  · 无"));
    });
    return out.join("\n");
  }

  function composeDebateBUser(review, round) {
    var lines = criticContextLines();
    lines.push(wrapEssay());
    lines.push(wrapLocked());
    lines.push("【甲方（主评）这一版的评审】\n" + JSON.stringify(slimReview(review)));
    var hist = debateHistoryText();
    if (hist) lines.push("【前几轮已经谈过的】\n" + hist + "\n已经谈拢的不要再提一遍，除非甲方这版又改回去了。");
    lines.push("用户提问：{\n第 " + round + " 轮复核。逐条看上面这版评审：判错、漏判、分数与档次表对不上，都指出来，每条写清依据。指不出依据的不要提；挑不出就交空数组。\n}");
    return lines.join("\n\n");
  }

  function composeDebateAUser(review, bObj, round) {
    var lines = criticContextLines();
    lines.push(wrapEssay());
    lines.push(wrapLocked());
    lines.push("【你上一版的评审】\n" + JSON.stringify(slimReview(review)));
    lines.push("【乙方这一轮的质疑】\n" + JSON.stringify(bObj));
    var hist = debateHistoryText();
    if (hist) lines.push("【前几轮已经谈过的】\n" + hist);
    lines.push("用户提问：{\n第 " + round + " 轮。对乙方的每一条质疑表态（坚持或撤回或折中），然后交出一版定稿 JSON：replies 加 overall 加 scores 加 items。items 是完整清单，不是差异。\n}");
    return lines.join("\n\n");
  }

  function debateBText(b) {
    var n = (b.disputes || []).length, m = (b.missed || []).length;
    var tail = (b.reviseNote ? " 对幅度的意见：" + b.reviseNote : "") + (b.scoreNote ? " " + b.scoreNote : "");
    if (!n && !m) return "复核完了，这版没有异议。" + tail;
    var out = "复核：" + b.stance + "。";
    if (n) out += "对 " + n + " 条有意见。";
    if (m) out += "另外认为漏了 " + m + " 句。";
    return out + tail;
  }

  function debateAText(replies) {
    if (!replies.length) return "这版没什么可争的，保持原判。";
    var keep = replies.filter(function (r) { return r.stance === "坚持"; }).length;
    var back = replies.filter(function (r) { return r.stance === "撤回"; }).length;
    var mid = replies.filter(function (r) { return r.stance === "折中"; }).length;
    var out = "逐条回应：" ;
    var bits = [];
    if (keep) bits.push("坚持 " + keep + " 条");
    if (back) bits.push("撤回 " + back + " 条");
    if (mid) bits.push("折中 " + mid + " 条");
    return out + bits.join("，") + "。定稿已更新。";
  }

  /* 讨论记录渲染进「AI 评卷」页：每轮一张卡，左边乙方质疑，右边甲方表态 */
  function renderDebateLog() {
    var host = els.debateLog;
    if (!host) return;
    host.innerHTML = "";
    var open = criticItems.filter(function (it) { return it.settled === false; }).length;
    var settledCnt = criticItems.filter(function (it) { return it.settled !== false; }).length;
    if (!debateLog.length) { host.hidden = true; return; }
    host.hidden = false;

    var head = document.createElement("div");
    head.className = "debate-head";
    // 已经按结论改过稿的话，条目会随正文一起清掉，这时只报轮数，别谎报「坐实 0 条」
    head.textContent = "这次讨论 " + debateLog.length + " 轮" +
      (criticItems.length
        ? (" · 坐实 " + settledCnt + " 条" + (open ? " · 仍有分歧 " + open + " 条" : ""))
        : " · 结论已用于改稿");
    host.appendChild(head);

    debateLog.forEach(function (r) {
      var card = document.createElement("div");
      card.className = "debate-round";

      var ttl = document.createElement("div");
      ttl.className = "debate-round-head";
      ttl.textContent = "第 " + r.round + " 轮 · 乙方复核（" + (r.b.stance || "同意") + "）";
      card.appendChild(ttl);

      (r.b.disputes || []).forEach(function (d) {
        var row = document.createElement("div");
        row.className = "debate-line";
        var tag = document.createElement("span");
        tag.className = "debate-tag dtag-b";
        tag.textContent = "#" + (d.no || "?") + " " + d.kind;
        var txt = document.createElement("span");
        txt.className = "debate-txt";
        txt.textContent = d.why || "";
        row.appendChild(tag);
        row.appendChild(txt);
        card.appendChild(row);
        var rep = (r.replies || []).filter(function (x) {
          return (x.no && x.no === d.no) || (x.sentence && debateKey(x.sentence) === debateKey(d.sentence));
        })[0];
        if (rep) {
          var rr = document.createElement("div");
          rr.className = "debate-line";
          var tg = document.createElement("span");
          tg.className = "debate-tag " + (rep.stance === "坚持" ? "dtag-keep" : rep.stance === "撤回" ? "dtag-back" : "dtag-mid");
          tg.textContent = "甲方" + rep.stance;
          var tt = document.createElement("span");
          tt.className = "debate-txt";
          tt.textContent = rep.why || "";
          rr.appendChild(tg);
          rr.appendChild(tt);
          card.appendChild(rr);
        }
      });

      (r.b.missed || []).forEach(function (m) {
        var row = document.createElement("div");
        row.className = "debate-line";
        var tag = document.createElement("span");
        tag.className = "debate-tag dtag-miss";
        tag.textContent = "乙方认为漏了";
        var txt = document.createElement("span");
        txt.className = "debate-txt";
        txt.textContent = m.reason || m.sentence;
        row.appendChild(tag);
        row.appendChild(txt);
        card.appendChild(row);
      });

      if (r.b.scoreNote) {
        var sc = document.createElement("div");
        sc.className = "debate-line";
        var s1 = document.createElement("span");
        s1.className = "debate-tag dtag-score";
        s1.textContent = "分数";
        var s2 = document.createElement("span");
        s2.className = "debate-txt";
        s2.textContent = r.b.scoreNote;
        sc.appendChild(s1);
        sc.appendChild(s2);
        card.appendChild(sc);
      }
      host.appendChild(card);
    });
  }

  // 中途与结果都走同一套渲染：先把这一版摆出来，再继续谈
  function showCriticReview(rev) {
    criticItems = (rev.items || []).filter(function (it) { return !isLocked(it.sentence); });
    criticScores = rev.scores || [];
    renderCritic();       // 内部会连讨论记录一起刷新
    switchPane("paper");
  }

  /* 讨论完按甲定下的幅度落地：
     不改 —— 稿子一个字不动，只留评语；
     小改 —— 只把坐实的几句交去重写；
     大改 —— 允许重搭结构、换开头结尾，字数护栏也放宽。
     debateAutoApply 关掉时只讨论不动笔，把条目勾好让学生自己点。 */
  async function autoApplySettled(revision) {
    revision = revision || lastRevision || {};
    var act = revision.action || "小改";
    var ready = criticItems.filter(function (it) {
      return it.verdict === "坏" && it.settled !== false && !it.soft;
    });

    if (!debateAutoApply) {
      if (!ready.length) { setDocHint("这轮没有坐实的问题，稿子不动"); return false; }
      ready.forEach(function (it) { it.agreed = "yes"; });
      renderCritic();
      setDocHint("已把 " + ready.length + " 条坐实问题勾好，点「按认可的 " + ready.length + " 条重写整篇」就改");
      return false;
    }

    if (act === "不改") {
      criticItems.forEach(function (it) { it.agreed = ""; });
      renderCritic();
      var nb = addAssistantBubble("结论");
      nb.textContent = "这轮讨论的结论是：稿子不动。" + (revision.why || "") +
        (criticItems.length ? " 评语留在「旁批」页，想改哪条自己勾。" : "");
      setDocHint("讨论结论：不改 · 评语已留在旁批");
      if (els.criticStat) {
        els.criticStat.textContent = "讨论结论：不改。" + (revision.why || "") +
          " 分数与逐句评语仍可看，想动手就在旁批里勾条目。";
      }
      return false;
    }

    var big = act === "大改";
    if (!ready.length && !big) {
      setDocHint("这轮没有坐实的问题，稿子不动");
      return false;
    }
    ready.forEach(function (it) { it.agreed = "yes"; });
    var req = criticReqText(act, revision);
    if (!req) { setDocHint("这轮没拼出修改要求，稿子不动"); return false; }

    var scoreTxt = criticScores.map(function (sc) {
      return sc.province + " " + sc.total + "/" + sc.full + (sc.band ? "（" + sc.band + "）" : "");
    }).join(" · ");
    var scoreKeep = criticScoresSummary();
    var bubble = addAssistantBubble("改稿");
    bubble.textContent = big
      ? ("讨论结论是这篇要大改" + (revision.scope ? "（动 " + revision.scope + "）" : "") + "，正在重搭一版完整新稿…")
      : ("坐实 " + ready.length + " 条，只动这几处，正在改一版完整新稿…");

    var ok = await rewriteEssay(req, {
      silentBubble: true,
      versionLabel: big ? "讨论改写 · 大改" : ("讨论改写 · " + ready.length + " 条"),
      versionScore: scoreKeep,
      minRatio: big ? 0.45 : 0.6
    });
    if (!ok) {
      bubble.textContent = "改稿没成，讨论结论还留在稿纸上，可以自己点「按认可的 " + ready.length + " 条重写整篇」。";
      return false;
    }
    bubble.textContent = (big ? "大改完了" : ("已按 " + ready.length + " 条坐实问题改好一版")) +
      "（" + plainLen(docBody) + " 字）" + (scoreTxt ? "，改前 " + scoreTxt : "") +
      "。「历史版本」里能逐段挑着留。";
    if (els.criticStat) {
      els.criticStat.textContent = (big ? "大改" : "小改") +
        "完成：" + ready.length + " 条坐实问题已改" + (scoreTxt ? "，改前 " + scoreTxt : "") +
        "。改了什么去「历史版本」逐段看，可以只留想要的那几段。";
    }
    setDocHint((big ? "大改" : "讨论改写") + "已存成一版 · 去「历史版本」逐段取舍");
    // 不硬切抽屉：讨论记录还留在评卷页，历史版本只点个红点提醒
    if (els.drawerDotHistory) els.drawerDotHistory.hidden = false;
    switchPane("paper");
    return true;
  }

  /* 一次讨论：甲评分 → 乙复核 → 甲表态定稿（连同改稿幅度） → 按幅度改或不改。
     轮数是上限，不是任务：乙这轮挑不出东西就提前收，不用把上限填满。 */
  async function runCriticDebate() {
    var sysA = window.WY_CRITIC || "";
    var gr = genreRule();
    if (gr) sysA += "\n\n" + gr;
    var sysB = (window.WY_CRITIC_B || "") + (gr ? "\n\n" + gr : "");
    var sysReplyA = sysA + (window.WY_CRITIC_A_REPLY || "");
    debateLog = [];
    lastRevision = null;
    var cap = Math.max(1, debateRounds);
    setDocHint("讨论开始：最多 " + debateCost() + " 次调用，甲先评分，乙复核，谈不动就提前收");
    var runOwned = runOwn("讨论中 · 甲评分");

    try {
      // 第 0 步：甲方评分（评分本身就是讨论的第一步，不再单列）
      var bA = addAssistantBubble("评卷甲");
      bA.textContent = "先按评分标准打一遍分，逐句判好坏与 AI 味。";
      var rawA = await fetchAnnotation(sysA, composeCriticUser());
      var review = parseCriticJSON(rawA);
      showCriticReview(review);
      bA.textContent = "初评：" + (review.overall || "已出第一版") + "。等乙方复核。";

      // 逐轮：乙挑错 → 甲表态并改定稿；乙无异议就停
      for (var r = 1; r <= cap; r++) {
        runPhase("第 " + r + "/" + cap + " 轮 · 乙复核");
        els.criticStat.textContent = "第 " + r + "/" + cap + " 轮：复核方正在挑错…";
        var bB = addAssistantBubble("评卷乙");
        bB.textContent = "正在复核第 " + r + " 轮…";
        var bObj = parseDebateB(await fetchAnnotation(sysB, composeDebateBUser(review, r)));
        bB.textContent = debateBText(bObj);

        // 乙挑不出东西：这版就定了，不再多花一次调用硬走流程
        if (!bObj.disputes.length && !bObj.missed.length) {
          debateLog.push({ round: r, b: bObj, replies: [] });
          bB.textContent += "（无异议，讨论到此收工）";
          break;
        }

        runPhase("第 " + r + "/" + cap + " 轮 · 甲回应");
        els.criticStat.textContent = "第 " + r + "/" + cap + " 轮：主评正在逐条回应…";
        var bR = addAssistantBubble("评卷甲");
        bR.textContent = "正在逐条回应乙方的质疑…";
        var aObj = parseDebateA(await fetchAnnotation(sysReplyA, composeDebateAUser(review, bObj, r)));
        bR.textContent = debateAText(aObj.replies) +
          (aObj.revision && aObj.revision.action ? " 幅度：" + aObj.revision.action + "。" : "");

        debateLog.push({ round: r, b: bObj, replies: aObj.replies });
        review = aObj.review;
        if (aObj.revision && aObj.revision.action) lastRevision = aObj.revision;
        showCriticReview(review);       // 每轮谈完就更新稿纸标记与旁批
      }

      // 定稿：判哪些坐实，再看甲定的改稿幅度
      runPhase("统一定稿");
      var last = debateLog.length ? debateLog[debateLog.length - 1] : null;
      var open = markDebateSettled(review, last ? last.b : null, last ? last.replies : []);
      showCriticReview(review);
      if (!lastRevision) {
        // 乙一轮就没异议、或模型没给幅度：按有没有坐实硬伤自己判
        var anyBad = criticItems.filter(function (it) { return it.verdict === "坏" && it.settled !== false && !it.soft; }).length;
        lastRevision = { action: anyBad ? "小改" : "不改", why: anyBad ? "" : "两评都挑不出必须改的硬伤。", scope: "" };
      }
      discussNo++;

      var scoreTxt = criticScores.map(function (s) {
        return s.province + " " + s.total + "/" + s.full + (s.band ? "（" + s.band + "）" : "");
      }).join("，");
      var settledCnt = criticItems.filter(function (it) { return it.settled !== false; }).length;
      var act = lastRevision.action || "小改";
      els.criticStat.textContent = (scoreTxt ? scoreTxt + " ｜ " : "") +
        "第 " + discussNo + " 次讨论（" + debateLog.length + " 轮），坐实 " + settledCnt + " 条" +
        (open ? "，另有 " + open + " 条没谈拢（标灰、不改）" : "") +
        "，结论：" + act + "。";
      setDocHint((scoreTxt ? scoreTxt + " · " : "") + "讨论 " + debateLog.length + " 轮 · 结论 " + act +
        "，逐条看「旁批」页");
      renderDebateLog();
      // 结论单独一条，学生扫一眼就知道这次动没动稿
      var concl = addAssistantBubble("讨论结论");
      concl.textContent = "第 " + discussNo + " 次讨论谈完（" + debateLog.length + " 轮）：" +
        (review.overall || "") + (scoreTxt ? " 得分 " + scoreTxt + "。" : "") +
        " 结论是「" + act + "」" + (lastRevision.why ? "：" + lastRevision.why : "。") +
        (open ? " 另有 " + open + " 条没谈拢，已标灰不给改。" : "") +
        " 逐句评语在「旁批」页。";
      await autoApplySettled(lastRevision);
    } catch (e) {
      var msg = (e && e.message) || "未知错误";
      if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
        msg = "请求发不出去：多为浏览器跨域被拦或网络不通。";
      }
      els.criticStat.textContent = "讨论中断：" + msg;
      setDocHint("讨论中断，可再点一次");
      var eb = addAssistantBubble("讨论");
      eb.textContent = "讨论中断：" + msg + (criticItems.length ? "（已经拿到的这一版仍留在稿纸上）" : "");
    } finally {
      renderDebateLog();
      syncCriticApply();
      runRelease(runOwned);
    }
  }

  /* ---------------- 单独一步：AI 评分 ----------------
     只做「打分 + 逐句判好坏」，不谈、不改。顶栏「AI 评分」直接走这里；
     讨论里的甲初评也复用同一个提示词，但那是讨论的第一步，不从这里进。 */
  async function scoreOnce(opts) {
    opts = opts || {};
    var fromChat = !!opts.fromChat;
    runningAsk = trim(opts.ask || "");
    if (!docBody.trim()) { setPaperHint("还没有正文，先按大纲写一篇再评分。"); runningAsk = ""; return; }
    var c = currentConfig();
    if (!c.base || !c.key || !c.model) {
      var needLogin = (c.preset === "site");
      setDrawer(true, "critic");
      els.criticStat.textContent = needLogin
        ? "请先登录再评分（站内模型需要登录后消耗积分）。"
        : "接口未配置：先回工作台填好 Base URL / API Key / 模型名。";
      setDocHint(needLogin ? "请先登录" : "请先配置接口");
      runningAsk = "";
      return;
    }

    if (!fromChat) setDrawer(true, "critic");
    if (els.criticList) els.criticList.innerHTML = "";
    if (els.criticScore) { els.criticScore.innerHTML = ""; els.criticScore.hidden = true; }
    criticItems = [];
    criticScores = [];
    els.criticStat.textContent = "正在按评分标准打分，逐句判好坏与 AI 味…";
    syncCriticDock(true);
    switchPane("paper");
    var bubble = addAssistantBubble("评分");
    bubble.textContent = "正在按评分标准打分，并逐句判好坏与 AI 味…";
    var runOwnedOne = runOwn("评分中");

    try {
      var sysCritic = window.WY_CRITIC;
      var grC = genreRule();
      if (grC) sysCritic += "\n\n" + grC;
      var raw = await fetchAnnotation(sysCritic, composeCriticUser());
      var obj = parseCriticJSON(raw);
      criticItems = obj.items.filter(function (it) {
        // 锁住的句子连"坏"都不许判，模型真判了也直接丢掉
        return !isLocked(it.sentence);
      });
      criticScores = obj.scores || [];
      renderCritic();      // 内部会重渲染稿纸，评改句标在原句上、评语排进右栏旁批
      switchPane("paper");

      var scoreTxt = criticScores.map(function (s) {
        return s.province + " " + s.total + "/" + s.full + (s.band ? "（" + s.band + "）" : "");
      }).join("，");

      if (!criticItems.length && !criticScores.length) {
        els.criticStat.textContent = "这次没拿到分数也没挑出句子，可再点一次。";
        bubble.textContent = "这次没有结果，再点一次「AI 评分」试试。";
        return;
      }
      if (!criticItems.length) {
        els.criticStat.textContent = scoreTxt + " ｜ 没挑出可定位的句子";
        bubble.textContent = (obj.overall ? obj.overall + " " : "") + "得分：" + scoreTxt + "。稿子一个字没动。";
        setDocHint((scoreTxt ? scoreTxt + " · " : "") + "只评分，未改稿");
        return;
      }
      var bad = criticItems.filter(function (x) { return x.verdict === "坏"; }).length;
      bubble.textContent = (obj.overall ? obj.overall + " " : "") +
        (scoreTxt ? "得分 " + scoreTxt + "；" : "") +
        "评分完成：" + criticItems.length + " 句（坏 " + bad + " 句），逐句评语在工作窗「旁批」页。稿子没动。";
      setDocHint((scoreTxt ? scoreTxt + " · " : "") + "评分 " + criticItems.length + " 条在「旁批」页 · 未改稿");
      if (els.criticStat) {
        els.criticStat.textContent = (scoreTxt ? scoreTxt + " ｜ " : "") +
          "只评分，未讨论也未改稿。想让它判要不要改，就说一句话发起讨论。";
      }
    } catch (e) {
      var msg = (e && e.message) || "未知错误";
      if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
        msg = "请求发不出去：多为浏览器跨域被拦或网络不通。";
      }
      bubble.textContent = "评分失败：" + msg;
      els.criticStat.textContent = "评分失败：" + msg;
    } finally {
      runningAsk = "";
      runRelease(runOwnedOne);
    }
  }

  function runScore() {
    return scoreOnce({});
  }

  /* 讨论入口：手动点按钮跟学生直接说话走同一条流程。
     userReq 是这一轮学生说的话（可为空），opts.fromChat 表示从对话框触发，不抢抽屉。 */
  async function runCritic(userReq, opts) {
    opts = opts || {};
    var fromChat = !!opts.fromChat;
    runningAsk = trim(userReq || "");
    if (!docBody.trim()) { setPaperHint("还没有正文，先按大纲写一篇再聊。"); runningAsk = ""; return; }
    var c = currentConfig();
    if (!c.base || !c.key || !c.model) {
      // 没配置就静默早返回，用户会以为"高亮没出"；这里把原因摆到抽屉里，移动端也一眼可见
      var needLogin = (c.preset === "site");
      setDrawer(true, "critic");
      els.criticStat.textContent = needLogin
        ? "请先登录再讨论（站内模型需要登录后消耗积分）。"
        : "接口未配置：先回工作台填好 Base URL / API Key / 模型名。";
      setDocHint(needLogin ? "请先登录" : "请先配置接口");
      runningAsk = "";
      return;
    }

    els.criticStat.textContent = debateRounds > 0 ? "讨论中：甲方先评分…" : "正在打分并逐句判…";
    if (els.criticList) els.criticList.innerHTML = "";
    if (els.criticScore) { els.criticScore.innerHTML = ""; els.criticScore.hidden = true; }
    criticItems = [];
    criticScores = [];
    // 从对话框触发时抽屉不抢镜：讨论过程本来就摆在对话里，抽屉只点个红点
    if (!fromChat) setDrawer(true, "critic");
    else if (els.drawerDotCritic) els.drawerDotCritic.hidden = false;
    syncCriticDock(true);            // 正在打分也要看得见，别只留空态
    switchPane("paper");
    syncCriticDock(true);
    if (debateRounds > 0) {
      try { await runCriticDebate(); }
      finally { runningAsk = ""; }
      return;
    }
    // 轮数填 0：只评分，不讨论也不改稿
    runningAsk = "";
    await scoreOnce({});
  }

  /* ---------------- 流程作文：写 → 评 → 只改硬伤 → 复评 ----------------
     护栏：轮数上限 / 分数不升回滚 / 只认硬伤 / 锁句不动 / 随时停止 / 开跑前报积分预算。
     不做无脑循环：AI 改坏的情况由「保留最高分版本」兜住。 */
  function flowRoundLimit() {
    return Math.max(1, Math.min(5, flowRounds));
  }

  // 向导与抽屉里的轮次下拉共用同一个值；运行中改，下一步循环就按新上限判断
  function setFlowRounds(n, from) {
    var v = parseInt(n, 10);
    if (isNaN(v)) v = 2;
    v = Math.max(1, Math.min(5, v));
    var changed = v !== flowRounds;
    flowRounds = v;
    if (from !== "wizard" && els.flowRounds) els.flowRounds.value = String(v);
    if (from !== "drawer" && els.flowRoundsDrawer) els.flowRoundsDrawer.value = String(v);
    syncFlowCost();
    if (changed && flowActive) {
      flowStep("轮次上限改为 " + v + " 轮（下一步生效）", "warn");
      flowSetStat("轮次上限改为 " + v + " 轮 · 下一步按新上限判断");
    }
    return v;
  }

  // 预算：每轮 = 1 次评分 + 1 次批改，最后再 1 次复评；没稿子还要 1 次写作
  function flowBudget(hasDraft) {
    return (hasDraft ? 0 : 1) + flowRoundLimit() * 2 + 1;
  }

  function syncFlowCost() {
    var txt = "约 " + flowBudget(true) + " 次 AI 调用（每次消耗 1 积分）";
    if (els.flowCostHint) {
      els.flowCostHint.textContent = txt +
        (els.flowAuto && els.flowAuto.checked ? "；从向导启动另含大纲、正文各 1 次" : "");
    }
    if (els.flowCostDrawer) els.flowCostDrawer.textContent = txt;
    if (els.flowSetupNote) {
      els.flowSetupNote.textContent = flowActive
        ? "运行中可随时改，调大继续跑、调小下一步收住。"
        : (docBody.trim() ? "已有正文：从评分开始，不会重写整篇。" : "还没有正文：会先写一篇再迭代。");
    }
  }

  function flowSetStat(text) {
    if (els.flowStat) els.flowStat.textContent = text;
    setDocHint(text);
  }

  function flowStep(text, kind) {
    if (!els.flowSteps) return;
    var d = document.createElement("div");
    d.className = "flow-step" + (kind ? " " + kind : "");
    d.textContent = text;
    els.flowSteps.appendChild(d);
    els.flowSteps.scrollTop = els.flowSteps.scrollHeight;
    scheduleSessionSave();
    if (els.flowEmpty) els.flowEmpty.hidden = true;
    if (els.flowDock) els.flowDock.hidden = false;
    syncDrawerDots();
  }

  function flowScoreLabel(scores) {
    return (scores || []).map(function (s) {
      return s.province + " " + s.total + "/" + s.full + (s.band ? "（" + s.band + "）" : "");
    }).join(" · ") || "没拿到分数";
  }

  // 多份标准时按满分折算成百分比再取平均，避免 50 分制被 60 分制压过去
  function flowPct(scores) {
    var arr = (scores || []).filter(function (s) { return s.full > 0; });
    if (!arr.length) return 0;
    var sum = 0;
    arr.forEach(function (s) { sum += s.total / s.full * 100; });
    return sum / arr.length;
  }

  function flowRestore(snap) {
    docTitle = snap.title;
    docBody = snap.body;
    currentComposition = (docTitle ? docTitle + "\n\n" : "") + docBody;
    annotations = [];
    criticItems = [];
    criticScores = [];
    renderAnnotated();
    syncAnnotTools();
  }

  async function flowScoreOnce(tag) {
    flowSetStat(tag + "：正在按评分标准打分…");
    var sys = window.WY_CRITIC;
    var gr = genreRule();
    if (gr) sys += "\n\n" + gr;
    var raw = await fetchAnnotation(sys, composeCriticUser());
    var obj = parseCriticJSON(raw);
    criticItems = obj.items.filter(function (it) { return !isLocked(it.sentence); });
    criticScores = obj.scores || [];
    renderCritic();
    switchPane("paper");
    var label = flowScoreLabel(criticScores);
    flowStep(tag + " · " + label);
    return { pct: flowPct(criticScores), label: label };
  }

  // 只把「说清具体毛病」的硬伤交给整篇重写；软条目、锁住的句子一律不动
  async function flowReviseOnce() {
    var hards = criticItems.filter(function (it) {
      return it.verdict === "坏" && it.hard && !it.soft && !isLocked(it.sentence);
    }).slice(0, 6);
    if (!hards.length) {
      flowStep("这轮没有可定位的硬伤，流程结束");
      return false;
    }
    criticItems.forEach(function (it) { it.agreed = hards.indexOf(it) >= 0 ? "yes" : ""; });
    renderCritic();
    flowSetStat("正在按 " + hards.length + " 条硬伤重写整篇…");
    var ok = await rewriteEssay(criticReqText("小改", {}), { silentBubble: true });   // 流程里只照坐实条目改，不跟着上次的大改幅度走
    if (flowAbort) return false;
    if (!ok) {
      flowStep("这轮没拿到合格新稿，已恢复改前版本", "warn");
      return false;
    }
    flowStep("已按 " + hards.length + " 条硬伤重写整篇");
    return true;
  }

  function stopFlow() {
    if (!flowActive) return;
    flowAbort = true;
    if (controller) controller.abort();
    flowStep("已请求停止，当前步骤跑完就收住", "warn");
  }

  async function runFlow(opts) {
    opts = opts || {};
    if (flowActive) { setPaperHint("流程作文正在进行中。"); return; }
    if (!loginReady()) { requireLoginInline(); return; }
    if (!docBody.trim() && !outline.points.some(function (p) { return trim(p.text); })) {
      setPaperHint("还没有大纲和正文，先点「开始生成」。"); return;
    }
    var budget = flowBudget(!!docBody.trim());
    if (!opts.confirmed && !confirm(
      "流程作文：最多 " + flowRoundLimit() + " 轮「评分 → 按硬伤重写整篇 → 复评」，约 " + budget +
      " 次 AI 调用，每次消耗 1 积分。\n每轮会从头重写一版完整新稿，轮次在右侧工作窗里可以随时改；分数不升会自动回退到最好的一版；中途可随时停止。继续？"
    )) return;

    flowActive = true;
    flowAbort = false;
    if (els.flowSteps) els.flowSteps.innerHTML = "";
    if (els.flowBtn) els.flowBtn.disabled = true;
    if (els.flowRerunBtn) els.flowRerunBtn.disabled = true;
    if (els.flowStopBtn) els.flowStopBtn.disabled = false;
    setDrawer(true, "flow");         // 流程一开始就拉出抽屉，全程进度可见
    syncFlowDock(true);
    if (isMobile()) setMView("paper");
    syncFlowCost();

    var best = null;
    var finalLabel = "";
    var runOwnedFlow = runOwn("流程作文 · 准备");
    try {
      if (!docBody.trim()) {
        flowStep("写正文");
        await generateEssay();
        if (flowAbort) { flowStep("已停止，保留当前稿纸", "warn"); return; }
        if (!docBody.trim()) throw new Error("正文没生成出来，流程停下。");
      }
      flowStep("开始 · 当前 " + flowRoundLimit() + " 轮上限");
      var first = await flowScoreOnce("初评");
      best = { title: docTitle, body: docBody, pct: first.pct, label: first.label };
      finalLabel = first.label;

      // 循环条件每轮重新读：抽屉里改了轮次，下一步立刻按新上限继续或收住
      for (var r = 1; r <= flowRoundLimit() && !flowAbort; r++) {
        flowSetStat("第 " + r + " 轮 / 上限 " + flowRoundLimit() + " 轮（可改）");
        var revised = await flowReviseOnce();
        if (!revised || flowAbort) break;
        var after = await flowScoreOnce("第 " + r + " 轮复评");
        finalLabel = after.label;
        if (after.pct > best.pct) {
          best = { title: docTitle, body: docBody, pct: after.pct, label: after.label };
          flowStep("分数上升，保留这一版", "done");
        } else {
          flowRestore(best);
          finalLabel = best.label;
          flowStep("分数没涨，回退到最高分版本", "warn");
          break;
        }
        if (after.pct >= 90) { flowStep("已进入高档区间，提前收住", "done"); break; }
      }
      // 正常路径上当前稿纸就是最高分版本，只有回退过才需要再恢复；避免清掉最终评分卡片
      if (docBody !== best.body) flowRestore(best);
      saveEssayToCloud();
      scheduleEssaySave();
      if (flowAbort) {
        flowStep("已停止流程 · 保留当前最高分版本", "warn");
        flowSetStat("已停止 · " + finalLabel);
      } else {
        flowStep("完成 · 初评 " + first.label + " → 终稿 " + finalLabel, "done");
        flowSetStat("流程结束 · 终稿 " + finalLabel);
      }
    } catch (e) {
      if (best) flowRestore(best);
      var msg = (e && e.message) || "未知错误";
      flowStep("流程中断：" + msg + (best ? "，已保留最高分版本" : ""), "warn");
      flowSetStat("流程中断 · " + msg);
    } finally {
      flowActive = false;
      flowAbort = false;
      if (els.flowBtn) { els.flowBtn.disabled = false; els.flowBtn.textContent = "流程作文"; }
      if (els.flowRerunBtn) els.flowRerunBtn.disabled = false;
      if (els.flowStopBtn) els.flowStopBtn.disabled = true;
      syncFlowCost();
      syncFlowDock();
      renderAnnotated();
      runRelease(runOwnedFlow);
    }
  }

  /* ---------------- 输出操作 ---------------- */

  function compositionText() {
    // docTitle/docBody 是收稿后唯一可信的作文（JSON 解析得到），不再回溯 fullText
    return { title: docTitle, body: docBody };
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

  // 右侧工作窗：拉手（开/收）/ 头部关闭 / tab / Esc；无遮罩、不拦截稿纸点击
  on(els.drawerHandle, "click", function () {
    if (drawerOpen) closeDrawer(true);
    else setDrawer(true);
  });
  on(els.drawerClose, "click", function () { closeDrawer(true); });
  on(els.criticDockClose, "click", function () { closeDrawer(true); });
  on(els.drawerTabs, "click", function (e) {
    var b = e.target.closest(".drawer-tab");
    if (!b) return;
    setDrawerTab(b.getAttribute("data-drawer"));
    if (!drawerOpen) setDrawer(true);
  });
  on(document, "keydown", function (e) {
    if (e.key !== "Escape" || !drawerOpen) return;
    var authMask = document.getElementById("authMask");
    if (authMask && !authMask.hasAttribute("hidden")) return;  // 登录弹窗优先
    closeDrawer(true);
  });

  // 评分标准表格在抽屉里，摘要行只是开关
  on(els.scoreToggle, "click", function () {
    var open = !(drawerOpen && drawerTab === "score");
    setScoreOpen(open);
  });
  on(els.criticBtn, "click", function () {
    // 手机端先切到稿纸视图，评改标记才落在可见的稿纸上
    if (isMobile()) setMView("paper");
    runCritic();
  });
  // 评分是单独一步：只打分给评语，不动稿也不谈
  on(els.scoreBtn, "click", function () {
    if (isMobile()) setMView("paper");
    runScore();
  });

  on(els.flowBtn, "click", function () {
    if (isMobile()) setMView("paper");
    runFlow();
  });
  on(els.flowRerunBtn, "click", function () {
    if (isMobile()) setMView("paper");
    runFlow();
  });
  on(els.flowStopBtn, "click", stopFlow);
  on(els.flowRounds, "change", function () { setFlowRounds(els.flowRounds.value, "wizard"); });
  on(els.flowRoundsDrawer, "change", function () { setFlowRounds(els.flowRoundsDrawer.value, "drawer"); });
  on(els.flowAuto, "change", syncFlowCost);
  setFlowRounds(els.flowRounds ? els.flowRounds.value : 2, "wizard");
  on(els.debateRounds, "change", function () { setDebateRounds(els.debateRounds.value); });
  on(els.debateRounds, "blur", function () { setDebateRounds(els.debateRounds.value); });
  on(els.debateAutoApply, "change", function () { setDebateAuto(els.debateAutoApply.checked); });
  loadDebateRounds();
  loadDebateAuto();

  // 对话框下方的模型切换
  on(els.modelPill, "click", function (e) {
    e.stopPropagation();
    toggleModelMenu();
  });
  document.addEventListener("click", function (e) {
    if (!els.modelMenu || els.modelMenu.hasAttribute("hidden")) return;
    if (els.modelPickWrap && els.modelPickWrap.contains(e.target)) return;
    closeModelMenu();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModelMenu();
  });
  loadModelPick();
  syncModelPill();
  // 登录状态变了，站内模型清单也要跟着能拿到
  if (window.WY_AUTH && window.WY_AUTH.onChange) {
    try { window.WY_AUTH.onChange(function () { syncModelPill(); }); } catch (e) { /* 老版本没有这个钩子 */ }
  }

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

  on(els.criticApplyBtn, "click", function () {
    var req = criticReqText();
    if (!req) { setDocHint("先在「旁批」页里点「认可」，再按这些重写整篇。"); return; }
    if (!docBody.trim()) { setDocHint("正文是空的，改不了。"); return; }
    rewriteEssay(req);
  });

  on(els.undoRewriteBtn, "click", function () {
    if (!undoStack.length) return;
    var snap = undoStack.pop();
    restoreEssaySnapshot(snap);
    commitVersion("恢复上一版");
    var msg = "已恢复上一版" + (undoStack.length ? "（还可再退 " + undoStack.length + " 版）" : "");
    setPaperHint(msg);
    setDocHint(msg);
  });

  if (els.diffBtn) on(els.diffBtn, "click", openLatestDiff);

  // 悬浮评语小卡：点别处 / Esc / 滚动即收（稿纸自己的选字逻辑不受影响）
  document.addEventListener("click", function (e) {
    if (!criticPopEl || criticPopEl.hidden) return;
    var t = e.target;
    if (t && t.closest && (t.closest(".critic-pop") || t.closest(".critic-mark"))) return;
    hideCriticPop();
  }, true);
  document.addEventListener("touchstart", function (e) {
    if (!criticPopEl || criticPopEl.hidden) return;
    var t = e.target;
    if (t && t.closest && (t.closest(".critic-pop") || t.closest(".critic-mark"))) return;
    hideCriticPop();
  }, { passive: true, capture: true });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" || e.keyCode === 27) hideCriticPop();
  });
  window.addEventListener("scroll", function () { hideCriticPop(); }, true);
  window.addEventListener("resize", function () { hideCriticPop(); });

  // 抽屉「旁批」页里点卡片：手机端先切到稿纸视图（捕获阶段，早于卡片自身的高亮逻辑），
  // 否则 focusSentence 会对着隐藏的稿纸空滚一次
  if (els.drawerNoteList) {
    els.drawerNoteList.addEventListener("click", function (e) {
      var card = e.target.closest && e.target.closest(".drawer-note");
      if (!card || !isMobile()) return;
      if (els.paperPane && els.paperPane.hidden) switchPane("paper");
      else setMView("paper");
    }, true);
  }

  on(els.paperBody, "click", function () { clearActiveMarks(); hideInkDock(); });

  /* ---------------- 锁句：稿纸内自己按字选，不碰浏览器原生选区 ----------------
     原生框选会跟浮层、拖动手柄、双击选词互相打架，所以在稿纸上整体关掉 user-select，
     改由这里按 .ch 字格自己维护一段区间：拖动连选，或点两下（起点、终点）成区间。 */
  var lockPop = $("lockPop");
  var lockApplyBtn = $("lockApplyBtn");
  var pendingLockText = "";

  var coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  var selChars = [];        // 本次按下时抓的字格快照（DOM 顺序即阅读顺序）
  var selA = -1, selB = -1; // 区间两端下标
  var selDragging = false;
  var selDownX = 0, selDownY = 0;
  var tapAt = 0, tapIdx = -1;   // 上一次「点选」的落点，用来拼成区间
  var selOnMark = false;        // 这次按下落在红笔标记/锁定句上：单击交给标记自己处理

  function hideLockPop() {
    if (lockPop) lockPop.hidden = true;
    pendingLockText = "";
  }

  function chIndexAt(node) {
    var el = node;
    if (el && el.nodeType === 3) el = el.parentNode;
    if (!el || !el.closest) return -1;
    var ch = el.closest(".ch");
    if (!ch || !els.paperBody.contains(ch)) return -1;
    for (var i = 0; i < selChars.length; i++) if (selChars[i] === ch) return i;
    return -1;
  }

  function selRange() {
    if (selA < 0 || selB < 0) return null;
    var a = Math.min(selA, selB), b = Math.max(selA, selB);
    return { a: a, b: b, text: selChars.slice(a, b + 1).map(function (c) { return c.textContent; }).join("") };
  }

  function paintSel() {
    var r = selRange();
    for (var i = 0; i < selChars.length; i++) {
      var on = r && i >= r.a && i <= r.b;
      if (on) selChars[i].classList.add("ch-sel");
      else selChars[i].classList.remove("ch-sel");
    }
  }

  function clearSel() {
    for (var i = 0; i < selChars.length; i++) selChars[i].classList.remove("ch-sel");
    selA = selB = -1;
    tapIdx = -1;
  }

  // 首尾两格拼出整体矩形：多行选区也能拿到正确的位置
  function selRect() {
    var r = selRange();
    if (!r) return null;
    var first = selChars[r.a], last = selChars[r.b];
    if (!first || !last) return null;
    var box = document.createRange();
    box.setStartBefore(first);
    box.setEndAfter(last);
    var rect = box.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    return rect;
  }

  // 浮层落在选区外：上方优先，放不下放下面；触屏直接放下面。任何情况都不压住选区。
  function showLockPop(text, rect) {
    if (!lockPop) return;
    var already = isLocked(text);
    pendingLockText = text;
    lockPop.hidden = false;

    var vw = window.innerWidth, vh = window.innerHeight;
    var pw = lockPop.offsetWidth || 96;
    var ph = lockPop.offsetHeight || 30;
    var gap = coarse ? 18 : 10;
    var left = Math.max(8, Math.min(vw - pw - 8, rect.left + rect.width / 2 - pw / 2));
    var top = coarse ? rect.bottom + gap : rect.top - ph - gap;
    if (top < 8) top = rect.bottom + gap;
    if (top + ph > vh - 8) top = Math.max(8, rect.top - ph - gap);
    if (top + ph > rect.top && top < rect.bottom) {
      top = rect.bottom + gap;
      if (top + ph > vh - 8) top = Math.max(8, vh - ph - 8);
    }
    lockPop.style.left = Math.round(left) + "px";
    lockPop.style.top = Math.round(top) + "px";
    if (lockApplyBtn) {
      lockApplyBtn.textContent = already ? "这句已锁住" : "锁住这句";
      lockApplyBtn.disabled = already;
    }
  }

  function settleSel() {
    var r = selRange();
    if (!r) { hideLockPop(); return; }
    if (r.text.length < 4) {
      hideLockPop();
      setPaperHint("锁句至少四个字");
      return;
    }
    var rect = selRect();
    if (!rect) { hideLockPop(); return; }
    showLockPop(r.text, rect);
    setPaperHint("已选 " + r.text.length + " 字，点「锁住这句」交给 AI，或继续拖动调整");
  }

  if (els.paperBody) {
    on(els.paperBody, "pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      selChars = Array.prototype.slice.call(els.paperBody.querySelectorAll(".ch"));
      // 手指按在格缝、标记或角标上时，按坐标再找一次字格，避免点空
      var idx = chIndexAt(e.target);
      if (idx < 0) idx = chIndexAt(document.elementFromPoint(e.clientX, e.clientY));
      if (idx < 0) { clearSel(); hideLockPop(); return; }

      // 点选第二下（且离上次不远）：直接成区间，触屏没拖动也能选
      if (!selDragging && tapIdx >= 0 && tapIdx !== idx && Date.now() - tapAt < 8000) {
        selA = tapIdx; selB = idx;
        selDragging = false;
        paintSel();
        settleSel();
        tapIdx = -1;
        e.preventDefault();
        return;
      }

      selOnMark = !!(e.target.closest && e.target.closest(".ink-mark, .critic-mark, .lock-mark"));
      selA = selB = idx;
      selDragging = false;
      selDownX = e.clientX;
      selDownY = e.clientY;
      paintSel();
      hideLockPop();
      if (els.paperBody.setPointerCapture) {
        try { els.paperBody.setPointerCapture(e.pointerId); } catch (x) { /* 老浏览器 */ }
      }
      e.preventDefault();
    });

    on(els.paperBody, "pointermove", function (e) {
      if (selA < 0) return;
      if (!selDragging) {
        if (Math.abs(e.clientX - selDownX) + Math.abs(e.clientY - selDownY) < 6) return;
        selDragging = true;
      }
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var idx = chIndexAt(el);
      if (idx >= 0 && idx !== selB) { selB = idx; paintSel(); }
      hideLockPop();
      if (e.cancelable) e.preventDefault();
    });

    on(els.paperBody, "pointerup", function (e) {
      if (selA < 0) return;
      var dragged = selDragging;
      selDragging = false;
      if (dragged) {
        settleSel();
      } else if (selOnMark) {
        // 单击标记：不抢，清掉这一格的高亮，让标记的 click（看旁批 / 解锁）照常生效
        clearSel();
        hideLockPop();
      } else if (selA === selB) {
        // 单击：记住落点，等第二下；同时把提示说清楚
        tapAt = Date.now();
        tapIdx = selA;
        hideLockPop();
        setPaperHint("已点到第 " + (selA + 1) + " 字，再点终点连成一句");
      }
      if (els.paperBody.releasePointerCapture) {
        try { els.paperBody.releasePointerCapture(e.pointerId); } catch (x) { /* 忽略 */ }
      }
    });

    on(els.paperBody, "pointercancel", function () { selDragging = false; });
  }

  if (lockApplyBtn) {
    on(lockApplyBtn, "pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); });
    on(lockApplyBtn, "click", function (e) {
      e.preventDefault();
      var t = pendingLockText;
      hideLockPop();
      clearSel();
      if (t) lockText(t);
    });
  }
  on(document, "pointerdown", function (e) {
    if (!lockPop || lockPop.hidden) return;
    if (lockPop.contains(e.target) || els.paperBody.contains(e.target)) return;
    hideLockPop();
  });
  on(document, "keydown", function (e) {
    if (e.key === "Escape") { hideLockPop(); clearSel(); }
  });
  on(window, "scroll", hideLockPop, true);
  on(window, "resize", hideLockPop);

  on(els.paperNotes, "click", function (e) {
    if (e.target === els.paperNotes) { clearActiveMarks(); hideInkDock(); }
  });

  on(els.stopBtn2, "click", function () {
    if (controller) controller.abort();
  });

  on(els.backBtn, "click", function () {
    if (controller) controller.abort();
    setDrawer(false);               // 回工作台别把浮层带到向导页
    els.studio.setAttribute("hidden", "");
    els.wizard.removeAttribute("hidden");
    document.body.classList.remove("studio-mode");
  });

  on(els.chatInput, "keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSend();
  });









  /* ---------------- 手机端：对话 / 大纲 / 稿纸 三视图 ---------------- */

  var mTabs = $("mTabs");
  var mBadgeChat = $("mBadgeChat");
  var mBadgePaper = $("mBadgePaper");
  var mqMobile = window.matchMedia("(max-width: 760px)");
  var mobileView = "outline";
  var unreadChat = 0;

  function isMobile() { return !!(mqMobile && mqMobile.matches); }

  function setBadge(el, n) {
    if (!el) return;
    if (n > 0) {
      el.textContent = n > 9 ? "9+" : String(n);
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  function noteChatReply() {
    if (!isMobile()) return;
    if (mobileView === "chat") return;
    unreadChat += 1;
    setBadge(mBadgeChat, unreadChat);
  }

  function syncPaperBadge() {
    var undecided = criticItems.filter(function (x) {
      return !x.agreed && x.verdict === "坏";
    }).length;
    setBadge(mBadgePaper, pendingMarks().length + undecided);
  }

  function setMView(name) {
    mobileView = name;
    if (!els.studio) return;
    els.studio.classList.remove("mv-chat", "mv-outline", "mv-paper");
    els.studio.classList.add("mv-" + name);
    if (mTabs) {
      mTabs.querySelectorAll(".m-tab").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-view") === name);
      });
    }
    if (name === "chat") {
      unreadChat = 0;
      setBadge(mBadgeChat, 0);
      requestAnimationFrame(function () {
        if (els.contextList) els.contextList.scrollTop = els.contextList.scrollHeight;
      });
    }
    if (name === "paper") {
      // 隐藏状态下 rect 全是 0，切回来必须重排一次旁批位置
      requestAnimationFrame(function () {
        if (docBody.trim()) renderAnnotated();
      });
    }
  }

  if (mTabs) {
    on(mTabs, "click", function (e) {
      var btn = e.target.closest(".m-tab");
      if (!btn) return;
      var v = btn.getAttribute("data-view");
      if (v === "chat") { setMView("chat"); return; }
      switchPane(v);
    });
  }

  // 从桌面切到手机宽度时，把视图补上，避免两个栏同时露出来
  (mqMobile.addEventListener ? mqMobile.addEventListener.bind(mqMobile, "change") : mqMobile.addListener.bind(mqMobile))(function () {
    if (!els.studio || els.studio.hasAttribute("hidden")) return;
    setMView(mobileView || "outline");
  });

  /* ---------------- 初始化 ---------------- */

  updateSteps();
  showEmpty();
  setBusy(false);
  setChatMode("annotate");
  setMView("outline");
  loadLocked();
  renderDrawerNotes();   // 抽屉「旁批」页的空态先摆好，等有批注时再增量重建
  syncUndoBtn();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { alignPaperGrid(); });
  }
  window.addEventListener("resize", function () {
    alignPaperGrid();
    if (els.paperPane && !els.paperPane.hidden) renderMarginNotes();
  });

  /* 登录门槛：auth.js 在本脚本之后加载，等 DOM 就绪再挂监听 */
  function initLoginGate() {
    syncGate();
    on(els.gateLoginBtn, "click", function () {
      pendingStart = false;
      if (window.WY_AUTH) window.WY_AUTH.open("login");
    });
    if (window.WY_AUTH && window.WY_AUTH.onChange) {
      window.WY_AUTH.onChange(function (user) {
        syncGate();
        // 刚才在工作台被登录拦下，登录成功后自动接着这次生成
        if (user && pendingStart && !els.wizard.hasAttribute("hidden")) {
          pendingStart = false;
          startWriting();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLoginGate);
  } else {
    initLoginGate();
  }

  /* 从控制台跳回来时恢复那篇作文。auth.js 在本脚本之后加载，
     所以延后到 DOM 就绪再读登录态。?essay 优先；没有就接上次的写作现场。 */
  function bootRestore() {
    Promise.resolve()
      .then(function () { return tryResumeEssay(); })
      .catch(function () { /* 取稿失败已由内部提示 */ })
      .then(function () { trySessionRestore(); });
  }

  // 关页/切后台时补一刀：定时器可能还差几百毫秒没落盘
  function flushSession() {
    if (sessionTimer) { clearTimeout(sessionTimer); sessionTimer = null; }
    saveSessionNow();
  }
  window.addEventListener("beforeunload", flushSession);
  window.addEventListener("pagehide", flushSession);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushSession();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      loadVersions();
      updateDiffBtn();
      setTimeout(bootRestore, 60);
    });
  } else {
    loadVersions();
    updateDiffBtn();
    setTimeout(bootRestore, 60);
  }
})();
