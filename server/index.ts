import express from 'express';
import session from 'express-session';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import db, { initializeDatabase } from './database.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ミドルウェア
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(session({
  secret: 'shift-management-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 5 * 60 * 1000, // 5分
  }
}));

// データベース初期化
initializeDatabase();

// セッション型定義
declare module 'express-session' {
  interface SessionData {
    role: 'admin' | 'store_manager' | null;
    storeId: number | null;
    lastActivity: number;
  }
}

// 認証ミドルウェア
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.session.role) {
    return res.status(401).json({ error: '認証が必要です' });
  }
  
  // 自動ログアウトチェック
  const now = Date.now();
  const lastActivity = req.session.lastActivity || now;
  const autoLogoutMs = 5 * 60 * 1000; // デフォルト5分
  
  if (now - lastActivity > autoLogoutMs) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'セッションがタイムアウトしました' });
  }
  
  req.session.lastActivity = now;
  next();
};

// ================== 認証API ==================

// ログイン
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'パスワードを入力してください' });
  }

  // 本部管理者チェック
  const adminPassword = db.prepare('SELECT * FROM passwords WHERE role = ?').get('admin') as any;
  if (adminPassword && bcrypt.compareSync(password, adminPassword.password_hash)) {
    req.session.role = 'admin';
    req.session.storeId = null;
    req.session.lastActivity = Date.now();
    return res.json({ role: 'admin', storeId: null });
  }

  // 店舗責任者チェック
  const storePasswords = db.prepare('SELECT * FROM passwords WHERE role = ?').all('store_manager') as any[];
  for (const storePassword of storePasswords) {
    if (bcrypt.compareSync(password, storePassword.password_hash)) {
      req.session.role = 'store_manager';
      req.session.storeId = storePassword.store_id;
      req.session.lastActivity = Date.now();
      return res.json({ role: 'store_manager', storeId: storePassword.store_id });
    }
  }

  res.status(401).json({ error: 'パスワードが正しくありません' });
});

// ログアウト
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'ログアウトに失敗しました' });
    }
    res.json({ success: true });
  });
});

// セッション確認
app.get('/api/auth/session', (req, res) => {
  if (req.session.role) {
    // 自動ログアウトチェック
    const now = Date.now();
    const lastActivity = req.session.lastActivity || now;
    const autoLogoutMs = 5 * 60 * 1000;
    
    if (now - lastActivity > autoLogoutMs) {
      req.session.destroy(() => {});
      return res.json({ role: null, storeId: null });
    }
    
    req.session.lastActivity = now;
    return res.json({ role: req.session.role, storeId: req.session.storeId });
  }
  res.json({ role: null, storeId: null });
});

// ================== 店舗API ==================

// 店舗一覧取得
app.get('/api/stores', (req, res) => {
  const stores = db.prepare('SELECT * FROM stores ORDER BY id').all();
  res.json(stores);
});

// 店舗詳細取得
app.get('/api/stores/:id', (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) {
    return res.status(404).json({ error: '店舗が見つかりません' });
  }
  res.json(store);
});

// 店舗追加
app.post('/api/stores', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '権限がありません' });
  }

  const { name, monthly_budget } = req.body;
  
  const result = db.prepare(`
    INSERT INTO stores (name, monthly_budget) VALUES (?, ?)
  `).run(name, monthly_budget || 0);

  const newStore = db.prepare('SELECT * FROM stores WHERE id = ?').get(result.lastInsertRowid);
  res.json(newStore);
});

