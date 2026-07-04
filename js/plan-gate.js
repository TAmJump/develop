/* ============================================================
   plan-gate.js — 無料開放版（会員登録は必須 / 有料制限なし）
   ------------------------------------------------------------
   会員登録済みのユーザーは全機能を無制限に利用可能。
   Pro ロック・月間利用上限・課金導線はすべて撤廃。
   会員登録／ログインの必須化は auth.js の requireAuth() が担う。
   （既存ページの checkUsageGate() 呼び出しとの互換のため本ファイルは残置）
   ============================================================ */
(function () {
  'use strict';

  // ── 会員バッジのみ（利用回数・課金導線なし） ──
  const style = document.createElement('style');
  style.textContent = `
    .plan-badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;letter-spacing:.5px;padding:4px 10px;margin-left:8px;border-radius:2px;background:#f5efe1;color:#856a2c;border:1px solid #a4863f}
    /* 旧Proロックの残骸が万一あっても無効化 */
    .pro-locked{pointer-events:auto!important;user-select:auto!important}
    .pro-locked>*{opacity:1!important;filter:none!important}
    .pro-lock-overlay{display:none!important}
    .btn-pro-tag{display:none!important}
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof onAuthReady !== 'function') { unlockAll(); return; }
    onAuthReady(user => {
      unlockAll();
      if (user) insertBadge();
    });
  });

  // すべての Pro ロックを解除（キャッシュ由来の残骸対策も含む）
  function unlockAll() {
    document.querySelectorAll('.pro-locked').forEach(el => {
      el.classList.remove('pro-locked');
      const ov = el.querySelector('.pro-lock-overlay');
      if (ov) ov.remove();
    });
    document.querySelectorAll('.btn-pro-tag').forEach(t => t.remove());
    // data-pro 属性は残っていても本スクリプトは何もロックしない
  }

  function insertBadge() {
    const nav = document.querySelector('.header-nav');
    if (!nav || nav.querySelector('.plan-badge')) return;
    const badge = document.createElement('span');
    badge.className = 'plan-badge';
    badge.textContent = '会員';
    nav.insertBefore(badge, nav.firstChild);
  }

  // ── 互換API：常に許可（上限・課金なし） ──
  window.checkUsageGate = function () { return true; };

})();
