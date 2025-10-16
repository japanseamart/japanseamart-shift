import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './database.js';

// ルーターのインポート
import authRoutes from './routes/auth.routes.js';
import storesRoutes from './routes/stores.routes.js';
import employeesRoutes from './routes/employees.routes.js';
import shiftsRoutes from './routes/shifts.routes.js';
import specialDaysRoutes from './routes/special-days.routes.js';
import shiftRequestsRoutes from './routes/shift-requests.routes.js';
import announcementsRoutes from './routes/announcements.routes.js';
import passwordsRoutes from './routes/passwords.routes.js';
import submissionStatusRoutes from './routes/submission-status.routes.js';
import shiftDeadlinesRoutes from './routes/shift-deadlines.routes.js';
import weeklyPublicationsRoutes from './routes/weekly-publications.routes.js';
import autoFillRoutes from './routes/auto-fill.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// ================== ミドルウェア設定 ==================

// CORS設定
app.use(cors({
  origin: isProduction ? true : 'http://localhost:5173',
  credentials: true,
}));

// JSONボディパーサー
app.use(express.json());

// セッション設定
app.use(session({
  secret: process.env.SESSION_SECRET || 'shift-management-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 5 * 60 * 1000, // 5分
    sameSite: isProduction ? 'none' : 'lax',
  }
}));

// データベース初期化
initializeDatabase();

// ================== ルーター登録 ==================

// 認証関連
app.use('/api/auth', authRoutes);

// マスタ管理
app.use('/api/stores', storesRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/special-days', specialDaysRoutes);

// シフト管理
app.use('/api/shifts', shiftsRoutes);
app.use('/api/shifts', autoFillRoutes); // 自動反映機能

// シフト希望管理
app.use('/api/shift-requests', shiftRequestsRoutes);
app.use('/api/submission-status', submissionStatusRoutes);
app.use('/api/shift-deadlines', shiftDeadlinesRoutes);
app.use('/api/weekly-publications', weeklyPublicationsRoutes);

// その他
app.use('/api/announcements', announcementsRoutes);
app.use('/api/passwords', passwordsRoutes);

// ================== ヘルスチェック ==================

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ================== 静的ファイル配信（プロダクション環境） ==================

if (isProduction) {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath));
  
  // すべてのGETリクエストをindex.htmlにリダイレクト（SPAルーティング対応）
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ================== サーバー起動 ==================

app.listen(PORT, () => {
  console.log('🚀 シフト管理システム サーバー起動');
  console.log(`📡 ポート: ${PORT}`);
  console.log(`🌍 環境: ${isProduction ? 'Production' : 'Development'}`);
  console.log(`⏰ 起動時刻: ${new Date().toLocaleString('ja-JP')}`);
});