// 店舗更新
app.put('/api/stores/:id', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '権限がありません' });
  }

  const { name, monthly_budget, overtime_rate_enabled, saturday_rate, sunday_rate, holiday_rate,
          business_hours_start, business_hours_end, morning_start, morning_end,
          afternoon_start, afternoon_end, evening_start, evening_end } = req.body;

  db.prepare(`
    UPDATE stores SET 
      name = ?, 
      monthly_budget = ?,
      overtime_rate_enabled = ?,
      saturday_rate = ?,
      sunday_rate = ?,
      holiday_rate = ?,
      business_hours_start = ?,
      business_hours_end = ?,
      morning_start = ?,
      morning_end = ?,
      afternoon_start = ?,
      afternoon_end = ?,
      evening_start = ?,
      evening_end = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, monthly_budget, overtime_rate_enabled ? 1 : 0, saturday_rate, sunday_rate, holiday_rate,
         business_hours_start, business_hours_end, morning_start, morning_end,
         afternoon_start, afternoon_end, evening_start, evening_end, req.params.id);

  const updatedStore = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  res.json(updatedStore);
});

// 店舗削除
app.delete('/api/stores/:id', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '権限がありません' });
  }

  db.prepare('DELETE FROM stores WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ================== 従業員API ==================

// 従業員一覧取得
app.get('/api/employees', (req, res) => {
  const { store_id } = req.query;
  let query = 'SELECT * FROM employees';
  let params: any[] = [];

  if (store_id) {
    query += ' WHERE store_id = ?';
    params.push(store_id);
  }

  query += ' ORDER BY store_id, name';
  const employees = db.prepare(query).all(...params);
  res.json(employees);
});

// 従業員詳細取得
app.get('/api/employees/:id', (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!employee) {
    return res.status(404).json({ error: '従業員が見つかりません' });
  }
  res.json(employee);
});

// 従業員追加
app.post('/api/employees', requireAuth, (req, res) => {
  const { name, store_id, employment_type, hourly_wage } = req.body;
  
  // 店舗責任者は自店舗のみ
  if (req.session.role === 'store_manager' && store_id !== req.session.storeId) {
    return res.status(403).json({ error: '他店舗の従業員は追加できません' });
  }

  const result = db.prepare(`
    INSERT INTO employees (name, store_id, employment_type, hourly_wage) 
    VALUES (?, ?, ?, ?)
  `).run(name, store_id, employment_type, hourly_wage);

  const newEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
  res.json(newEmployee);
});

// 従業員更新
app.put('/api/employees/:id', requireAuth, (req, res) => {
  const { name, store_id, employment_type, hourly_wage } = req.body;
  
  // 店舗責任者は自店舗のみ
  if (req.session.role === 'store_manager' && store_id !== req.session.storeId) {
    return res.status(403).json({ error: '他店舗の従業員は編集できません' });
  }

  db.prepare(`
    UPDATE employees SET 
      name = ?, 
      store_id = ?,
      employment_type = ?,
      hourly_wage = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, store_id, employment_type, hourly_wage, req.params.id);

  const updatedEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  res.json(updatedEmployee);
});

