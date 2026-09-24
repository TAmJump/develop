/*
 * 案件ページ共通の閲覧制御（lock.js）
 *
 * 公開版（ノンネーム）：
 *   1. 閲覧パスワード（ゲート）
 *   2. 伏せ字の状態で表示。所在地・名称・図面・写真等は HTML に含まれていない
 *   3. 解除キー（NDA締結で発行・7日で更新）または最高権限キーを Worker で照合
 *   4. 照合が通ると、Worker から復号用の鍵を受け取り、同じフォルダの full.enc（暗号化した完全版）を復号して表示
 *
 * 読み込み方：<script src="../lock.js" data-l="案件ID"></script>（<body> の直後）
 * 完全版の中では window.__NDA_STATE（照合結果）が先に設定されている
 */
(function () {
  "use strict";
  var API = "https://develop-api.tamjump.com";
  var GATE = ["tamj2026", "tamj2030"];
  var me = document.currentScript;
  var L = (me && me.getAttribute("data-l")) || "";
  var FULL = !!window.__NDA_STATE;
  var T = "tamj_nda_tok_" + L, S = "tamj_gate_ok";

  var css = document.createElement("style");
  css.textContent =
    "#nda-gate{position:fixed;inset:0;z-index:9999;background:#f4efe6;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif}" +
    "#nda-gate .box{background:#faf7f0;border:1px solid #c9bda8;padding:34px 30px;max-width:390px;width:90%;text-align:center;color:#1a1815}" +
    "#nda-gate h2{font-family:'Noto Serif JP',serif;font-size:19px;margin:10px 0 4px;font-weight:600}" +
    "#nda-gate p{font-size:12.5px;color:#6e6354;margin:0 0 16px}" +
    "#nda-gate input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #c9bda8;border-radius:6px;font-size:14px}" +
    "#nda-gate button{width:100%;margin-top:10px;padding:10px;border:1px solid #9b6339;background:#9b6339;color:#fff;border-radius:6px;cursor:pointer;font-size:14px}" +
    "#nda-gate .er{color:#b52d2d;font-size:12px;height:16px;margin:8px 0 0}" +
    "#nda-gate .ft{font-size:11px;color:#8a7c68;margin:12px 0 0}" +
    ".nda-bar{position:sticky;top:0;z-index:9000;background:#f3e7dd;border-bottom:1px solid #c9bda8;padding:8px 20px;font:12.5px/1.6 -apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;color:#7e4e2d;display:flex;gap:10px;align-items:center;flex-wrap:wrap}" +
    ".nda-bar.ok{background:#e7efec;border-color:#9ec3bc;color:#2e7d78}" +
    ".nda-bar input{border:1px solid #c9bda8;border-radius:6px;padding:5px 9px;font-size:12.5px}" +
    ".nda-bar button{border:1px solid #9b6339;background:#9b6339;color:#fff;border-radius:6px;padding:5px 12px;font-size:12.5px;cursor:pointer}" +
    ".nda-bar a{color:inherit}" +
    ".nda-wm{position:fixed;inset:0;z-index:8000;pointer-events:none;opacity:.09;overflow:hidden}" +
    ".nda-wm span{position:absolute;font:600 15px/1 'Noto Sans JP',sans-serif;color:#1a1815;white-space:nowrap;transform:rotate(-30deg)}" +
    ".conf{border-radius:2px}" +
    "body.nonname .conf{background:#c9bda8;color:transparent!important;box-shadow:0 0 0 1px #b9aa94 inset}" +
    "body.show .conf{background:transparent!important;color:inherit!important;box-shadow:none!important}" +
    "#nda-loading{position:fixed;inset:0;z-index:9998;background:rgba(244,239,230,.92);display:flex;align-items:center;justify-content:center;font:14px -apple-system,'Noto Sans JP',sans-serif;color:#6e6354}" +
    "@media print{body{display:none!important}}";
  document.head.appendChild(css);

  function $(i) { return document.getElementById(i); }
  function fmt(iso) { try { return new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (_) { return ""; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) { return null; } }
  async function call(p, o) {
    var r = await fetch(API + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) });
    var j = {}; try { j = await r.json(); } catch (_) {}
    return j;
  }
  function b64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  // 透かし・転用防止
  function wm() {
    var d = document.createElement("div"); d.className = "nda-wm"; var t = "CONFIDENTIAL · 転載禁止 · TAmJ";
    for (var y = 0; y < 40; y++) for (var x = 0; x < 8; x++) { var s = document.createElement("span"); s.textContent = t; s.style.left = (x * 260 - 120) + "px"; s.style.top = (y * 180) + "px"; d.appendChild(s); }
    document.body.appendChild(d);
  }
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.addEventListener("dragstart", function (e) { e.preventDefault(); });
  document.addEventListener("copy", function (e) { e.preventDefault(); });
  document.addEventListener("keydown", function (e) {
    var k = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ["p", "s", "c", "u", "x"].indexOf(k) >= 0) e.preventDefault();
  });

  // 状態バー
  var bar = document.createElement("div"); bar.className = "nda-bar";
  function links() { return '<a href="../nda/?l=' + L + '">秘密保持契約を締結して閲覧</a>・<a href="../nda/?l=' + L + '#renew">解除キーを更新</a>'; }
  function setBar(st, msg) {
    if (st) {
      bar.className = "nda-bar ok";
      bar.innerHTML = "<b>非公開資料</b><span>" + (st.level === "master" ? "最高権限キーで全項目を表示中。" :
        "秘密保持の締結済み" + (st.company ? "（" + st.company + "）" : "") + "。全項目を表示中。解除キーの有効期限 " + fmt(st.expires_at) + "。") + "</span>";
    } else {
      bar.className = "nda-bar";
      bar.innerHTML = "<b>非公開資料</b><span>" + (msg ? msg + " " : "") +
        "秘密保持の締結前のため、所在地・名称・図面・写真などを伏せた概要を表示しています。秘密保持契約の締結後、発行される解除キーを入力すると全項目を表示します。" + links() +
        '</span><span><input id="nda-key" type="password" placeholder="秘密保持の解除キー" autocomplete="off"> <button id="nda-btn">解除</button></span>';
      var go = function () { var v = $("nda-key").value.trim(); if (v) { $("nda-key").value = ""; unlock(v); } };
      $("nda-btn").onclick = go;
      $("nda-key").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    }
  }

  // 完全版の復号・表示
  async function showFull(st) {
    if (!st.ck) { setBar(null, "表示の準備が完了していません。時間をおいて再度お試しください。"); return; }
    var ld = document.createElement("div"); ld.id = "nda-loading"; ld.textContent = "資料を読み込んでいます"; document.body.appendChild(ld);
    try {
      var r = await fetch("full.enc?v=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error("fetch");
      var buf = new Uint8Array(await r.arrayBuffer());
      var key = await crypto.subtle.importKey("raw", b64(st.ck), { name: "AES-GCM" }, false, ["decrypt"]);
      var plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
      var ds = new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip")));
      var html = await ds.text();
      var state = { level: st.level, company: st.company || "", expires_at: st.expires_at };
      html = html.replace(/<head[^>]*>/i, function (m) { return m + "<script>window.__NDA_STATE=" + JSON.stringify(state) + "<\/script>"; });
      document.open(); document.write(html); document.close();
    } catch (e) {
      ld.remove();
      setBar(null, "資料を表示できませんでした。解除キーを入力し直してください。");
    }
  }

  async function check() {
    var t = ls(T) || ls("tamj_nda_tok_master"); if (!t) { setBar(null); return; }
    try {
      var j = await call("/api/nda/check", { token: t, listing: L });
      if (j.ok) { showFull(j); return; }
      ls(T, null); if (j.error !== "other_listing") ls("tamj_nda_tok_master", null);
      setBar(null, j.error === "expired" ? "解除キーの有効期限切れ。更新手続きで新しいキーを取得してください。" : j.error === "revoked" ? "この解除キーは失効しています。" : "");
    } catch (_) { setBar(null, "認証サーバーに接続できません。"); }
  }
  async function unlock(key) {
    var j = await call("/api/nda/unlock", { key: key, listing: L });
    if (j.ok) { ls(j.level === "master" ? "tamj_nda_tok_master" : T, j.token); try { sessionStorage.setItem(S, "1"); } catch (_) {} ls(S, "1"); showFull(j); return j; }
    var E = { expired: "この解除キーは有効期限切れ。", revoked: "この解除キーは失効しています。", other_listing: "別の案件の解除キーです。", too_many: "試行回数が多いため、しばらく時間をおいてください。" };
    setBar(null, E[j.error] || "解除キーが違います。");
    return j;
  }

  // 閲覧パスワード
  function gate() {
    if (ls(S) === "1") return;
    var g = document.createElement("div"); g.id = "nda-gate";
    g.innerHTML = '<div class="box"><h2>' + (document.title.split("｜")[0] || "非公開資料") + '</h2><p>取引先限定の資料。パスワードを入力してください。</p>' +
      '<input id="nda-gp" type="password" placeholder="パスワード" autocomplete="off"><button id="nda-gb">表示する</button><p class="er" id="nda-ge"></p>' +
      '<p class="ft">無断での複製・転載・第三者への提供を禁じます<br>タムジ株式会社</p></div>';
    document.body.appendChild(g); document.documentElement.style.overflow = "hidden";
    var t = async function () {
      var v = $("nda-gp").value.trim(); if (!v) return;
      if (GATE.indexOf(v) >= 0) { ls(S, "1"); g.remove(); document.documentElement.style.overflow = ""; return; }
      var j = await unlock(v);
      if (j && j.ok) { g.remove(); document.documentElement.style.overflow = ""; return; }
      $("nda-ge").textContent = "パスワードが違います";
    };
    $("nda-gb").onclick = t;
    $("nda-gp").addEventListener("keydown", function (e) { if (e.key === "Enter") t(); });
  }

  function boot() {
    document.body.insertBefore(bar, document.body.firstChild);
    wm();
    if (FULL) {
      document.body.classList.remove("nonname"); document.body.classList.add("show");
      setBar(window.__NDA_STATE);
      return;
    }
    document.body.classList.add("nonname");
    try { localStorage.removeItem("tamj_nda_ok"); } catch (_) {}
    var h = null; try { h = sessionStorage.getItem("tamj_nda_handoff_" + L); sessionStorage.removeItem("tamj_nda_handoff_" + L); } catch (_) {}
    if (h) { ls(S, "1"); unlock(h); } else { gate(); check(); }
  }
  if (document.body) boot(); else document.addEventListener("DOMContentLoaded", boot);
})();

// 管理者バー（管理者でログイン中のみ表示）
(function(){ var s = document.createElement("script"); s.src = "/js/admin-bar.js"; (document.head || document.documentElement).appendChild(s); })();
