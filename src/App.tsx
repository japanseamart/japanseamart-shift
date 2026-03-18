import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Role } from './types';
import { getApiUrl } from './config/api';

// Pages
import EmployeeShiftView from './pages/EmployeeShiftView';
import EmployeeShiftRequest from './pages/EmployeeShiftRequest';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import StoreManagement from './pages/StoreManagement';
import EmployeeManagement from './pages/EmployeeManagement';
import ShiftManagement from './pages/ShiftManagement';
import ShiftRequestManagement from './pages/ShiftRequestManagement';
import MonthlyReport from './pages/MonthlyReport';
import SpecialDayManagement from './pages/SpecialDayManagement';
import AnnouncementManagement from './pages/AnnouncementManagement';
import PasswordManagement from './pages/PasswordManagement';
import StoreRanking from './pages/StoreRanking';
import OtherStoreShifts from './pages/OtherStoreShifts';
import PublicationStatus from './pages/PublicationStatus';
import BudgetManagement from './pages/BudgetManagement';

function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState<number>(5);
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // セッション確認
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      // ログアウトフラグをチェック（セキュリティ確保のため）
      const hasLoggedOut = localStorage.getItem('hasLoggedOut');
      
      if (hasLoggedOut === 'true') {
        // ログアウト済みの場合は自動ログイン（セッション復元）をしない
        setLoading(false);
        return;
      }
      
      const res = await fetch(getApiUrl('/api/session'), {
        credentials: 'include',
      });
      const data = await res.json();
      setRole(data.role);
      setStoreId(data.storeId);
      if (data.autoLogoutMinutes) {
        setAutoLogoutMinutes(data.autoLogoutMinutes);
      }
    } catch (error) {
      console.error('セッション確認エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (password: string) => {
    try {
      const res = await fetch(getApiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const data = await res.json();
        setRole(data.role);
        setStoreId(data.storeId);
        
        // ログイン成功時にログアウトフラグをクリア
        localStorage.removeItem('hasLoggedOut');
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('ログインエラー:', error);
      return false;
    }
  };

  const handleLogout = async (auto = false) => {
    try {
      await fetch(getApiUrl('/api/logout'), {
        method: 'POST',
        credentials: 'include',
      });
      
      // 状態をクリア
      setRole(null);
      setStoreId(null);
      
      // セキュリティのため、ログアウトフラグを設定（再ログイン必須にする）
      localStorage.setItem('hasLoggedOut', 'true');
      
      // セッションストレージもクリア（タブを閉じてもログイン状態を保持しない）
      sessionStorage.clear();
      
      // すべてのCookieをクリア（念のため）
      document.cookie.split(";").forEach(cookie => {
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      });
      
      // 自動ログアウトの場合は通知
      if (auto) {
        alert('無操作のため自動的にログアウトしました');
      }
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

  // 自動ログアウトタイマーをリセット
  const resetLogoutTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
    }
    
    if (role) {
      logoutTimerRef.current = setTimeout(() => {
        handleLogout(true);
      }, autoLogoutMinutes * 60 * 1000);
    }
  }, [role, autoLogoutMinutes]);

  // ユーザー操作を検知
  useEffect(() => {
    if (!role) return;

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetLogoutTimer();
    };

    // イベントリスナーを登録
    events.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    // 初期タイマー設定
    resetLogoutTimer();

    // クリーンアップ
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
      }
    };
  }, [role, resetLogoutTimer]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ocean-50 to-ocean-100">
        <div className="text-ocean-700 text-xl">読み込み中...</div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* 従業員向けページ（認証不要） */}
        <Route path="/employee/shift" element={<EmployeeShiftView />} />
        <Route path="/employee/request" element={<EmployeeShiftRequest />} />

        {/* 管理者ログイン */}
        <Route 
          path="/admin/login" 
          element={
            role ? <Navigate to="/admin" replace /> : <Login onLogin={handleLogin} />
          } 
        />

        {/* 管理者ページ（認証必要） */}
        <Route
          path="/admin"
          element={
            role ? (
              <AdminDashboard role={role} storeId={storeId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/stores"
          element={
            role ? (
              <StoreManagement role={role} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/employees"
          element={
            role ? (
              <EmployeeManagement role={role} storeId={storeId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/shifts"
          element={
            role ? (
              <ShiftManagement role={role} storeId={storeId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/shift-requests"
          element={
            role ? (
              <ShiftRequestManagement role={role} storeId={storeId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/other-shifts"
          element={
            role ? (
              <OtherStoreShifts role={role} storeId={storeId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/publication-status"
          element={
            role === 'admin' ? (
              <PublicationStatus role={role} storeId={storeId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/budgets"
          element={
            role === 'admin' ? (
              <BudgetManagement role={role} storeId={storeId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/reports"
          element={
            role ? (
              <MonthlyReport role={role} storeId={storeId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/special-days"
          element={
            role ? (
              <SpecialDayManagement role={role} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/announcements"
          element={
            role ? (
              <AnnouncementManagement role={role} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/passwords"
          element={
            role ? (
              <PasswordManagement role={role} storeId={storeId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/ranking"
          element={
            role ? (
              <StoreRanking role={role} storeId={storeId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />

        {/* デフォルトルート */}
        <Route path="/" element={<Navigate to="/employee/shift" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
