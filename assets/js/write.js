/* 文芽作文 - AI 写作工作台逻辑
 * 纯前端直连 OpenAI 兼容接口，无后端、无数据上传。
 * AI 输出两段：回应（对话上下文）+ 作文（方格稿纸，逐字入格）。
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

  var COLS = 15;   // 每页列数（与 CSS --cols 一致）
  var ROWS = 18;   // 每页行数（与 CSS --rows 一致）

  var els = {
    topic: $("topic"), grade: $("grade"), length: $("length"), extra: $("extra"),
    preset: $("cfgPreset"), base: $("cfgBase"), path: $("cfgPath"),
    key: $("cfgKey"), model: $("cfgModel"), temp: $("cfgTemp"),
    maxTokens: $("cfgMaxTokens"), remember: $("cfgRemember"),
    genBtn: $("genBtn"), stopBtn: $("stopBtn"), clearBtn: $("clearBtn"),
    copyBtn: $("copyBtn"), downloadBtn: $("downloadBtn"), testBtn: $("testBtn"),
    keyToggle: $("keyToggle"), resetCfg: $("resetCfg"),
    toggleConfig: $("toggleConfig"), configPanel: $("configPanel"),
    contextList: $("contextList"), contextEmpty: $("contextEmpty"),
    ctxRaw: $("ctxRaw"), copyPromptBtn: $("copyPromptBtn"),
    status: $("status"), paperScroll: $("paperScroll"), paperStat: $("paperStat")
  };

  var controller = null;
  var fullText = "";
  var lastTitle = "作文";
  var history = [];            // [{role, content}] 用于对话上下文与模型上下文
  var assistantReplyEl = null;  // 当前这一轮 AI 回应气泡的文本节点

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
    } catch (e) { /* 隐私模式下 localStorage 不可用，忽略 */ }
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

  /* ---------------- 配置面板 ---------------- */

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
      setStatus("已载入预设，请填写 API Key。", "");
    } else {
      setStatus("自定义模式：填写完整 Base URL 与模型名。", "");
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
    setStatus("配置已清除。", "ok");
  });

  /* ---------------- 状态 / 工具 ---------------- */

  function setStatus(msg, kind) {
    els.status.textContent = msg || "";
    els.status.className = "status-line" + (kind ? " " + kind : "");
  }

  function topicLines() {
    var lines = [];
    lines.push("作文题目／题材：" + els.topic.value.trim());
    if (els.grade.value) lines.push("适用学段：" + els.grade.value);
    if (els.length.value) lines.push("篇幅：" + els.length.value);
    if (els.extra.value.trim()) lines.push("额外要求：" + els.extra.value.trim());
    return lines.join("\n");
  }

  function userMessage() {
    return topicLines() + "\n\n" +
      "请先写一段给用户的「回应」，再写「作文」正文，严格按系统提示中的格式与全部条款。";
  }

  /* ---------------- 两段解析：回应 + 作文 ---------------- */

  function splitTwo(text) {
    var parts = text.split(/^\s*===作文===\s*$/m);
    if (parts.length < 2) return { reply: "", comp: text };
    var reply = parts[0].replace(/^\s*===回应===\s*$/m, "").trim();
    var comp = parts.slice(1).join("===作文===").replace(/^\s+|\s+$/g, "");
    return { reply: reply, comp: comp };
  }

  function splitText(text) {
    var src = text.replace(/\r/g, "");
    var lines = src.split("\n");
    var first = -1;
    for (var i = 0; i < lines.length && i < 3; i++) {
      if (lines[i].trim()) { first = i; break; }
    }
    if (first === -1) return { title: "", body: "" };

    // 只有短且不带句读的首行才算标题；否则整篇都是正文，避免吞掉第一句
    var raw = lines[first].trim()
      .replace(/^#+\s*/, "")
      .replace(/[《》]/g, "")
      .trim();
    var looksTitle = raw.length > 0 && raw.length <= 20 && !/[。！？，、；：]/.test(raw);
    if (looksTitle) {
      return { title: raw, body: lines.slice(first + 1).join("\n").replace(/^\n+/, "") };
    }
    return { title: "", body: src.replace(/^\n+/, "") };
  }

  /* ---------------- 逐字入格：把正文排进 ROWS×COLS 的格子 ---------------- */

  // 把若干段落排成「行」序列：每段首行缩进两格，段间空一行
  function flowRows(paragraphs) {
    var rows = [];
    var cur = [];
    var col = 0;

    function pushRow() {
      while (cur.length < COLS) cur.push("");
      rows.push(cur);
      cur = [];
      col = 0;
    }

    paragraphs.forEach(function (p, pi) {
      if (pi > 0) pushRow();          // 段间空一行
      col = 2;                        // 段首缩进两格
      for (var i = 0; i < p.length; i++) {
        if (col >= COLS) { pushRow(); }  // 换行：续行不缩进
        cur[col] = p[i];
        col++;
      }
      pushRow();
    });
    if (cur.length) pushRow();
    return rows;
  }

  // 把行序列切成每页 ROWS 行
  function paginateRows(rows) {
    var pages = [];
    for (var i = 0; i < rows.length; i += ROWS) pages.push(rows.slice(i, i + ROWS));
    return pages;
  }

  function makeCell(ch) {
    var span = document.createElement("span");
    span.className = "c";
    if (ch) span.textContent = ch;
    return span;
  }

  function renderPages(pages, streaming) {
    els.paperScroll.innerHTML = "";
    var lastCell = null;
    pages.forEach(function (rowList, pi) {
      var pageEl = document.createElement("div");
      pageEl.className = "paper-page";
      var inner = document.createElement("div");
      inner.className = "page-inner";

      if (pi === 0) {
        var t = document.createElement("div");
        t.className = "page-title";
        t.textContent = lastTitle;
        inner.appendChild(t);
      }
      var grid = document.createElement("div");
      grid.className = "page-grid";
      grid.style.gridTemplateColumns = "repeat(" + COLS + ", var(--cell))";
      rowList.forEach(function (row) {
        for (var c = 0; c < COLS; c++) {
          var cell = makeCell(row[c]);
          grid.appendChild(cell);
          if (pi === pages.length - 1 && row[c]) lastCell = cell;
        }
      });
      inner.appendChild(grid);

      var num = document.createElement("div");
      num.className = "page-num";
      num.textContent = "第 " + (pi + 1) + " 页";
      inner.appendChild(num);

      pageEl.appendChild(inner);
      els.paperScroll.appendChild(pageEl);
    });
    if (streaming && lastCell) {
      var caret = document.createElement("span");
      caret.className = "caret";
      lastCell.appendChild(caret);
      els.paperScroll.scrollTop = els.paperScroll.scrollHeight;
    }
  }

  function showPaperPlaceholder() {
    els.paperScroll.innerHTML = "";
    var pageEl = document.createElement("div");
    pageEl.className = "paper-page";
    var inner = document.createElement("div");
    inner.className = "page-inner";
    var t = document.createElement("div");
    t.className = "page-title";
    t.textContent = "作文稿纸";
    inner.appendChild(t);
    var hint = document.createElement("div");
    hint.className = "page-hint";
    hint.textContent = "填好题目与接口，点「生成作文」，作文会逐字写进这里。";
    inner.appendChild(hint);
    var grid = document.createElement("div");
    grid.className = "page-grid";
    grid.style.gridTemplateColumns = "repeat(" + COLS + ", var(--cell))";
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) grid.appendChild(makeCell(""));
    }
    inner.appendChild(grid);
    var num = document.createElement("div");
    num.className = "page-num";
    num.textContent = "第 1 页";
    inner.appendChild(num);
    pageEl.appendChild(inner);
    els.paperScroll.appendChild(pageEl);
  }

  function renderComposition(text, streaming) {
    var parts = splitText(text);
    lastTitle = parts.title || "作文";
    var paras = parts.body.split(/\n+/).filter(function (p) { return p.trim(); });
    if (!paras.length) paras = [""];
    var rows = flowRows(paras);
    var pages = paginateRows(rows);
    renderPages(pages, streaming);
    var count = Array.from(parts.body.replace(/\s/g, "")).length;
    els.paperStat.textContent = count ? ("字数 " + count + (streaming ? " · 生成中" : "")) : "";
  }

  /* ---------------- 对话上下文气泡 ---------------- */

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

  function updateContextRaw() {
    var parts = ["【系统提示】\n" + (window.WY_PROMPT || "")];
    history.slice(-4).forEach(function (it) {
      parts.push((it.role === "user" ? "【用户（上一次）】" : "【文芽（上一次）】") + "\n" + it.content);
    });
    parts.push("【用户（本次）】\n" + userMessage());
    els.ctxRaw.textContent = parts.join("\n\n----------\n\n");
  }

  /* ---------------- 输出更新（流式驱动） ---------------- */

  function updateOutput(streaming) {
    var hasMarker = /^\s*===作文===\s*$/m.test(fullText);
    if (!hasMarker) {
      if (streaming) {
        if (assistantReplyEl) assistantReplyEl.textContent = "正在理解你的要求…";
        showPaperPlaceholder();
        return;
      }
      // 收尾但没有分隔标记：整段当作作文
      if (assistantReplyEl) assistantReplyEl.textContent = "（模型未按两段格式输出，已作为作文呈现）";
      renderComposition(fullText, false);
      return;
    }
    var parts = splitTwo(fullText);
    if (assistantReplyEl) assistantReplyEl.textContent = parts.reply || "（已生成回应）";
    renderComposition(parts.comp, streaming);
  }

  function setBusy(busy) {
    els.genBtn.disabled = busy;
    els.stopBtn.disabled = !busy;
    els.testBtn.disabled = busy;
    els.genBtn.textContent = busy ? "生成中…" : "生成作文";
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

  function validate() {
    var c = currentConfig();
    if (!c.base) return "请先填写 Base URL。";
    if (!c.key) return "请先填写 API Key。";
    if (!c.model) return "请先填写模型名。";
    if (!els.topic.value.trim()) return "请先写一句作文题目或题材。";
    return "";
  }

  function buildBody(c, stream) {
    var t = parseFloat(c.temp);
    var m = parseInt(c.maxTokens, 10);
    var messages = [{ role: "system", content: window.WY_PROMPT }];
    history.slice(-4).forEach(function (it) {
      messages.push({ role: it.role, content: it.content });
    });
    messages.push({ role: "user", content: userMessage() });
    return {
      model: c.model,
      messages: messages,
      stream: stream,
      temperature: isNaN(t) ? 1 : Math.min(2, Math.max(0, t)),
      max_tokens: isNaN(m) ? 2400 : Math.min(16000, Math.max(64, m))
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
    return map[res.status] || ("接口返回 " + res.status) + (detail ? "：" + detail : "");
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

  async function generate() {
    var err = validate();
    if (err) {
      setStatus(err, "error");
      if (/Base URL|API Key|模型名/.test(err)) setConfigOpen(true);
      return;
    }

    var c = currentConfig();
    saveConfig();
    controller = new AbortController();
    fullText = "";
    setBusy(true);
    setStatus("正在连接接口…", "");

    addUserBubble(topicLines());
    assistantReplyEl = addAssistantBubble();
    showPaperPlaceholder();
    updateContextRaw();

    try {
      var res = await fetch(endpoint(c), {
        method: "POST",
        headers: headers(c),
        body: JSON.stringify(buildBody(c, true)),
        signal: controller.signal
      });

      if (!res.ok) {
        var raw = await res.text();
        throw new Error(friendlyError(res, raw));
      }

      var ctype = res.headers.get("content-type") || "";
      var got = false;

      // 部分网关忽略 stream 参数直接返回 JSON；其余一律按 SSE 读
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

      history.push({ role: "user", content: topicLines() });
      history.push({ role: "assistant", content: fullText });
      if (history.length > 8) history = history.slice(-8);

      setStatus("生成完成。", "ok");

    } catch (e) {
      if (e && e.name === "AbortError") {
        updateOutput(false);
        setStatus("已停止，保留已生成的部分。", "");
      } else {
        var msg = (e && e.message) || "未知错误";
        if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
          msg = "请求发不出去：多为浏览器跨域被拦或网络不通。换支持 CORS 的接口，或改用本地代理。";
        }
        setStatus("生成失败：" + msg, "error");
        updateOutput(false);
      }
    } finally {
      controller = null;
      setBusy(false);
    }
  }

  async function testConnection() {
    var c = currentConfig();
    if (!c.base || !c.key || !c.model) {
      setStatus("测试前先填齐 Base URL、API Key、模型名。", "error");
      return;
    }
    setStatus("正在测试连接…", "");
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
      setStatus("连接正常，可以生成作文。", "ok");
    } catch (e) {
      var msg = (e && e.message) || "未知错误";
      if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
        msg = "跨域被拦或网络不通，该接口可能无法从浏览器直连。";
      }
      setStatus("连接失败：" + msg, "error");
    } finally {
      els.testBtn.disabled = false;
    }
  }

  /* ---------------- 输出操作 ---------------- */

  function compositionText() {
    var parts = splitTwo(fullText);
    return splitText(parts.comp);
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
      setStatus(okMsg, "ok");
    } catch (e) {
      var ok = fallbackCopy(text);
      setStatus(ok ? okMsg : "复制失败，请手动选中文字。", ok ? "ok" : "error");
    }
  }

  function copyText() {
    var text = plainOutput();
    if (!text.trim()) { setStatus("稿纸还是空的。", "error"); return; }
    copyString(text, "作文已复制。");
  }

  function copyPrompt() {
    copyString(els.ctxRaw.textContent || "", "完整上下文已复制。");
  }

  function downloadText() {
    var text = plainOutput();
    if (!text.trim()) { setStatus("稿纸还是空的。", "error"); return; }
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
    setStatus("已下载为 txt。", "ok");
  }

  /* ---------------- 事件绑定 ---------------- */

  els.genBtn.addEventListener("click", generate);
  els.testBtn.addEventListener("click", testConnection);
  els.copyBtn.addEventListener("click", copyText);
  els.copyPromptBtn.addEventListener("click", copyPrompt);
  els.downloadBtn.addEventListener("click", downloadText);

  els.stopBtn.addEventListener("click", function () {
    if (controller) controller.abort();
  });

  els.clearBtn.addEventListener("click", function () {
    if (controller) controller.abort();
    fullText = "";
    history = [];
    assistantReplyEl = null;
    els.contextList.innerHTML = "";
    var empty = document.createElement("div");
    empty.className = "context-empty";
    empty.id = "contextEmpty";
    empty.textContent = "还没有对话。写下题目，点「生成作文」，AI 的回应和作文会依次出现在这里。";
    els.contextList.appendChild(empty);
    els.contextEmpty = empty;
    showPaperPlaceholder();
    els.paperStat.textContent = "";
    setStatus("已清空。", "");
  });

  document.querySelectorAll("[data-topic]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      els.topic.value = btn.getAttribute("data-topic");
      els.topic.focus();
      setStatus("已填入示例题目，可直接生成。", "");
    });
  });

  els.topic.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") generate();
  });

  showPaperPlaceholder();
  setBusy(false);
})();
