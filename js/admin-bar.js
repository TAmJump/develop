/* 管理者（info@tamjump.com でログイン中）向けの共通処理
 * - サイトのどのページでも右下に「管理画面」「ログアウト」を表示
 * - ?signout=1 で管理者状態（全案件の閲覧権限を含む）を消す
 */
(function () {
  var API = "https://develop-api.tamjump.com";
  function g(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function clear() {
    try {
      ["tamj_admin", "tamj_nda_tok_master", "tamj_gate_ok"].forEach(function (k) { localStorage.removeItem(k); });
      sessionStorage.removeItem("tamj_listings_unlock");
    } catch (_) {}
  }
  window.tamjAdminSignout = function () { clear(); location.href = API + "/admin/signout"; };
  if (/[?&]signout=1/.test(location.search)) { clear(); return; }
  if (g("tamj_admin") !== "1") return;

  function bar() {
    if (document.getElementById("tamj-admin-bar")) return;
    var css = document.createElement("style");
    css.textContent = "#tamj-admin-bar{position:fixed;right:16px;bottom:16px;z-index:10050;display:flex;gap:6px;align-items:center;background:#fffdf8;border:1px solid #c9bda8;border-radius:999px;padding:5px 6px 5px 14px;font:12px/1.4 -apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;color:#6e6354;box-shadow:0 2px 10px rgba(60,40,20,.12)}" +
      "#tamj-admin-bar a{color:#9b6339;text-decoration:none;border:1px solid #d9c9b2;border-radius:999px;padding:5px 12px;background:#fff}" +
      "#tamj-admin-bar a:hover{border-color:#9b6339}@media print{#tamj-admin-bar{display:none}}";
    document.head.appendChild(css);
    var d = document.createElement("div"); d.id = "tamj-admin-bar";
    d.innerHTML = '<span>管理者</span><a href="' + API + '/admin/nda">管理画面</a><a href="#" id="tamj-admin-out">ログアウト</a>';
    document.body.appendChild(d);
    document.getElementById("tamj-admin-out").onclick = function (e) { e.preventDefault(); window.tamjAdminSignout(); };
  }
  if (document.body) bar(); else document.addEventListener("DOMContentLoaded", bar);
})();
