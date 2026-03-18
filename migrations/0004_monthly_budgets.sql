-- 月別予算テーブル
CREATE TABLE IF NOT EXISTS monthly_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  budget INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  UNIQUE(store_id, year, month)
);

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_monthly_budgets_store_year_month ON monthly_budgets(store_id, year, month);
