import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import db from '../database.js';

const router = Router();

// 従業員一覧取得
router.get('/', (req, res) => {
  const { store_id } = req.query;
  let query = 'SELECT * FROM employees';
  let params: any[] = [];

  // 店舗管理者は自店舗のみ
  if (req.session?.role === 'store_manager' && req.session?.storeId) {
    query += ' WHERE store_id = ?';
    params.push(req.session.storeId);
  } else if (store_id) {
    query += ' WHERE store_id = ?';
    params.push(store_id);
  }

  query += ' ORDER BY store_id, name';
  const employees = db.prepare(query).all(...params);
  res.json(employees);
});

// 従業員詳細取得
router.get('/:id', (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id) as any;
  if (!employee) {
    return res.status(404).json({ error: '従業員が見つかりません' });
  }
  
  // 店舗管理者は自店舗の従業員のみ閲覧可能
  if (req.session?.role === 'store_manager' && req.session?.storeId !== employee.store_id) {
    return res.status(403).json({ error: '権限がありません' });
  }
  
  res.json(employee);
});

// 従業員追加
router.post('/', requireAuth, (req, res) => {
  const { name, store_id, employment_type, hourly_wage } = req.body;
  
  // 店舗責任者は自店舗のみ
  if (req.session.role === 'store_manager' && store_id !== req.session.storeId) {
    return res.status(403).json({ error: '他店舗の従業員は追加できません' });
  }

  const result = db.prepare(`
    INSERT INTO employees (name, store_id, employment_type, hourly_wage) 
    VALUES (?, ?, ?, ?)
  `).run(name, store_id, employment_type, hourly_wage);

  const newEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
  res.json(newEmployee);
});

// 従業員更新
router.put('/:id', requireAuth, (req, res) => {
  const { name, store_id, employment_type, hourly_wage } = req.body;
  
  // 店舗責任者は自店舗のみ
  if (req.session.role === 'store_manager' && store_id !== req.session.storeId) {
    return res.status(403).json({ error: '他店舗の従業員は編集できません' });
  }

  db.prepare(`
    UPDATE employees SET 
      name = ?, 
      store_id = ?,
      employment_type = ?,
      hourly_wage = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, store_id, employment_type, hourly_wage, req.params.id);

  const updatedEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  res.json(updatedEmployee);
});

// 従業員削除
router.delete('/:id', requireAuth, (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id) as any;
  
  // 店舗責任者は自店舗のみ
  if (req.session.role === 'store_manager' && employee.store_id !== req.session.storeId) {
    return res.status(403).json({ error: '他店舗の従業員は削除できません' });
  }

  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
