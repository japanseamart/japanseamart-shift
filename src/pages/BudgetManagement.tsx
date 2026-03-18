import { useState, useEffect } from 'react';
import { Role, Store } from '../types';
import AdminLayout from '../components/AdminLayout';
import { getApiUrl } from '../config/api';

interface BudgetManagementProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

interface MonthlyBudget {
  id?: number;
  store_id: number;
  year: number;
  month: number;
  budget: number | null;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

export default function BudgetManagement({ role, storeId, onLogout }: BudgetManagementProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [budgets, setBudgets] = useState<MonthlyBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // 対象年
  const today = new Date();
  const [targetYear, setTargetYear] = useState(today.getFullYear());
  
  // 編集中の予算
  const [editingBudgets, setEditingBudgets] = useState<Map<string, number>>(new Map());
  
  // メッセージ
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    if (stores.length > 0) {
      fetchBudgets();
    }
  }, [stores, targetYear]);

  const fetchStores = async () => {
    try {
      const res = await fetch(getApiUrl('/api/stores'));
      const data = await res.json();
      // 本部を含む全店舗
      setStores(data);
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  };

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/monthly-budgets?year=${targetYear}`));
      const data = await res.json();
      setBudgets(data);
      
      // 編集用のMapを初期化
      const budgetMap = new Map<string, number>();
      data.forEach((b: MonthlyBudget) => {
        budgetMap.set(`${b.store_id}-${b.month}`, b.budget || 0);
      });
      setEditingBudgets(budgetMap);
    } catch (error) {
      console.error('予算取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  // 予算値を取得（編集中 > 保存済み > デフォルト の優先順）
  const getBudgetValue = (storeId: number, month: number): number => {
    const key = `${storeId}-${month}`;
    if (editingBudgets.has(key)) {
      return editingBudgets.get(key) || 0;
    }
    const saved = budgets.find(b => b.store_id === storeId && b.month === month);
    if (saved && saved.budget !== null) {
      return saved.budget;
    }
    // デフォルトは店舗の月間予算
    const store = stores.find(s => s.id === storeId);
    return store?.monthly_budget || 0;
  };

  // 編集中の値を更新
  const handleBudgetChange = (storeId: number, month: number, value: string) => {
    const key = `${storeId}-${month}`;
    const numValue = parseInt(value.replace(/,/g, '')) || 0;
    const newMap = new Map(editingBudgets);
    newMap.set(key, numValue);
    setEditingBudgets(newMap);
  };

  // 単一の予算を保存
  const saveBudget = async (storeId: number, month: number) => {
    const key = `${storeId}-${month}`;
    const budget = editingBudgets.get(key);
    if (budget === undefined) return;

    setSaving(true);
    try {
      await fetch(getApiUrl('/api/monthly-budgets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          year: targetYear,
          month: month,
          budget: budget
        })
      });
      setMessage({ type: 'success', text: '予算を保存しました' });
      fetchBudgets();
    } catch (error) {
      console.error('予算保存エラー:', error);
      setMessage({ type: 'error', text: '予算の保存に失敗しました' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // 前月からコピー（単一店舗）
  const copyFromPrevious = async (storeId: number, month: number) => {
    setSaving(true);
    try {
      const res = await fetch(getApiUrl('/api/monthly-budgets/copy-from-previous'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          year: targetYear,
          month: month
        })
      });
      const data = await res.json();
      if (data.budget !== undefined) {
        const key = `${storeId}-${month}`;
        const newMap = new Map(editingBudgets);
        newMap.set(key, data.budget);
        setEditingBudgets(newMap);
        setMessage({ type: 'success', text: `前月の予算(¥${data.budget.toLocaleString()})をコピーしました` });
      }
      fetchBudgets();
    } catch (error) {
      console.error('コピーエラー:', error);
      setMessage({ type: 'error', text: 'コピーに失敗しました' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // 全店舗の予算を前月からコピー
  const copyAllFromPrevious = async (month: number) => {
    if (!confirm(`${targetYear}年${month}月の予算を全店舗に前月からコピーしますか？\n（既に設定済みの店舗はスキップされます）`)) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(getApiUrl('/api/monthly-budgets/copy-all-from-previous'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: targetYear,
          month: month
        })
      });
      const data = await res.json();
      setMessage({ 
        type: 'success', 
        text: `${data.copied_count}件コピーしました（スキップ: ${data.skipped_count}件）` 
      });
      fetchBudgets();
    } catch (error) {
      console.error('一括コピーエラー:', error);
      setMessage({ type: 'error', text: '一括コピーに失敗しました' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // 予算が設定済みかどうか
  const isBudgetSaved = (storeId: number, month: number): boolean => {
    return budgets.some(b => b.store_id === storeId && b.month === month && b.budget !== null);
  };

  // 年間合計を計算
  const getYearlyTotal = (storeId: number): number => {
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      total += getBudgetValue(storeId, m);
    }
    return total;
  };

  // 月別合計を計算
  const getMonthlyTotal = (month: number): number => {
    return stores.reduce((sum, store) => sum + getBudgetValue(store.id, month), 0);
  };

  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-800">💰 月別予算設定</h1>
          
          {/* 年選択 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTargetYear(y => y - 1)}
              className="btn-secondary px-3 py-1"
            >
              ◀
            </button>
            <span className="text-lg font-bold">{targetYear}年</span>
            <button
              onClick={() => setTargetYear(y => y + 1)}
              className="btn-secondary px-3 py-1"
            >
              ▶
            </button>
          </div>
        </div>

        {/* メッセージ */}
        {message && (
          <div className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* 説明 */}
        <div className="card bg-blue-50 border border-blue-200">
          <h3 className="font-bold text-blue-800 mb-2">📖 使い方</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• 各月の予算を直接入力して「保存」ボタンをクリック</li>
            <li>• 「📋」ボタンで前月の予算をコピー</li>
            <li>• 月ヘッダーの「📋 全店舗」で全店舗の予算を一括コピー</li>
            <li>• 未設定の場合は店舗のデフォルト予算が使用されます</li>
          </ul>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">読み込み中...</div>
        ) : (
          <div className="card overflow-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="sticky left-0 z-10 bg-gray-100 px-4 py-3 text-left font-bold border-b border-r min-w-[120px]">
                    店舗
                  </th>
                  {months.map(month => (
                    <th key={month} className="px-2 py-2 text-center border-b min-w-[130px]">
                      <div className="font-bold">{month}月</div>
                      <button
                        onClick={() => copyAllFromPrevious(month)}
                        className="text-xs text-ocean-600 hover:text-ocean-800 mt-1"
                        disabled={saving}
                        title="全店舗の予算を前月からコピー"
                      >
                        📋 全店舗
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center border-b font-bold bg-gray-200 min-w-[120px]">
                    年間合計
                  </th>
                </tr>
              </thead>
              <tbody>
                {stores.map(store => (
                  <tr key={store.id} className="hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium border-b border-r">
                      <div>{store.name}</div>
                      <div className="text-xs text-gray-500">
                        デフォルト: ¥{(store.monthly_budget || 0).toLocaleString()}
                      </div>
                    </td>
                    {months.map(month => {
                      const value = getBudgetValue(store.id, month);
                      const saved = isBudgetSaved(store.id, month);
                      return (
                        <td key={month} className="px-2 py-2 border-b">
                          <div className="flex flex-col gap-1">
                            <input
                              type="text"
                              value={value.toLocaleString()}
                              onChange={(e) => handleBudgetChange(store.id, month, e.target.value)}
                              className={`w-full px-2 py-1 text-right border rounded text-sm ${
                                saved ? 'border-green-300 bg-green-50' : 'border-gray-300'
                              }`}
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => saveBudget(store.id, month)}
                                className="flex-1 text-xs bg-ocean-600 text-white rounded px-1 py-0.5 hover:bg-ocean-700"
                                disabled={saving}
                              >
                                保存
                              </button>
                              <button
                                onClick={() => copyFromPrevious(store.id, month)}
                                className="text-xs bg-gray-200 text-gray-700 rounded px-1 py-0.5 hover:bg-gray-300"
                                disabled={saving}
                                title="前月からコピー"
                              >
                                📋
                              </button>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right font-bold border-b bg-gray-50">
                      ¥{getYearlyTotal(store.id).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {/* 合計行 */}
                <tr className="bg-gray-100 font-bold">
                  <td className="sticky left-0 z-10 bg-gray-100 px-4 py-3 border-t-2">
                    月別合計
                  </td>
                  {months.map(month => (
                    <td key={month} className="px-2 py-3 text-right border-t-2">
                      ¥{getMonthlyTotal(month).toLocaleString()}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right border-t-2 bg-ocean-100">
                    ¥{stores.reduce((sum, s) => sum + getYearlyTotal(s.id), 0).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