// 従業員削除
app.delete('/api/employees/:id', requireAuth, (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id) as any;
  
  // 店舗責任者は自店舗のみ
  if (req.session.role === 'store_manager' && employee.store_id !== req.session.storeId) {
    return res.status(403).json({ error: '他店舗の従業員は削除できません' });
  }

  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ================== シフトAPI ==================

// シフト一覧取得
app.get('/api/shifts', (req, res) => {
  const { store_id, start_date, end_date, employee_id } = req.query;
  let query = 'SELECT * FROM shifts WHERE 1=1';
  let params: any[] = [];

  if (store_id) {
    query += ' AND store_id = ?';
    params.push(store_id);
  }

  if (start_date) {
    query += ' AND date >= ?';
    params.push(start_date);
  }

  if (end_date) {
    query += ' AND date <= ?';
    params.push(end_date);
  }

  if (employee_id) {
    query += ' AND employee_id = ?';
    params.push(employee_id);
  }

  query += ' ORDER BY date, start_time';
  const shifts = db.prepare(query).all(...params);
  res.json(shifts);
});

// シフト追加
app.post('/api/shifts', requireAuth, (req, res) => {
  const { employee_id, store_id, date, start_time, end_time, break_minutes } = req.body;
  
  // 店舗責任者は自店舗のみ
  if (req.session.role === 'store_manager' && store_id !== req.session.storeId) {
    return res.status(403).json({ error: '他店舗のシフトは追加できません' });
  }

  // 人件費計算
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee_id) as any;
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id) as any;
  
  let laborCost = 0;
  if (employee.employment_type !== 'full_time' && employee.hourly_wage) {
    const [startHour, startMin] = start_time.split(':').map(Number);
    const [endHour, endMin] = end_time.split(':').map(Number);
    const totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin) - (break_minutes || 0);
    const hours = Math.ceil(totalMinutes / 30) * 0.5; // 30分単位切り上げ
    
    // 基本時給
    let hourlyRate = employee.hourly_wage;
    
    // 曜日チェック（土日加算）
    const dayOfWeek = new Date(date).getDay();
    if (store.overtime_rate_enabled) {
      if (dayOfWeek === 6 && store.saturday_rate > 0) {
        hourlyRate += store.saturday_rate;
      } else if (dayOfWeek === 0 && store.sunday_rate > 0) {
        hourlyRate += store.sunday_rate;
      }
    }
    
    // 祝日チェック
    const specialDay = db.prepare('SELECT * FROM special_days WHERE date = ?').get(date) as any;
    if (specialDay && store.overtime_rate_enabled && store.holiday_rate > 0) {
      hourlyRate += store.holiday_rate;
    }
    
    laborCost = hours * hourlyRate;
  }

  const result = db.prepare(`
    INSERT INTO shifts (employee_id, store_id, date, start_time, end_time, break_minutes, labor_cost) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(employee_id, store_id, date, start_time, end_time, break_minutes || 0, laborCost);

  // 履歴記録
  const newShift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(result.lastInsertRowid);
  db.prepare(`
    INSERT INTO shift_history (shift_id, changed_by, after_data) 
    VALUES (?, ?, ?)
  `).run(result.lastInsertRowid, req.session.role, JSON.stringify(newShift));

  res.json(newShift);
});

// シフト更新
app.put('/api/shifts/:id', requireAuth, (req, res) => {
  const { employee_id, store_id, date, start_time, end_time, break_minutes } = req.body;
  
  // 店舗責任者は自店舗のみ
  if (req.session.role === 'store_manager' && store_id !== req.session.storeId) {
    return res.status(403).json({ error: '他店舗のシフトは編集できません' });
  }

  // 変更前データ取得
  const beforeShift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id);

  // 人件費再計算
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee_id) as any;
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id) as any;
  
  let laborCost = 0;
  if (employee.employment_type !== 'full_time' && employee.hourly_wage) {
    const [startHour, startMin] = start_time.split(':').map(Number);
    const [endHour, endMin] = end_time.split(':').map(Number);
    const totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin) - (break_minutes || 0);
    const hours = Math.ceil(totalMinutes / 30) * 0.5;
    
    let hourlyRate = employee.hourly_wage;
    const dayOfWeek = new Date(date).getDay();
    if (store.overtime_rate_enabled) {
      if (dayOfWeek === 6 && store.saturday_rate > 0) {
        hourlyRate += store.saturday_rate;
      } else if (dayOfWeek === 0 && store.sunday_rate > 0) {
        hourlyRate += store.sunday_rate;
      }
    }
    
    const specialDay = db.prepare('SELECT * FROM special_days WHERE date = ?').get(date) as any;
    if (specialDay && store.overtime_rate_enabled && store.holiday_rate > 0) {
      hourlyRate += store.holiday_rate;
    }
    
    laborCost = hours * hourlyRate;
  }

  db.prepare(`
    UPDATE shifts SET 
      employee_id = ?,
      store_id = ?,
      date = ?,
      start_time = ?,
      end_time = ?,
      break_minutes = ?,
      labor_cost = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(employee_id, store_id, date, start_time, end_time, break_minutes || 0, laborCost, req.params.id);

  const afterShift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id);
  
  // 履歴記録
  db.prepare(`
    INSERT INTO shift_history (shift_id, changed_by, before_data, after_data) 
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, req.session.role, JSON.stringify(beforeShift), JSON.stringify(afterShift));

  res.json(afterShift);
});

// シフト削除
app.delete('/api/shifts/:id', requireAuth, (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id) as any;
  
  // 店舗責任者は自店舗のみ
  if (req.session.role === 'store_manager' && shift.store_id !== req.session.storeId) {
    return res.status(403).json({ error: '他店舗のシフトは削除できません' });
  }

  // 履歴記録
  db.prepare(`
    INSERT INTO shift_history (shift_id, changed_by, before_data, after_data) 
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, req.session.role, JSON.stringify(shift), JSON.stringify({ deleted: true }));

  db.prepare('DELETE FROM shifts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 月間統計
app.get('/api/shifts/stats/monthly', (req, res) => {
  const { store_id, month } = req.query; // month: "2025-09"
  
  if (!month) {
    return res.status(400).json({ error: '月を指定してください' });
  }

  const startDate = `${month}-01`;
  const endDate = `${month}-31`;

  let query = `
    SELECT 
      date,
      SUM(labor_cost) as total_cost,
      COUNT(DISTINCT employee_id) as total_employees,
      SUM((julianday(time(end_time)) - julianday(time(start_time))) * 24 - break_minutes / 60.0) as total_hours
    FROM shifts
    WHERE date >= ? AND date <= ?
  `;
  let params: any[] = [startDate, endDate];

  if (store_id) {
    query += ' AND store_id = ?';
    params.push(store_id);
  }

  query += ' GROUP BY date ORDER BY date';

  const dailyStats = db.prepare(query).all(...params);
  res.json(dailyStats);
});

// ================== その他のAPI（特別日、シフト希望、お知らせなど） ==================

// 特別日一覧
app.get('/api/special-days', (req, res) => {
  const specialDays = db.prepare('SELECT * FROM special_days ORDER BY date').all();
  res.json(specialDays);
});

// 特別日追加
app.post('/api/special-days', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '権限がありません' });
  }

  const { date, type, name, description } = req.body;
  
  const result = db.prepare(`
    INSERT INTO special_days (date, type, name, description) VALUES (?, ?, ?, ?)
  `).run(date, type, name, description || '');

  const newSpecialDay = db.prepare('SELECT * FROM special_days WHERE id = ?').get(result.lastInsertRowid);
  res.json(newSpecialDay);
});

