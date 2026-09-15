import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Store, Employee, Shift, SpecialDay } from '../types';
import type { AllStoresDeadlineStatus } from '../types';
import { getApiUrl } from '../config/api';
import HelpPanel from '../components/HelpPanel';

export default function EmployeeShiftView() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number>(1);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [deadlineStatus, setDeadlineStatus] = useState<AllStoresDeadlineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPublished, setIsPublished] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'table'>('list'); // リストビュー or テーブルビュー
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null); // フィルター用
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);

  useEffect(() => {
    fetchStores();
    fetchDeadlineStatus();
    fetchSpecialDays();
  }, []);

  const fetchSpecialDays = async () => {
    try {
      const res = await fetch(getApiUrl('/api/special-days'));
      const data = await res.json();
      setSpecialDays(data);
    } catch (error) {
      console.error('特別日取得エラー:', error);
    }
  };

  // 特別日情報を取得（type=1=祝日, 2=繁忙, 3=イベント）
  const getSpecialDayInfo = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return specialDays.find(sd => sd.date === dateStr);
  };

  useEffect(() => {
    if (selectedStoreId) {
      fetchShifts();
      fetchEmployees();
    }
  }, [selectedStoreId, currentWeek]);

  const fetchStores = async () => {
    try {
      const res = await fetch(getApiUrl('/api/stores'));
      const data = await res.json();
      setStores(data);
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  };

  const fetchDeadlineStatus = async () => {
    try {
      const res = await fetch(getApiUrl('/api/shift-deadlines/all-stores-status'));
      const data = await res.json();
      setDeadlineStatus(data);
    } catch (error) {
      console.error('締切ステータス取得エラー:', error);
      setDeadlineStatus(null);
    }
  };

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
      
      // 週に該当する前半/後半の公開状態を確認
      // 前半: 1日〜15日、後半: 16日〜月末
      // 週の開始日と終了日が属する期間の公開状態を両方チェック
      const weekStartDay = weekStart.getDate();
      const weekEndDay = weekEnd.getDate();
      const weekStartMonth = weekStart.getMonth();
      const weekEndMonth = weekEnd.getMonth();
      const weekStartYear = weekStart.getFullYear();
      const weekEndYear = weekEnd.getFullYear();
      
      // 前半の開始日（1日）と後半の開始日（16日）を計算
      const getHalfStartDate = (year: number, month: number, isFirstHalf: boolean) => {
        const day = isFirstHalf ? 1 : 16;
        return format(new Date(year, month, day), 'yyyy-MM-dd');
      };
      
      // 週の開始日が属する期間
      const startIsFirstHalf = weekStartDay <= 15;
      const startHalfDate = getHalfStartDate(weekStartYear, weekStartMonth, startIsFirstHalf);
      
      // 週の終了日が属する期間
      const endIsFirstHalf = weekEndDay <= 15;
      const endHalfDate = getHalfStartDate(weekEndYear, weekEndMonth, endIsFirstHalf);
      
      // 両方の公開状態を確認
      const pubRes1 = await fetch(
        getApiUrl(`/api/weekly-publications?store_id=${selectedStoreId}&week_start_date=${startHalfDate}`)
      );
      const pubData1 = await pubRes1.json();
      
      let pubData2 = pubData1;
      if (startHalfDate !== endHalfDate) {
        const pubRes2 = await fetch(
          getApiUrl(`/api/weekly-publications?store_id=${selectedStoreId}&week_start_date=${endHalfDate}`)
        );
        pubData2 = await pubRes2.json();
      }
      
      console.log('従業員画面 - 公開状態取得 v2:', { startHalfDate, endHalfDate, pubData1, pubData2, published: pubData1.is_published === 1 || pubData2.is_published === 1 });
      
      // どちらかの期間が公開されていれば公開済みとする
      const published = pubData1.is_published === 1 || pubData2.is_published === 1;
      setIsPublished(published);
      
      // 公開済みの場合のみシフトを取得
      if (published) {
        const res = await fetch(
          getApiUrl(`/api/shifts?store_id=${selectedStoreId}&start_date=${format(weekStart, 'yyyy-MM-dd')}&end_date=${format(weekEnd, 'yyyy-MM-dd')}`)
        );
        const data = await res.json();
        setShifts(data);
      } else {
        setShifts([]);
      }
    } catch (error) {
      console.error('シフト取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch(getApiUrl(`/api/employees?store_id=${selectedStoreId}`));
      const data = await res.json();
      setEmployees(data);
    } catch (error) {
      console.error('従業員取得エラー:', error);
    }
  };

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getShiftsForDay = (date: Date, employeeId: number) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.filter(s => s.date === dateStr && s.employee_id === employeeId);
  };

  const selectedStore = stores.find(s => s.id === selectedStoreId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 to-blue-50">
      {/* ヘッダー */}
      <header className="bg-white shadow-md border-b-4 border-ocean-500 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-ocean-500 to-ocean-700 rounded-lg flex items-center justify-center mr-2 sm:mr-3">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-800">シフト確認</h1>
                <p className="text-xs text-gray-500 hidden sm:block">従業員用画面</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link to="/employee/request" className="btn-primary text-sm px-3 py-2 sm:px-4">
                希望提出
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-8 space-y-4 sm:space-y-6">
        {/* 全店舗シフト締切ステータス */}
        {deadlineStatus && deadlineStatus.rows.length > 0 && (
          <div className="card">
            <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4 flex items-center">
              <span className="mr-2">📅</span>
              各店舗のシフト締切状況
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200 text-gray-600">
                    <th className="text-left py-2 px-2 font-medium">店舗</th>
                    <th className="text-left py-2 px-2 font-medium">対象期間</th>
                    <th className="text-left py-2 px-2 font-medium">締切日</th>
                    <th className="text-left py-2 px-2 font-medium">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {deadlineStatus.rows.map((row, idx) => {
                    const periodLabel = `${row.target_month}月${row.target_period === 'first' ? '前半' : '後半'}`;
                    if (!row.deadline) {
                      return (
                        <tr key={`${row.store_id}-${idx}`} className="border-b border-gray-100">
                          <td className="py-2 px-2 font-medium text-gray-700">{row.store_name}</td>
                          <td className="py-2 px-2 text-gray-600">{periodLabel}</td>
                          <td className="py-2 px-2 text-gray-400">-</td>
                          <td className="py-2 px-2">
                            <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">未設定</span>
                          </td>
                        </tr>
                      );
                    }

                    // 締切日までの日数計算
                    const now = new Date();
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const deadlineDay = new Date(row.deadline.deadline_date);
                    deadlineDay.setHours(0, 0, 0, 0);
                    const diffDays = Math.ceil((deadlineDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                    // 状態バッジ
                    let statusLabel = '';
                    let statusClass = '';
                    if (diffDays < 0) {
                      // 発生し得ないが念のため
                      statusLabel = '締切済';
                      statusClass = 'bg-gray-300 text-gray-700';
                    } else if (diffDays === 0) {
                      statusLabel = '🔴 本日締切';
                      statusClass = 'bg-red-100 text-red-800 font-bold';
                    } else if (diffDays <= 3) {
                      statusLabel = `🟠 あと${diffDays}日`;
                      statusClass = 'bg-orange-100 text-orange-800 font-bold';
                    } else if (diffDays <= 7) {
                      statusLabel = `🟡 あと${diffDays}日`;
                      statusClass = 'bg-yellow-100 text-yellow-800';
                    } else {
                      statusLabel = `🟢 あと${diffDays}日`;
                      statusClass = 'bg-green-100 text-green-800';
                    }

                    const isChanged = row.deadline.is_changed === 1;
                    const deadlineDateStr = format(new Date(row.deadline.deadline_date), 'M/d(E)', { locale: ja });

                    return (
                      <tr key={`${row.store_id}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-2 font-medium text-gray-800">{row.store_name}</td>
                        <td className="py-2 px-2 text-gray-700">{periodLabel}</td>
                        <td className="py-2 px-2 text-gray-800">
                          {deadlineDateStr}
                          {isChanged && (
                            <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">変更</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              ※ 各店舗の今期および次期のシフト希望提出締切です。締切を過ぎたものは表示されません。
            </p>
          </div>
        )}

        {/* 店舗選択と週選択 */}
        <div className="card">
          <div className="space-y-4">
            {/* 店舗選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">🏪 店舗選択</label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(Number(e.target.value))}
                className="input-field text-base h-12"
              >
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>

            {/* 週選択 */}
            <div className="space-y-3">
              <div className="text-center">
                <div className="text-base sm:text-lg font-bold text-gray-800">
                  {format(weekStart, 'M月d日', { locale: ja })} - {format(weekEnd, 'M月d日', { locale: ja })}
                </div>
                <div className="text-sm text-gray-600">
                  {format(currentWeek, 'yyyy年', { locale: ja })}
                </div>
              </div>
              
              <div className="flex gap-2 no-print">
                <button
                  onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
                  className="btn-secondary flex-1 flex items-center justify-center gap-1 h-12"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="hidden sm:inline">前週</span>
                </button>
                <button
                  onClick={() => setCurrentWeek(new Date())}
                  className="btn-primary flex-1 h-12 text-base font-bold"
                >
                  📅 今週
                </button>
                <button
                  onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                  className="btn-secondary flex-1 flex items-center justify-center gap-1 h-12"
                >
                  <span className="hidden sm:inline">次週</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ビュー切り替えとフィルター（スマホ向け） */}
            <div className="flex gap-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => setViewMode('list')}
                className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'list' 
                    ? 'bg-ocean-600 text-white' 
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                📋 リスト
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'table' 
                    ? 'bg-ocean-600 text-white' 
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                📅 表
              </button>
            </div>

            {/* 従業員フィルター（リストビュー時のみ） */}
            {viewMode === 'list' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">👤 従業員フィルター</label>
                <select
                  value={selectedEmployeeId || ''}
                  onChange={(e) => setSelectedEmployeeId(e.target.value ? Number(e.target.value) : null)}
                  className="input-field text-base h-12"
                >
                  <option value="">全員表示</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* シフト表示エリア */}
        <div className="card">
          <h2 className="text-base sm:text-xl font-bold text-gray-800 mb-3 sm:mb-4">
            {selectedStore?.name} - 週間シフト表
          </h2>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-ocean-700"></div>
              <p className="text-gray-600 mt-4">読み込み中...</p>
            </div>
          ) : !isPublished ? (
            <div className="text-center py-8 sm:py-12 bg-yellow-50 rounded-lg border-2 border-yellow-200">
              <svg className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-yellow-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-base sm:text-lg font-bold text-gray-800 mb-2">この週のシフトはまだ公開されていません</p>
              <p className="text-sm sm:text-base text-gray-600">管理者がシフトを公開するまでお待ちください</p>
            </div>
          ) : viewMode === 'list' ? (
            /* リストビュー（スマホ最適化） */
            <div className="space-y-4">
              {weekDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayShifts = shifts.filter(s => s.date === dateStr);
                const filteredShifts = selectedEmployeeId 
                  ? dayShifts.filter(s => s.employee_id === selectedEmployeeId)
                  : dayShifts;
                const dow = day.getDay();
                const specialDay = getSpecialDayInfo(day);
                const isHoliday = specialDay?.type === 1;
                // 日付ヘッダーの背景色
                const headerBg = isHoliday ? 'bg-red-600' :
                                 dow === 0 ? 'bg-red-500' :
                                 dow === 6 ? 'bg-blue-500' :
                                 'bg-ocean-500';
                const borderColor = isHoliday ? 'border-red-300' :
                                    dow === 0 ? 'border-red-200' :
                                    dow === 6 ? 'border-blue-200' :
                                    'border-gray-200';

                return (
                  <div key={dateStr} className={`border-2 ${borderColor} rounded-lg overflow-hidden`}>
                    {/* 日付ヘッダー */}
                    <div className={`${headerBg} text-white px-4 py-3`}>
                      <h3 className="text-lg font-bold flex items-center gap-2 flex-wrap">
                        <span>📅 {format(day, 'M月d日(E)', { locale: ja })}</span>
                        {isHoliday && (
                          <span className="text-sm bg-white/25 px-2 py-0.5 rounded font-medium">
                            🎌 {specialDay!.name}
                          </span>
                        )}
                      </h3>
                    </div>

                    {/* シフト一覧 */}
                    <div className="bg-white">
                      {filteredShifts.length === 0 ? (
                        <div className="text-center py-6 text-gray-400">
                          シフトなし
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-200">
                          {filteredShifts.map((shift) => {
                            const employee = employees.find(e => e.id === shift.employee_id);
                            return (
                              <div key={shift.id} className="p-4 hover:bg-ocean-50 transition-colors">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-lg">👤</span>
                                      <span className="font-bold text-gray-800 text-base">
                                        {employee?.name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-ocean-700">
                                      <span className="text-xl">🕐</span>
                                      <span className="font-bold text-lg">
                                        {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                                      </span>
                                    </div>
                                    {shift.break_minutes > 0 && (
                                      <div className="flex items-center gap-2 text-gray-600 text-sm mt-1">
                                        <span>💤</span>
                                        <span>休憩 {shift.break_minutes}分</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* テーブルビュー（既存のガントチャート） */
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="min-w-[800px] px-4 sm:px-0">
                {/* ヘッダー */}
                <div className="grid grid-cols-8 gap-2 mb-2">
                  <div className="font-semibold text-gray-700 p-2 text-xs sm:text-sm">従業員名</div>
                  {weekDays.map((day) => {
                    const dow = day.getDay();
                    const specialDay = getSpecialDayInfo(day);
                    const isHoliday = specialDay?.type === 1;
                    const headerCls = isHoliday ? 'bg-red-200 text-red-800 border border-red-300' :
                                      dow === 0 ? 'bg-red-50 text-red-600' :
                                      dow === 6 ? 'bg-blue-50 text-blue-600' :
                                      'text-gray-700';
                    return (
                      <div key={day.toISOString()} className={`text-center rounded p-1 ${headerCls}`} title={specialDay ? specialDay.name : undefined}>
                        <div className="font-semibold text-xs sm:text-sm">
                          {format(day, 'M/d (E)', { locale: ja })}
                          {isHoliday && <span className="ml-0.5">🎌</span>}
                        </div>
                        {isHoliday && (
                          <div className="text-[10px] font-medium truncate">{specialDay!.name}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* シフト表 */}
                {employees.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">従業員が登録されていません</div>
                ) : (
                  employees.map((employee) => (
                    <div key={employee.id} className="grid grid-cols-8 gap-2 mb-2">
                      <div className="p-2 sm:p-3 bg-ocean-50 rounded-lg font-medium text-gray-800 flex items-center text-xs sm:text-sm">
                        {employee.name}
                      </div>
                      {weekDays.map((day) => {
                        const dayShifts = getShiftsForDay(day, employee.id);
                        const dow = day.getDay();
                        const specialDay = getSpecialDayInfo(day);
                        const isHoliday = specialDay?.type === 1;
                        const cellBg = isHoliday ? 'bg-red-50' :
                                       dow === 0 ? 'bg-red-50/60' :
                                       dow === 6 ? 'bg-blue-50/60' :
                                       '';
                        return (
                          <div key={day.toISOString()} className={`gantt-cell p-1 sm:p-2 rounded ${cellBg}`}>
                            {dayShifts.length === 0 ? (
                              <div className="text-center text-gray-400 text-xs sm:text-sm">-</div>
                            ) : (
                              dayShifts.map((shift) => (
                                <div
                                  key={shift.id}
                                  className="bg-ocean-500 text-white text-xs p-1 sm:p-2 rounded mb-1"
                                >
                                  <div className="font-semibold">{shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}</div>
                                </div>
                              ))
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ヘルプパネル */}
      <HelpPanel isAdmin={false} />
    </div>
  );
}
