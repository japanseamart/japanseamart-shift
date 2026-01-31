import { useState, useEffect } from 'react';
import { format, eachDayOfInterval } from 'date-fns';
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
                  {Array.from({ length: 12 }, (_, i) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() + i - 3);
                    return (
                      <option key={i} value={format(d, 'yyyy-MM')}>
                        {format(d, 'yyyy年M月', { locale: ja })}
                      </option>
                    );
                  })}
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

            {/* 日別出勤一覧 */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-800 mb-4">📆 日別出勤一覧</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {periodDates.map(date => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const dayShifts = shifts.filter(s => s.date === dateStr);
                  const specialDay = getSpecialDayInfo(date);
                  const dayOfWeek = date.getDay();
                  
                  return (
                    <div
                      key={dateStr}
                      className={`p-3 rounded-lg border-2 ${
                        specialDay?.type === 1 ? 'border-red-300 bg-red-50' :
                        dayOfWeek === 0 ? 'border-red-200 bg-red-50' :
                        dayOfWeek === 6 ? 'border-blue-200 bg-blue-50' :
                        'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className={`font-bold ${
                          dayOfWeek === 0 ? 'text-red-600' :
                          dayOfWeek === 6 ? 'text-blue-600' : 'text-gray-800'
                        }`}>
                          {format(date, 'M/d(E)', { locale: ja })}
                        </span>
                        <span className="text-sm bg-ocean-100 text-ocean-700 px-2 py-0.5 rounded-full">
                          {dayShifts.length}名
                        </span>
                      </div>
                      {specialDay && (
                        <div className="text-xs text-red-600 mb-1">{specialDay.name}</div>
                      )}
                      <div className="text-xs text-gray-600 space-y-0.5">
                        {dayShifts.slice(0, 5).map(shift => {
                          const emp = employees.find(e => e.id === shift.employee_id);
                          return (
                            <div key={shift.id} className="flex justify-between">
                              <span>{emp?.name}</span>
                              <span className="text-gray-400">
                                {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
                              </span>
                            </div>
                          );
                        })}
                        {dayShifts.length > 5 && (
                          <div className="text-gray-400">...他{dayShifts.length - 5}名</div>
                        )}
                        {dayShifts.length === 0 && (
                          <div className="text-gray-400">シフトなし</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
