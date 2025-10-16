# デプロイガイド

## プロジェクト構成

このプロジェクトは以下の3つのコンポーネントで構成されています：

1. **フロントエンド**: React + Vite + TypeScript
2. **バックエンドAPI**: Express + Node.js
3. **データベース**: SQLite

## デプロイオプション

### オプション1: VPS/クラウドサーバー（推奨）

**適している環境:**
- AWS EC2, Google Cloud Compute Engine, DigitalOcean Droplet, さくらのVPS等

**手順:**

1. **サーバーにSSH接続**
```bash
ssh user@your-server-ip
```

2. **Node.jsのインストール**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **プロジェクトのデプロイ**
```bash
# プロジェクトをクローン
git clone https://github.com/japanseamart/japanseamart-shift.git
cd japanseamart-shift

# 依存関係をインストール
npm install

# フロントエンドをビルド
npm run build

# プロダクション用にバックエンドを起動
PORT=3001 npx tsx server/index.ts
```

4. **PM2で永続化（推奨）**
```bash
# PM2をグローバルインストール
sudo npm install -g pm2

# バックエンドを起動
pm2 start "npx tsx server/index.ts" --name shift-api --env production

# 自動起動を設定
pm2 startup
pm2 save
```

5. **Nginx リバースプロキシ設定**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # フロントエンド（静的ファイル）
    location / {
        root /path/to/japanseamart-shift/dist;
        try_files $uri $uri/ /index.html;
    }

    # バックエンドAPI
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### オプション2: Railway（簡単デプロイ）

**手順:**

1. [Railway](https://railway.app)にサインアップ
2. GitHub リポジトリを接続
3. 環境変数を設定:
   - `PORT=3001`
4. デプロイボタンをクリック

**注意**: SQLiteはファイルベースなので、永続化ストレージを設定する必要があります。

### オプション3: Render（無料プラン可能）

1. [Render](https://render.com)にサインアップ
2. "New Web Service"を作成
3. GitHub リポジトリを接続
4. 設定:
   - **Build Command**: `npm install && npm run build && npx tsx server/index.ts`
   - **Start Command**: `npx tsx server/index.ts`
   - **Environment**: Node

### オプション4: Docker（コンテナ化）

**Dockerfile を作成:**

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 依存関係をインストール
COPY package*.json ./
RUN npm install

# アプリケーションをコピー
COPY . .

# フロントエンドをビルド
RUN npm run build

# ポートを公開
EXPOSE 3001

# バックエンドを起動
CMD ["npx", "tsx", "server/index.ts"]
```

**ビルドと実行:**
```bash
docker build -t shift-management .
docker run -p 3001:3001 -v $(pwd)/shift_management.db:/app/shift_management.db shift-management
```

## 環境変数

必要に応じて以下の環境変数を設定してください：

```env
PORT=3001
NODE_ENV=production
SESSION_SECRET=your-secret-key-here
```

## データベースのバックアップ

SQLiteデータベースは`shift_management.db`ファイルに保存されます。
定期的にバックアップを取ることを推奨します：

```bash
# バックアップ
cp shift_management.db shift_management.db.backup-$(date +%Y%m%d)

# 自動バックアップ（cronジョブ）
0 2 * * * cp /path/to/shift_management.db /path/to/backups/shift_management.db.backup-$(date +\%Y\%m\%d)
```

## セキュリティ推奨事項

1. **HTTPS を有効化** - Let's Encrypt + Cerbot を使用
2. **ファイアウォールを設定** - 必要なポートのみを開放
3. **定期的なアップデート** - `npm update`でパッケージを更新
4. **強力なセッションシークレット** - ランダムな文字列を使用
5. **データベースバックアップ** - 毎日自動バックアップを設定

## トラブルシューティング

### ポート競合
```bash
# ポート3001が使用中の場合
lsof -ti:3001 | xargs kill -9
```

### データベースファイルが見つからない
サーバー起動時に自動的に作成されます。初回起動を確認してください。

### ビルドエラー
```bash
# node_modulesとdistを削除して再ビルド
rm -rf node_modules dist
npm install
npm run build
```

## サポート

問題が発生した場合は、GitHubリポジトリのIssuesで報告してください。
