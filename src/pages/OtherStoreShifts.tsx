import { useState, useEffect } from 'react';
import { format, eachDayOfInterval, differenceInMinutes } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Role, Employee, Shift, Store, SpecialDay } from '../types';
import AdminLayout from '../components/AdminLayout';
import { getApiUrl } from '../config/api';
import { getPeriodDates } from '../utils/dateUtils';

interface OtherStoreShiftsProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

export default function OtherStoreShifts({ role, storeId, onLogout }: OtherStoreShiftsProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  
  // 期間選択
  const today = new Date();
  const [targetYear, setTargetYear] = useState(today.getFullYear());
  const [targetMonth, setTargetMonth] = useState(today.getMonth() + 1);
  const [targetPeriod, setTargetPeriod] = useState<'first' | 'second'>(today.getDate() <= 15 ? 'first' : 'second');
  
  const [loading, setLoading] = useState(false);
  const [isPublished, setIsPublished] = useState(false);

  // 期間の日付リストを計算
  const { start: periodStart, end: periodEnd } = getPeriodDates(targetYear, targetMonth, targetPeriod);
  const periodDates = eachDayOfInterval({ start: periodStart, end: periodEnd });

  useEffect(() => {
    fetchStores();
    fetchSpecialDays();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      fetchStore(selectedStoreId);
      fetchEmployees(selectedStoreId);
      fetchShifts();
      fetchPublicationStatus();
    }
  }, [selectedStoreId, targetYear, targetMonth, targetPeriod]);

  const fetchStores = async () => {
    try {
      const res = await fetch(getApiUrl('/api/stores'));
      const data = await res.json();
      // 本部以外の全店舗（自店舗も含む）
      const allStores = data.filter((s: Store) => s.id !== 8);
      setStores(allStores);
      // 最初の店舗を選択
      if (allStores.length > 0 && !selectedStoreId) {
        setSelectedStoreId(allStores[0].id);
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
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

  const fetchSpecialDays = async () => {
    try {
      const res = await fetch(getApiUrl('/api/special-days'));
      const data = await res.json();
      setSpecialDays(data);
    } catch (error) {
      console.error('特別日取得エラー:', error);
    }
  };

  const fetchShifts = async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const res = await fetch(
        getApiUrl(`/api/shifts?store_id=${selectedStoreId}&start_date=${format(periodStart, 'yyyy-MM-dd')}&end_date=${format(periodEnd, 'yyyy-MM-dd')}`)
      );
      const data = await res.json();
      setShifts(data);
    } catch (error) {
      console.error('シフト取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPublicationStatus = async () => {
    if (!selectedStoreId) return;
    try {
      const res = await fetch(
        getApiUrl(`/api/weekly-publications?store_id=${selectedStoreId}&week_start_date=${format(periodStart, 'yyyy-MM-dd')}`)
      );
      const data = await res.json();
      setIsPublished(data.is_published || false);
    } catch (error) {
      console.error('公開状態取得エラー:', error);
      setIsPublished(false);
    }
  };

  const getSpecialDayInfo = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return specialDays.find(sd => sd.date === dateStr);
  };

  const getShiftForEmployeeAndDate = (employeeId: number, dateStr: string) => {
    return shifts.find(s => s.employee_id === employeeId && s.date === dateStr);
  };

  // 日別の出勤人数を計算
  const getDailyStaffCount = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.filter(s => s.date === dateStr).length;
  };

  // 人件費計算（シフトに保存されたlabor_costを優先、なければ計算）
  const calculateLaborCost = (shift: Shift, employee: Employee): number => {
    // 正社員は月給制のため人件費計算から除外
    if (employee.employment_type === 'full_time') return 0;
    // シフトに保存されたlabor_costがあれば使用
    if (shift.labor_cost) return shift.labor_cost;
    
    if (!selectedStore) return 0;
    const startTime = new Date(`2000-01-01T${shift.start_time}`);
    const endTime = new Date(`2000-01-01T${shift.end_time}`);
    const workMinutes = differenceInMinutes(endTime, startTime) - (shift.break_minutes || 0);
    const workHours = workMinutes / 60;

    let hourlyRate = employee.hourly_wage || 0;

    if (selectedStore.overtime_rate_enabled) {
      const specialDay = specialDays.find(sd => sd.date === shift.date);
      const dayOfWeek = new Date(shift.date).getDay();
      const applicableRates: number[] = [];

      if (specialDay?.type === 1 && selectedStore.holiday_rate > 0) {
        applicableRates.push(selectedStore.holiday_rate);
      }
      if (dayOfWeek === 0 && selectedStore.sunday_rate > 0) {
        applicableRates.push(selectedStore.sunday_rate);
      }
      if (dayOfWeek === 6 && selectedStore.saturday_rate > 0) {
        applicableRates.push(selectedStore.saturday_rate);
      }
      if (applicableRates.length > 0) {
        hourlyRate += Math.max(...applicableRates);
      }
    }
    return Math.round(workHours * hourlyRate);
  };

  // 日別人件費を計算
  const getDailyCost = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts
      .filter(s => s.date === dateStr)
      .reduce((sum, shift) => {
        const employee = employees.find(e => e.id === shift.employee_id);
        return sum + (employee ? calculateLaborCost(shift, employee) : 0);
      }, 0);
  };

  // 期間内の総人件費を計算
  const totalLaborCost = shifts.reduce((sum, shift) => {
    const employee = employees.find(e => e.id === shift.employee_id);
    return sum + (employee ? calculateLaborCost(shift, employee) : 0);
  }, 0);

  // ヒートマップ用: 時間帯別人数を計算
  const getHourlyStaffCount = (date: Date, hour: number) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const timeStr = `${hour.toString().padStart(2, '0')}:00`;
    return shifts.filter(s => {
      if (s.date !== dateStr) return false;
      const start = s.start_time.slice(0, 5);
      const end = s.end_time.slice(0, 5);
      return start <= timeStr && end > timeStr;
    }).length;
  };

  // ヒートマップ用: 最大人数を計算
  const getMaxHourlyStaffCount = () => {
    let max = 0;
    for (const date of periodDates) {
      for (let hour = 6; hour <= 21; hour++) {
        const count = getHourlyStaffCount(date, hour);
        if (count > max) max = count;
      }
    }
    return max || 1;
  };

  // ヒートマップのカラー計算（青系グラデーション）
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

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">🏪 他店舗シフト閲覧</h1>
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">閲覧専用</span>
        </div>

        {/* コントロールパネル */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* 店舗選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">店舗を選択</label>
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

            {/* 期間選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">対象期間</label>
              <div className="flex gap-2">
                <select
                  value={`${targetYear}-${targetMonth.toString().padStart(2, '0')}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split('-');
                    setTargetYear(parseInt(y));
                    setTargetMonth(parseInt(m));
                  }}
                  className="input-field flex-1"
                >
                  {(() => {
                    // システム稼働開始: 2024年11月から現在+12ヶ月先まで
                    const startYear = 2024;
                    const startMonth = 11; // 11月
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
                  onClick={() => setTargetPeriod('first')}
                  className={`px-4 py-2 rounded-lg font-bold transition-colors ${
                    targetPeriod === 'first' ? 'bg-ocean-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  前半
                </button>
                <button
                  onClick={() => setTargetPeriod('second')}
                  className={`px-4 py-2 rounded-lg font-bold transition-colors ${
                    targetPeriod === 'second' ? 'bg-ocean-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  後半
                </button>
              </div>
            </div>
          </div>

          {/* 期間表示 */}
          <div className="bg-ocean-50 border border-ocean-200 rounded-lg p-3 text-center">
            <span className="text-ocean-800 font-bold">
              📅 {selectedStore?.name} - {targetMonth}月{targetPeriod === 'first' ? '前半' : '後半'}
              （{format(periodStart, 'M/d')}〜{format(periodEnd, 'M/d')}）
            </span>
          </div>
          
          {/* 公開状態インジケーター */}
          <div className={`mt-4 p-3 rounded-lg border-2 ${isPublished ? 'bg-green-50 border-green-300' : 'bg-yellow-50 border-yellow-300'}`}>
            <div className="flex items-center gap-2">
              {isPublished ? (
                <>
                  <span className="text-green-600 text-lg">✅</span>
                  <span className="text-green-800 font-medium">公開済み</span>
                </>
              ) : (
                <>
                  <span className="text-yellow-600 text-lg">🔒</span>
                  <span className="text-yellow-800 font-medium">編集中（未公開）</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* シフト一覧 */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        ) : stores.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-gray-500">閲覧可能な他店舗がありません</div>
          </div>
        ) : (
          <>
            {/* サマリー */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="card bg-gradient-to-br from-ocean-50 to-ocean-100">
                <div className="text-sm text-ocean-700">従業員数</div>
                <div className="text-2xl font-bold text-ocean-900">{employees.length}名</div>
              </div>
              <div className="card bg-gradient-to-br from-green-50 to-green-100">
                <div className="text-sm text-green-700">シフト数</div>
                <div className="text-2xl font-bold text-green-900">{shifts.length}件</div>
              </div>
              <div className="card bg-gradient-to-br from-blue-50 to-blue-100">
                <div className="text-sm text-blue-700">平均出勤</div>
                <div className="text-2xl font-bold text-blue-900">
                  {periodDates.length > 0 ? Math.round(shifts.length / periodDates.length * 10) / 10 : 0}名/日
                </div>
              </div>
              <div className="card bg-gradient-to-br from-purple-50 to-purple-100">
                <div className="text-sm text-purple-700">稼働率</div>
                <div className="text-2xl font-bold text-purple-900">
                  {employees.length > 0 && periodDates.length > 0
                    ? Math.round(shifts.length / (employees.length * periodDates.length) * 100)
                    : 0}%
                </div>
              </div>
              <div className="card bg-gradient-to-br from-amber-50 to-amber-100" data-salary>
                <div className="text-sm text-amber-700">期間人件費</div>
                <div className="text-2xl font-bold text-amber-900">¥{totalLaborCost.toLocaleString()}</div>
              </div>
            </div>

            {/* シフト表 */}
            <div className="card overflow-auto max-h-[600px] border rounded-lg">
              <table className="min-w-full">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gray-50">
                    <th className="sticky left-0 z-30 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r border-b min-w-[120px]">
                      従業員
                    </th>
                    {periodDates.map(date => {
                      const specialDay = getSpecialDayInfo(date);
                      const dayOfWeek = date.getDay();
                      const staffCount = getDailyStaffCount(date);
                      return (
                        <th
                          key={date.toISOString()}
                          className={`px-2 py-3 text-center text-xs font-medium uppercase border-r border-b min-w-[80px] ${
                            specialDay?.type === 1 ? 'bg-red-100 text-red-700' :
                            dayOfWeek === 0 ? 'bg-red-50 text-red-600' :
                            dayOfWeek === 6 ? 'bg-blue-50 text-blue-700' :
                            'bg-gray-50 text-gray-500'
                          }`}
                        >
                          <div className="font-bold">{format(date, 'd', { locale: ja })}</div>
                          <div className="text-[10px] mt-1">{format(date, 'E', { locale: ja })}</div>
                          <div className="text-[10px] text-gray-400 mt-1">{staffCount}名</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {employees.map(employee => (
                    <tr key={employee.id} className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r">
                        <div className="font-medium text-gray-900">{employee.name}</div>
                        <div className="text-xs text-gray-500">
                          {employee.employment_type === 'part_time' && 'パート'}
                          {employee.employment_type === 'part_time_insured' && '社保パート'}
                          {employee.employment_type === 'full_time' && '正社員'}
                        </div>
                      </td>
                      {periodDates.map(date => {
                        const dateStr = format(date, 'yyyy-MM-dd');
                        const shift = getShiftForEmployeeAndDate(employee.id, dateStr);
                        const specialDay = getSpecialDayInfo(date);
                        const dayOfWeek = date.getDay();
                        return (
                          <td
                            key={dateStr}
                            className={`px-2 py-2 border-r text-center ${
                              specialDay?.type === 1 ? 'bg-red-50' :
                              dayOfWeek === 0 ? 'bg-red-50' :
                              dayOfWeek === 6 ? 'bg-blue-50' : ''
                            }`}
                          >
                            {shift ? (
                              <div className="bg-ocean-600 text-white rounded px-1 py-1 text-xs">
                                <div className="font-medium">
                                  {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
                                </div>
                                {shift.break_minutes > 0 && (
                                  <div className="text-[9px] opacity-75">休{shift.break_minutes}分</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ヒートマップ */}
            {(() => {
              const maxStaffCount = getMaxHourlyStaffCount();
              return (
                <div className="card overflow-x-auto">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">🔥 時間帯別人員配置</h3>
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="sticky left-0 z-10 bg-gray-50 px-2 py-2 text-left font-medium text-gray-500 min-w-[60px]">時間</th>
                        {periodDates.map(date => {
                          const dayOfWeek = date.getDay();
                          return (
                            <th key={date.toISOString()}
                              className={`px-1 py-2 text-center font-medium min-w-[40px] ${
                                dayOfWeek === 0 ? 'bg-red-50 text-red-600' : dayOfWeek === 6 ? 'bg-blue-50 text-blue-600' : 'text-gray-500'
                              }`}>
                              <div>{format(date, 'd')}</div>
                              <div className="text-[9px]">{format(date, 'E', { locale: ja })}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 16 }, (_, i) => i + 6).map(hour => (
                        <tr key={hour} className="border-b">
                          <td className="sticky left-0 z-10 bg-white px-2 py-1 font-medium text-gray-700">{hour}:00</td>
                          {periodDates.map(date => {
                            const count = getHourlyStaffCount(date, hour);
                            const bgColor = getHeatmapColor(count, maxStaffCount);
                            return (
                              <td key={date.toISOString()} className={`px-1 py-1 text-center ${bgColor}`} title={`${count}名`}>
                                {count > 0 && <span className={count >= maxStaffCount * 0.8 ? 'text-white font-bold' : 'text-gray-800 font-medium'}>{count}</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 text-xs text-gray-500 flex items-center gap-4">
                    <span>濃い色ほど人数が多い</span>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 bg-gray-50 border border-gray-300 rounded"></div>
                      <span>0</span>
                      <div className="w-4 h-4 bg-blue-100 border border-gray-300 rounded"></div>
                      <div className="w-4 h-4 bg-blue-200 border border-gray-300 rounded"></div>
                      <div className="w-4 h-4 bg-blue-300 border border-gray-300 rounded"></div>
                      <div className="w-4 h-4 bg-blue-400 border border-gray-300 rounded"></div>
                      <div className="w-4 h-4 bg-blue-500 border border-gray-300 rounded"></div>
                      <span>最大({maxStaffCount}名)</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 日次人件費計 */}
            <div className="card" data-salary>
              <h3 className="text-lg font-bold text-gray-800 mb-4">💰 日次人件費一覧</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">日付</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-500">出勤人数</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">人件費</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {periodDates.map(date => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const dayShifts = shifts.filter(s => s.date === dateStr);
                      const dayCost = getDailyCost(date);
                      const specialDay = getSpecialDayInfo(date);
                      const dayOfWeek = date.getDay();
                      return (
                        <tr key={dateStr} className={`${
                          specialDay?.type === 1 ? 'bg-red-50' : dayOfWeek === 0 ? 'bg-red-50' : dayOfWeek === 6 ? 'bg-blue-50' : ''
                        }`}>
                          <td className="px-4 py-3">
                            <div className={`font-medium ${dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : 'text-gray-900'}`}>
                              {format(date, 'M/d(E)', { locale: ja })}
                            </div>
                            {specialDay && <div className="text-xs text-red-600">{specialDay.name}</div>}
                          </td>
                          <td className="px-4 py-3 text-center font-medium">{dayShifts.length}名</td>
                          <td className="px-4 py-3 text-right font-bold">¥{dayCost.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-ocean-50">
                    <tr>
                      <td className="px-4 py-3 font-bold text-gray-800">合計</td>
                      <td className="px-4 py-3 text-center font-bold">{shifts.length}件</td>
                      <td className="px-4 py-3 text-right font-bold text-ocean-700">¥{totalLaborCost.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
