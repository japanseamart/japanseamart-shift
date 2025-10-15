import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'shift_management.db'));

// データベース初期化
export function initializeDatabase() {
  // 店舗マスタ
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      monthly_budget REAL DEFAULT 0,
      overtime_rate_enabled INTEGER DEFAULT 1,
      saturday_rate REAL DEFAULT 0,
      sunday_rate REAL DEFAULT 0,
      holiday_rate REAL DEFAULT 0,
      business_hours_start TEXT DEFAULT '07:00',
      business_hours_end TEXT DEFAULT '22:00',
      morning_start TEXT DEFAULT '07:00',
      morning_end TEXT DEFAULT '12:00',
      afternoon_start TEXT DEFAULT '12:00',
      afternoon_end TEXT DEFAULT '17:00',
      evening_start TEXT DEFAULT '17:00',
      evening_end TEXT DEFAULT '22:00',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 従業員マスタ
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      store_id INTEGER NOT NULL,
      employment_type TEXT NOT NULL CHECK(employment_type IN ('part_time', 'part_time_insured', 'full_time')),
      hourly_wage REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    )
  `);

  // 特別日マスタ
  db.exec(`
    CREATE TABLE IF NOT EXISTS special_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      type INTEGER NOT NULL CHECK(type IN (1, 2, 3)),
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // シフト希望
  db.exec(`
    CREATE TABLE IF NOT EXISTS shift_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      store_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      patterns TEXT NOT NULL,
      custom_start TEXT,
      custom_end TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      reviewed_by INTEGER,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      UNIQUE(employee_id, date)
    )
  `);

  // シフト実績
  db.exec(`
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      store_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      break_minutes INTEGER DEFAULT 0,
      labor_cost REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    )
  `);

  // シフト提出期限
  db.exec(`
    CREATE TABLE IF NOT EXISTS shift_deadlines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      target_month TEXT NOT NULL,
      deadline_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      UNIQUE(store_id, target_month)
    )
  `);

  // お知らせ
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )
  `);

  // パスワード管理
  db.exec(`
    CREATE TABLE IF NOT EXISTS passwords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('admin', 'store_manager')),
      store_id INTEGER,
      password_hash TEXT NOT NULL,
      auto_logout_minutes INTEGER DEFAULT 5,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    )
  `);

  // 変更履歴
  db.exec(`
    CREATE TABLE IF NOT EXISTS shift_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      before_data TEXT,
      after_data TEXT NOT NULL,
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
    )
  `);

  // 週次シフト公開管理
  db.exec(`
    CREATE TABLE IF NOT EXISTS weekly_publications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      week_start_date TEXT NOT NULL,
      is_published INTEGER DEFAULT 0,
      published_at TEXT,
      published_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      UNIQUE(store_id, week_start_date)
    )
  `);

  // 初期データ投入
  insertInitialData();
}

function insertInitialData() {
  // 既にデータがある場合はスキップ
  const storeCount = db.prepare('SELECT COUNT(*) as count FROM stores').get() as { count: number };
  if (storeCount.count > 0) return;

  // 店舗マスタ初期データ（8拠点）
  const stores = [
    { name: '茨木太田店', budget: 3000000 },
    { name: '吹田店', budget: 2500000 },
    { name: '松原店', budget: 2800000 },
    { name: '忠岡店', budget: 2200000 },
    { name: '生駒店', budget: 2600000 },
    { name: '大和郡山店', budget: 2400000 },
    { name: '大和高田店', budget: 2300000 },
    { name: '本部', budget: 5000000 },
  ];

  const insertStore = db.prepare(`
    INSERT INTO stores (name, monthly_budget) VALUES (?, ?)
  `);

  stores.forEach(store => {
    insertStore.run(store.name, store.budget);
  });

  // 従業員初期データ（本部所属のサンプル3名）
  const employees = [
    { name: '森本 泰博', store_id: 8, type: 'full_time', wage: null },
    { name: '山田 太郎', store_id: 8, type: 'part_time_insured', wage: 1200 },
    { name: '鈴木 花子', store_id: 8, type: 'part_time', wage: 1100 },
  ];

  const insertEmployee = db.prepare(`
    INSERT INTO employees (name, store_id, employment_type, hourly_wage) VALUES (?, ?, ?, ?)
  `);

  employees.forEach(emp => {
    insertEmployee.run(emp.name, emp.store_id, emp.type, emp.wage);
  });

  // パスワード初期データ
  const adminPasswordHash = bcrypt.hashSync('admin', 10);
  
  // 本部管理者パスワード
  db.prepare(`
    INSERT INTO passwords (role, store_id, password_hash, auto_logout_minutes) 
    VALUES ('admin', NULL, ?, 5)
  `).run(adminPasswordHash);

  // 各店舗責任者パスワード（初期値: store1 ~ store7）
  for (let i = 1; i <= 7; i++) {
    const storePasswordHash = bcrypt.hashSync(`store${i}`, 10);
    db.prepare(`
      INSERT INTO passwords (role, store_id, password_hash, auto_logout_minutes) 
      VALUES ('store_manager', ?, ?, 5)
    `).run(i, storePasswordHash);
  }

  console.log('✅ 初期データ投入完了');
}

export default db;
