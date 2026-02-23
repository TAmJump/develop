/* ============================================================
   plan-gate.js — Free/Pro プラン制限 UI
   ============================================================
   - Free: 月3回シミュレーション実行、Pro機能ロック
   - Pro:  無制限
   auth.js の getPlan(), canUseService() 等に依存
   ============================================================ */

(function () {
    'use strict';

    // ── 定数 ──
    const FREE_LIMIT = 3;

    // ── CSS注入 ──
    const style = document.createElement('style');
    style.textContent = `
        /* 利用回数バッジ */
        .plan-badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;letter-spacing:.5px;padding:4px 10px;margin-left:8px;border-radius:2px}
        .plan-badge.free{background:#f5f5f3;color:#777;border:1px solid #d5d5d5}
        .plan-badge.pro{background:#C8161D;color:#fff;border:1px solid #C8161D}
        .plan-usage{font-family:'Inter',sans-serif;font-size:10px;color:#777;margin-left:4px}
        .plan-usage b{color:#C8161D;font-weight:700}

        /* Proロックオーバーレイ */
        .pro-locked{position:relative;pointer-events:none;user-select:none}
        .pro-locked>*{opacity:.35;filter:blur(.5px)}
        .pro-locked>.pro-lock-overlay{opacity:1;filter:none;pointer-events:auto}
        .pro-lock-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;background:rgba(246,244,241,.85)}
        .pro-lock-icon{width:48px;height:48px;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
        .pro-lock-icon svg{width:36px;height:36px;stroke:#2d2d2d;stroke-width:1.5;fill:none;stroke-linecap:round;stroke-linejoin:round}
        .pro-lock-text{font-size:13px;font-weight:600;color:#2d2d2d;margin-bottom:4px}
        .pro-lock-sub{font-size:11px;color:#777;margin-bottom:12px}
        .pro-lock-btn{padding:8px 20px;font-size:11px;font-weight:700;letter-spacing:1px;background:#C8161D;color:#fff;border:none;cursor:pointer;text-decoration:none;display:inline-block;transition:background .3s}
        .pro-lock-btn:hover{background:#a01218}

        /* ボタンのProバッジ */
        .btn-pro-tag{display:inline-block;font-size:8px;font-weight:700;letter-spacing:.5px;padding:1px 5px;background:#C8161D;color:#fff;vertical-align:middle;margin-left:4px}

        /* 利用上限モーダル */
        .limit-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .3s}
        .limit-modal-bg.show{opacity:1}
        .limit-modal{background:#fff;max-width:400px;width:90%;padding:36px 32px;text-align:center;box-shadow:0 16px 64px rgba(0,0,0,.15)}
        .limit-modal h3{font-size:18px;font-weight:700;color:#1a1a1a;margin:0 0 8px}
        .limit-modal p{font-size:13px;color:#777;line-height:1.9;margin:0 0 20px}
        .limit-modal .count{font-family:'Inter',sans-serif;font-size:36px;font-weight:700;color:#C8161D;margin:12px 0}
        .limit-modal .count small{font-size:14px;color:#999;font-weight:400}
        .limit-modal .btn-upgrade{display:inline-block;padding:12px 32px;font-size:13px;font-weight:700;letter-spacing:1px;background:#C8161D;color:#fff;border:none;cursor:pointer;text-decoration:none;transition:background .3s;margin-bottom:8px}
        .limit-modal .btn-upgrade:hover{background:#a01218}
        .limit-modal .btn-close{display:block;font-size:12px;color:#999;cursor:pointer;background:none;border:none;margin:8px auto 0}

        /* ヘッダー内プランバッジ */
        .header-plan-area{display:flex;align-items:center;gap:6px;margin-left:auto;padding-right:12px}
    `;
    document.head.appendChild(style);

    // ── DOM Ready ──
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof getPlan !== 'function') return; // auth.js未読み込み

        onAuthReady(user => {
            if (!user) return;
            insertPlanBadge();
            if (!isPro()) {
                lockProFeatures();
            }
        });
    });

    // ── ヘッダーにプランバッジ挿入 ──
    function insertPlanBadge() {
        const nav = document.querySelector('.header-nav');
        if (!nav) return;

        const badge = document.createElement('span');
        const plan = getPlan();
        if (plan === 'pro') {
            badge.className = 'plan-badge pro';
            badge.textContent = 'PRO';
        } else {
            const remaining = getRemainingUses();
            badge.className = 'plan-badge free';
            badge.innerHTML = 'FREE <span class="plan-usage">残り <b>' + remaining + '</b>/' + FREE_LIMIT + '回</span>';
        }
        nav.insertBefore(badge, nav.firstChild);
    }

    // ── Pro機能にロックオーバーレイ ──
    function lockProFeatures() {
        // data-pro="locked" 属性を持つ要素にオーバーレイ
        document.querySelectorAll('[data-pro="locked"]').forEach(el => {
            el.classList.add('pro-locked');
            const overlay = document.createElement('div');
            overlay.className = 'pro-lock-overlay';
            overlay.innerHTML = `
                <div class="pro-lock-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#2d2d2d" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1" fill="#2d2d2d" stroke="none"/></svg></div>
                <div class="pro-lock-text">Pro プラン限定機能</div>
                <div class="pro-lock-sub">アップグレードですべての機能をご利用いただけます</div>
                <a href="../checkout.html?plan=annual" class="pro-lock-btn">Proで始める →</a>
            `;
            el.appendChild(overlay);
        });

        // data-pro="btn" のボタンにクリックインターセプト
        document.querySelectorAll('[data-pro="btn"]').forEach(btn => {
            // Proタグ追加
            if (!btn.querySelector('.btn-pro-tag')) {
                const tag = document.createElement('span');
                tag.className = 'btn-pro-tag';
                tag.textContent = 'PRO';
                btn.appendChild(tag);
            }
            btn.addEventListener('click', (e) => {
                if (!isPro()) {
                    e.preventDefault();
                    e.stopPropagation();
                    showLimitModal('pro');
                    return false;
                }
            }, true);
        });
    }

    // ── シミュレーション実行ゲート ──
    // 各ページから呼び出し: if(!checkUsageGate()) return;
    window.checkUsageGate = function () {
        if (isPro()) return true;
        if (canUseService()) {
            const count = incrementUsage();
            // バッジ更新
            const badge = document.querySelector('.plan-badge.free');
            if (badge) {
                const remaining = Math.max(0, FREE_LIMIT - count);
                badge.innerHTML = 'FREE <span class="plan-usage">残り <b>' + remaining + '</b>/' + FREE_LIMIT + '回</span>';
            }
            return true;
        }
        showLimitModal('limit');
        return false;
    };

    // ── 上限モーダル表示 ──
    function showLimitModal(reason) {
        // 既存モーダル削除
        document.querySelectorAll('.limit-modal-bg').forEach(e => e.remove());

        const bg = document.createElement('div');
        bg.className = 'limit-modal-bg';

        const used = getUsageCount();
        const isLimit = reason === 'limit';

        bg.innerHTML = `
            <div class="limit-modal">
                <h3>${isLimit ? '今月の無料枠を使い切りました' : 'Pro プラン限定機能です'}</h3>
                <div class="count">${isLimit ? used + '<small> / ' + FREE_LIMIT + ' 回</small>' : '<svg viewBox="0 0 24 24" style="width:36px;height:36px;fill:none;stroke:#2d2d2d;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1" fill="#2d2d2d" stroke="none"/></svg>'}</div>
                <p>${isLimit
                    ? 'Freeプランは月' + FREE_LIMIT + '回までシミュレーションを実行できます。<br>Proプランにアップグレードすると無制限でご利用いただけます。'
                    : 'この機能はProプラン限定です。<br>Proプランにアップグレードすると、PDF出力・財務設計・スキーム構造設計など<br>すべての機能をご利用いただけます。'
                }</p>
                <a href="../checkout.html?plan=annual" class="btn-upgrade">Proで始める — ¥1,650/月〜</a>
                <button class="btn-close">閉じる</button>
            </div>
        `;

        document.body.appendChild(bg);
        requestAnimationFrame(() => bg.classList.add('show'));

        bg.querySelector('.btn-close').addEventListener('click', () => {
            bg.classList.remove('show');
            setTimeout(() => bg.remove(), 300);
        });
        bg.addEventListener('click', (e) => {
            if (e.target === bg) {
                bg.classList.remove('show');
                setTimeout(() => bg.remove(), 300);
            }
        });
    }

})();
