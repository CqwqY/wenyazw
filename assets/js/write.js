/* 文芽作文 - AI 写作工作台逻辑
 * 纯前端直连 OpenAI 兼容接口，无后端、无数据上传。
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
    topic: $("topic"), grade: $("grade"), length: $("length"), extra: $("extra"),
    preset: $("cfgPreset"), base: $("cfgBase"), path: $("cfgPath"),
    key: $("cfgKey"), model: $("cfgModel"), temp: $("cfgTemp"),
    maxTokens: $("cfgMaxTokens"), remember: $("cfgRemember"),
    genBtn: $("genBtn"), stopBtn: $("stopBtn"), clearBtn: $("clearBtn"),
    copyBtn: $("copyBtn"), downloadBtn: $("downloadBtn"), testBtn: $("testBtn"),
    keyToggle: $("keyToggle"), resetCfg: $("resetCfg"),
    toggleConfig: $("toggleConfig"), configPanel: $("configPanel"),
    promptPreview: $("promptPreview"), promptStat: $("promptStat"),
    copyPromptBtn: $("copyPromptBtn"),
    status: $("status"), paperTitle: $("paperTitle"),
    paperBody: $("paperBody"), paperStat: $("paperStat")
  };

  var controller = null;
  var fullText = "";
  var lastTitle = "未命名";

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

  /* ---------------- 配置面板与提示文本 ---------------- */

  function setConfigOpen(open) {
    if (open) els.configPanel.removeAttribute("hidden");
    else els.configPanel.setAttribute("hidden", "");
    els.toggleConfig.setAttribute("aria-expanded", String(!!open));
    els.toggleConfig.textContent = open ? "收起配置" : "接口配置";
  }

  function updatePromptPreview() {
    var rulesCount = Array.from(window.WY_PROMPT || "").length;
    var msg = userMessage();
    els.promptPreview.textContent =
      "【系统提示】12 条写作规则已固定 · " + rulesCount + " 字（可在下方展开查看）\n\n" +
      "【本次输入】\n" + msg;
    els.promptStat.textContent = Array.from(msg.replace(/\s/g, "")).length + " 字";
  }

  function fullPrompt() {
    return window.WY_PROMPT + "\n\n=====\n\n" + userMessage();
  }

  els.toggleConfig.addEventListener("click", function () {
    setConfigOpen(els.configPanel.hasAttribute("hidden"));
  });
  setConfigOpen(!readConfig().key);

  ["topic", "grade", "length", "extra"].forEach(function (name) {
    els[name].addEventListener("input", updatePromptPreview);
    els[name].addEventListener("change", updatePromptPreview);
  });
  updatePromptPreview();

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

  /* ---------------- 状态与稿纸 ---------------- */

  function setStatus(msg, kind) {
    els.status.textContent = msg || "";
    els.status.className = "status-line" + (kind ? " " + kind : "");
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

  function render(text, streaming) {
    var parts = splitText(text);
    lastTitle = parts.title || "作文稿纸";
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
    els.paperStat.textContent = count ? count + " 字" + (streaming ? " · 生成中" : "") : "";
  }

  function showEmpty() {
    els.paperTitle.textContent = "作文稿纸";
    els.paperBody.textContent = "填好题目与接口，点「生成作文」，内容会逐字写在这里。";
    els.paperBody.className = "paper-body paper-empty";
    els.paperStat.textContent = "";
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

  function userMessage() {
    var lines = [];
    lines.push("作文题目／题材：" + els.topic.value.trim());
    if (els.grade.value) lines.push("适用学段：" + els.grade.value);
    if (els.length.value) lines.push("篇幅：" + els.length.value);
    if (els.extra.value.trim()) lines.push("额外要求：" + els.extra.value.trim());
    lines.push("");
    lines.push("严格按系统提示中的全部条款，写出一篇完整的作文。只输出作文正文。");
    return lines.join("\n");
  }

  function buildBody(c, stream) {
    var t = parseFloat(c.temp);
    var m = parseInt(c.maxTokens, 10);
    return {
      model: c.model,
      messages: [
        { role: "system", content: window.WY_PROMPT },
        { role: "user", content: userMessage() }
      ],
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
    // 最后一行可能没有换行符
    if (leftover.trim()) readDataLine(leftover, onDelta);
  }

  async function generate() {
    var err = validate();
    if (err) {
      setStatus(err, "error");
      if (/Base URL|API Key|模型名/.test(err)) setConfigOpen(true);
      return;
    }
    updatePromptPreview();

    var c = currentConfig();
    saveConfig();
    controller = new AbortController();
    fullText = "";
    setBusy(true);
    setStatus("正在连接接口…", "");
    render("", true);

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
          render(fullText, true);
        });
      } else {
        // 部分网关忽略 stream 参数，直接返回完整 JSON
        var j = await res.json();
        if (j.error) throw new Error(j.error.message || "接口返回错误");
        var msg = j.choices && j.choices[0] && j.choices[0].message;
        fullText = (msg && msg.content) || "";
        got = true;
        render(fullText, false);
      }

      if (!got || !fullText.trim()) throw new Error("接口没有返回内容，换一个模型或检查额度。");
      render(fullText, false);
      setStatus("生成完成。", "ok");

    } catch (e) {
      if (e && e.name === "AbortError") {
        render(fullText, false);
        setStatus("已停止，保留已生成的部分。", "");
      } else {
        var msg = (e && e.message) || "未知错误";
        if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(msg)) {
          msg = "请求发不出去：多为浏览器跨域被拦或网络不通。换支持 CORS 的接口，或改用本地代理。";
        }
        setStatus("生成失败：" + msg, "error");
        render(fullText, false);
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

  function plainOutput() {
    var body = splitText(fullText).body;
    return (lastTitle && lastTitle !== "作文稿纸" ? lastTitle + "\n\n" : "") + body;
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
    copyString(fullPrompt(), "完整提示词已复制。");
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
    showEmpty();
    setStatus("稿纸已清空。", "");
  });

  document.querySelectorAll("[data-topic]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      els.topic.value = btn.getAttribute("data-topic");
      updatePromptPreview();
      els.topic.focus();
      setStatus("已填入示例题目，可直接生成。", "");
    });
  });

  els.topic.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") generate();
  });

  showEmpty();
  setBusy(false);
})();
