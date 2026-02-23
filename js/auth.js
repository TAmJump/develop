/* ============================================================
   auth.js — 仮認証モード（テスト用）
   ============================================================
   本番切替時：USE_DEMO = false にして firebaseConfig を設定
   ============================================================ */

const USE_DEMO = true;

// ── デモ用アカウント ──
const DEMO_ACCOUNTS = [
    { email: 'demo@tamj.jp', password: 'tamj1234', name: 'デモユーザー', plan: 'free' },
    { email: 'test@tamj.jp', password: 'test1234', name: 'テストユーザー', plan: 'free' },
    { email: 'info@tamjump.com', password: 'tamj2026', name: 'TAmJ Admin', plan: 'pro' }
];

// ── Firebase Config（本番用・要差し替え） ──
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "000000000000",
    appId: "YOUR_APP_ID"
};

// ── Stripe Config ──
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/test_XXXXXXXX";

// ── State ──
let _currentUser = null;

function _getDemoSession() {
    try { return JSON.parse(sessionStorage.getItem('tamj_demo_user')); } catch { return null; }
}
function _setDemoSession(user) {
    sessionStorage.setItem('tamj_demo_user', JSON.stringify(user));
}
function _clearDemoSession() {
    sessionStorage.removeItem('tamj_demo_user');
}

// ══════════════════════════════════════
// Public API（デモ/Firebase 共通インターフェース）
// ══════════════════════════════════════

function onAuthReady(callback) {
    if (USE_DEMO) {
        _currentUser = _getDemoSession();
        callback(_currentUser);
        return;
    }
    // Firebase mode
    initFirebase();
    if (!_auth) { callback(null); return; }
    _auth.onAuthStateChanged(user => {
        _currentUser = user;
        callback(user);
    });
}

async function registerUser(email, password, displayName) {
    if (USE_DEMO) {
        email = email.trim().toLowerCase();
        const exists = DEMO_ACCOUNTS.find(a => a.email === email);
        if (exists) return { ok: false, error: 'このメールアドレスは既に登録されています。' };
        // 新規登録OK（セッションに保存）
        const user = { email, displayName: displayName || email.split('@')[0], uid: 'demo_' + Date.now() };
        DEMO_ACCOUNTS.push({ email, password, name: user.displayName, plan: 'free' });
        _currentUser = user;
        _setDemoSession(user);
        setPlan('free');
        return { ok: true, user };
    }
    // Firebase mode
    initFirebase();
    try {
        const cred = await _auth.createUserWithEmailAndPassword(email, password);
        if (displayName) await cred.user.updateProfile({ displayName });
        return { ok: true, user: cred.user };
    } catch (e) {
        return { ok: false, error: firebaseErrorMessage(e.code) };
    }
}

async function loginUser(email, password) {
    if (USE_DEMO) {
        email = email.trim().toLowerCase();
        const account = DEMO_ACCOUNTS.find(a => a.email === email);
        if (!account) return { ok: false, error: 'アカウントが見つかりません。' };
        if (account.password !== password) return { ok: false, error: 'パスワードが正しくありません。' };
        const user = { email: account.email, displayName: account.name, uid: 'demo_' + email.replace(/[^a-z0-9]/g, '') };
        _currentUser = user;
        _setDemoSession(user);
        // プラン自動設定
        if (account.plan === 'pro') setPlan('pro');
        else if (!localStorage.getItem('tamj_plan')) setPlan('free');
        return { ok: true, user };
    }
    // Firebase mode
    initFirebase();
    try {
        const cred = await _auth.signInWithEmailAndPassword(email, password);
        return { ok: true, user: cred.user };
    } catch (e) {
        return { ok: false, error: firebaseErrorMessage(e.code) };
    }
}

async function logoutUser() {
    if (USE_DEMO) {
        _currentUser = null;
        _clearDemoSession();
        localStorage.removeItem('tamj_plan');
        location.href = getRelativePath('login.html');
        return;
    }
    initFirebase();
    if (_auth) await _auth.signOut();
    _currentUser = null;
    location.href = getRelativePath('login.html');
}

async function resetPassword(email) {
    if (USE_DEMO) {
        return { ok: true }; // デモではリセットメール送信を模擬
    }
    initFirebase();
    try {
        await _auth.sendPasswordResetEmail(email);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: firebaseErrorMessage(e.code) };
    }
}

function requireAuth() {
    onAuthReady(user => {
        if (!user) {
            const returnUrl = encodeURIComponent(location.pathname + location.search);
            location.href = getRelativePath('login.html') + '?return=' + returnUrl;
        } else {
            document.body.classList.add('auth-ready');
            updateAuthUI(user);
        }
    });
}

