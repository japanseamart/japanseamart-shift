import { useState, useEffect } from 'react';
import { Role, Announcement } from '../types';
import AdminLayout from '../components/AdminLayout';

interface AnnouncementManagementProps {
  role: Role;
  onLogout: () => void;
}

export default function AnnouncementManagement({ role, onLogout }: AnnouncementManagementProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    is_active: 1
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch('/api/announcements');
      const data = await res.json();
      setAnnouncements(data);
    } catch (error) {
      console.error('お知らせ取得エラー:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingAnnouncement) {
        // 更新
        await fetch(`/api/announcements/${editingAnnouncement.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(formData)
        });
      } else {
        // 新規作成
        await fetch('/api/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(formData)
        });
      }

      setFormData({ title: '', content: '', is_active: 1 });
      setShowForm(false);
      setEditingAnnouncement(null);
      fetchAnnouncements();
    } catch (error) {
      console.error('お知らせ保存エラー:', error);
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      is_active: announcement.is_active
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('このお知らせを削除しますか?')) return;

    try {
      await fetch(`/api/announcements/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      fetchAnnouncements();
    } catch (error) {
      console.error('お知らせ削除エラー:', error);
    }
  };

  const toggleActive = async (id: number, currentStatus: number) => {
    try {
      await fetch(`/api/announcements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: currentStatus === 1 ? 0 : 1 })
      });
      fetchAnnouncements();
    } catch (error) {
      console.error('ステータス変更エラー:', error);
    }
  };

  return (
    <AdminLayout role={role} storeId={null} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">お知らせ管理</h1>
          <button
            onClick={() => {
              setShowForm(true);
              setEditingAnnouncement(null);
              setFormData({ title: '', content: '', is_active: 1 });
            }}
            className="btn-primary"
          >
            + 新規お知らせ
          </button>
        </div>

        {showForm && (
          <div className="card">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              {editingAnnouncement ? 'お知らせ編集' : '新規お知らせ'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  タイトル
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  内容
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="input-field"
                  rows={5}
                  required
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active === 1}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked ? 1 : 0 })}
                  className="mr-2"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">
                  有効にする
                </label>
              </div>

              <div className="flex gap-2">
                <button type="submit" className="btn-primary">
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingAnnouncement(null);
                  }}
                  className="btn-secondary"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="card">
          <h2 className="text-lg font-bold text-gray-800 mb-4">お知らせ一覧</h2>
          
          {announcements.length === 0 ? (
            <p className="text-gray-500 text-center py-8">お知らせがありません</p>
          ) : (
            <div className="space-y-4">
              {announcements.map(announcement => (
                <div
                  key={announcement.id}
                  className={`border rounded-lg p-4 ${
                    announcement.is_active === 1 ? 'border-gray-200' : 'border-gray-300 bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-800">{announcement.title}</h3>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            announcement.is_active === 1
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {announcement.is_active === 1 ? '有効' : '無効'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">
                        {announcement.content}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        作成日時: {new Date(announcement.created_at).toLocaleString('ja-JP')}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => toggleActive(announcement.id, announcement.is_active)}
                        className="text-sm px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
                      >
                        {announcement.is_active === 1 ? '無効化' : '有効化'}
                      </button>
                      <button
                        onClick={() => handleEdit(announcement)}
                        className="text-sm px-3 py-1 rounded bg-ocean-100 text-ocean-700 hover:bg-ocean-200 transition-colors"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(announcement.id)}
                        className="text-sm px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
