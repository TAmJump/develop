/* ヘッダーの「ログアウト」：ログイン中（会員・管理者・案件の関係者）だけ表示 */
(function () {
  function g(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  var admin = g("tamj_admin") === "1", member = !!g("tamj_session"), guest = !!g("tamj_guest");
  if (!admin && !member && !guest) return;
  function out(e) {
    e.preventDefault();
    if (admin) { if (window.tamjAdminSignout) window.tamjAdminSignout(); else location.href = "https://develop-api.tamjump.com/admin/signout"; return; }
    try {
      if (guest) {
        Object.keys(localStorage).forEach(function (k) { if (k.indexOf("tamj_nda_tok_") === 0) localStorage.removeItem(k); });
        localStorage.removeItem("tamj_guest");
      }
    } catch (_) {}
    if (member && window.logoutUser) { window.logoutUser(); return; }
    try { localStorage.removeItem("tamj_session"); localStorage.removeItem("tamj_user"); } catch (_) {}
    location.href = "/";
  }
  function add() {
    var nav = document.querySelector("header nav.menu, .topnav nav, nav.nav .menu, nav.menu, nav.header-nav");
    if (!nav || nav.querySelector(".hdr-logout")) return;
    var a = document.createElement("a");
    a.href = "#"; a.className = "hdr-logout"; a.textContent = "ログアウト";
    a.style.cssText = "border:1px solid currentColor;border-radius:99px;padding:4px 12px;opacity:.85";
    a.onclick = out;
    var cta = nav.querySelector(".cta");
    if (cta && cta.parentNode === nav) nav.insertBefore(a, cta.nextSibling); else nav.appendChild(a);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add();
})();
