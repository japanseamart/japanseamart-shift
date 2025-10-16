import { Request, Response, NextFunction } from 'express';

// セッション型定義の拡張
declare module 'express-session' {
  interface SessionData {
    role: 'admin' | 'store_manager' | null;
    storeId: number | null;
    lastActivity: number;
    autoLogoutMinutes: number;
  }
}

/**
 * 認証ミドルウェア
 * ログイン状態と自動ログアウトをチェック
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.role) {
    return res.status(401).json({ error: '認証が必要です' });
  }
  
  // 自動ログアウトチェック
  const now = Date.now();
  const lastActivity = req.session.lastActivity || now;
  const autoLogoutMs = 5 * 60 * 1000; // デフォルト5分
  
  if (now - lastActivity > autoLogoutMs) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'セッションがタイムアウトしました' });
  }
  
  req.session.lastActivity = now;
  next();
};

/**
 * 本部管理者のみアクセス可能
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '本部管理者権限が必要です' });
  }
  next();
};

/**
 * 店舗管理者以上（本部管理者 or 店舗責任者）がアクセス可能
 */
export const requireStoreManager = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.role || (req.session.role !== 'admin' && req.session.role !== 'store_manager')) {
    return res.status(403).json({ error: '管理者権限が必要です' });
  }
  next();
};
