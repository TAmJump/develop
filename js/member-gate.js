/* 案件一覧・案件ページの入口：会員ログイン（無料登録）が必要
 * - 管理者（info@tamjump.com でログイン中）・最高権限キー入力済みの端末はそのまま表示
 * - 会員はログイン状態をサーバーで確認
 * - 未ログインなら「ログイン／会員登録（無料）」の画面を出し、済んだら元のページに戻る
 * 使い方：<script src="/js/member-gate.js"></script> を <body> 直後に置く。
 *        window.tamjMemberGate(onKey) … onKey(key) を渡すと「解除キーをお持ちの方」欄を表示
 */
(function () {
  var MEMBER_API = "https://tamjump-member-api.animalb001.workers.dev";
  function g(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function privileged() { return g("tamj_admin") === "1" || !!g("tamj_nda_tok_master"); }
  function back() { return encodeURIComponent(location.pathname + location.search); }

  var css = document.createElement("style");
  css.textContent = "#tamj-mg{position:fixed;inset:0;z-index:99990;background:#f4efe6;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;color:#1a1815}" +
    "#tamj-mg .bx{background:#faf7f0;border:1px solid #c9bda8;padding:34px 30px;max-width:420px;width:90%;text-align:center}" +
    "#tamj-mg h2{font-family:'Noto Serif JP',serif;font-size:19px;font-weight:600;margin:6px 0 10px}" +
    "#tamj-mg p{font-size:13px;color:#6e6354;line-height:1.9;margin:0 0 18px}" +
    "#tamj-mg a.b{display:block;padding:11px;border:1px solid #9b6339;border-radius:6px;text-decoration:none;font-size:14px;margin-top:10px}" +
    "#tamj-mg a.p{background:#9b6339;color:#fff}#tamj-mg a.s{background:#fff;color:#9b6339}" +
    "#tamj-mg .k{margin-top:20px;padding-top:14px;border-top:1px solid #e4ded3;font-size:12px;color:#8a7c68;text-align:left}" +
    "#tamj-mg .k input{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #c9bda8;border-radius:6px;font-size:14px;margin-top:6px}" +
    "#tamj-mg .k button{margin-top:8px;padding:8px 14px;border:1px solid #9b6339;background:#fff;color:#9b6339;border-radius:6px;cursor:pointer}" +
    "#tamj-mg .er{color:#b52d2d;font-size:12px;min-height:16px;margin-top:6px}";
  (document.head || document.documentElement).appendChild(css);

  function show(onKey) {
    if (document.getElementById("tamj-mg")) return;
    var d = document.createElement("div"); d.id = "tamj-mg";
    d.innerHTML = '<div class="bx"><h2>取扱案件の閲覧</h2>' +
      '<p>開発・M&amp;A案件の閲覧には、会員登録（無料）とログインが必要です。所在地・名称などの詳細は、案件ごとの秘密保持契約の締結後に表示します。</p>' +
      '<a class="b p" href="/login.html?return=' + back() + '">ログイン</a>' +
      '<a class="b s" href="/register.html?return=' + back() + '">会員登録（無料）</a>' +
      (onKey ? '<div class="k">解除キーをお持ちの方<input id="tamj-mg-k" type="password" autocomplete="off" placeholder="解除キー"><button id="tamj-mg-b">表示する</button><div class="er" id="tamj-mg-e"></div></div>' : '') +
      '</div>';
    (document.body || document.documentElement).appendChild(d);
    document.documentElement.style.overflow = "hidden";
    if (onKey) {
      var go = async function () {
        var v = document.getElementById("tamj-mg-k").value.trim(); if (!v) return;
        var ok = await onKey(v);
        if (ok) hide(); else document.getElementById("tamj-mg-e").textContent = "解除キーが違います";
      };
      document.getElementById("tamj-mg-b").onclick = go;
      document.getElementById("tamj-mg-k").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    }
  }
  function hide() { var d = document.getElementById("tamj-mg"); if (d) d.remove(); document.documentElement.style.overflow = ""; }

  window.tamjMemberGate = function (onKey) {
    if (privileged()) return;
    var tok = g("tamj_session");
    if (!tok) { show(onKey); return; }
    fetch(MEMBER_API + "/api/auth/me", { headers: { Authorization: "Bearer " + tok }, credentials: "include" })
      .then(function (r) { if (r.status === 401 || r.status === 403) { try { localStorage.removeItem("tamj_session"); localStorage.removeItem("tamj_user"); } catch (_) {} show(onKey); } })
      .catch(function () {});
  };
  window.tamjMemberGateHide = hide;
})();
