-- 店舗マスタ
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
);

-- 従業員マスタ
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  store_id INTEGER NOT NULL,
  employment_type TEXT NOT NULL CHECK(employment_type IN ('part_time', 'part_time_insured', 'full_time')),
  hourly_wage REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- 特別日マスタ
CREATE TABLE IF NOT EXISTS special_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  type INTEGER NOT NULL CHECK(type IN (1, 2, 3)),
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- シフト希望
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
);

-- シフト実績
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
);

-- シフト提出期限
CREATE TABLE IF NOT EXISTS shift_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  target_month TEXT NOT NULL,
  deadline_date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  UNIQUE(store_id, target_month)
);

-- お知らせ
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1
);

-- パスワード管理
CREATE TABLE IF NOT EXISTS passwords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('admin', 'store_manager')),
  store_id INTEGER,
  password_hash TEXT NOT NULL,
  auto_logout_minutes INTEGER DEFAULT 5,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- 変更履歴
CREATE TABLE IF NOT EXISTS shift_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  before_data TEXT,
  after_data TEXT NOT NULL,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
);

-- 週次シフト公開管理
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
);

-- 初期データ投入
-- 店舗マスタ初期データ（8拠点）
INSERT INTO stores (name, monthly_budget) VALUES 
  ('茨木太田店', 3000000),
  ('吹田店', 2500000),
  ('松原店', 2800000),
  ('忠岡店', 2200000),
  ('生駒店', 2600000),
  ('大和郡山店', 2400000),
  ('大和高田店', 2300000),
  ('本部', 5000000);

-- 従業員初期データ（本部所属のサンプル3名）
INSERT INTO employees (name, store_id, employment_type, hourly_wage) VALUES 
  ('森本 泰博', 8, 'full_time', NULL),
  ('山田 太郎', 8, 'part_time_insured', 1200),
  ('鈴木 花子', 8, 'part_time', 1100);

-- パスワード初期データ
-- 本部管理者: admin
INSERT INTO passwords (role, store_id, password_hash, auto_logout_minutes) VALUES 
  ('admin', NULL, '$2b$10$5d7XOUSh97jRvyAV28YUEuSEVIc87S8cFjpA0XKIj07OHYUKAcBTK', 5);

-- 各店舗責任者: store1 ~ store7
INSERT INTO passwords (role, store_id, password_hash, auto_logout_minutes) VALUES 
  ('store_manager', 1, '$2b$10$wgwdqFDU3lIXLv.uCbwO0urMoJ1vvtR64tgqVopB2WHutDbqUajky', 5),
  ('store_manager', 2, '$2b$10$n/CLfFpEF5TNQpxqOp9eI.REcSO/UWZeYk1gBwCyMc3bJsGeAttCS', 5),
  ('store_manager', 3, '$2b$10$6jtKEx3y7xLEuXNRb2WCWO1LGhiOJn8rtTKgQAul2QZ5LSs9IZAhC', 5),
  ('store_manager', 4, '$2b$10$mwf82hQnR/OMoypggrEymuvWfB.yNA.unS3lxLV2APq/pE1SrtbAG', 5),
  ('store_manager', 5, '$2b$10$E.9X9fZBkFOiTGGR.bceB.Kqn0zLZPLbHBZrDl9HuxrnQcIY4/noO', 5),
  ('store_manager', 6, '$2b$10$63nU5PkDBRpdKx93Qbt8y.m5KM95J669DDZSZSqsmP3EQurnJ.EPK', 5),
  ('store_manager', 7, '$2b$10$841gfw4a0DrBVAOhB9mgzOxiVWi3k7ESQG2k58noWgDVg8MQeopUW', 5);
