/* 掲載終了の案件を、案件一覧・トップのカードから外す（管理者には「掲載終了」の印を付けて表示） */
(function () {
  var admin = false; try { admin = localStorage.getItem("tamj_admin") === "1"; } catch (_) {}
  fetch("https://develop-api.tamjump.com/api/nda/listings").then(function (r) { return r.json(); }).then(function (j) {
    (j.closed || []).forEach(function (id) {
      document.querySelectorAll('a[href$="' + id + '/"]').forEach(function (a) {
        if (!/listings\/[^/]+\/$|^[^/]+\/$/.test(a.getAttribute("href"))) return;
        if (admin) {
          a.style.opacity = ".55";
          var b = document.createElement("span"); b.textContent = "掲載終了";
          b.style.cssText = "position:absolute;top:8px;left:8px;z-index:3;background:#fff;border:1px solid #b52d2d;color:#b52d2d;font-size:11px;padding:1px 8px;border-radius:99px";
          if (getComputedStyle(a).position === "static") a.style.position = "relative";
          a.appendChild(b);
        } else a.remove();
      });
    });
  }).catch(function () {});
})();
