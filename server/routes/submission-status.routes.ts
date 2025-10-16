import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import db from '../database.js';

const router = Router();

router.get('/unsubmitted-count', requireAuth, (req, res) => {
  const { store_id } = req.query;
  
  try {
    // 対象店舗の従業員数を取得
    let employeeQuery = 'SELECT COUNT(*) as total FROM employees WHERE 1=1';
    const employeeParams: any[] = [];
    
    if (store_id) {
      employeeQuery += ' AND store_id = ?';
      employeeParams.push(store_id);
    } else if (req.session.role === 'store_manager' && req.session.storeId) {
      employeeQuery += ' AND store_id = ?';
      employeeParams.push(req.session.storeId);
    }
    
    const totalEmployees = db.prepare(employeeQuery).get(...employeeParams) as any;
    
    // 今週の日付範囲を計算（次週を対象とする）
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(nextWeek);
    startOfWeek.setDate(nextWeek.getDate() - nextWeek.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    const startDate = startOfWeek.toISOString().split('T')[0];
    const endDate = endOfWeek.toISOString().split('T')[0];
    
    // 完全に提出している従業員数を取得（7日分全て提出）
    let submittedQuery = `
      SELECT employee_id, COUNT(DISTINCT date) as submitted_days
      FROM shift_requests
      WHERE date BETWEEN ? AND ?
    `;
    const submittedParams: any[] = [startDate, endDate];
    
    if (store_id) {
      submittedQuery += ' AND store_id = ?';
      submittedParams.push(store_id);
    } else if (req.session.role === 'store_manager' && req.session.storeId) {
      submittedQuery += ' AND store_id = ?';
      submittedParams.push(req.session.storeId);
    }
    
    submittedQuery += ' GROUP BY employee_id HAVING submitted_days = 7';
    
    const fullySubmitted = db.prepare(submittedQuery).all(...submittedParams);
    
    const unsubmittedCount = totalEmployees.total - fullySubmitted.length;
    
    res.json({ count: unsubmittedCount, total: totalEmployees.total });
  } catch (error) {
    console.error('未提出者数取得エラー:', error);
    res.status(500).json({ error: '未提出者数の取得に失敗しました' });
  }
});

export default router;
