import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import db from '../database.js';

const router = Router();

router.get('/', (req, res) => {
  const { store_id, week_start_date } = req.query;
  
  let query = 'SELECT * FROM weekly_publications WHERE 1=1';
  const params: any[] = [];
  
  // 店舗管理者は自店舗のみ
  if (req.session?.role === 'store_manager' && req.session?.storeId) {
    query += ' AND store_id = ?';
    params.push(req.session.storeId);
  } else if (store_id) {
    query += ' AND store_id = ?';
    params.push(store_id);
  }
  
  if (week_start_date) {
    query += ' AND week_start_date = ?';
    params.push(week_start_date);
  }
  
  query += ' ORDER BY week_start_date DESC';
  
  const publications = db.prepare(query).all(...params);
  res.json(publications);
});

// 週次公開設定
router.post('/', requireAuth, (req, res) => {
  const { store_id, week_start_date, is_published } = req.body;
  
  // 店舗管理者は自店舗のみ
  if (req.session?.role === 'store_manager' && req.session?.storeId !== store_id) {
    return res.status(403).json({ error: '他店舗のシフトは公開できません' });
  }
  
  try {
    // 既存レコード確認
    const existing = db.prepare(
      'SELECT * FROM weekly_publications WHERE store_id = ? AND week_start_date = ?'
    ).get(store_id, week_start_date) as any;
    
    if (existing) {
      // 更新
      db.prepare(`
        UPDATE weekly_publications 
        SET is_published = ?, published_at = ?, published_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        is_published ? 1 : 0,
        is_published ? new Date().toISOString() : null,
        req.session?.role || 'unknown',
        existing.id
      );
      
      const updated = db.prepare('SELECT * FROM weekly_publications WHERE id = ?').get(existing.id);
      res.json(updated);
    } else {
      // 新規作成
      const result = db.prepare(`
        INSERT INTO weekly_publications (store_id, week_start_date, is_published, published_at, published_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        store_id,
        week_start_date,
        is_published ? 1 : 0,
        is_published ? new Date().toISOString() : null,
        req.session?.role || 'unknown'
      );
      
      const newPublication = db.prepare('SELECT * FROM weekly_publications WHERE id = ?').get(result.lastInsertRowid);
      res.json(newPublication);
    }
  } catch (error: any) {
    console.error('週次公開設定エラー:', error);
    res.status(500).json({ error: '公開設定に失敗しました' });
  }
});

export default router;
