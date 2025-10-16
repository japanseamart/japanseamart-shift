import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Role, Announcement, Store } from '../types';
import AdminLayout from '../components/AdminLayout';
import { getApiUrl } from '../config/api';

interface AdminDashboardProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

export default function AdminDashboard({ role, storeId, onLogout }: AdminDashboardProps) {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [unsubmittedCount, setUnsubmittedCount] = useState(0);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', content: '' });
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);

  useEffect(() => {
    fetchAnnouncements();
    fetchStores();
    fetchUnsubmittedCount();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch(getApiUrl('/api/announcements'));
      const data = await res.json();
      setAnnouncements(data);
    } catch (error) {
      console.error('お知らせ取得エラー:', error);
    }
  };

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

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const res = await fetch(getApiUrl('/api/announcements'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newAnnouncement),
      });

      if (res.ok) {
        setNewAnnouncement({ title: '', content: '' });
        setShowAnnouncementForm(false);
        fetchAnnouncements();
      }
    } catch (error) {
      console.error('お知らせ投稿エラー:', error);
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
            <h3 className="text-lg font-semibold text-gray-800 mb-1">シフト管理</h3>
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

        {/* お知らせセクション */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
              <svg className="w-6 h-6 mr-2 text-ocean-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
              本部からのお知らせ
            </h2>
            {role === 'admin' && (
              <button
                onClick={() => setShowAnnouncementForm(!showAnnouncementForm)}
                className="btn-primary"
              >
                {showAnnouncementForm ? 'キャンセル' : '+ 新規投稿'}
              </button>
            )}
          </div>

          {/* お知らせ投稿フォーム */}
          {showAnnouncementForm && role === 'admin' && (
            <form onSubmit={handleCreateAnnouncement} className="mb-6 p-4 bg-ocean-50 rounded-lg">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">タイトル</label>
                <input
                  type="text"
                  value={newAnnouncement.title}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">内容</label>
                <textarea
                  value={newAnnouncement.content}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                  className="input-field"
                  rows={4}
                  required
                />
              </div>
              <button type="submit" className="btn-primary">投稿する</button>
            </form>
          )}

          {/* お知らせ一覧 */}
          <div className="space-y-4">
            {announcements.length === 0 ? (
              <p className="text-gray-500 text-center py-8">お知らせはありません</p>
            ) : (
              announcements.map((announcement) => (
                <div key={announcement.id} className="border-l-4 border-ocean-500 bg-ocean-50 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-800 mb-2">{announcement.title}</h3>
                  <p className="text-gray-600 text-sm whitespace-pre-wrap">{announcement.content}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(announcement.created_at).toLocaleString('ja-JP')}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
