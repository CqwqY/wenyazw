/* 文芽作文 - 主页：CTA 登录门槛 + 精选范文 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var cta = $("homeCta");
  var cta2 = $("homeCta2");
  var note = $("heroNote");
  var pending = false;          // 点了开始写作但还没登录，登录成功后自动进工作台

  function loggedIn() {
    return !!(window.WY_AUTH && window.WY_AUTH.loggedIn());
  }

  function sync() {
    var on = loggedIn();
    if (cta) cta.textContent = on ? "继续写作" : "开始写作";
    if (note) {
      note.textContent = on
        ? "已登录。进工作台后先确认接口配置，再点开始生成。"
        : "生成作文需要登录。邮箱验证码登录，不设密码；大模型密钥只存在你自己的浏览器里。";
    }
  }

  function go() {
    if (loggedIn()) { location.href = "write.html"; return; }
    pending = true;
    if (window.WY_AUTH) window.WY_AUTH.open("login");
  }

  if (cta) cta.addEventListener("click", go);
  if (cta2) cta2.addEventListener("click", go);

  window.addEventListener("load", function () {
    sync();
    if (window.WY_AUTH && window.WY_AUTH.onChange) {
      window.WY_AUTH.onChange(function (user) {
        sync();
        if (user && pending) { pending = false; location.href = "write.html"; }
      });
    }
  });

  var grid = $("featuredEssays");
  if (grid && window.WY && window.WY.renderEssayCards) {
    window.WY.renderEssayCards(grid, (window.WY.essays || []).slice(0, 3));
  }
})();
