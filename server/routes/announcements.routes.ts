import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import db from '../database.js';

const router = Router();

router.get('/', (req, res) => {
  const { active_only } = req.query;
  let query = 'SELECT * FROM announcements';
  
  if (active_only === 'true') {
    query += ' WHERE is_active = 1';
  }
  
  query += ' ORDER BY created_at DESC';
  
  const announcements = db.prepare(query).all();
  res.json(announcements);
});

// お知らせ追加
router.post('/', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '権限がありません' });
  }

  const { title, content, is_active } = req.body;
  
  const result = db.prepare(`
    INSERT INTO announcements (title, content, is_active) VALUES (?, ?, ?)
  `).run(title, content, is_active !== undefined ? is_active : 1);

  const newAnnouncement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(result.lastInsertRowid);
  res.json(newAnnouncement);
});

// お知らせ更新
router.put('/:id', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '権限がありません' });
  }

  const { id } = req.params;
  const { title, content, is_active } = req.body;
  
  db.prepare(`
    UPDATE announcements SET title = ?, content = ?, is_active = ? WHERE id = ?
  `).run(title || null, content || null, is_active !== undefined ? is_active : 1, id);
  
  const updated = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  res.json(updated);
});

// お知らせ削除
router.delete('/:id', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '権限がありません' });
  }

  const { id } = req.params;
  db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
