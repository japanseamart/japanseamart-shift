-- シフト提出期限テーブルの拡張
-- 前半/後半の区別と、変更通知のためのカラムを追加

-- 既存のテーブルをドロップして再作成（SQLiteはALTER TABLE ADD COLUMNの制限がある）
DROP TABLE IF EXISTS shift_deadlines;

CREATE TABLE IF NOT EXISTS shift_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  target_year INTEGER NOT NULL,
  target_month INTEGER NOT NULL,
  target_period TEXT NOT NULL CHECK(target_period IN ('first', 'second')), -- 'first' = 前半(1-15日), 'second' = 後半(16日以降)
  deadline_date TEXT NOT NULL,
  notification_message TEXT, -- カスタム告知メッセージ（オプション）
  is_changed INTEGER DEFAULT 0, -- 変更されたかどうか（従業員への再告知用）
  change_count INTEGER DEFAULT 0, -- 変更回数
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  UNIQUE(store_id, target_year, target_month, target_period)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_shift_deadlines_store_period ON shift_deadlines(store_id, target_year, target_month, target_period);
