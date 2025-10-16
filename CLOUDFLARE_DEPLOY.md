# ☁️ Cloudflareでのデプロイガイド

## 🎯 推奨構成: ハイブリッドデプロイ

このプロジェクトはフルスタック（React + Express + SQLite）のため、以下の構成が最適です：

```
┌─────────────────────────────────────────┐
│  フロントエンド                         │
│  Cloudflare Pages                       │
│  - 超高速CDN配信                        │
│  - 無料・無制限                         │
│  - 自動HTTPS                            │
└─────────────────────────────────────────┘
              ↓ API呼び出し
┌─────────────────────────────────────────┐
│  バックエンド + データベース            │
│  Railway / Render                       │
│  - Node.js + Express                    │
│  - SQLite データベース                  │
│  - セッション管理                       │
└─────────────────────────────────────────┘
```

**メリット:**
- ✅ Cloudflareの高速CDNでフロントエンド配信
- ✅ グローバルに高速アクセス
- ✅ フロントエンドは完全無料
- ✅ バックエンドは既存コードをそのまま使用可能

---

## 🚀 デプロイ手順（30分で完了）

### ステップ1: バックエンドをRailwayにデプロイ

#### 1.1 Railwayにアクセス
- https://railway.app
- GitHubでログイン

#### 1.2 新規プロジェクト作成
1. "New Project" をクリック
2. "Deploy from GitHub repo" を選択
3. `japanseamart/japanseamart-shift` を選択
4. 自動デプロイ開始

#### 1.3 ドメインを取得
1. Settings → Domains → "Generate Domain"
2. 生成されたURL（例: `japanseamart-shift.up.railway.app`）をメモ

**これがAPIエンドポイントになります！**

---

### ステップ2: フロントエンドをCloudflare Pagesにデプロイ

#### 2.1 環境変数を設定してビルド

フロントエンドがバックエンドAPIを呼び出せるよう設定：

```bash
cd /home/user/webapp

# .env.productionファイルを作成
cat > .env.production << EOF
VITE_API_URL=https://your-railway-app.up.railway.app
EOF

# ビルド
npm run build
```

#### 2.2 Cloudflare Pagesにデプロイ

**方法A: Wranglerを使用（推奨）**

```bash
# Wranglerをインストール
npm install -g wrangler

# Cloudflareにログイン
wrangler login

# Pagesプロジェクトを作成してデプロイ
wrangler pages deploy dist --project-name=japanseamart-shift
```

デプロイURL（例）: `https://japanseamart-shift.pages.dev`

**方法B: Cloudflare Dashboardから**

1. https://dash.cloudflare.com にアクセス
2. "Pages" → "Create a project"
3. "Connect to Git" → GitHubリポジトリを接続
4. ビルド設定:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variables**:
     - `VITE_API_URL`: `https://your-railway-app.up.railway.app`
5. "Save and Deploy"

---

### ステップ3: API URL設定の修正

フロントエンドがバックエンドと通信できるよう、コードを少し修正します。

#### 3.1 環境変数ファイルを作成

```bash
cd /home/user/webapp

# 開発用
cat > .env.development << EOF
VITE_API_URL=http://localhost:3001
EOF

# 本番用（Railwayのドメインに置き換え）
cat > .env.production << EOF
VITE_API_URL=https://japanseamart-shift.up.railway.app
EOF
```

#### 3.2 フロントエンドコードでAPI URLを使用

すべてのfetchコールを以下のように修正：

```typescript
// 修正前
fetch('/api/stores')

// 修正後
const API_URL = import.meta.env.VITE_API_URL || '';
fetch(`${API_URL}/api/stores`)
```

---

## 🔧 完全な設定手順

実際にコードを修正してデプロイする詳細手順：

### 1. API URL設定ファイルを作成

```bash
cd /home/user/webapp

# src/config/api.tsを作成
mkdir -p src/config
cat > src/config/api.ts << 'EOF'
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function getApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
EOF
```

### 2. 各ページでAPI URLを使用

例: `src/pages/Login.tsx`

```typescript
import { getApiUrl } from '../config/api';

// 修正前
const res = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ password }),
});

// 修正後
const res = await fetch(getApiUrl('/api/auth/login'), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ password }),
});
```