// ── 決済（デモモードではスキップ） ──
function startPayment(toolId) {
    if (USE_DEMO) {
        // デモ：即座に利用券を発行
        const tickets = getTickets();
        tickets[toolId] = Date.now() + (24 * 60 * 60 * 1000);
        localStorage.setItem('tamj_tickets', JSON.stringify(tickets));
        location.reload();
        return true;
    }
    const tickets = getTickets();
    if (tickets[toolId] && tickets[toolId] > Date.now()) return true;
    const successUrl = encodeURIComponent(location.origin + location.pathname + '?paid=' + toolId);
    const paymentUrl = STRIPE_PAYMENT_LINK +
        '?prefilled_email=' + encodeURIComponent(_currentUser?.email || '') +
        '&client_reference_id=' + (_currentUser?.uid || 'anonymous') +
        '&success_url=' + successUrl;
    location.href = paymentUrl;
    return false;
}

function handlePaymentSuccess() {
    const params = new URLSearchParams(location.search);
    const toolId = params.get('paid');
    if (toolId) {
        const tickets = getTickets();
        tickets[toolId] = Date.now() + (24 * 60 * 60 * 1000);
        localStorage.setItem('tamj_tickets', JSON.stringify(tickets));
        history.replaceState(null, '', location.pathname);
        return true;
    }
    return false;
}

function getTickets() {
    try { return JSON.parse(localStorage.getItem('tamj_tickets') || '{}'); } catch { return {}; }
}

function hasValidTicket(toolId) {
    if (USE_DEMO) return true; // デモモードでは常にアクセス可
    const tickets = getTickets();
    return tickets[toolId] && tickets[toolId] > Date.now();
}

// ── プラン管理 ──
function getPlan() {
    try {
        const raw = localStorage.getItem('tamj_plan');
        if (!raw) return 'free';
        // checkout.html stores JSON object with plan details
        try {
            const data = JSON.parse(raw);
            if (data && data.plan) return 'pro'; // has active plan
        } catch {}
        // simple string
        if (raw === 'pro') return 'pro';
        return 'free';
    } catch { return 'free'; }
}
function setPlan(plan) {
    localStorage.setItem('tamj_plan', plan);
}
function isPro() { return getPlan() === 'pro'; }

// 月次利用カウント（ユーザー別）
function _usageKey() {
    const d = new Date();
    const uid = (_currentUser?.email || _getDemoSession()?.email || 'anon').replace(/[^a-z0-9]/g, '_');
    return 'tamj_usage_' + uid + '_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function getUsageCount() {
    try { return parseInt(localStorage.getItem(_usageKey()) || '0', 10); } catch { return 0; }
}
function incrementUsage() {
    const count = getUsageCount() + 1;
    localStorage.setItem(_usageKey(), String(count));
    return count;
}
function getRemainingUses() {
    if (isPro()) return Infinity;
    return Math.max(0, 3 - getUsageCount());
}
function canUseService() {
    if (isPro()) return true;
    return getUsageCount() < 3;
}

// ── UI更新 ──
function updateAuthUI(user) {
    document.querySelectorAll('[data-auth]').forEach(el => {
        const when = el.dataset.auth;
        el.style.display =
            (when === 'logged-in' && user) ? '' :
            (when === 'logged-out' && !user) ? '' : 'none';
    });
    document.querySelectorAll('[data-user-name]').forEach(el => {
        el.textContent = user?.displayName || user?.email?.split('@')[0] || '';
    });
}

// ── Firebase 初期化（本番用） ──
let _app = null, _auth = null;
function initFirebase() {
    if (_app || USE_DEMO) return;
    if (typeof firebase === 'undefined') { console.warn('Firebase SDK not loaded'); return; }
    _app = firebase.initializeApp(firebaseConfig);
    _auth = firebase.auth();
    _auth.languageCode = 'ja';
}

function firebaseErrorMessage(code) {
    const map = {
        'auth/email-already-in-use': 'このメールアドレスは既に登録されています。',
        'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
        'auth/weak-password': 'パスワードは6文字以上で設定してください。',
        'auth/user-not-found': 'アカウントが見つかりません。',
        'auth/wrong-password': 'パスワードが正しくありません。',
        'auth/too-many-requests': 'ログイン試行が多すぎます。しばらく待ってください。',
    };
    return map[code] || 'エラーが発生しました。';
}

function getRelativePath(file) {
    return location.pathname.includes('/members/') ? '../' + file : file;
}

document.addEventListener('DOMContentLoaded', () => { handlePaymentSuccess(); });
