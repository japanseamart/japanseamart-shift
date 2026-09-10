import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Role, Store } from '../types';
import AdminLayout from '../components/AdminLayout';
import { getApiUrl } from '../config/api';

interface AdminDashboardProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

export default function AdminDashboard({ role, storeId, onLogout }: AdminDashboardProps) {
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [unsubmittedCount, setUnsubmittedCount] = useState(0);

  useEffect(() => {
    fetchStores();
    fetchUnsubmittedCount();
  }, []);

  const fetchStores = async () => {
    try {
      const res = await fetch(getApiUrl('/api/stores'));
      const data = await res.json();
      setStores(data);
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  };

  const fetchUnsubmittedCount = async () => {
    try {
      let url = '/api/submission-status/unsubmitted-count';
      if (role === 'store_manager' && storeId) {
        url += `?store_id=${storeId}`;
      }
      const res = await fetch(getApiUrl(url), { credentials: 'include' });
      const data = await res.json();
      setUnsubmittedCount(data.count || 0);
    } catch (error) {
      console.error('未提出者数取得エラー:', error);
    }
  };

  const roleDisplay = role === 'admin' ? '本部管理者' : '店舗責任者';
  const storeName = storeId ? stores.find(s => s.id === storeId)?.name : '';

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-ocean-600 to-ocean-700 text-white rounded-xl p-8 shadow-lg">
          <h1 className="text-3xl font-bold mb-2">管理者ダッシュボード</h1>
          <p className="text-ocean-100">
            {roleDisplay} {storeName && `- ${storeName}`}
          </p>
        </div>

        {/* クイックアクション */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => navigate('/admin/shifts')}
            className="card hover:shadow-xl transition-shadow p-6 text-left group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-ocean-100 rounded-lg group-hover:bg-ocean-200 transition-colors">
                <svg className="w-8 h-8 text-ocean-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-ocean-700">→</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">シフト作成</h3>
            <p className="text-sm text-gray-600">シフトの作成・編集</p>
          </button>

          <button
            onClick={() => navigate('/admin/shift-requests')}
            className="card hover:shadow-xl transition-shadow p-6 text-left group relative"
          >
            {unsubmittedCount > 0 && (
              <div className="absolute top-4 right-4 bg-fish-red text-white text-xs font-bold px-2 py-1 rounded-full">
                {unsubmittedCount}
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-fish-orange bg-opacity-20 rounded-lg group-hover:bg-opacity-30 transition-colors">
                <svg className="w-8 h-8 text-fish-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-fish-orange">→</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">シフト提出状況</h3>
            <p className="text-sm text-gray-600">未提出者: {unsubmittedCount}名</p>
          </button>

          <button
            onClick={() => navigate('/admin/employees')}
            className="card hover:shadow-xl transition-shadow p-6 text-left group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-fish-green bg-opacity-20 rounded-lg group-hover:bg-opacity-30 transition-colors">
                <svg className="w-8 h-8 text-fish-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-fish-green">→</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">従業員管理</h3>
            <p className="text-sm text-gray-600">従業員の追加・編集</p>
          </button>

          <button
            onClick={() => navigate('/admin/reports')}
            className="card hover:shadow-xl transition-shadow p-6 text-left group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                <svg className="w-8 h-8 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-purple-700">→</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">月間レポート</h3>
            <p className="text-sm text-gray-600">人件費・労働時間分析</p>
          </button>
        </div>

      </div>
    </AdminLayout>
  );
}
