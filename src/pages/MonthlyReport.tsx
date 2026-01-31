import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import Papa from 'papaparse';
import { Role, Store, Employee, Shift } from '../types';
import AdminLayout from '../components/AdminLayout';
import { getApiUrl } from '../config/api';

interface MonthlyReportProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

interface MonthlyStats {
  totalLaborCost: number;
  totalWorkHours: number;
  totalShifts: number;
  employeeCount: number;
  averageCostPerShift: number;
  averageHoursPerShift: number;
  budgetUsage: number;
}

interface EmployeeStats {
  employee: Employee;
  shifts: number;
  totalHours: number;
  totalCost: number;
}

interface HeatmapData {
  hour: number;
  weekday: number; // 0=日, 1=月, ..., 6=土
  staffCount: number;
  laborCost: number;
}

interface DailyData {
  date: string;
  laborCost: number;
  staffCount: number;
  weekday: number;
}

interface HourlyStats {
  hour: number;
  avgStaffCount: number;
  avgLaborCost: number;
  totalShifts: number;
}

interface WeekdayStats {
  weekday: number;
  totalLaborCost: number;
  totalShifts: number;
  avgLaborCost: number;
}

export default function MonthlyReport({ role, storeId, onLogout }: MonthlyReportProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(storeId);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [targetMonth, setTargetMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [hourlyStats, setHourlyStats] = useState<HourlyStats[]>([]);
  const [weekdayStats, setWeekdayStats] = useState<WeekdayStats[]>([]);
  const [heatmapMode, setHeatmapMode] = useState<'staff' | 'cost'>('staff');
  const [isAllStores, setIsAllStores] = useState(false); // 全店計モード
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]); // 全従業員データ
  
  // 前半/後半分析データ
  const [firstHalfStats, setFirstHalfStats] = useState<{ cost: number; shifts: number; staffCount: number } | null>(null);
  const [secondHalfStats, setSecondHalfStats] = useState<{ cost: number; shifts: number; staffCount: number } | null>(null);

  useEffect(() => {
    fetchStores();
    if (role === 'admin') {
      fetchAllEmployees();
    }
  }, []);

  useEffect(() => {
    if (isAllStores) {
      // 全店計モード
      fetchMonthlyData();
    } else if (selectedStoreId) {
      // 単一店舗モード
      fetchStore(selectedStoreId);
      fetchEmployees(selectedStoreId);
      fetchMonthlyData();
    }
  }, [selectedStoreId, targetMonth, isAllStores]);

  const fetchStores = async () => {
    try {
      const res = await fetch(getApiUrl('/api/stores'));
      const data = await res.json();
      setStores(data.filter((s: Store) => s.id !== 8));
      
      // 店舗責任者の場合は自店舗を選択、管理者の場合は未選択（全店計）
      if (role === 'store_manager' && storeId) {
        setSelectedStoreId(storeId);
        setIsAllStores(false);
      } else if (role === 'admin') {
        setIsAllStores(false); // デフォルトは全店計ではなく最初の店舗
        if (!selectedStoreId && data.length > 0) {
          setSelectedStoreId(data[0].id);
        }
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  };
  
  const fetchAllEmployees = async () => {
    try {
      const res = await fetch(getApiUrl('/api/employees'));
      const data = await res.json();
      setAllEmployees(data.filter((e: Employee) => e.store_id !== 8)); // 本部以外
    } catch (error) {
      console.error('全従業員取得エラー:', error);
    }
  };

  const fetchStore = async (id: number) => {
    try {
      const res = await fetch(getApiUrl(`/api/stores/${id}`));
      const data = await res.json();
      setSelectedStore(data);
    } catch (error) {
      console.error('店舗詳細取得エラー:', error);
    }
  };

  const fetchEmployees = async (storeId: number) => {
    try {
      const res = await fetch(getApiUrl(`/api/employees?store_id=${storeId}`));
      const data = await res.json();
      setEmployees(data);
    } catch (error) {
      console.error('従業員取得エラー:', error);
    }
  };

  const fetchMonthlyData = async () => {
    if (!isAllStores && !selectedStoreId) return;

    setLoading(true);

    try {
      const monthStart = startOfMonth(parseISO(`${targetMonth}-01`));
      const monthEnd = endOfMonth(monthStart);

      let apiUrl = '';
      if (isAllStores) {
        // 全店計モード：全店舗のシフトを取得
        apiUrl = getApiUrl(`/api/shifts?start_date=${format(monthStart, 'yyyy-MM-dd')}&end_date=${format(monthEnd, 'yyyy-MM-dd')}`);
      } else {
        // 単一店舗モード
        apiUrl = getApiUrl(`/api/shifts?store_id=${selectedStoreId}&start_date=${format(monthStart, 'yyyy-MM-dd')}&end_date=${format(monthEnd, 'yyyy-MM-dd')}`);
      }

      const res = await fetch(apiUrl);
      const shiftsData: Shift[] = await res.json();

      // 統計計算
      const totalLaborCost = shiftsData.reduce((sum, shift) => sum + (shift.labor_cost || 0), 0);
      const totalWorkMinutes = shiftsData.reduce((sum, shift) => {
        const start = new Date(`2000-01-01T${shift.start_time}`);
        const end = new Date(`2000-01-01T${shift.end_time}`);
        const minutes = (end.getTime() - start.getTime()) / 60000 - (shift.break_minutes || 0);
        return sum + minutes;
      }, 0);
      const totalWorkHours = Math.round(totalWorkMinutes / 60 * 10) / 10;

      const uniqueEmployees = new Set(shiftsData.map(s => s.employee_id)).size;

      // 予算計算（全店計の場合は全店舗の予算合計）
      let totalBudget = 0;
      if (isAllStores) {
        totalBudget = stores.reduce((sum, store) => sum + (store.monthly_budget || 0), 0);
      } else {
        totalBudget = selectedStore?.monthly_budget || 0;
      }

      const monthlyStats: MonthlyStats = {
        totalLaborCost,
        totalWorkHours,
        totalShifts: shiftsData.length,
        employeeCount: uniqueEmployees,
        averageCostPerShift: shiftsData.length > 0 ? Math.round(totalLaborCost / shiftsData.length) : 0,
        averageHoursPerShift: shiftsData.length > 0 ? Math.round(totalWorkHours / shiftsData.length * 10) / 10 : 0,
        budgetUsage: totalBudget > 0 ? Math.round((totalLaborCost / totalBudget) * 100) : 0
      };

      setStats(monthlyStats);

      // 従業員別統計
      const empStatsMap = new Map<number, EmployeeStats>();
      const employeeList = isAllStores ? allEmployees : employees;
      
      shiftsData.forEach(shift => {
        if (!empStatsMap.has(shift.employee_id)) {
          const employee = employeeList.find(e => e.id === shift.employee_id);
          if (employee) {
            empStatsMap.set(shift.employee_id, {
              employee,
              shifts: 0,
              totalHours: 0,
              totalCost: 0
            });
          }
        }

        const empStats = empStatsMap.get(shift.employee_id);
        if (empStats) {
          const start = new Date(`2000-01-01T${shift.start_time}`);
          const end = new Date(`2000-01-01T${shift.end_time}`);
          const minutes = (end.getTime() - start.getTime()) / 60000 - (shift.break_minutes || 0);
          const hours = Math.round(minutes / 60 * 10) / 10;

          empStats.shifts += 1;
          empStats.totalHours += hours;
          empStats.totalCost += shift.labor_cost || 0;
        }
      });

      const empStatsArray = Array.from(empStatsMap.values()).sort((a, b) => b.totalCost - a.totalCost);
      setEmployeeStats(empStatsArray);

      // ヒートマップデータの計算（時間帯 × 曜日）
      const heatmapMap = new Map<string, HeatmapData>();
      shiftsData.forEach(shift => {
        const shiftDate = parseISO(shift.date);
        const weekday = shiftDate.getDay();
        const startHour = parseInt(shift.start_time.split(':')[0]);
        const endHour = parseInt(shift.end_time.split(':')[0]);
        
        // シフトの開始時間から終了時間まで各時間をカウント
        for (let hour = startHour; hour < endHour; hour++) {
          const key = `${hour}-${weekday}`;
          if (!heatmapMap.has(key)) {
            heatmapMap.set(key, { hour, weekday, staffCount: 0, laborCost: 0 });
          }
          const data = heatmapMap.get(key)!;
          data.staffCount += 1;
          // 時間あたりの人件費を按分
          const shiftHours = endHour - startHour;
          data.laborCost += (shift.labor_cost || 0) / shiftHours;
        }
      });
      setHeatmapData(Array.from(heatmapMap.values()));

      // 日別データの計算
      const dailyMap = new Map<string, DailyData>();
      shiftsData.forEach(shift => {
        if (!dailyMap.has(shift.date)) {
          const shiftDate = parseISO(shift.date);
          dailyMap.set(shift.date, {
            date: shift.date,
            laborCost: 0,
            staffCount: 0,
            weekday: shiftDate.getDay()
          });
        }
        const data = dailyMap.get(shift.date)!;
        data.laborCost += shift.labor_cost || 0;
        data.staffCount += 1;
      });
      const sortedDailyData = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      setDailyData(sortedDailyData);

      // 前半/後半の分析データ計算
      const firstHalfShifts = shiftsData.filter(s => {
        const day = parseInt(s.date.split('-')[2]);
        return day <= 15;
      });
      const secondHalfShifts = shiftsData.filter(s => {
        const day = parseInt(s.date.split('-')[2]);
        return day > 15;
      });
      
      setFirstHalfStats({
        cost: firstHalfShifts.reduce((sum, s) => sum + (s.labor_cost || 0), 0),
        shifts: firstHalfShifts.length,
        staffCount: new Set(firstHalfShifts.map(s => s.employee_id)).size
      });
      setSecondHalfStats({
        cost: secondHalfShifts.reduce((sum, s) => sum + (s.labor_cost || 0), 0),
        shifts: secondHalfShifts.length,
        staffCount: new Set(secondHalfShifts.map(s => s.employee_id)).size
      });

      // 時間帯別統計
      const hourlyMap = new Map<number, { staffCount: number; laborCost: number; days: number }>();
      for (let hour = 0; hour < 24; hour++) {
        hourlyMap.set(hour, { staffCount: 0, laborCost: 0, days: 0 });
      }
      heatmapMap.forEach(data => {
        const hourData = hourlyMap.get(data.hour)!;
        hourData.staffCount += data.staffCount;
        hourData.laborCost += data.laborCost;
        hourData.days += 1;
      });
      const hourlyStatsArray: HourlyStats[] = Array.from(hourlyMap.entries()).map(([hour, data]) => ({
        hour,
        avgStaffCount: data.days > 0 ? Math.round(data.staffCount / data.days * 10) / 10 : 0,
        avgLaborCost: data.days > 0 ? Math.round(data.laborCost / data.days) : 0,
        totalShifts: data.staffCount
      }));
      setHourlyStats(hourlyStatsArray);

      // 曜日別統計
      const weekdayMap = new Map<number, { laborCost: number; shifts: number }>();
      for (let day = 0; day < 7; day++) {
        weekdayMap.set(day, { laborCost: 0, shifts: 0 });
      }
      shiftsData.forEach(shift => {
        const weekday = parseISO(shift.date).getDay();
        const data = weekdayMap.get(weekday)!;
        data.laborCost += shift.labor_cost || 0;
        data.shifts += 1;
      });
      const weekdayStatsArray: WeekdayStats[] = Array.from(weekdayMap.entries()).map(([weekday, data]) => ({
        weekday,
        totalLaborCost: data.laborCost,
        totalShifts: data.shifts,
        avgLaborCost: data.shifts > 0 ? Math.round(data.laborCost / data.shifts) : 0
      }));
      setWeekdayStats(weekdayStatsArray);

    } catch (error) {
      console.error('月間データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!selectedStore || !stats) return;

    const csvData = [
      ['月間レポート', `${targetMonth}`, selectedStore.name],
      [],
      ['サマリー'],
      ['項目', '値'],
      ['総人件費', `¥${stats.totalLaborCost.toLocaleString()}`],
      ['総労働時間', `${stats.totalWorkHours}時間`],
      ['シフト数', `${stats.totalShifts}件`],
      ['稼働従業員数', `${stats.employeeCount}名`],
      ['1シフト平均人件費', `¥${stats.averageCostPerShift.toLocaleString()}`],
      ['1シフト平均時間', `${stats.averageHoursPerShift}時間`],
      ['予算使用率', `${stats.budgetUsage}%`],
      [],
      ['従業員別統計'],
      ['従業員名', '雇用形態', 'シフト数', '総労働時間', '総人件費'],
      ...employeeStats.map(es => [
        es.employee.name,
        es.employee.employment_type === 'part_time' ? 'パート' :
        es.employee.employment_type === 'part_time_insured' ? '社保パート' : '正社員',
        es.shifts,
        `${es.totalHours}時間`,
        `¥${es.totalCost.toLocaleString()}`
      ])
    ];

    const csv = Papa.unparse(csvData);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `月間レポート_${selectedStore.name}_${targetMonth}.csv`;
    link.click();
  };

  const handlePrint = () => {
    window.print();
  };

  // ヒートマップのカラー計算
  const getHeatmapColor = (value: number, max: number) => {
    if (max === 0) return 'bg-gray-100';
    const intensity = Math.min(value / max, 1);
    if (intensity === 0) return 'bg-gray-50';
    if (intensity < 0.2) return 'bg-blue-100';
    if (intensity < 0.4) return 'bg-blue-200';
    if (intensity < 0.6) return 'bg-blue-300';
    if (intensity < 0.8) return 'bg-blue-400';
    return 'bg-blue-500';
  };

  const getHeatmapValue = (hour: number, weekday: number): number => {
    const data = heatmapData.find(d => d.hour === hour && d.weekday === weekday);
    if (!data) return 0;
    return heatmapMode === 'staff' ? data.staffCount : data.laborCost;
  };

  const getMaxHeatmapValue = (): number => {
    if (heatmapData.length === 0) return 1;
    return Math.max(...heatmapData.map(d => heatmapMode === 'staff' ? d.staffCount : d.laborCost));
  };

  const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];
  const weekdayColors = ['text-red-600', 'text-gray-700', 'text-gray-700', 'text-gray-700', 'text-gray-700', 'text-gray-700', 'text-blue-600'];

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">月間レポート</h1>
          <div className="flex gap-2">
            <button
              onClick={handleExportCSV}
              disabled={!stats}
              className="btn-secondary disabled:opacity-50"
            >
              📊 CSV出力
            </button>
            <button
              onClick={handlePrint}
              disabled={!stats}
              className="btn-secondary disabled:opacity-50"
            >
              🖨️ 印刷
            </button>
          </div>
        </div>

        {/* フィルター */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {role === 'admin' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">店舗</label>
                <select
                  value={isAllStores ? 'all' : (selectedStoreId || '')}
                  onChange={(e) => {
                    if (e.target.value === 'all') {
                      setIsAllStores(true);
                      setSelectedStoreId(null);
                    } else {
                      setIsAllStores(false);
                      setSelectedStoreId(Number(e.target.value));
                    }
                  }}
                  className="input-field"
                >
                  <option value="all">全店計</option>
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">対象月</label>
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card text-center py-12">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        ) : stats ? (
          <>
            {/* サマリーカード */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card bg-gradient-to-br from-ocean-50 to-ocean-100">
                <div className="text-sm text-ocean-700 mb-1">総人件費</div>
                <div className="text-3xl font-bold text-ocean-900">
                  ¥{stats.totalLaborCost.toLocaleString()}
                </div>
                <div className="text-xs text-ocean-600 mt-2">
                  予算使用率: {stats.budgetUsage}%
                </div>
              </div>

              <div className="card bg-gradient-to-br from-blue-50 to-blue-100">
                <div className="text-sm text-blue-700 mb-1">総労働時間</div>
                <div className="text-3xl font-bold text-blue-900">
                  {stats.totalWorkHours}h
                </div>
                <div className="text-xs text-blue-600 mt-2">
                  平均 {stats.averageHoursPerShift}h/シフト
                </div>
              </div>

              <div className="card bg-gradient-to-br from-green-50 to-green-100">
                <div className="text-sm text-green-700 mb-1">シフト数</div>
                <div className="text-3xl font-bold text-green-900">
                  {stats.totalShifts}
                </div>
                <div className="text-xs text-green-600 mt-2">
                  稼働従業員: {stats.employeeCount}名
                </div>
              </div>

              <div className="card bg-gradient-to-br from-yellow-50 to-yellow-100">
                <div className="text-sm text-yellow-700 mb-1">平均人件費</div>
                <div className="text-3xl font-bold text-yellow-900">
                  ¥{stats.averageCostPerShift.toLocaleString()}
                </div>
                <div className="text-xs text-yellow-600 mt-2">
                  1シフトあたり
                </div>
              </div>
            </div>

            {/* 前半/後半比較 */}
            {firstHalfStats && secondHalfStats && (
              <div className="card">
                <h2 className="text-lg font-bold text-gray-800 mb-4">📊 前半/後半比較</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 前半 */}
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-lg font-bold text-purple-900">前半（1-15日）</span>
                      <span className="text-xs bg-purple-200 text-purple-700 px-2 py-1 rounded">1st Half</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-purple-700">人件費</span>
                        <span className="text-xl font-bold text-purple-900">¥{firstHalfStats.cost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-purple-700">シフト数</span>
                        <span className="font-bold text-purple-900">{firstHalfStats.shifts}件</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-purple-700">稼働人数</span>
                        <span className="font-bold text-purple-900">{firstHalfStats.staffCount}名</span>
                      </div>
                      {selectedStore?.monthly_budget && (
                        <div className="mt-3 pt-3 border-t border-purple-200">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-purple-600">半期予算比</span>
                            <span className={`text-sm font-bold ${
                              firstHalfStats.cost > selectedStore.monthly_budget / 2 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {Math.round(firstHalfStats.cost / (selectedStore.monthly_budget / 2) * 100)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* 後半 */}
                  <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-lg font-bold text-indigo-900">後半（16日以降）</span>
                      <span className="text-xs bg-indigo-200 text-indigo-700 px-2 py-1 rounded">2nd Half</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-indigo-700">人件費</span>
                        <span className="text-xl font-bold text-indigo-900">¥{secondHalfStats.cost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-indigo-700">シフト数</span>
                        <span className="font-bold text-indigo-900">{secondHalfStats.shifts}件</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-indigo-700">稼働人数</span>
                        <span className="font-bold text-indigo-900">{secondHalfStats.staffCount}名</span>
                      </div>
                      {selectedStore?.monthly_budget && (
                        <div className="mt-3 pt-3 border-t border-indigo-200">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-indigo-600">半期予算比</span>
                            <span className={`text-sm font-bold ${
                              secondHalfStats.cost > selectedStore.monthly_budget / 2 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {Math.round(secondHalfStats.cost / (selectedStore.monthly_budget / 2) * 100)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* 前半/後半の差分 */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex flex-wrap gap-4 justify-center text-sm">
                    <div className="text-center">
                      <div className="text-gray-600">人件費差</div>
                      <div className={`font-bold ${
                        firstHalfStats.cost > secondHalfStats.cost ? 'text-purple-600' : 'text-indigo-600'
                      }`}>
                        {firstHalfStats.cost > secondHalfStats.cost ? '前半 +' : '後半 +'}
                        ¥{Math.abs(firstHalfStats.cost - secondHalfStats.cost).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-600">シフト差</div>
                      <div className={`font-bold ${
                        firstHalfStats.shifts > secondHalfStats.shifts ? 'text-purple-600' : 'text-indigo-600'
                      }`}>
                        {firstHalfStats.shifts > secondHalfStats.shifts ? '前半 +' : '後半 +'}
                        {Math.abs(firstHalfStats.shifts - secondHalfStats.shifts)}件
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 予算比較 */}
            {selectedStore?.monthly_budget && (
              <div className="card">
                <h2 className="text-lg font-bold text-gray-800 mb-4">予算比較</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-gray-600">月間予算</div>
                      <div className="text-2xl font-bold text-gray-900">
                        ¥{selectedStore.monthly_budget.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">実績</div>
                      <div className="text-2xl font-bold text-gray-900">
                        ¥{stats.totalLaborCost.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">差額</div>
                      <div className={`text-2xl font-bold ${
                        stats.totalLaborCost <= selectedStore.monthly_budget ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {stats.totalLaborCost <= selectedStore.monthly_budget ? '-' : '+'}
                        ¥{Math.abs(selectedStore.monthly_budget - stats.totalLaborCost).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="relative pt-1">
                    <div className="flex mb-2 items-center justify-between">
                      <div>
                        <span className={`text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full ${
                          stats.budgetUsage > 100 ? 'text-red-600 bg-red-200' :
                          stats.budgetUsage > 80 ? 'text-yellow-600 bg-yellow-200' :
                          'text-green-600 bg-green-200'
                        }`}>
                          予算使用率
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold inline-block text-gray-600">
                          {stats.budgetUsage}%
                        </span>
                      </div>
                    </div>
                    <div className="overflow-hidden h-4 text-xs flex rounded bg-gray-200">
                      <div
                        style={{ width: `${Math.min(stats.budgetUsage, 100)}%` }}
                        className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${
                          stats.budgetUsage > 100 ? 'bg-red-500' :
                          stats.budgetUsage > 80 ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 従業員別統計 */}
            <div className="card">
              <h2 className="text-lg font-bold text-gray-800 mb-4">従業員別統計</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">従業員名</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">雇用形態</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">シフト数</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">総労働時間</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">総人件費</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">平均/シフト</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {employeeStats.map(empStat => (
                      <tr key={empStat.employee.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{empStat.employee.name}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {empStat.employee.employment_type === 'part_time' && 'パート'}
                          {empStat.employee.employment_type === 'part_time_insured' && '社保パート'}
                          {empStat.employee.employment_type === 'full_time' && '正社員'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                          {empStat.shifts}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                          {empStat.totalHours}h
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          ¥{empStat.totalCost.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                          ¥{Math.round(empStat.totalCost / empStat.shifts).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 font-bold text-gray-900">合計</td>
                      <td className="px-4 py-3 text-center font-bold text-gray-900">{stats.totalShifts}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{stats.totalWorkHours}h</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        ¥{stats.totalLaborCost.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        ¥{stats.averageCostPerShift.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* 時間帯×曜日ヒートマップ */}
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">時間帯別分析（ヒートマップ）</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setHeatmapMode('staff')}
                    className={`px-3 py-1 rounded text-sm font-medium transition ${
                      heatmapMode === 'staff'
                        ? 'bg-ocean-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    👥 人数
                  </button>
                  <button
                    onClick={() => setHeatmapMode('cost')}
                    className={`px-3 py-1 rounded text-sm font-medium transition ${
                      heatmapMode === 'cost'
                        ? 'bg-ocean-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    💰 人件費
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-gray-300 px-2 py-2 bg-gray-50 text-xs font-medium text-gray-700">
                        時間
                      </th>
                      {weekdayLabels.map((label, idx) => (
                        <th key={idx} className={`border border-gray-300 px-2 py-2 bg-gray-50 text-xs font-medium ${weekdayColors[idx]}`}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 24 }, (_, hour) => (
                      <tr key={hour}>
                        <td className="border border-gray-300 px-2 py-2 bg-gray-50 text-xs font-medium text-gray-700 text-center">
                          {hour}:00
                        </td>
                        {Array.from({ length: 7 }, (_, weekday) => {
                          const value = getHeatmapValue(hour, weekday);
                          const maxValue = getMaxHeatmapValue();
                          return (
                            <td
                              key={weekday}
                              className={`border border-gray-300 px-2 py-2 text-center text-xs font-medium ${getHeatmapColor(value, maxValue)}`}
                              title={heatmapMode === 'staff' ? `${value}人` : `¥${Math.round(value).toLocaleString()}`}
                            >
                              {value > 0 ? (heatmapMode === 'staff' ? value : `¥${Math.round(value / 1000)}k`) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-xs text-gray-500 flex items-center gap-4">
                <span>濃い色ほど{heatmapMode === 'staff' ? '人数が多い' : '人件費が高い'}</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-gray-50 border border-gray-300"></div>
                  <span>0</span>
                  <div className="w-4 h-4 bg-blue-100 border border-gray-300"></div>
                  <div className="w-4 h-4 bg-blue-200 border border-gray-300"></div>
                  <div className="w-4 h-4 bg-blue-300 border border-gray-300"></div>
                  <div className="w-4 h-4 bg-blue-400 border border-gray-300"></div>
                  <div className="w-4 h-4 bg-blue-500 border border-gray-300"></div>
                  <span>最大</span>
                </div>
              </div>
            </div>

            {/* 日別推移グラフ */}
            <div className="card">
              <h2 className="text-lg font-bold text-gray-800 mb-4">日別人件費推移</h2>
              <div className="space-y-2">
                {dailyData.map((day, idx) => {
                  const maxCost = Math.max(...dailyData.map(d => d.laborCost), 1);
                  const widthPercent = (day.laborCost / maxCost) * 100;
                  const dayOfWeek = weekdayLabels[day.weekday];
                  const isWeekend = day.weekday === 0 || day.weekday === 6;
                  const budgetPerDay = selectedStore?.monthly_budget ? selectedStore.monthly_budget / dailyData.length : 0;
                  const isOverBudget = day.laborCost > budgetPerDay;
                  
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-16 text-xs text-gray-600">
                        {format(parseISO(day.date), 'M/d')}({dayOfWeek})
                      </div>
                      <div className="flex-1 relative h-8 bg-gray-100 rounded overflow-hidden">
                        <div
                          className={`h-full ${isWeekend ? 'bg-blue-400' : 'bg-ocean-500'} transition-all`}
                          style={{ width: `${widthPercent}%` }}
                        />
                        {budgetPerDay > 0 && (
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-red-400"
                            style={{ left: `${(budgetPerDay / maxCost) * 100}%` }}
                            title={`予算ライン: ¥${Math.round(budgetPerDay).toLocaleString()}`}
                          />
                        )}
                      </div>
                      <div className={`w-24 text-xs text-right font-medium ${isOverBudget ? 'text-red-600' : 'text-gray-700'}`}>
                        ¥{day.laborCost.toLocaleString()}
                      </div>
                      <div className="w-16 text-xs text-gray-500 text-right">
                        {day.staffCount}人
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedStore?.monthly_budget && (
                <div className="mt-4 text-xs text-gray-500">
                  <span className="inline-block w-2 h-2 bg-red-400 mr-1"></span>
                  赤線: 1日あたり予算目安 (¥{Math.round(selectedStore.monthly_budget / dailyData.length).toLocaleString()})
                </div>
              )}
            </div>

            {/* 時間帯別統計 */}
            <div className="card">
              <h2 className="text-lg font-bold text-gray-800 mb-4">時間帯別統計</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {hourlyStats.filter(h => h.totalShifts > 0).map(hourStat => {
                  const maxAvgStaff = Math.max(...hourlyStats.map(h => h.avgStaffCount), 1);
                  const isPeak = hourStat.avgStaffCount >= maxAvgStaff * 0.8;
                  
                  return (
                    <div
                      key={hourStat.hour}
                      className={`p-3 rounded-lg border-2 ${
                        isPeak ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="text-sm font-bold text-gray-800 mb-1">
                        {hourStat.hour}:00
                        {isPeak && <span className="ml-1 text-orange-500">🔥</span>}
                      </div>
                      <div className="text-xs text-gray-600">
                        平均: {hourStat.avgStaffCount}人
                      </div>
                      <div className="text-xs text-gray-600">
                        ¥{hourStat.avgLaborCost.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 text-xs text-gray-500">
                🔥 ピーク時間帯（平均人数が多い時間）
              </div>
            </div>

            {/* 曜日別分析 */}
            <div className="card">
              <h2 className="text-lg font-bold text-gray-800 mb-4">曜日別分析</h2>
              <div className="space-y-3">
                {weekdayStats.map(dayStat => {
                  const maxCost = Math.max(...weekdayStats.map(d => d.totalLaborCost), 1);
                  const widthPercent = (dayStat.totalLaborCost / maxCost) * 100;
                  const isWeekend = dayStat.weekday === 0 || dayStat.weekday === 6;
                  
                  return (
                    <div key={dayStat.weekday} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className={`w-12 text-sm font-medium ${weekdayColors[dayStat.weekday]}`}>
                          {weekdayLabels[dayStat.weekday]}曜日
                        </div>
                        <div className="text-xs text-gray-500">
                          {dayStat.totalShifts}シフト
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 relative h-10 bg-gray-100 rounded overflow-hidden">
                          <div
                            className={`h-full flex items-center px-2 text-white text-sm font-bold ${
                              isWeekend ? 'bg-blue-500' : 'bg-ocean-500'
                            }`}
                            style={{ width: `${widthPercent}%` }}
                          >
                            {widthPercent > 30 && `¥${dayStat.totalLaborCost.toLocaleString()}`}
                          </div>
                        </div>
                        {widthPercent <= 30 && (
                          <div className="w-32 text-sm font-medium text-gray-700">
                            ¥{dayStat.totalLaborCost.toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="card text-center py-12">
            <p className="text-gray-500">店舗と対象月を選択してください</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
