# TAmJ 不動産開発サイト アーキテクチャ

## サイトマップ

```
/
├── index.html                     ← TOP（ランディング）
├── service-development-public.html ← サービス紹介（ログイン不要）
├── pricing.html                   ← 料金プラン（¥100/回）
├── register.html                  ← 会員登録（Firebase Auth）
├── login.html                     ← ログイン
│
├── members/                       ← 認証必須エリア
│   ├── index.html                 ← 会員ダッシュボード
│   ├── service-development.html   ← 開発シミュレーター（決済ゲート）
│   ├── service-equipment.html     ← 什器備品選定（決済ゲート）
│   └── estimate-development.html  ← 見積書 + BS影響表 + リース仕訳
│
├── css/
│   ├── base.css      ← 変数・リセット
│   ├── corporate.css ← ヘッダー/フッター
│   └── tools.css     ← 不動産デザイン
│
├── js/
│   └── auth.js       ← Firebase Auth + Stripe
│
└── logo.png          ← 別途配置
```

## セットアップ

### Firebase
1. Firebase Console → プロジェクト作成 → Auth → メール/パスワード有効化
2. js/auth.js の firebaseConfig を差し替え

### Stripe
1. Stripe Dashboard → Products → ¥100のPrice作成
2. Payment Links → 作成 → js/auth.js の STRIPE_PAYMENT_LINK を差し替え

## 会計帳票
- BS影響概算表: オンバラ/オフバラ判定、資産・負債・PL影響をCSV出力
- リース仕訳シート: IFRS16/ASC842対応、月次仕訳＋旧基準比較をCSV出力
