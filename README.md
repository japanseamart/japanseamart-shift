# 店舗運営支援システム - シフト管理システム

## 📋 プロジェクト概要

魚屋さん向けのシフト管理システムです。従業員100～200名、8拠点（7店舗+本部）に対応し、10年間の長期運用を想定して設計されています。

### 対象拠点
1. 茨木太田店
2. 吹田店
3. 松原店
4. 忠岡店
5. 生駒店
6. 大和郡山店
7. 大和高田店
8. 本部

### 従業員区分
- **パート・アルバイト**: 時給制
- **パート社員**: 時給制・社会保険加入
- **正社員**: 月給制・時給計算なし

### 権限レベル
1. **本部管理者**: 全店舗・全機能アクセス可能
2. **店舗責任者**: 自店舗のみ管理（シフト作成・承認）
3. **一般従業員**: シフト確認・希望提出のみ

---

## 🎯 主な機能

### ✅ 実装済み機能

#### 認証・セキュリティ
- パスワード認証（ID不要・パスワードのみ）
- 権限レベル別アクセス制御
- 自動ログアウト（5分・設定変更可能）
- セッション管理

#### マスタ管理
- **店舗マスタ**
  - CRUD機能
  - 営業時間設定（店舗ごとに個別設定可能）
  - シフトパターン時間設定（午前・午後・夕方）
  - 加算時給設定（土日・祝日・店舗ごと）
  - 月間予算設定

- **従業員マスタ**
  - CRUD機能
  - CSVエクスポート/インポート
  - 差分更新対応
  - 店舗別フィルタリング
  - 時給順ソート

#### 従業員向け機能
- **シフト確認画面**
  - ガントチャート形式表示
  - 週単位表示（月曜起点）
  - 店舗選択
  - 週切り替え（前週・次週・今週）
  - スマートフォン対応

#### 管理者向け機能
- **ダッシュボード**
  - クイックアクション
  - 承認待ちシフト希望表示
  - お知らせ機能

- **お知らせ機能**
  - 本部から全従業員へのメッセージ投稿
  - リアルタイム表示

### ⏳ 実装予定機能（スタブ作成済み）

- シフト希望提出
  - 複数パターン選択（休み・午前・午後・夕方・終日可・時間指定）
  - 重複申請防止
  - 提出期限管理

- シフト管理
  - ガントチャート形式入力
  - 人件費リアルタイム計算
  - 予算消化率表示
  - 警告アラート

- シフト希望管理
  - 承認・非承認機能
  - 未提出者検知
  - 期限設定

- 月間レポート
  - 人件費分析
  - 労働時間統計
  - CSVエクスポート
  - グラフ表示

- 印刷機能
  - A4縦レイアウト
  - 金額情報非表示
  - 週単位印刷

- 特別日マスタ
  - 祝日設定
  - 繁忙日設定
  - イベント日設定

---

## 🛠️ 技術スタック

### フロントエンド
- **React 18** + **TypeScript**
- **Tailwind CSS** (レスポンシブ対応)
- **React Router** (ルーティング)
- **date-fns** (日付処理)
- **Chart.js** (グラフ表示)
- **PapaParse** (CSV処理)

### バックエンド
- **Node.js** + **Express**
- **SQLite** (開発環境)
- **PostgreSQL** (本番環境推奨)
- **bcryptjs** (パスワードハッシュ化)
- **express-session** (セッション管理)

### デザインシステム
- **カラーパレット**: 魚屋テーマ
  - プライマリ: 深い青 (ocean)
  - アクセント: オレンジ (fish-orange)
  - 警告: 赤 (fish-red)
  - 成功: 緑 (fish-green)

---

## 🚀 開発環境セットアップ

### 必要要件
- Node.js 18以上
- npm 8以上

### インストール

```bash
# 依存関係のインストール
npm install

# 開発用依存関係（既にインストール済み）
npm install -D tsx nodemon @types/node
```

### 開発サーバー起動

#### バックエンドサーバー（ポート3001）
```bash
npx tsx server/index.ts
```

#### フロントエンドサーバー（ポート5173）
```bash
npm run dev
```

### 初期パスワード
- **本部管理者**: `admin`
- **店舗1責任者**: `store1`
- **店舗2責任者**: `store2`
- **店舗3責任者**: `store3`
- **店舗4責任者**: `store4`
- **店舗5責任者**: `store5`
- **店舗6責任者**: `store6`
- **店舗7責任者**: `store7`

### サンプルデータ
- **従業員**:
  - 森本 泰博（正社員・本部）
  - 山田 太郎（パート社員・本部）
  - 鈴木 花子（パート・アルバイト・本部）

---

## 📊 データベース設計

### テーブル一覧

#### stores（店舗マスタ）
- id: 店舗ID
- name: 店舗名
- monthly_budget: 月間予算
- overtime_rate_enabled: 加算時給有効フラグ
- saturday_rate: 土曜加算額
- sunday_rate: 日曜加算額
- holiday_rate: 祝日加算額
- business_hours_start/end: 営業時間
- morning/afternoon/evening_start/end: シフトパターン時間

