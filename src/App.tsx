import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Role } from './types';

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

function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // セッション確認
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/auth/session', {
        credentials: 'include',
      });
      const data = await res.json();
      setRole(data.role);
      setStoreId(data.storeId);
    } catch (error) {
      console.error('セッション確認エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (password: string) => {
    try {
      const res = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const data = await res.json();
        setRole(data.role);
        setStoreId(data.storeId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('ログインエラー:', error);
      return false;
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('http://localhost:3001/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      setRole(null);
      setStoreId(null);
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

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

        {/* デフォルトルート */}
        <Route path="/" element={<Navigate to="/employee/shift" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
