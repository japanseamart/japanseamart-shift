# ☁️ Cloudflare Pages デプロイガイド（フロントエンド）

## 📋 概要

このガイドでは、**japanseamart-shift** のフロントエンド（React SPA）を Cloudflare Pages にデプロイする手順を説明します。

### 前提条件

✅ **バックエンドAPIが Railway にデプロイ済み**であること  
→ [Railway デプロイガイド](./RAILWAY_DEPLOY_GUIDE.md) を参照

---

## ステップ1: バックエンドURLの確認

Railway から取得したバックエンドURLをメモします：

```
例: https://japanseamart-shift-production-xxxx.up.railway.app
```

---

## ステップ2: 環境変数ファイルの作成

プロジェクトルートに `.env.production` ファイルを作成：

```bash
VITE_API_URL=https://your-railway-backend-url.up.railway.app
```

**重要**: `https://` を必ず含めてください。

---

## ステップ3: フロントエンドのビルド

ローカル環境でビルドします：

```bash
cd /home/user/webapp
npm run build
```

ビルド成功を確認：

```bash
✓ built in X.XXs
dist/index.html                   0.45 kB
dist/assets/index-xxxxx.css      29.79 kB
dist/assets/index-xxxxx.js      395.96 kB
```

---

## ステップ4: Cloudflare Pages プロジェクト作成

### Wrangler CLI を使用（推奨）

1. **Cloudflare API キーの確認**:

```bash
echo $CLOUDFLARE_API_TOKEN
```

空の場合、`setup_cloudflare_api_key` を実行してください。

2. **プロジェクト作成**:

```bash
npx wrangler pages project create japanseamart-shift \
  --production-branch main \
  --compatibility-date 2024-01-01
```

---

## ステップ5: デプロイ実行

### 方法1: Wrangler CLI（手動デプロイ）

```bash
npx wrangler pages deploy dist --project-name japanseamart-shift
```

**デプロイURL** が表示されます：

```
✨ Deployment complete! Take a peek over at https://japanseamart-shift.pages.dev
```

### 方法2: GitHub統合（自動デプロイ）

1. Cloudflare Dashboard にアクセス
2. 「Pages」→「Create a project」
3. 「Connect to Git」を選択
4. `japanseamart/japanseamart-shift` リポジトリを接続
5. ビルド設定:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variables**: 
     ```
     VITE_API_URL=https://your-railway-backend-url.up.railway.app
     ```
6. 「Save and Deploy」をクリック

---

## ステップ6: 環境変数の設定

Cloudflare Dashboard で環境変数を設定：

1. プロジェクト → 「Settings」→「Environment variables」
2. 「Add variable」をクリック
3. 設定:
   - **Variable name**: `VITE_API_URL`
   - **Value**: `https://your-railway-backend-url.up.railway.app`
   - **Environment**: `Production` を選択
4. 「Save」をクリック

---

## ステップ7: CORS設定の更新（バックエンド側）

フロントエンドのURLが確定したら、バックエンド（Railway）のCORS設定を更新します。

### server/index.ts を修正:

```typescript
app.use(cors({
  origin: [
    'https://japanseamart-shift.pages.dev',  // 本番環境
    'http://localhost:5173'  // 開発環境
  ],
  credentials: true,
}));
```

または、Railway の環境変数で設定：

```bash
CORS_ORIGIN=https://japanseamart-shift.pages.dev
```

変更をGitHubにプッシュすると、Railwayが自動デプロイします。

---

## ステップ8: 動作確認

### ブラウザでアクセス

```
https://japanseamart-shift.pages.dev
```

### 確認項目

- ✅ ページが正常に表示される
- ✅ ログイン画面が表示される
- ✅ APIとの通信が正常（店舗一覧の取得など）

### デバッグ

ブラウザの開発者ツール（F12）でエラーを確認：

**CORS エラーの場合**:
```
Access to fetch at 'https://...' from origin 'https://japanseamart-shift.pages.dev' 
has been blocked by CORS policy
```

→ バックエンドのCORS設定を再確認

**API URLエラーの場合**:
```
Failed to fetch
```

→ `VITE_API_URL` 環境変数を再確認

---

## カスタムドメインの設定（オプション）

独自ドメインを使用する場合：

### Cloudflare Dashboard

1. プロジェクト → 「Custom domains」
2. 「Set up a custom domain」をクリック
3. ドメイン名を入力（例: `shift.japanseamart.com`）
4. DNSレコードを設定
5. SSL証明書が自動発行されます（約5分）

---

## デプロイ後の更新

### コードを更新する場合

1. ローカルで変更
2. GitHubにプッシュ

```bash
git add .
git commit -m "Update: description"
git push origin main
```

3. **GitHub統合の場合**: 自動デプロイ
4. **手動デプロイの場合**:

```bash
npm run build
npx wrangler pages deploy dist --project-name japanseamart-shift
```

---

## トラブルシューティング

### ビルドエラー

**症状**: デプロイが失敗する

**解決方法**:
```bash
# ローカルでビルドテスト
rm -rf node_modules dist
npm install
npm run build
```

### 環境変数が反映されない

**症状**: APIへの接続が失敗する

**解決方法**:
1. Cloudflare Dashboard で環境変数を再確認
2. 再デプロイを実行
3. ブラウザのキャッシュをクリア

### 404エラー（SPAルーティング）

**症状**: リロード時に404エラー

**解決方法**:
Cloudflare Pages は自動的にSPAルーティングを処理します。
設定不要ですが、問題がある場合は `_routes.json` を確認。

---

## パフォーマンス最適化

### Cloudflare CDN の恩恵

- ✅ グローバルCDN: 世界中で高速アクセス
- ✅ 自動キャッシュ: 静的アセットの高速配信
- ✅ HTTP/3対応: 最新プロトコルで高速化
- ✅ 無制限帯域幅: トラフィック制限なし

### ビルドサイズの最適化

現在のビルドサイズ:
- CSS: 29.79 kB (gzip: 5.61 kB)
- JS: 395.96 kB (gzip: 114.09 kB)

最適化の余地:
- Tree shaking（未使用コードの削除）
- コード分割（lazy loading）
- 画像最適化

---

## コスト見積もり

### Cloudflare Pages 無料プラン

- ✅ 無制限のリクエスト
- ✅ 無制限の帯域幅
- ✅ 500ビルド/月
- ✅ グローバルCDN

**完全無料で運用可能です！** 🎉

---

## セキュリティ

### HTTPS/SSL

- ✅ 自動SSL証明書（Let's Encrypt）
- ✅ HTTP → HTTPS 自動リダイレクト
- ✅ TLS 1.3 対応

### セキュリティヘッダー

Cloudflare が自動的に設定:
- X-Content-Type-Options
- X-Frame-Options
- Strict-Transport-Security

---

## 完成！

✅ **デプロイ完了おめでとうございます！**

あなたのシフト管理システムは以下のURLでアクセス可能です：

- **フロントエンド**: https://japanseamart-shift.pages.dev
- **バックエンドAPI**: https://your-railway-url.up.railway.app

---

## 次のステップ

1. ✅ 初期パスワードでログイン（README参照）
2. ✅ 店舗・従業員データの登録
3. ✅ シフト管理機能の活用
4. ✅ スタッフへのURLを共有

---

## サポート

デプロイに問題が発生した場合：

1. Cloudflare Pages のログを確認
2. GitHubリポジトリのIssuesで質問
3. Cloudflare Docs: https://developers.cloudflare.com/pages/
