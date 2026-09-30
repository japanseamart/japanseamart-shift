-- 公休を明示的に記録できるようにする
-- shift_type: 'work' = 通常勤務(既定), 'holiday' = 公休
ALTER TABLE shifts ADD COLUMN shift_type TEXT NOT NULL DEFAULT 'work'
  CHECK(shift_type IN ('work','holiday'));

-- 集計高速化のためのインデックス
CREATE INDEX IF NOT EXISTS idx_shifts_employee_date_type
  ON shifts(employee_id, date, shift_type);