// 特別日削除
app.delete('/api/special-days/:id', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '権限がありません' });
  }

  db.prepare('DELETE FROM special_days WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// シフト希望一覧
app.get('/api/shift-requests', (req, res) => {
  const { store_id, employee_id, status, start_date, end_date } = req.query;
  let query = 'SELECT * FROM shift_requests WHERE 1=1';
  let params: any[] = [];

  if (store_id) {
    query += ' AND store_id = ?';
    params.push(store_id);
  }

  if (employee_id) {
    query += ' AND employee_id = ?';
    params.push(employee_id);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (start_date) {
    query += ' AND date >= ?';
    params.push(start_date);
  }

  if (end_date) {
    query += ' AND date <= ?';
    params.push(end_date);
  }

  query += ' ORDER BY date, submitted_at';
  const requests = db.prepare(query).all(...params);
  res.json(requests);
});

// シフト希望提出
app.post('/api/shift-requests', (req, res) => {
  const { employee_id, store_id, date, patterns, custom_start, custom_end } = req.body;
  
  // 重複チェック
  const existing = db.prepare('SELECT * FROM shift_requests WHERE employee_id = ? AND date = ?').get(employee_id, date);
  if (existing) {
    return res.status(400).json({ error: 'すでにこの日のシフト希望が提出されています' });
  }

  const result = db.prepare(`
    INSERT INTO shift_requests (employee_id, store_id, date, patterns, custom_start, custom_end) 
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(employee_id, store_id, date, JSON.stringify(patterns), custom_start, custom_end);

  const newRequest = db.prepare('SELECT * FROM shift_requests WHERE id = ?').get(result.lastInsertRowid);
  res.json(newRequest);
});

// シフト希望承認・却下
app.put('/api/shift-requests/:id', requireAuth, (req, res) => {
  const { status } = req.body;
  
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: '無効なステータスです' });
  }

  db.prepare(`
    UPDATE shift_requests SET 
      status = ?,
      reviewed_at = CURRENT_TIMESTAMP,
      reviewed_by = ?
    WHERE id = ?
  `).run(status, req.session.role, req.params.id);

  const updatedRequest = db.prepare('SELECT * FROM shift_requests WHERE id = ?').get(req.params.id);
  res.json(updatedRequest);
});

// お知らせ一覧
app.get('/api/announcements', (req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC').all();
  res.json(announcements);
});

// お知らせ追加
app.post('/api/announcements', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '権限がありません' });
  }

  const { title, content } = req.body;
  
  const result = db.prepare(`
    INSERT INTO announcements (title, content) VALUES (?, ?)
  `).run(title, content);

  const newAnnouncement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(result.lastInsertRowid);
  res.json(newAnnouncement);
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 サーバーが起動しました: http://localhost:${PORT}`);
  console.log(`📊 データベース: shift_management.db`);
  console.log(`🔐 初期パスワード - 本部管理者: admin, 店舗1-7: store1 ~ store7`);
});
