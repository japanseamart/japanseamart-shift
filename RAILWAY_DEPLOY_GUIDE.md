# 🚂 Railway デプロイガイド（バックエンドAPI）

## 📋 概要

このガイドでは、**japanseamart-shift** のバックエンドAPIを Railway にデプロイする手順を説明します。

### デプロイ構成

- **バックエンドAPI**: Railway（Express + SQLite）← このガイド
- **フロントエンド**: Cloudflare Pages（React SPA）← 別途デプロイ

---

## ステップ1: Railway アカウント作成

1. https://railway.app/ にアクセス
2. 「Start a New Project」をクリック
3. GitHubアカウントで認証・ログイン

---

## ステップ2: プロジェクト作成

1. ダッシュボードで「New Project」をクリック
2. 「Deploy from GitHub repo」を選択
3. リポジトリ一覧から **`japanseamart/japanseamart-shift`** を選択
4. ブランチは **`main`** を選択

---

## ステップ3: 環境変数設定

Railway ダッシュボードで「Variables」タブを開き、以下を設定：

### 必須環境変数

```bash
NODE_ENV=production
PORT=3001
SESSION_SECRET=your-super-secret-session-key-change-this-to-random-string
```

### SESSION_SECRET の生成方法

以下のコマンドでランダムな文字列を生成できます：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## ステップ4: ビルド・デプロイ設定

Railway は `railway.json` を自動検出します（既に設定済み）：

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**自動実行される内容**:
1. `npm install` - 依存関係インストール
2. `npm run build` - TypeScriptコンパイル + Viteビルド
3. `npm start` - サーバー起動（`npx tsx server/index.ts`）

---

## ステップ5: デプロイ実行

1. 「Deploy」ボタンをクリック
2. ビルドログを確認
3. デプロイ完了を待つ（通常2-3分）

---

## ステップ6: デプロイURLを取得

デプロイ完了後、以下のようなURLが発行されます：

```
https://japanseamart-shift-production-xxxx.up.railway.app
```

**このURLをメモしてください。フロントエンドのビルド時に使用します。**

---

## ステップ7: 動作確認

### ヘルスチェック

```bash
curl https://your-railway-url.up.railway.app/health
```

期待されるレスポンス：
```json
{
  "status": "OK",
  "timestamp": "2025-10-16T08:45:00.000Z"
}
```

### 店舗一覧API

```bash
curl https://your-railway-url.up.railway.app/api/stores
```

期待されるレスポンス：
```json
[
  {
    "id": 1,
    "name": "茨木太田店",
    "monthly_budget": 3000000,
    ...
  },
  ...
]
```

---

## ステップ8: CORS設定の更新（重要）

フロントエンドをCloudflare Pagesにデプロイする際、CORS設定を更新する必要があります。

### 方法1: 環境変数で設定（推奨）

Railway の環境変数に追加：

```bash
CORS_ORIGIN=https://japanseamart-shift.pages.dev
```

そして、`server/index.ts` を以下のように修正：

```typescript
app.use(cors({
  origin: process.env.CORS_ORIGIN || (isProduction ? true : 'http://localhost:5173'),
  credentials: true,
}));
```

### 方法2: コードで直接指定

`server/index.ts` の CORS設定を更新：

```typescript
app.use(cors({
  origin: [
    'https://japanseamart-shift.pages.dev',
    'http://localhost:5173'
  ],
  credentials: true,
}));
```

変更後、GitHubにプッシュすると自動デプロイされます。

---

## トラブルシューティング

### ビルドエラー

**症状**: デプロイが失敗する

**解決方法**:
1. ログを確認
2. ローカルで `npm install && npm run build` が成功するか確認
3. `package.json` の dependencies を確認

### データベースが初期化されない

**症状**: APIが500エラーを返す

**解決方法**:
1. ログで「✅ 初期データ投入完了」を確認
2. 確認されない場合、`server/database.ts` の `initializeDatabase()` を確認

### ポートエラー

**症状**: `EADDRINUSE` エラー

**解決方法**:
- 環境変数 `PORT` が正しく設定されているか確認
- Railway は自動的に `PORT` を設定するため、通常は不要

---

## データベースの永続化

Railway では、デフォルトでファイルシステムは**エフェメラル**（一時的）です。

### Volume のマウント（推奨）

1. Railway ダッシュボードで「Volumes」タブを開く
2. 「Add Volume」をクリック
3. マウントパス: `/app/server` を指定
4. これにより `shift_management.db` が永続化されます

---

## バックアップ

定期的にSQLiteデータベースをバックアップすることを推奨します：

### 方法1: 手動ダウンロード

Railway CLIを使用：

```bash
railway run sqlite3 shift_management.db .dump > backup.sql
```

### 方法2: 自動バックアップスクリプト

cron ジョブやGitHub Actionsで定期実行

---

## コスト見積もり

### Railway 無料プラン

- ✅ 月500時間まで無料
- ✅ 512MB RAM
- ✅ 1GB ストレージ

### 有料プラン（必要に応じて）

- $5/月 〜
- より多くのリソースと稼働時間

---

## 次のステップ

✅ バックエンドのデプロイが完了したら、次は **フロントエンドを Cloudflare Pages にデプロイ** します。

👉 [Cloudflare Pages デプロイガイド](./CLOUDFLARE_DEPLOY_GUIDE.md) に進んでください。

---

## サポート

デプロイに問題が発生した場合：

1. Railway のログを確認
2. GitHubリポジトリのIssuesで質問
3. Railway のドキュメント: https://docs.railway.app/
