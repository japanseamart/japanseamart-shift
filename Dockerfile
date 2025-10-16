# ベースイメージ
FROM node:20-alpine

# 作業ディレクトリを設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm ci --only=production && npm cache clean --force

# アプリケーションファイルをコピー
COPY . .

# フロントエンドをビルド
RUN npm run build

# データベースディレクトリを作成
RUN mkdir -p /app/data

# ポートを公開
EXPOSE 3001

# 環境変数を設定
ENV NODE_ENV=production
ENV PORT=3001

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/stores', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# アプリケーションを起動
CMD ["npm", "start"]
