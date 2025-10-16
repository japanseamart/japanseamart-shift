import { useState, useEffect } from 'react';
import { Role, Store } from '../types';
import AdminLayout from '../components/AdminLayout';

interface PasswordManagementProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

export default function PasswordManagement({ role, storeId, onLogout }: PasswordManagementProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedPasswordType, setSelectedPasswordType] = useState<'admin' | 'store'>('admin');
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState<number>(5);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/stores');
      const data = await res.json();
      setStores(data.filter((s: Store) => s.id !== 8)); // 本部以外
      if (data.length > 0) {
        setSelectedStoreId(data[0].id);
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'パスワードが一致しません' });
      return;
    }

    if (newPassword.length < 4) {
      setMessage({ type: 'error', text: 'パスワードは4文字以上で設定してください' });
      return;
    }

    setLoading(true);

    try {
      const requestData: any = {
        role: selectedPasswordType === 'admin' ? 'admin' : 'store_manager',
        new_password: newPassword,
        auto_logout_minutes: autoLogoutMinutes
      };

      if (selectedPasswordType === 'store') {
        requestData.store_id = selectedStoreId;
      }

      const res = await fetch('/api/passwords/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestData)
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'パスワードを変更しました' });
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'パスワード変更に失敗しました' });
      }
    } catch (error) {
      console.error('パスワード変更エラー:', error);
      setMessage({ type: 'error', text: 'パスワード変更に失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  // 店舗責任者は自店舗のパスワードのみ変更可能
  const canManageAdmin = role === 'admin';
  const canManageStore = role === 'admin' || (role === 'store_manager' && storeId !== null);

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">パスワード管理</h1>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* パスワード種別選択 */}
            {canManageAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  変更対象
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="admin"
                      checked={selectedPasswordType === 'admin'}
                      onChange={(e) => setSelectedPasswordType(e.target.value as 'admin')}
                      className="mr-2"
                    />
                    <span>本部管理者パスワード</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="store"
                      checked={selectedPasswordType === 'store'}
                      onChange={(e) => setSelectedPasswordType(e.target.value as 'store')}
                      className="mr-2"
                    />
                    <span>店舗責任者パスワード</span>
                  </label>
                </div>
              </div>
            )}

            {/* 店舗選択 */}
            {selectedPasswordType === 'store' && canManageStore && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  店舗
                </label>
                <select
                  value={selectedStoreId || ''}
                  onChange={(e) => setSelectedStoreId(Number(e.target.value))}
                  className="input-field"
                  disabled={role === 'store_manager'}
                >
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
                {role === 'store_manager' && (
                  <p className="text-xs text-gray-500 mt-1">
                    ※店舗責任者は自店舗のパスワードのみ変更できます
                  </p>
                )}
              </div>
            )}

            {/* 新しいパスワード */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                新しいパスワード
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-field"
                placeholder="4文字以上"
                required
                minLength={4}
              />
            </div>

            {/* パスワード確認 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                パスワード確認
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                placeholder="もう一度入力"
                required
              />
            </div>

            {/* 自動ログアウト時間（本部管理者のみ） */}
            {selectedPasswordType === 'admin' && role === 'admin' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  自動ログアウト時間
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={autoLogoutMinutes}
                    onChange={(e) => setAutoLogoutMinutes(Number(e.target.value))}
                    className="input-field flex-1"
                    min="1"
                    max="120"
                    required
                  />
                  <span className="text-gray-700">分</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  無操作時に自動的にログアウトされるまでの時間（1～120分）
                </p>
              </div>
            )}

            {/* メッセージ表示 */}
            {message && (
              <div
                className={`p-4 rounded-lg ${
                  message.type === 'success'
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                {message.text}
              </div>
            )}

            {/* 送信ボタン */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '変更中...' : 'パスワードを変更'}
            </button>
          </form>

          {/* 注意事項 */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-bold text-blue-900 mb-2">⚠️ 注意事項</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• パスワードは4文字以上で設定してください</li>
              <li>• パスワード変更後は、新しいパスワードでログインしてください</li>
              <li>• セキュリティのため、定期的なパスワード変更を推奨します</li>
              {role === 'admin' && (
                <li>• 本部管理者は全店舗のパスワードを変更できます</li>
              )}
            </ul>
          </div>
        </div>

        {/* パスワード一覧 */}
        <div className="card">
          <h2 className="text-lg font-bold text-gray-800 mb-4">初期パスワード一覧</h2>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-3">
              システム初期状態のパスワードは以下の通りです:
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-700">本部管理者:</span>
                <code className="bg-white px-3 py-1 rounded border">admin</code>
              </div>
              {stores.map((store, index) => (
                <div key={store.id} className="flex justify-between">
                  <span className="text-gray-700">{store.name}:</span>
                  <code className="bg-white px-3 py-1 rounded border">store{index + 1}</code>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              ※初期パスワードは変更することを強く推奨します
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
