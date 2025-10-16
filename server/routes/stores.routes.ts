import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import db from '../database.js';

const router = Router();

// 店舗一覧取得
router.get('/', (req, res) => {
  const stores = db.prepare('SELECT * FROM stores ORDER BY id').all();
  res.json(stores);
});

// 店舗詳細取得
router.get('/:id', (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) {
    return res.status(404).json({ error: '店舗が見つかりません' });
  }
  res.json(store);
});

// 店舗追加
router.post('/', requireAuth, (req, res) => {
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
router.put('/:id', requireAuth, (req, res) => {
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
router.delete('/:id', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '権限がありません' });
  }

  db.prepare('DELETE FROM stores WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
