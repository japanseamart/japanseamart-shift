import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../database.js';

/**
 * ログイン処理
 */
export const login = (req: Request, res: Response) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'パスワードを入力してください' });
  }

  // 本部管理者チェック
  const adminPassword = db.prepare('SELECT * FROM passwords WHERE role = ?').get('admin') as any;
  if (adminPassword && bcrypt.compareSync(password, adminPassword.password_hash)) {
    req.session.role = 'admin';
    req.session.storeId = null;
    req.session.autoLogoutMinutes = adminPassword.auto_logout_minutes || 5;
    req.session.lastActivity = Date.now();
    return res.json({ 
      role: 'admin', 
      storeId: null,
      autoLogoutMinutes: adminPassword.auto_logout_minutes || 5
    });
  }

  // 店舗責任者チェック
  const storePasswords = db.prepare('SELECT * FROM passwords WHERE role = ?').all('store_manager') as any[];
  for (const storePassword of storePasswords) {
    if (bcrypt.compareSync(password, storePassword.password_hash)) {
      req.session.role = 'store_manager';
      req.session.storeId = storePassword.store_id;
      req.session.autoLogoutMinutes = storePassword.auto_logout_minutes || 5;
      req.session.lastActivity = Date.now();
      return res.json({ 
        role: 'store_manager', 
        storeId: storePassword.store_id,
        autoLogoutMinutes: storePassword.auto_logout_minutes || 5
      });
    }
  }

  res.status(401).json({ error: 'パスワードが正しくありません' });
};

/**
 * ログアウト処理
 */
export const logout = (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'ログアウトに失敗しました' });
    }
    res.json({ success: true });
  });
};

/**
 * セッション確認
 */
export const getSession = (req: Request, res: Response) => {
  if (req.session.role) {
    const autoLogoutMinutes = req.session.autoLogoutMinutes || 5;
    return res.json({ 
      role: req.session.role, 
      storeId: req.session.storeId,
      autoLogoutMinutes
    });
  }
  res.json({ role: null, storeId: null });
};
