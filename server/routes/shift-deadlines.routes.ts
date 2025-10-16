import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import db from '../database.js';

const router = Router();

router.get('/', (req, res) => {
  const { store_id, target_month } = req.query;
  
  let query = 'SELECT * FROM shift_deadlines WHERE 1=1';
  const params: any[] = [];
  
  // 店舗管理者は自店舗のみ
  if (req.session?.role === 'store_manager' && req.session?.storeId) {
    query += ' AND store_id = ?';
    params.push(req.session.storeId);
  } else if (store_id) {
    query += ' AND store_id = ?';
    params.push(store_id);
  }
  
  if (target_month) {
    query += ' AND target_month = ?';
    params.push(target_month);
  }
  
  const deadlines = db.prepare(query).all(...params);
  res.json(deadlines);
});

// シフト締切追加
router.post('/', requireAuth, (req, res) => {
  const { store_id, target_month, deadline_date } = req.body;
  
  try {
    const result = db.prepare(`
      INSERT INTO shift_deadlines (store_id, target_month, deadline_date)
      VALUES (?, ?, ?)
    `).run(store_id, target_month, deadline_date);
    
    const newDeadline = db.prepare('SELECT * FROM shift_deadlines WHERE id = ?').get(result.lastInsertRowid);
    
    // 店舗情報を取得
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id) as any;
    
    // お知らせを自動作成
    if (store && req.session.role === 'admin') {
      const deadlineFormatted = new Date(deadline_date).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const targetMonthFormatted = new Date(target_month + '-01').toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long'
      });
      
      const title = `【${store.name}】シフト希望提出締切のお知らせ`;
      const content = `${store.name}の${targetMonthFormatted}分のシフト希望提出締切が設定されました。\n締切日: ${deadlineFormatted}\n期限までに必ずシフト希望を提出してください。`;
      
      db.prepare(`
        INSERT INTO announcements (title, content, is_active) VALUES (?, ?, 1)
      `).run(title, content);
    }
    
    res.json(newDeadline);
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'この店舗・月の締切は既に設定されています' });
    } else {
      res.status(500).json({ error: '締切の追加に失敗しました' });
    }
  }
});

// シフト締切更新
router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { deadline_date } = req.body;
  
  // 更新前の締切情報を取得
  const oldDeadline = db.prepare('SELECT * FROM shift_deadlines WHERE id = ?').get(id) as any;
  
  db.prepare('UPDATE shift_deadlines SET deadline_date = ? WHERE id = ?').run(deadline_date, id);
  
  const updated = db.prepare('SELECT * FROM shift_deadlines WHERE id = ?').get(id) as any;
  
  // 締切日が変更された場合、お知らせを自動作成
  if (oldDeadline && oldDeadline.deadline_date !== deadline_date && req.session.role === 'admin') {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(updated.store_id) as any;
    
    if (store) {
      const deadlineFormatted = new Date(deadline_date).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const targetMonthFormatted = new Date(updated.target_month + '-01').toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long'
      });
      
      const title = `【${store.name}】シフト希望提出締切の変更`;
      const content = `${store.name}の${targetMonthFormatted}分のシフト希望提出締切が変更されました。\n新しい締切日: ${deadlineFormatted}\n期限までに必ずシフト希望を提出してください。`;
      
      db.prepare(`
        INSERT INTO announcements (title, content, is_active) VALUES (?, ?, 1)
      `).run(title, content);
    }
  }
  
  res.json(updated);
});

// シフト締切削除
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  db.prepare('DELETE FROM shift_deadlines WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
