# Cloudflare Pages 手動デプロイ手順

## 🎉 準備完了！

すべてのコードがGitHub mainブランチにプッシュされ、デプロイの準備が整いました。

## 📋 デプロイオプション

### オプション1: Cloudflare Pages（推奨・最も簡単）

Cloudflare Pagesの管理画面から直接デプロイできます。

#### ステップ1: Cloudflare Pagesプロジェクトを作成

1. [Cloudflare Dashboard](https://dash.cloudflare.com) にログイン
2. 左メニューから「Workers & Pages」を選択
3. 「Create application」→「Pages」→「Connect to Git」をクリック
4. GitHubアカウントを接続（初回のみ）
5. `japanseamart/japanseamart-shift` リポジトリを選択

#### ステップ2: ビルド設定

```
Project name: japanseamart-shift
Production branch: main
Build command: npm run build
Build output directory: dist
```

#### ステップ3: 環境変数設定

**重要**: バックエンドURLを設定してください。

現在、テスト用のサンドボックスバックエンドが起動しています：
```
VITE_API_URL=https://3001-itxj9cqsy32tf9cthkazp-b237eb32.sandbox.novita.ai
```

**注意**: このサンドボックスURLは一時的なものです。本番環境では以下のオプションをご検討ください：

**本番バックエンドのオプション**:
- **Railway**: https://railway.app でプロジェクトを作成し、GitHubリポジトリを接続
- **Render**: https://render.com でWebサービスを作成
- **Fly.io**: https://fly.io でアプリをデプロイ
- **VPS**: 自社サーバーでNode.jsアプリを実行

#### ステップ4: デプロイ

「Save and Deploy」をクリックすると、自動的にビルド＆デプロイが開始されます。

数分後、以下のようなURLで公開されます：
```
https://japanseamart-shift.pages.dev
```

---

### オプション2: Railway でバックエンドをデプロイ（推奨・本番環境向け）

#### Railway でのデプロイ手順

1. [Railway](https://railway.app) にアクセス
2. 「Start a New Project」をクリック
3. 「Deploy from GitHub repo」を選択
4. `japanseamart/japanseamart-shift` を選択
5. 自動的にNode.jsアプリとして検出されます

**環境変数**:
```bash
NODE_ENV=production
PORT=3001
```

6. デプロイ後、RailwayのダッシュボードでURLを確認（例: `https://japanseamart-shift-production.up.railway.app`）

7. このURLをCloudflare Pagesの環境変数に設定：
```
VITE_API_URL=https://japanseamart-shift-production.up.railway.app
```

8. Cloudflare Pagesで再デプロイ

#### CORS設定を更新

`server/index.ts` のCORS設定に、Cloudflare PagesのドメインVITE_API_URL追加：

```typescript
app.use(cors({
  origin: [
    'https://japanseamart-shift.pages.dev',
    'http://localhost:5173',
    // カスタムドメインを使用する場合はここに追加
  ],
  credentials: true
}));
```

変更をコミット＆プッシュすると、Railwayが自動的に再デプロイします。

---

### オプション3: wrangler CLI でデプロイ

ローカル環境でwrangler CLIを使用してデプロイすることもできます。

#### 前提条件
- Node.js v18以上
- Cloudflareアカウント

#### デプロイコマンド

```bash
# wrangler CLIをインストール
npm install -g wrangler

# Cloudflareにログイン
wrangler login

# フロントエンドをビルド
npm run build

# Cloudflare Pagesにデプロイ
wrangler pages deploy dist --project-name=japanseamart-shift
```

#### 環境変数の設定（wrangler CLI）

```bash
# 本番環境の環境変数を設定
wrangler pages secret put VITE_API_URL --project-name=japanseamart-shift
# プロンプトが表示されたら、バックエンドURLを入力
```

---

## 🔧 バックエンドのデプロイ先の選択

### Railway（推奨）
- ✅ 自動デプロイ
- ✅ 無料枠あり
- ✅ SQLiteサポート
- ✅ 簡単な設定

### Render
- ✅ 無料枠あり
- ✅ 自動デプロイ
- ⚠️ SQLiteは永続化に注意が必要（ボリュームマウント推奨）

### Fly.io
- ✅ 高パフォーマンス
- ✅ SQLiteサポート
- ⚠️ 設定がやや複雑

### VPS（自社サーバー）
- ✅ 完全なコントロール
- ✅ SQLiteの永続化が確実
- ⚠️ サーバー管理が必要

---

## 🧪 テスト用バックエンド

現在、サンドボックス環境でテスト用バックエンドが起動しています：

**バックエンドURL**: https://3001-itxj9cqsy32tf9cthkazp-b237eb32.sandbox.novita.ai

**動作確認**:
```bash
# ヘルスチェック
curl https://3001-itxj9cqsy32tf9cthkazp-b237eb32.sandbox.novita.ai/api/stores

# 店舗一覧を取得できれば正常
```

**初期ログイン情報**:
- 本部管理者: パスワード `admin`
- 店舗1: パスワード `store1`
- 店舗2: パスワード `store2`
- ...店舗7まで同様

**注意**: このURLは一時的なものです。本番環境では別途バックエンドをデプロイしてください。

---

## 📊 デプロイ後の確認事項

1. ✅ フロントエンドが正常に表示される
2. ✅ ログイン機能が動作する
3. ✅ データの取得・保存ができる
4. ✅ すべてのページが正常に動作する

## 🚀 完了

おめでとうございます！シフト管理システムがCloudflare Pagesにデプロイされました！

---

## 💡 トラブルシューティング

### ログインできない
- CORS設定を確認
- バックエンドURLが正しいか確認
- ブラウザのコンソールでエラーを確認

### データが表示されない
- `VITE_API_URL` が正しく設定されているか確認
- バックエンドが起動しているか確認
- ネットワークタブでAPIリクエストを確認

### ビルドエラー
- `npm install` を実行
- Node.jsのバージョンを確認（v18以上推奨）
- `package-lock.json` を削除して再インストール

---

## 📚 関連ドキュメント

- [CLOUDFLARE_DEPLOY.md](./CLOUDFLARE_DEPLOY.md) - 詳細な技術解説
- [DEPLOYMENT_STATUS.md](./DEPLOYMENT_STATUS.md) - 現在のデプロイ状況
- [README.md](./README.md) - アプリケーション概要

---

## 🎯 次のステップ

1. カスタムドメインの設定（Cloudflare Pages）
2. SSL証明書の設定（自動）
3. パフォーマンスモニタリングの設定
4. バックアップ戦略の実装
5. セキュリティ強化（パスワード変更、アクセス制限など）

デプロイ成功を願っています！🎉