### 3. CORS設定を更新

バックエンド（`server/index.ts`）でCloudflare Pagesのドメインを許可：

```typescript
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://japanseamart-shift.pages.dev', // Cloudflare Pagesドメイン
    /\.pages\.dev$/ // すべての*.pages.devドメイン
  ],
  credentials: true,
}));
```

### 4. ビルド & デプロイ

```bash
# バックエンドをRailwayにプッシュ
git add .
git commit -m "feat: Cloudflare Pages対応のCORS設定"
git push

# フロントエンドをビルド
npm run build

# Cloudflare Pagesにデプロイ
wrangler pages deploy dist --project-name=japanseamart-shift
```

---

## 📊 デプロイ後の確認

### 動作確認チェックリスト

- [ ] Cloudflare Pages URL（https://xxx.pages.dev）にアクセス
- [ ] ログイン画面が表示される
- [ ] `admin`でログイン成功
- [ ] 店舗一覧が表示される
- [ ] シフト管理画面が動作する
- [ ] データの保存・取得が正常

### トラブルシューティング

#### CORS エラーが発生する

**原因**: バックエンドがCloudflare Pagesドメインを許可していない

**解決**: `server/index.ts`のCORS設定に以下を追加：
```typescript
origin: ['https://your-app.pages.dev']
```

#### API呼び出しが失敗する

**原因**: VITE_API_URLが正しく設定されていない

**解決**: Cloudflare Pagesの環境変数を確認：
```
VITE_API_URL=https://your-railway-app.up.railway.app
```

#### セッションが保持されない

**原因**: クロスドメインCookie設定

**解決**: バックエンドのセッション設定：
```typescript
cookie: {
  secure: true,
  sameSite: 'none',
  httpOnly: true
}
```

---

## 💰 コスト

| サービス | 料金 | 用途 |
|---------|------|------|
| **Cloudflare Pages** | 無料 | フロントエンド配信 |
| **Railway** | $5/月〜 | バックエンド + DB |

**合計**: 約$5/月（フロントエンドは完全無料！）

---

## 🔐 セキュリティ設定

### 必須設定

1. **HTTPS強制**: Cloudflare Pagesは自動対応
2. **環境変数保護**: Cloudflare/Railwayの環境変数機能を使用
3. **初期パスワード変更**: デプロイ後すぐに変更

### 推奨設定

- Cloudflare Web Application Firewall（WAF）を有効化
- Rate Limitingを設定
- Bot Protection を有効化

---

## 🚨 重要な注意事項

### Cloudflare Workersは使用できません

このプロジェクトは以下の理由でCloudflare Workersと非互換です：

1. **Express.js依存**: Workers環境では完全動作せず
2. **better-sqlite3**: Node.js専用ライブラリ（Workers非対応）
3. **express-session**: Workers環境で動作しない

### 完全Cloudflare移行には大規模リファクタリングが必要

Workers対応にするには：
- Express → Hono（Workers対応フレームワーク）
- better-sqlite3 → Cloudflare D1 API
- express-session → KV + カスタム実装
- 全APIエンドポイントの書き換え

**推定作業時間**: 40〜80時間

**現時点の推奨**: ハイブリッドデプロイ（Pages + Railway）

---

## ✅ まとめ

### デプロイ構成

```
フロントエンド: Cloudflare Pages（無料）
     ↓
バックエンド: Railway ($5/月)
     ↓
データベース: SQLite（Railwayに含む）
```

### デプロイ時間

- バックエンド: 5分
- フロントエンド: 5分
- 設定・確認: 20分
- **合計**: 約30分

### アクセスURL

- **フロントエンド**: https://japanseamart-shift.pages.dev
- **バックエンドAPI**: https://japanseamart-shift.up.railway.app

---

## 📞 サポート

問題が発生した場合:
1. このガイドを再確認
2. DEPLOY_NOW.mdも参照
3. GitHubのIssuesで質問

---

**🎉 Cloudflare Pages + Railwayのハイブリッドデプロイで、高速かつコスト効率的なシステムが構築できます！**
