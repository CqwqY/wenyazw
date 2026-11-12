/* 文芽作文 - 主页：登录门槛，只留一个按钮 */
(function () {
  "use strict";

  var cta = document.getElementById("homeCta");
  var note = document.getElementById("heroNote");
  var pending = false;

  function loggedIn() {
    return !!(window.WY_AUTH && window.WY_AUTH.loggedIn());
  }

  function sync() {
    var on = loggedIn();
    if (cta) cta.textContent = on ? "继续写作" : "开始写作";
    if (note) {
      note.textContent = on
        ? "已登录。进工作台后先确认接口配置，再点开始生成。"
        : "生成需要登录，邮箱验证码即可，不设密码。";
    }
  }

  if (cta) {
    cta.addEventListener("click", function () {
      if (loggedIn()) { location.href = "write.html"; return; }
      pending = true;
      if (window.WY_AUTH) window.WY_AUTH.open("login");
    });
  }

  window.addEventListener("load", function () {
    sync();
    if (window.WY_AUTH && window.WY_AUTH.onChange) {
      window.WY_AUTH.onChange(function (user) {
        sync();
        if (user && pending) { pending = false; location.href = "write.html"; }
      });
    }
  });
})();
