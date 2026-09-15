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

interface Publication {
  id: number;
  store_id: number;
  week_start_date: string;
  is_published: number;
  published_at: string | null;
}

interface StoreStatus {
  store: Store;
  firstHalf: Publication | null;
  secondHalf: Publication | null;
}

export default function PublicationStatus({ role, storeId, onLogout }: PublicationStatusProps) {
  const [, setStores] = useState<Store[]>([]);
  const [storeStatuses, setStoreStatuses] = useState<StoreStatus[]>([]);
  const [loading, setLoading] = useState(true);

  // 対象期間
  const today = new Date();
  const [targetYear, setTargetYear] = useState(today.getFullYear());
  const [targetMonth, setTargetMonth] = useState(today.getMonth() + 1);

  useEffect(() => {
    fetchData();
  }, [targetYear, targetMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 店舗一覧を取得
      const storesRes = await fetch(getApiUrl('/api/stores'));
      const storesData: Store[] = await storesRes.json();
      // 本部以外の店舗
      const filteredStores = storesData.filter(s => s.id !== 8);
      setStores(filteredStores);

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

          return {
            store,
            firstHalf: firstHalfPub.id ? firstHalfPub : null,
            secondHalf: secondHalfPub.id ? secondHalfPub : null,
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

  const getPublicationStatus = (publication: Publication | null) => {
    if (!publication || publication.is_published !== 1) {
      return { text: '未公開', color: 'text-orange-700', bg: 'bg-orange-100', icon: '🔒' };
    }
    return { text: '公開済', color: 'text-green-700', bg: 'bg-green-100', icon: '✅' };
  };

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">📋 シフト公開状況</h1>
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
          </div>
        </div>

        {/* 凡例 */}
        <div className="card bg-gray-50">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700">公開状態:</span>
              <span className="px-2 py-1 rounded bg-green-100 text-green-700 font-medium">✅ 公開済</span>
              <span className="px-2 py-1 rounded bg-orange-100 text-orange-700 font-medium">🔒 未公開</span>
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
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">店舗</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-b border-l">
                    前半（1〜15日）
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-b border-l">
                    後半（16日〜末日）
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {storeStatuses.map((status) => {
                  const firstPubStatus = getPublicationStatus(status.firstHalf);
                  const secondPubStatus = getPublicationStatus(status.secondHalf);

                  return (
                    <tr key={status.store.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {status.store.name}
                      </td>
                      <td className="px-3 py-3 text-center border-l">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${firstPubStatus.bg} ${firstPubStatus.color}`}>
                            {firstPubStatus.icon} {firstPubStatus.text}
                          </span>
                          {status.firstHalf?.published_at && (
                            <span className="text-[10px] text-gray-500">
                              {format(new Date(status.firstHalf.published_at), 'M/d H:mm', { locale: ja })} 公開
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center border-l">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${secondPubStatus.bg} ${secondPubStatus.color}`}>
                            {secondPubStatus.icon} {secondPubStatus.text}
                          </span>
                          {status.secondHalf?.published_at && (
                            <span className="text-[10px] text-gray-500">
                              {format(new Date(status.secondHalf.published_at), 'M/d H:mm', { locale: ja })} 公開
                            </span>
                          )}
                        </div>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="card bg-gradient-to-br from-green-50 to-green-100">
              <div className="text-sm text-green-700">前半公開済</div>
              <div className="text-2xl font-bold text-green-900">
                {storeStatuses.filter(s => s.firstHalf?.is_published === 1).length} / {storeStatuses.length}
              </div>
            </div>
            <div className="card bg-gradient-to-br from-green-50 to-green-100">
              <div className="text-sm text-green-700">後半公開済</div>
              <div className="text-2xl font-bold text-green-900">
                {storeStatuses.filter(s => s.secondHalf?.is_published === 1).length} / {storeStatuses.length}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
