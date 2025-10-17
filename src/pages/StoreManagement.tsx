import { useState, useEffect } from 'react';
import { Role, Store } from '../types';
import AdminLayout from '../components/AdminLayout';
import { getApiUrl } from '../config/api';

interface StoreManagementProps {
  role: Role;
  onLogout: () => void;
}

export default function StoreManagement({ role, onLogout }: StoreManagementProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    monthly_budget: 0,
    password: '',
    overtime_rate_enabled: true,
    saturday_rate: 0,
    sunday_rate: 0,
    holiday_rate: 0,
    business_hours_start: '07:00',
    business_hours_end: '22:00',
    morning_start: '07:00',
    morning_end: '12:00',
    afternoon_start: '12:00',
    afternoon_end: '17:00',
    evening_start: '17:00',
    evening_end: '22:00',
  });

  useEffect(() => {
    fetchStores();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingStore
        ? `/api/stores/${editingStore.id}`
        : '/api/stores';
      
      const method = editingStore ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        fetchStores();
        resetForm();
      }
    } catch (error) {
      console.error('店舗保存エラー:', error);
    }
  };

  const handleEdit = (store: Store) => {
    setEditingStore(store);
    setFormData({
      name: store.name,
      monthly_budget: store.monthly_budget,
      password: '', // 編集時はパスワードフィールドを空にする
      overtime_rate_enabled: Boolean(store.overtime_rate_enabled),
      saturday_rate: store.saturday_rate,
      sunday_rate: store.sunday_rate,
      holiday_rate: store.holiday_rate,
      business_hours_start: store.business_hours_start,
      business_hours_end: store.business_hours_end,
      morning_start: store.morning_start,
      morning_end: store.morning_end,
      afternoon_start: store.afternoon_start,
      afternoon_end: store.afternoon_end,
      evening_start: store.evening_start,
      evening_end: store.evening_end,
    });
    setIsCreating(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('この店舗を削除してもよろしいですか？')) return;

    try {
      const res = await fetch(getApiUrl(`/api/stores/${id}`), {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        fetchStores();
      }
    } catch (error) {
      console.error('店舗削除エラー:', error);
    }
  };

  const resetForm = () => {
    setIsCreating(false);
    setEditingStore(null);
    setFormData({
      name: '',
      monthly_budget: 0,
      password: '',
      overtime_rate_enabled: true,
      saturday_rate: 0,
      sunday_rate: 0,
      holiday_rate: 0,
      business_hours_start: '07:00',
      business_hours_end: '22:00',
      morning_start: '07:00',
      morning_end: '12:00',
      afternoon_start: '12:00',
      afternoon_end: '17:00',
      evening_start: '17:00',
      evening_end: '22:00',
    });
  };

  if (role !== 'admin') {
    return (
      <AdminLayout role={role} storeId={null} onLogout={onLogout}>
        <div className="card text-center py-12">
          <p className="text-red-600 text-lg">この機能は本部管理者のみアクセス可能です</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout role={role} storeId={null} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-800">店舗管理</h1>
          <button
            onClick={() => setIsCreating(true)}
            className="btn-primary"
          >
            + 新規店舗追加
          </button>
        </div>

        {/* 店舗フォーム */}
        {isCreating && (
          <div className="card">
            <h2 className="text-xl font-bold text-gray-800 mb-6">
              {editingStore ? '店舗編集' : '新規店舗追加'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 基本情報 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    店舗名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    月間予算（円）
                  </label>
                  <input
                    type="number"
                    value={formData.monthly_budget}
                    onChange={(e) => setFormData({ ...formData, monthly_budget: Number(e.target.value) })}
                    className="input-field"
                    min="0"
                  />
                </div>
              </div>

              {/* パスワード設定 */}
              {!editingStore && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    店舗責任者パスワード <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="input-field"
                    placeholder="新規店舗のログインパスワードを設定"
                    required={!editingStore}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    ログインID: store{stores.length + 1} / パスワード: 上記で設定したパスワード
                  </p>
                </div>
              )}

              {/* 営業時間設定 */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">営業時間設定</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">営業開始時間</label>
                    <input
                      type="time"
                      value={formData.business_hours_start}
                      onChange={(e) => setFormData({ ...formData, business_hours_start: e.target.value })}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">営業終了時間</label>
                    <input
                      type="time"
                      value={formData.business_hours_end}
                      onChange={(e) => setFormData({ ...formData, business_hours_end: e.target.value })}
                      className="input-field"
                    />
                  </div>
                </div>
              </div>

              {/* シフトパターン時間設定 */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">シフトパターン時間設定</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">午前</label>
                    <div className="flex gap-2">
                      <input
                        type="time"
                        value={formData.morning_start}
                        onChange={(e) => setFormData({ ...formData, morning_start: e.target.value })}
                        className="input-field"
                      />
                      <span className="flex items-center">〜</span>
                      <input
                        type="time"
                        value={formData.morning_end}
                        onChange={(e) => setFormData({ ...formData, morning_end: e.target.value })}
                        className="input-field"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">午後</label>
                    <div className="flex gap-2">
                      <input
                        type="time"
                        value={formData.afternoon_start}
                        onChange={(e) => setFormData({ ...formData, afternoon_start: e.target.value })}
                        className="input-field"
                      />
                      <span className="flex items-center">〜</span>
                      <input
                        type="time"
                        value={formData.afternoon_end}
                        onChange={(e) => setFormData({ ...formData, afternoon_end: e.target.value })}
                        className="input-field"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">夕方</label>
                    <div className="flex gap-2">
                      <input
                        type="time"
                        value={formData.evening_start}
                        onChange={(e) => setFormData({ ...formData, evening_start: e.target.value })}
                        className="input-field"
                      />
                      <span className="flex items-center">〜</span>
                      <input
                        type="time"
                        value={formData.evening_end}
                        onChange={(e) => setFormData({ ...formData, evening_end: e.target.value })}
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 特別日加算時給設定 */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">特別日（祝日など）</h3>
                <div className="mb-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.overtime_rate_enabled}
                      onChange={(e) => setFormData({ ...formData, overtime_rate_enabled: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">特別日加算を有効にする</span>
                  </label>
                </div>
                {formData.overtime_rate_enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">土日加算（円）</label>
                      <input
                        type="number"
                        value={formData.sunday_rate}
                        onChange={(e) => setFormData({ ...formData, saturday_rate: Number(e.target.value), sunday_rate: Number(e.target.value) })}
                        className="input-field"
                        min="0"
                        placeholder="土曜・日曜の加算額"
                      />
                      <p className="text-xs text-gray-500 mt-1">土曜日と日曜日に同じ金額が加算されます</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">祝日加算（円）</label>
                      <input
                        type="number"
                        value={formData.holiday_rate}
                        onChange={(e) => setFormData({ ...formData, holiday_rate: Number(e.target.value) })}
                        className="input-field"
                        min="0"
                        placeholder="祝日の加算額"
                      />
                      <p className="text-xs text-gray-500 mt-1">特別日設定で登録した祝日に加算されます</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn-primary">
                  {editingStore ? '更新' : '追加'}
                </button>
                <button type="button" onClick={resetForm} className="btn-secondary">
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 店舗一覧 */}
        <div className="card">
          <h2 className="text-xl font-bold text-gray-800 mb-4">店舗一覧</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">店舗名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">月間予算</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">営業時間</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">特別日加算</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {store.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ¥{store.monthly_budget.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {store.business_hours_start} - {store.business_hours_end}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {store.overtime_rate_enabled ? '有効' : '無効'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleEdit(store)}
                        className="text-ocean-600 hover:text-ocean-900"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(store.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
