import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import db from '../database.js';

const router = Router();

// 特別日一覧
router.get('/', (req, res) => {
  const specialDays = db.prepare('SELECT * FROM special_days ORDER BY date').all();
  res.json(specialDays);
});

// 特別日追加
router.post('/', requireAuth, (req, res) => {
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
router.delete('/:id', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '権限がありません' });
  }

  db.prepare('DELETE FROM special_days WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
