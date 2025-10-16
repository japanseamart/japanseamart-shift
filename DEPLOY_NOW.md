# 🚀 即座にデプロイする方法

このファイルには、最も簡単で迅速なデプロイ方法を記載しています。

## 🎯 推奨デプロイ方法（Railway - 最も簡単）

### 必要なもの
- GitHubアカウント
- クレジットカード（無料枠あり、$5/月から）

### 手順（5分で完了）

#### 1. GitHubリポジトリにプッシュ

**⚠️ 注意**: まず、GitHubの個人アクセストークン（PAT）が必要です。

GitHubでトークンを作成：
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. "Generate new token" → "Generate new token (classic)"
3. スコープ: `repo` (すべて)にチェック
4. トークンをコピー

次に、以下のコマンドを実行：

```bash
cd /home/user/webapp

# リモートURLを設定（YOUR_TOKENを実際のトークンに置き換える）
git remote set-url origin https://YOUR_TOKEN@github.com/japanseamart/japanseamart-shift.git

# プッシュ
git push -u origin main
```

#### 2. Railwayにデプロイ

1. **Railwayにアクセス**: https://railway.app
2. **GitHubでサインアップ/ログイン**
3. **"New Project"をクリック**
4. **"Deploy from GitHub repo"を選択**
5. **リポジトリを選択**: `japanseamart/japanseamart-shift`
6. **環境変数を設定**（Optional）:
   - `NODE_ENV=production`（自動設定されます）
   - `PORT=3001`（自動設定されます）
   - `SESSION_SECRET=your-random-secret-key`（任意、推奨）

7. **デプロイ開始**
   - 自動的にビルドとデプロイが開始されます
   - 約5分でデプロイ完了

8. **URLを取得**
   - Settings → Domains → "Generate Domain"
   - 例: `https://japanseamart-shift-production.up.railway.app`

#### 3. アクセステスト

生成されたURLにアクセスして、アプリケーションが動作することを確認：
- ログイン画面が表示されるはずです
- 初期パスワード: `admin`

---

## 📦 代替案1: Render（無料プランあり）

### 手順

1. **Renderにアクセス**: https://render.com
2. **GitHubでサインアップ/ログイン**
3. **"New Web Service"をクリック**
4. **リポジトリを接続**: `japanseamart/japanseamart-shift`
5. **設定**:
   - **Name**: `japanseamart-shift`
   - **Environment**: `Node`
   - **Region**: `Singapore`
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
6. **環境変数**（オプション）:
   - `SESSION_SECRET`: ランダムな文字列
7. **"Create Web Service"をクリック**

デプロイURL（例）: `https://japanseamart-shift.onrender.com`

---

## 🐳 代替案2: Docker（ローカルまたはクラウド）

### ローカルでテスト

```bash
cd /home/user/webapp

# Dockerイメージをビルド
docker build -t shift-management .

# コンテナを起動
docker run -p 3001:3001 shift-management

# ブラウザで確認
# http://localhost:3001
```

### Docker Hubにプッシュしてクラウドでデプロイ

```bash
# Docker Hubにログイン
docker login

# イメージにタグ付け
docker tag shift-management your-dockerhub-username/shift-management:latest

# プッシュ
docker push your-dockerhub-username/shift-management:latest
```

その後、任意のクラウドプラットフォーム（AWS ECS, GCP Cloud Run等）で実行可能。

---

## 🔐 デプロイ後の重要な設定

### 1. 初期パスワードを変更

**必須**: デプロイ直後に以下のパスワードを変更してください：

```
本部管理者: admin → 強力なパスワードに変更
店舗1-7: store1～store7 → それぞれ変更
```

変更方法:
1. 管理者ログイン
2. 「パスワード管理」メニュー
3. 各パスワードを変更

### 2. HTTPS設定（推奨）

- Railway/Render: 自動的にHTTPSが有効
- 独自ドメイン: SSL証明書（Let's Encrypt）を設定

### 3. データベースバックアップ

SQLiteファイル（`shift_management.db`）を定期的にバックアップ：

Railway:
- Volumes機能で永続化ストレージを確保
- 定期的にダウンロード

Render:
- Persistent Disksを使用
- 手動でダウンロード

---

## 📊 デプロイ状況の確認

### ログの確認

**Railway**:
- Dashboard → プロジェクト → "Deployments" → "View Logs"

**Render**:
- Dashboard → サービス → "Logs"

### 動作確認

1. ブラウザでURLにアクセス
2. ログイン画面が表示されることを確認
3. `admin`でログイン
4. 各機能が正常に動作することを確認

---

## ❓ トラブルシューティング

### デプロイが失敗する

**原因**: ビルドエラー
**解決**: ログを確認して、不足しているパッケージをインストール

### データベースが初期化されない

**原因**: 書き込み権限がない
**解決**: ボリューム/ディスク設定を確認

### セッションが保持されない

**原因**: Cookie設定の問題
**解決**: `SESSION_SECRET`環境変数を設定

---

## 📞 サポート

問題が発生した場合:
1. このファイルの内容を再確認
2. DEPLOYMENT.mdの詳細手順を参照
3. GitHubのIssuesで質問

---

## ✅ デプロイ完了チェックリスト

- [ ] GitHubにプッシュ済み
- [ ] デプロイサービスを選択（Railway/Render/Docker）
- [ ] アプリケーションが正常にデプロイされた
- [ ] URLにアクセス可能
- [ ] ログイン画面が表示される
- [ ] `admin`でログイン成功
- [ ] 初期パスワードをすべて変更
- [ ] HTTPSが有効
- [ ] データベースバックアップ設定完了

すべてにチェックが入ったら、デプロイ完了です！🎉
