import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import Papa from 'papaparse';
import { Role, Store, Employee, Shift } from '../types';
import AdminLayout from '../components/AdminLayout';

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

export default function MonthlyReport({ role, storeId, onLogout }: MonthlyReportProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(storeId);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [targetMonth, setTargetMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      fetchStore(selectedStoreId);
      fetchEmployees(selectedStoreId);
      fetchMonthlyData();
    }
  }, [selectedStoreId, targetMonth]);

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/stores');
      const data = await res.json();
      setStores(data.filter((s: Store) => s.id !== 8));
      
      if (!selectedStoreId && data.length > 0) {
        setSelectedStoreId(data[0].id);
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  };

  const fetchStore = async (id: number) => {
    try {
      const res = await fetch(`/api/stores/${id}`);
      const data = await res.json();
      setSelectedStore(data);
    } catch (error) {
      console.error('店舗詳細取得エラー:', error);
    }
  };

  const fetchEmployees = async (storeId: number) => {
    try {
      const res = await fetch(`/api/employees?store_id=${storeId}`);
      const data = await res.json();
      setEmployees(data);
    } catch (error) {
      console.error('従業員取得エラー:', error);
    }
  };

  const fetchMonthlyData = async () => {
    if (!selectedStoreId) return;

    setLoading(true);

    try {
      const monthStart = startOfMonth(parseISO(`${targetMonth}-01`));
      const monthEnd = endOfMonth(monthStart);

      const res = await fetch(
        `/api/shifts?store_id=${selectedStoreId}&start_date=${format(monthStart, 'yyyy-MM-dd')}&end_date=${format(monthEnd, 'yyyy-MM-dd')}`
      );
      const shiftsData: Shift[] = await res.json();
      setShifts(shiftsData);

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

      const monthlyStats: MonthlyStats = {
        totalLaborCost,
        totalWorkHours,
        totalShifts: shiftsData.length,
        employeeCount: uniqueEmployees,
        averageCostPerShift: shiftsData.length > 0 ? Math.round(totalLaborCost / shiftsData.length) : 0,
        averageHoursPerShift: shiftsData.length > 0 ? Math.round(totalWorkHours / shiftsData.length * 10) / 10 : 0,
        budgetUsage: selectedStore?.monthly_budget ? Math.round((totalLaborCost / selectedStore.monthly_budget) * 100) : 0
      };

      setStats(monthlyStats);

      // 従業員別統計
      const empStatsMap = new Map<number, EmployeeStats>();
      
      shiftsData.forEach(shift => {
        if (!empStatsMap.has(shift.employee_id)) {
          const employee = employees.find(e => e.id === shift.employee_id);
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
                  value={selectedStoreId || ''}
                  onChange={(e) => setSelectedStoreId(Number(e.target.value))}
                  className="input-field"
                >
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
