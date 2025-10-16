import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import db from '../database.js';

const router = Router();

router.get('/', (req, res) => {
  const { employee_id, store_id, start_date, end_date, status } = req.query;
  
  let query = 'SELECT * FROM shift_requests WHERE 1=1';
  const params: any[] = [];
  
  if (employee_id) {
    query += ' AND employee_id = ?';
    params.push(employee_id);
  }
  
  if (store_id) {
    query += ' AND store_id = ?';
    params.push(store_id);
  }
  
  if (start_date && end_date) {
    query += ' AND date BETWEEN ? AND ?';
    params.push(start_date, end_date);
  }
  
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY date ASC';
  
  const requests = db.prepare(query).all(...params);
  res.json(requests);
});

// シフト希望追加
router.post('/', (req, res) => {
  const { employee_id, store_id, date, patterns, custom_start, custom_end } = req.body;
  
  try {
    const result = db.prepare(`
      INSERT INTO shift_requests (employee_id, store_id, date, patterns, custom_start, custom_end)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(employee_id, store_id, date, patterns, custom_start, custom_end);
    
    const newRequest = db.prepare('SELECT * FROM shift_requests WHERE id = ?').get(result.lastInsertRowid);
    res.json(newRequest);
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'この日付のシフト希望は既に提出されています' });
    } else {
      res.status(500).json({ error: 'シフト希望の追加に失敗しました' });
    }
  }
});

// シフト希望更新
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { patterns, custom_start, custom_end } = req.body;
  
  db.prepare(`
    UPDATE shift_requests 
    SET patterns = ?, custom_start = ?, custom_end = ?, submitted_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(patterns, custom_start, custom_end, id);
  
  const updated = db.prepare('SELECT * FROM shift_requests WHERE id = ?').get(id);
  res.json(updated);
});

// シフト希望承認/却下
router.patch('/:id/review', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'approved' or 'rejected'
  
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: '無効なステータスです' });
  }
  
  db.prepare(`
    UPDATE shift_requests 
    SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
    WHERE id = ?
  `).run(status, req.session.storeId || 0, id);
  
  const updated = db.prepare('SELECT * FROM shift_requests WHERE id = ?').get(id);
  res.json(updated);
});

// シフト希望削除
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  
  db.prepare('DELETE FROM shift_requests WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
