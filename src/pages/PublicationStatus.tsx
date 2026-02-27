import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Role, Store } from '../types';
import AdminLayout from '../components/AdminLayout';
import { getApiUrl } from '../config/api';

interface PublicationStatusProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

interface ShiftDeadline {
  id: number;
  store_id: number;
  target_year: number;
  target_month: number;
  target_period: 'first' | 'second';
  deadline_date: string;
  notification_message: string | null;
  is_changed: number;
  change_count: number;
}

interface Publication {
  id: number;
  store_id: number;
  week_start_date: string;
  is_published: number;
  published_at: string | null;
}

interface StoreStatus {
  store: Store;
  firstHalf: {
    deadline: ShiftDeadline | null;
    publication: Publication | null;
  };
  secondHalf: {
    deadline: ShiftDeadline | null;
    publication: Publication | null;
  };
}

export default function PublicationStatus({ role, storeId, onLogout }: PublicationStatusProps) {
  const [, setStores] = useState<Store[]>([]);
  const [, setDeadlines] = useState<ShiftDeadline[]>([]);
  const [storeStatuses, setStoreStatuses] = useState<StoreStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSetupLoading, setAutoSetupLoading] = useState(false);
  const [autoSetupResult, setAutoSetupResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // 対象期間
  const today = new Date();
  const [targetYear, setTargetYear] = useState(today.getFullYear());
  const [targetMonth, setTargetMonth] = useState(today.getMonth() + 1);

  useEffect(() => {
    fetchData();
  }, [targetYear, targetMonth]);

  // 締切自動設定
  const handleAutoSetup = async () => {
    if (!confirm(`${targetYear}年${targetMonth}月の締切を未設定の店舗に自動設定しますか？\n\n・前半締切: ${targetMonth === 1 ? targetYear - 1 : targetYear}年${targetMonth === 1 ? 12 : targetMonth - 1}月20日\n・後半締切: ${targetYear}年${targetMonth}月5日`)) {
      return;
    }
    
    setAutoSetupLoading(true);
    setAutoSetupResult(null);
    
    try {
      const res = await fetch(getApiUrl('/api/shift-deadlines/auto-setup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_year: targetYear, target_month: targetMonth }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setAutoSetupResult({
          success: true,
          message: `${data.created_count}件の締切を設定しました（スキップ: ${data.skipped_count}件）`,
        });
        // データを再取得
        fetchData();
      } else {
        setAutoSetupResult({
          success: false,
          message: data.error || '自動設定に失敗しました',
        });
      }
    } catch (error) {
      console.error('自動設定エラー:', error);
      setAutoSetupResult({
        success: false,
        message: '自動設定に失敗しました',
      });
    } finally {
      setAutoSetupLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 店舗一覧を取得
      const storesRes = await fetch(getApiUrl('/api/stores'));
      const storesData: Store[] = await storesRes.json();
      // 本部以外の店舗
      const filteredStores = storesData.filter(s => s.id !== 8);
      setStores(filteredStores);

      // 締切一覧を取得
      const deadlinesRes = await fetch(getApiUrl('/api/shift-deadlines'));
      const deadlinesData: ShiftDeadline[] = await deadlinesRes.json();
      setDeadlines(deadlinesData);

      // 各店舗の公開状態を取得
      const statuses: StoreStatus[] = await Promise.all(
        filteredStores.map(async (store) => {
          // 前半の公開状態（1日）
          const firstHalfDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
          const firstHalfPubRes = await fetch(
            getApiUrl(`/api/weekly-publications?store_id=${store.id}&week_start_date=${firstHalfDate}`)
          );
          const firstHalfPub = await firstHalfPubRes.json();

          // 後半の公開状態（16日）
          const secondHalfDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-16`;
          const secondHalfPubRes = await fetch(
            getApiUrl(`/api/weekly-publications?store_id=${store.id}&week_start_date=${secondHalfDate}`)
          );
          const secondHalfPub = await secondHalfPubRes.json();

          // 締切を検索
          const firstHalfDeadline = deadlinesData.find(
            d => d.store_id === store.id && d.target_year === targetYear && d.target_month === targetMonth && d.target_period === 'first'
          ) || null;
          const secondHalfDeadline = deadlinesData.find(
            d => d.store_id === store.id && d.target_year === targetYear && d.target_month === targetMonth && d.target_period === 'second'
          ) || null;

          return {
            store,
            firstHalf: {
              deadline: firstHalfDeadline,
              publication: firstHalfPub.id ? firstHalfPub : null,
            },
            secondHalf: {
              deadline: secondHalfDeadline,
              publication: secondHalfPub.id ? secondHalfPub : null,
            },
          };
        })
      );

      setStoreStatuses(statuses);
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDeadlineStatus = (deadline: ShiftDeadline | null) => {
    if (!deadline) {
      return { text: '未設定', color: 'text-gray-400', bg: 'bg-gray-100', icon: '⚪' };
    }
    const deadlineDate = new Date(deadline.deadline_date);
    deadlineDate.setHours(23, 59, 59, 999); // 締切日の23:59:59まで有効
    const now = new Date();
    
    if (deadlineDate < now) {
      return { text: '締切済', color: 'text-gray-500', bg: 'bg-gray-200', icon: '⏰' };
    }
    
    // 日数計算は0時基準で
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDay = new Date(deadline.deadline_date);
    deadlineDay.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((deadlineDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return { text: '本日締切', color: 'text-red-600', bg: 'bg-red-100', icon: '🔴' };
    }
    if (diffDays <= 3) {
      return { text: `あと${diffDays}日`, color: 'text-red-600', bg: 'bg-red-100', icon: '🔴' };
    }
    if (diffDays <= 7) {
      return { text: `あと${diffDays}日`, color: 'text-yellow-600', bg: 'bg-yellow-100', icon: '🟡' };
    }
    return { text: `あと${diffDays}日`, color: 'text-green-600', bg: 'bg-green-100', icon: '🟢' };
  };

  const getPublicationStatus = (publication: Publication | null) => {
    if (!publication || publication.is_published !== 1) {
      return { text: '未公開', color: 'text-orange-600', bg: 'bg-orange-100', icon: '🔒' };
    }
    return { text: '公開済', color: 'text-green-600', bg: 'bg-green-100', icon: '✅' };
  };

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">📋 シフト公開・締切設定状況</h1>
        </div>

        {/* 期間選択 */}
        <div className="card">
          <label className="block text-sm font-medium text-gray-700 mb-2">対象月</label>
          <div className="flex gap-2 items-center">
            <select
              value={`${targetYear}-${String(targetMonth).padStart(2, '0')}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-');
                setTargetYear(parseInt(y));
                setTargetMonth(parseInt(m));
              }}
              className="input-field max-w-xs"
            >
              {(() => {
                const startYear = 2024;
                const startMonth = 11;
                const now = new Date();
                const endYear = now.getFullYear() + 1;
                const endMonth = now.getMonth() + 1;
                
                const months: { year: number; month: number }[] = [];
                let y = startYear;
                let m = startMonth;
                
                while (y < endYear || (y === endYear && m <= endMonth)) {
                  months.push({ year: y, month: m });
                  m++;
                  if (m > 12) {
                    m = 1;
                    y++;
                  }
                }
                
                return months.map(({ year, month }) => (
                  <option key={`${year}-${month}`} value={`${year}-${String(month).padStart(2, '0')}`}>
                    {year}年{month}月
                  </option>
                ));
              })()}
            </select>
            <button
              onClick={() => {
                const now = new Date();
                setTargetYear(now.getFullYear());
                setTargetMonth(now.getMonth() + 1);
              }}
              className="btn-secondary"
            >
              今月
            </button>
            <div className="flex-1"></div>
            <button
              onClick={handleAutoSetup}
              disabled={autoSetupLoading}
              className="btn-primary flex items-center gap-2"
            >
              {autoSetupLoading ? (
                <>
                  <span className="animate-spin">⏳</span>
                  処理中...
                </>
              ) : (
                <>
                  ⚡ 締切を一括自動設定
                </>
              )}
            </button>
          </div>
          
          {/* 自動設定結果 */}
          {autoSetupResult && (
            <div className={`mt-4 p-3 rounded-lg ${autoSetupResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className={`flex items-center gap-2 ${autoSetupResult.success ? 'text-green-700' : 'text-red-700'}`}>
                <span>{autoSetupResult.success ? '✅' : '❌'}</span>
                <span>{autoSetupResult.message}</span>
              </div>
            </div>
          )}
          
          {/* 自動設定ルール説明 */}
          <div className="mt-4 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
            <div className="font-medium mb-1">📌 自動設定ルール:</div>
            <ul className="list-disc list-inside space-y-1">
              <li>前半（1〜15日）の締切 → 前月20日</li>
              <li>後半（16〜末日）の締切 → 該当月5日</li>
              <li>既に設定済みの店舗はスキップされます</li>
            </ul>
          </div>
        </div>

        {/* 凡例 */}
        <div className="card bg-gray-50">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700">公開状態:</span>
              <span className="px-2 py-1 rounded bg-green-100 text-green-600">✅ 公開済</span>
              <span className="px-2 py-1 rounded bg-orange-100 text-orange-600">🔒 未公開</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700">締切状態:</span>
              <span className="px-2 py-1 rounded bg-green-100 text-green-600">🟢 余裕あり</span>
              <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-600">🟡 1週間以内</span>
              <span className="px-2 py-1 rounded bg-red-100 text-red-600">🔴 3日以内</span>
              <span className="px-2 py-1 rounded bg-gray-100 text-gray-400">⚪ 未設定</span>
            </div>
          </div>
        </div>

        {/* 一覧 */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        ) : (
          <div className="card overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b" rowSpan={2}>
                    店舗
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-b border-l" colSpan={3}>
                    前半（1日〜15日）
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-b border-l" colSpan={3}>
                    後半（16日〜末日）
                  </th>
                </tr>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 border-b border-l">公開</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 border-b">締切日</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 border-b">状態</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 border-b border-l">公開</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 border-b">締切日</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 border-b">状態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {storeStatuses.map((status) => {
                  const firstPubStatus = getPublicationStatus(status.firstHalf.publication);
                  const firstDeadlineStatus = getDeadlineStatus(status.firstHalf.deadline);
                  const secondPubStatus = getPublicationStatus(status.secondHalf.publication);
                  const secondDeadlineStatus = getDeadlineStatus(status.secondHalf.deadline);

                  return (
                    <tr key={status.store.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {status.store.name}
                      </td>
                      
                      {/* 前半 */}
                      <td className="px-3 py-3 text-center border-l">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${firstPubStatus.bg} ${firstPubStatus.color}`}>
                          {firstPubStatus.icon} {firstPubStatus.text}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-sm">
                        {status.firstHalf.deadline ? (
                          <span className="font-mono">
                            {format(new Date(status.firstHalf.deadline.deadline_date), 'M/d', { locale: ja })}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${firstDeadlineStatus.bg} ${firstDeadlineStatus.color}`}>
                          {firstDeadlineStatus.icon} {firstDeadlineStatus.text}
                        </span>
                      </td>

                      {/* 後半 */}
                      <td className="px-3 py-3 text-center border-l">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${secondPubStatus.bg} ${secondPubStatus.color}`}>
                          {secondPubStatus.icon} {secondPubStatus.text}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-sm">
                        {status.secondHalf.deadline ? (
                          <span className="font-mono">
                            {format(new Date(status.secondHalf.deadline.deadline_date), 'M/d', { locale: ja })}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${secondDeadlineStatus.bg} ${secondDeadlineStatus.color}`}>
                          {secondDeadlineStatus.icon} {secondDeadlineStatus.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* サマリー */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card bg-gradient-to-br from-green-50 to-green-100">
              <div className="text-sm text-green-700">前半公開済</div>
              <div className="text-2xl font-bold text-green-900">
                {storeStatuses.filter(s => s.firstHalf.publication?.is_published === 1).length} / {storeStatuses.length}
              </div>
            </div>
            <div className="card bg-gradient-to-br from-blue-50 to-blue-100">
              <div className="text-sm text-blue-700">前半締切設定済</div>
              <div className="text-2xl font-bold text-blue-900">
                {storeStatuses.filter(s => s.firstHalf.deadline).length} / {storeStatuses.length}
              </div>
            </div>
            <div className="card bg-gradient-to-br from-green-50 to-green-100">
              <div className="text-sm text-green-700">後半公開済</div>
              <div className="text-2xl font-bold text-green-900">
                {storeStatuses.filter(s => s.secondHalf.publication?.is_published === 1).length} / {storeStatuses.length}
              </div>
            </div>
            <div className="card bg-gradient-to-br from-blue-50 to-blue-100">
              <div className="text-sm text-blue-700">後半締切設定済</div>
              <div className="text-2xl font-bold text-blue-900">
                {storeStatuses.filter(s => s.secondHalf.deadline).length} / {storeStatuses.length}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
