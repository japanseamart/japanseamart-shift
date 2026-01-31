import { useState, useEffect } from 'react';
import { format, addMonths, getDaysInMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Role, Shift, Store, Employee, SpecialDay } from '../types';
import AdminLayout from '../components/AdminLayout';
import { getApiUrl } from '../config/api';

interface StoreRankingProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

interface StoreStats {
  store: Store;
  laborCost: number;
  budgetUsage: number;
  monthlyForecast: number;
  shiftCount: number;
  employeeCount: number;
  avgDailyCost: number;
}

export default function StoreRanking({ role, storeId, onLogout }: StoreRankingProps) {
  const today = new Date();
  const [targetYear, setTargetYear] = useState(today.getFullYear());
  const [targetMonth, setTargetMonth] = useState(today.getMonth() + 1);
  const [targetPeriod, setTargetPeriod] = useState<'first' | 'second' | 'full'>(today.getDate() <= 15 ? 'first' : 'second');
  
  const [stores, setStores] = useState<Store[]>([]);
  const [storeStats, setStoreStats] = useState<StoreStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'budgetUsage' | 'laborCost' | 'forecast'>('budgetUsage');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);

  // 自店舗のランキングをハイライト
  const myStoreId = role === 'store_manager' ? storeId : null;

  useEffect(() => {
    fetchStores();
    fetchSpecialDays();
  }, []);

  useEffect(() => {
    if (stores.length > 0) {
      fetchAllStoreStats();
    }
  }, [stores, targetYear, targetMonth, targetPeriod, specialDays]);

  const fetchStores = async () => {
    try {
      const res = await fetch(getApiUrl('/api/stores'));
      const data = await res.json();
      // 本部を除外
      setStores(data.filter((s: Store) => s.id !== 8));
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  };

  const fetchSpecialDays = async () => {
    try {
      const res = await fetch(getApiUrl('/api/special-days'));
      const data = await res.json();
      setSpecialDays(data);
    } catch (error) {
      console.error('特別日取得エラー:', error);
    }
  };

  const getPeriodDates = () => {
    const daysInMonth = getDaysInMonth(new Date(targetYear, targetMonth - 1));
    let startDay = 1, endDay = daysInMonth;
    
    if (targetPeriod === 'first') {
      endDay = 15;
    } else if (targetPeriod === 'second') {
      startDay = 16;
    }
    
    return {
      start: new Date(targetYear, targetMonth - 1, startDay),
      end: new Date(targetYear, targetMonth - 1, endDay)
    };
  };

  const calculateLaborCost = (shift: Shift, employee: Employee, store: Store): number => {
    const startTime = new Date(`2000-01-01T${shift.start_time}`);
    const endTime = new Date(`2000-01-01T${shift.end_time}`);
    const workMinutes = (endTime.getTime() - startTime.getTime()) / 60000 - (shift.break_minutes || 0);
    const workHours = workMinutes / 60;

    let hourlyRate = employee.hourly_wage || 0;

    if (store.overtime_rate_enabled) {
      const specialDay = specialDays.find(sd => sd.date === shift.date);
      const dayOfWeek = new Date(shift.date).getDay();
      const applicableRates: number[] = [];

      if (specialDay?.type === 1 && store.holiday_rate > 0) {
        applicableRates.push(store.holiday_rate);
      }
      if (dayOfWeek === 0 && store.sunday_rate > 0) {
        applicableRates.push(store.sunday_rate);
      }
      if (dayOfWeek === 6 && store.saturday_rate > 0) {
        applicableRates.push(store.saturday_rate);
      }
      if (applicableRates.length > 0) {
        hourlyRate += Math.max(...applicableRates);
      }
    }
    return Math.round(workHours * hourlyRate);
  };

  const fetchAllStoreStats = async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates();
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');
      const periodDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;

      const stats: StoreStats[] = await Promise.all(
        stores.map(async (store) => {
          // 従業員取得
          const empRes = await fetch(getApiUrl(`/api/employees?store_id=${store.id}`));
          const employees: Employee[] = await empRes.json();

          // シフト取得
          const shiftRes = await fetch(getApiUrl(`/api/shifts?store_id=${store.id}&start_date=${startStr}&end_date=${endStr}`));
          const shifts: Shift[] = await shiftRes.json();

          // 人件費計算
          let laborCost = 0;
          shifts.forEach(shift => {
            const employee = employees.find(e => e.id === shift.employee_id);
            if (employee) {
              laborCost += calculateLaborCost(shift, employee, store);
            }
          });

          // 予算消化率（期間に応じて調整）
          const periodBudget = targetPeriod === 'full' 
            ? store.monthly_budget 
            : store.monthly_budget / 2;
          const budgetUsage = periodBudget > 0 ? (laborCost / periodBudget) * 100 : 0;

          // 月末予想（前半の場合は2倍、後半の場合は前半+後半）
          let monthlyForecast = laborCost;
          if (targetPeriod === 'first') {
            monthlyForecast = laborCost * 2;
          } else if (targetPeriod === 'second') {
            // 後半の場合、前半のデータも取得して合算
            const firstHalfStart = format(new Date(targetYear, targetMonth - 1, 1), 'yyyy-MM-dd');
            const firstHalfEnd = format(new Date(targetYear, targetMonth - 1, 15), 'yyyy-MM-dd');
            const firstHalfRes = await fetch(getApiUrl(`/api/shifts?store_id=${store.id}&start_date=${firstHalfStart}&end_date=${firstHalfEnd}`));
            const firstHalfShifts: Shift[] = await firstHalfRes.json();
            let firstHalfCost = 0;
            firstHalfShifts.forEach(shift => {
              const employee = employees.find(e => e.id === shift.employee_id);
              if (employee) {
                firstHalfCost += calculateLaborCost(shift, employee, store);
              }
            });
            monthlyForecast = firstHalfCost + laborCost;
          }

          return {
            store,
            laborCost,
            budgetUsage,
            monthlyForecast,
            shiftCount: shifts.length,
            employeeCount: employees.length,
            avgDailyCost: periodDays > 0 ? Math.round(laborCost / periodDays) : 0
          };
        })
      );

      setStoreStats(stats);
    } catch (error) {
      console.error('統計取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const sortedStats = [...storeStats].sort((a, b) => {
    let aVal = 0, bVal = 0;
    if (sortBy === 'budgetUsage') {
      aVal = a.budgetUsage;
      bVal = b.budgetUsage;
    } else if (sortBy === 'laborCost') {
      aVal = a.laborCost;
      bVal = b.laborCost;
    } else if (sortBy === 'forecast') {
      aVal = a.monthlyForecast;
      bVal = b.monthlyForecast;
    }
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const getRankIcon = (index: number) => {
    if (sortOrder === 'asc') {
      // 予算消化率が低い = 良い
      if (index === 0) return '🥇';
      if (index === 1) return '🥈';
      if (index === 2) return '🥉';
    } else {
      // 降順の場合は最初が最悪
      if (index === sortedStats.length - 1) return '⚠️';
      if (index === sortedStats.length - 2) return '⚠️';
    }
    return `${index + 1}`;
  };

  const getBudgetStatusColor = (usage: number) => {
    if (usage >= 100) return 'bg-red-500 text-white';
    if (usage >= 90) return 'bg-yellow-500 text-white';
    if (usage >= 80) return 'bg-green-500 text-white';
    return 'bg-green-400 text-white';
  };

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex flex-col gap-3">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">🏆 店舗ランキング</h1>
          <p className="text-sm text-gray-600">
            各店舗の人件費・予算消化率を比較して、自店舗の立ち位置を確認できます
          </p>
        </div>

        {/* 期間選択 */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 年月選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">対象月</label>
              <select
                value={`${targetYear}-${targetMonth.toString().padStart(2, '0')}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-');
                  setTargetYear(parseInt(y));
                  setTargetMonth(parseInt(m));
                }}
                className="input-field"
              >
                {Array.from({ length: 12 }, (_, i) => {
                  const d = addMonths(new Date(), i - 6);
                  return (
                    <option key={i} value={format(d, 'yyyy-MM')}>
                      {format(d, 'yyyy年M月', { locale: ja })}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* 期間選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">期間</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'first', label: '前半' },
                  { value: 'second', label: '後半' },
                  { value: 'full', label: '月全体' }
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setTargetPeriod(value as typeof targetPeriod)}
                    className={`h-10 rounded-lg font-medium transition-colors ${
                      targetPeriod === value
                        ? 'bg-ocean-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ソート選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">並び順</label>
              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="input-field flex-1"
                >
                  <option value="budgetUsage">予算消化率</option>
                  <option value="laborCost">人件費</option>
                  <option value="forecast">月末予想</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="btn-secondary px-4"
                >
                  {sortOrder === 'asc' ? '↑ 昇順' : '↓ 降順'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ランキング表示 */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="text-2xl mb-2">⏳</div>
            <div className="text-gray-500">データを読み込んでいます...</div>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedStats.map((stat, index) => {
              const isMyStore = stat.store.id === myStoreId;
              const forecastUsage = stat.store.monthly_budget > 0
                ? (stat.monthlyForecast / stat.store.monthly_budget) * 100
                : 0;

              return (
                <div
                  key={stat.store.id}
                  className={`card border-2 transition-all ${
                    isMyStore
                      ? 'border-ocean-500 bg-ocean-50 ring-2 ring-ocean-300'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* 順位 */}
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 flex items-center justify-center rounded-full text-xl font-bold ${
                        index === 0 && sortOrder === 'asc' ? 'bg-yellow-400 text-yellow-900' :
                        index === 1 && sortOrder === 'asc' ? 'bg-gray-300 text-gray-700' :
                        index === 2 && sortOrder === 'asc' ? 'bg-orange-400 text-orange-900' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {getRankIcon(index)}
                      </div>
                      <div>
                        <h3 className={`text-lg font-bold ${isMyStore ? 'text-ocean-700' : 'text-gray-800'}`}>
                          {stat.store.name}
                          {isMyStore && <span className="ml-2 text-sm text-ocean-600">（自店舗）</span>}
                        </h3>
                        <p className="text-sm text-gray-500">
                          従業員 {stat.employeeCount}名 / シフト {stat.shiftCount}件
                        </p>
                      </div>
                    </div>

                    {/* 統計 */}
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                      {/* 人件費 */}
                      <div className="bg-white rounded-lg p-3 border">
                        <div className="text-xs text-gray-500 mb-1">
                          {targetPeriod === 'first' ? '前半' : targetPeriod === 'second' ? '後半' : '月間'}人件費
                        </div>
                        <div className="text-lg font-bold text-gray-800" data-salary>
                          ¥{stat.laborCost.toLocaleString()}
                        </div>
                      </div>

                      {/* 予算消化率 */}
                      <div className="bg-white rounded-lg p-3 border">
                        <div className="text-xs text-gray-500 mb-1">予算消化率</div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-sm font-bold ${getBudgetStatusColor(stat.budgetUsage)}`}>
                            {Math.round(stat.budgetUsage)}%
                          </span>
                        </div>
                        <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              stat.budgetUsage >= 100 ? 'bg-red-500' :
                              stat.budgetUsage >= 90 ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(stat.budgetUsage, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* 月末予想 */}
                      <div className="bg-white rounded-lg p-3 border">
                        <div className="text-xs text-gray-500 mb-1">月末予想</div>
                        <div className="text-lg font-bold text-gray-800" data-salary>
                          ¥{stat.monthlyForecast.toLocaleString()}
                        </div>
                        <div className={`text-xs ${forecastUsage >= 100 ? 'text-red-600' : 'text-gray-500'}`}>
                          予算比 {Math.round(forecastUsage)}%
                        </div>
                      </div>

                      {/* 日平均 */}
                      <div className="bg-white rounded-lg p-3 border">
                        <div className="text-xs text-gray-500 mb-1">日平均人件費</div>
                        <div className="text-lg font-bold text-gray-800" data-salary>
                          ¥{stat.avgDailyCost.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 凡例 */}
        <div className="card bg-gray-50">
          <h3 className="text-sm font-bold text-gray-700 mb-3">📊 予算消化率の見方</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-green-400 text-white font-medium">〜79%</span>
              <span className="text-gray-600">余裕あり</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-green-500 text-white font-medium">80〜89%</span>
              <span className="text-gray-600">適正</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-yellow-500 text-white font-medium">90〜99%</span>
              <span className="text-gray-600">注意</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-red-500 text-white font-medium">100%〜</span>
              <span className="text-gray-600">超過</span>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