#### employees（従業員マスタ）
- id: 従業員ID（自動連番）
- name: 氏名
- store_id: 所属店舗ID
- employment_type: 給与タイプ
- hourly_wage: 時給（正社員はnull）

#### shifts（シフト実績）
- id: シフトID
- employee_id: 従業員ID
- store_id: 店舗ID
- date: 日付
- start_time/end_time: 勤務時間
- break_minutes: 休憩時間
- labor_cost: 人件費

#### shift_requests（シフト希望）
- id: シフト希望ID
- employee_id: 従業員ID
- store_id: 店舗ID
- date: 日付
- patterns: 希望パターン（JSON）
- status: ステータス（pending/approved/rejected）

#### special_days（特別日マスタ）
- id: 特別日ID
- date: 日付
- type: タイプ（1:祝日 2:繁忙日 3:イベント）
- name: 名称

#### passwords（パスワード管理）
- id: パスワードID
- role: 権限レベル（admin/store_manager）
- store_id: 店舗ID（adminの場合null）
- password_hash: パスワードハッシュ
- auto_logout_minutes: 自動ログアウト時間

#### shift_history（変更履歴）
- id: 履歴ID
- shift_id: シフトID
- changed_by: 変更者
- before_data/after_data: 変更前後データ（JSON）

---

## 📱 画面一覧

### 従業員向け（認証不要）
- `/employee/shift` - シフト確認画面
- `/employee/request` - シフト希望提出画面

### 管理者向け（認証必要）
- `/admin/login` - ログイン画面
- `/admin` - ダッシュボード
- `/admin/stores` - 店舗管理
- `/admin/employees` - 従業員管理
- `/admin/shifts` - シフト管理
- `/admin/shift-requests` - シフト希望管理
- `/admin/reports` - 月間レポート
- `/admin/special-days` - 特別日設定

---

## 🔧 API エンドポイント

### 認証
- `POST /api/auth/login` - ログイン
- `POST /api/auth/logout` - ログアウト
- `GET /api/auth/session` - セッション確認

### 店舗
- `GET /api/stores` - 店舗一覧
- `GET /api/stores/:id` - 店舗詳細
- `POST /api/stores` - 店舗追加
- `PUT /api/stores/:id` - 店舗更新
- `DELETE /api/stores/:id` - 店舗削除

### 従業員
- `GET /api/employees` - 従業員一覧
- `GET /api/employees/:id` - 従業員詳細
- `POST /api/employees` - 従業員追加
- `PUT /api/employees/:id` - 従業員更新
- `DELETE /api/employees/:id` - 従業員削除

### シフト
- `GET /api/shifts` - シフト一覧
- `POST /api/shifts` - シフト追加
- `PUT /api/shifts/:id` - シフト更新
- `DELETE /api/shifts/:id` - シフト削除
- `GET /api/shifts/stats/monthly` - 月間統計

### その他
- `GET /api/announcements` - お知らせ一覧
- `POST /api/announcements` - お知らせ投稿
- `GET /api/special-days` - 特別日一覧
- `POST /api/special-days` - 特別日追加
- `GET /api/shift-requests` - シフト希望一覧
- `POST /api/shift-requests` - シフト希望提出

---

## 📝 開発メモ

### 設定可能項目
- 週の起点: 月曜日
- タイムゾーン: 日本（Asia/Tokyo）
- シフト最小単位: 30分
- 端数処理: 切り上げ
- 交通費: 時給に含まない

### CSVフォーマット
```csv
従業員ID,氏名,所属店舗,給与タイプ,時給,登録日
1,森本 泰博,本部,正社員,-,2025-09-01
2,山田 太郎,本部,パート社員,1200,2025-09-01
```

---

## 🎨 デザインガイドライン

### カラー使用例
- **海の深さ**: `bg-ocean-700` - プライマリボタン
- **新鮮な水**: `bg-ocean-100` - 背景色
- **魚市場の活気**: `text-fish-orange` - アクセント
- **警告**: `bg-fish-red` - エラー・警告
- **成功**: `bg-fish-green` - 成功メッセージ

### レスポンシブ対応
- モバイル: 320px〜
- タブレット: 768px〜
- デスクトップ: 1024px〜

---

## 🔐 セキュリティ

- パスワードはbcryptでハッシュ化
- セッションベース認証
- 自動ログアウト機能
- CSRF対策（本番環境で追加推奨）
- SQLインジェクション対策（prepared statement使用）

---

## 📦 本番デプロイ

### 推奨環境
- **フロントエンド**: Vercel / Netlify
- **バックエンド**: Render / Railway / Fly.io
- **データベース**: PostgreSQL (Render / Supabase)

### 環境変数
```
NODE_ENV=production
DATABASE_URL=postgresql://...
SESSION_SECRET=your-secret-key
PORT=3001
```

---

## 🤝 サポート

### 開発者
GenSpark AI Assistant

### 開発年度
2025年9月

### バージョン
v1.0.0（基本機能実装版）

---

## 📄 ライセンス

このプロジェクトは魚屋様専用のカスタムシステムです。
