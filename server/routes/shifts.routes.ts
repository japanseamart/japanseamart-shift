import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import db from '../database.js';

const router = Router();

router.get('/', (req, res) => {
  const { store_id, start_date, end_date, employee_id } = req.query;
  let query = 'SELECT * FROM shifts WHERE 1=1';
  let params: any[] = [];

  // 店舗管理者は自店舗のみ
  if (req.session?.role === 'store_manager' && req.session?.storeId) {
    query += ' AND store_id = ?';
    params.push(req.session.storeId);
  } else if (store_id) {
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
router.post('/', requireAuth, (req, res) => {
  let { employee_id, store_id, date, start_time, end_time, break_minutes } = req.body;
  
  // 店舗責任者は自店舗のみ
  if (req.session.role === 'store_manager' && store_id !== req.session.storeId) {
    return res.status(403).json({ error: '他店舗のシフトは追加できません' });
  }

  // 休憩時間の自動計算（6時間以上の場合は60分）
  const [startHour, startMin] = start_time.split(':').map(Number);
  const [endHour, endMin] = end_time.split(':').map(Number);
  const workMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  
  // break_minutesが未指定または0の場合、6時間以上なら自動的に60分付与
  if (!break_minutes && workMinutes >= 360) {
    break_minutes = 60;
  }

  // 人件費計算
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee_id) as any;
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id) as any;
  
  let laborCost = 0;
  if (employee.employment_type !== 'full_time' && employee.hourly_wage) {
    const totalMinutes = workMinutes - (break_minutes || 0);
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
router.put('/:id', requireAuth, (req, res) => {
  let { employee_id, store_id, date, start_time, end_time, break_minutes } = req.body;
  
  // 店舗責任者は自店舗のみ
  if (req.session.role === 'store_manager' && store_id !== req.session.storeId) {
    return res.status(403).json({ error: '他店舗のシフトは編集できません' });
  }

  // 変更前データ取得
  const beforeShift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id);

  // 休憩時間の自動計算（6時間以上の場合は60分）
  const [startHour, startMin] = start_time.split(':').map(Number);
  const [endHour, endMin] = end_time.split(':').map(Number);
  const workMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  
  // break_minutesが未指定または0の場合、6時間以上なら自動的に60分付与
  if (!break_minutes && workMinutes >= 360) {
    break_minutes = 60;
  }

  // 人件費再計算
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee_id) as any;
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id) as any;
  
  let laborCost = 0;
  if (employee.employment_type !== 'full_time' && employee.hourly_wage) {
    const totalMinutes = workMinutes - (break_minutes || 0);
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
router.delete('/:id', requireAuth, (req, res) => {
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
router.get('/stats/monthly', (req, res) => {
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

  // 店舗管理者は自店舗のみ
  if (req.session?.role === 'store_manager' && req.session?.storeId) {
    query += ' AND store_id = ?';
    params.push(req.session.storeId);
  } else if (store_id) {
    query += ' AND store_id = ?';
    params.push(store_id);
  }

  query += ' GROUP BY date ORDER BY date';

  const dailyStats = db.prepare(query).all(...params);
  res.json(dailyStats);
});

export default router;
