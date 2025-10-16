import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import db from '../database.js';

const router = Router();

router.post('/change', requireAuth, (req, res) => {
  const { role: targetRole, store_id, new_password, auto_logout_minutes } = req.body;
  
  if (!new_password || new_password.length < 4) {
    return res.status(400).json({ error: 'パスワードは4文字以上で設定してください' });
  }
  
  // 自動ログアウト時間のバリデーション（指定された場合のみ）
  if (auto_logout_minutes !== undefined && (auto_logout_minutes < 1 || auto_logout_minutes > 120)) {
    return res.status(400).json({ error: '自動ログアウト時間は1～120分の範囲で設定してください' });
  }
  
  // 権限チェック
  if (targetRole === 'admin' && req.session.role !== 'admin') {
    return res.status(403).json({ error: '本部管理者パスワードは本部管理者のみ変更できます' });
  }
  
  if (targetRole === 'store_manager') {
    // 店舗責任者は自店舗のみ変更可能
    if (req.session.role === 'store_manager' && req.session.storeId !== store_id) {
      return res.status(403).json({ error: '他店舗のパスワードは変更できません' });
    }
  }
  
  try {
    const hashedPassword = bcrypt.hashSync(new_password, 10);
    
    if (targetRole === 'admin') {
      // 本部管理者パスワード更新（auto_logout_minutesも含める）
      if (auto_logout_minutes !== undefined) {
        db.prepare(`
          UPDATE passwords SET password_hash = ?, auto_logout_minutes = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE role = 'admin'
        `).run(hashedPassword, auto_logout_minutes);
      } else {
        db.prepare(`
          UPDATE passwords SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE role = 'admin'
        `).run(hashedPassword);
      }
    } else {
      // 店舗責任者パスワード更新
      db.prepare(`
        UPDATE passwords SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE role = 'store_manager' AND store_id = ?
      `).run(hashedPassword, store_id);
    }
    
    res.json({ success: true, message: 'パスワードを変更しました' });
  } catch (error) {
    console.error('パスワード変更エラー:', error);
    res.status(500).json({ error: 'パスワード変更に失敗しました' });
  }
});

export default router;
