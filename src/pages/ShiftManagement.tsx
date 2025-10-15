import { useState, useEffect } from 'react';
import { format, addWeeks, startOfWeek, endOfWeek, eachDayOfInterval, parseISO, differenceInMinutes } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Role, Employee, Shift, Store, SpecialDay } from '../types';
import AdminLayout from '../components/AdminLayout';

interface ShiftManagementProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

interface ShiftInput {
  id?: number;
  employee_id: number;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
}

export default function ShiftManagement({ role, storeId, onLogout }: ShiftManagementProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(storeId);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  const [targetWeekStart, setTargetWeekStart] = useState(startOfWeek(new Date(), { locale: ja }));
  const [editingShift, setEditingShift] = useState<ShiftInput | null>(null);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [totalLaborCost, setTotalLaborCost] = useState(0);
  const [saving, setSaving] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);

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
  }, [selectedStoreId, targetWeekStart]);

  useEffect(() => {
    calculateTotalLaborCost();
  }, [shifts, selectedStore, specialDays]);

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

  const fetchSpecialDays = async () => {
    try {
      const res = await fetch('/api/special-days');
      const data = await res.json();
      setSpecialDays(data);
    } catch (error) {
      console.error('特別日取得エラー:', error);
    }
  };

  const fetchShifts = async () => {
    if (!selectedStoreId) return;
    
    try {
      const weekEnd = endOfWeek(targetWeekStart, { locale: ja });
      const res = await fetch(
        `/api/shifts?store_id=${selectedStoreId}&start_date=${format(targetWeekStart, 'yyyy-MM-dd')}&end_date=${format(weekEnd, 'yyyy-MM-dd')}`
      );
      const data = await res.json();
      setShifts(data);
    } catch (error) {
      console.error('シフト取得エラー:', error);
    }
  };

  const fetchPublicationStatus = async () => {
    if (!selectedStoreId) return;
    
    try {
      const res = await fetch(
        `/api/weekly-publications?store_id=${selectedStoreId}&week_start_date=${format(targetWeekStart, 'yyyy-MM-dd')}`
      );
      const data = await res.json();
      setIsPublished(data.length > 0 && data[0].is_published === 1);
    } catch (error) {
      console.error('公開状態取得エラー:', error);
    }
  };

  const handleTogglePublication = async () => {
    if (!selectedStoreId) return;
    
    const newStatus = !isPublished;
    const confirmMessage = newStatus
      ? 'この週のシフトを従業員に公開しますか？'
      : 'この週のシフトを非公開にしますか？';
    
    if (!confirm(confirmMessage)) return;
    
    try {
      await fetch('/api/weekly-publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          store_id: selectedStoreId,
          week_start_date: format(targetWeekStart, 'yyyy-MM-dd'),
          is_published: newStatus
        })
      });
      
      setIsPublished(newStatus);
      alert(newStatus ? 'シフトを公開しました' : 'シフトを非公開にしました');
    } catch (error) {
      console.error('公開設定エラー:', error);
      alert('公開設定に失敗しました');
    }
  };

  const handleAutoFillRequests = async () => {
    if (!selectedStoreId) return;
    
    // 表示中の週の期間を明示
    const weekEnd = endOfWeek(targetWeekStart, { locale: ja });
    const weekPeriod = `${format(targetWeekStart, 'M月d日', { locale: ja })}〜${format(weekEnd, 'M月d日', { locale: ja })}`;
    
    if (!confirm(`【表示中の週のみ反映】\n対象期間: ${weekPeriod}\n\nこの週のシフト希望を自動的にシフトに反映しますか？\n既存のシフトは保持され、新しいシフトのみが追加されます。`)) {
      return;
    }
    
    setAutoFilling(true);
    
    try {
      const res = await fetch('/api/shifts/auto-fill-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          store_id: selectedStoreId,
          week_start_date: format(targetWeekStart, 'yyyy-MM-dd')
        })
      });
      
      const result = await res.json();
      
      if (result.success) {
        alert(`【${weekPeriod}】シフト希望の自動反映が完了しました\n作成されたシフト: ${result.createdCount}件 / 希望総数: ${result.totalRequests}件`);
        fetchShifts();
      } else {
        alert('シフト希望の自動反映に失敗しました');
      }
    } catch (error) {
      console.error('自動反映エラー:', error);
      alert('シフト希望の自動反映に失敗しました');
    } finally {
      setAutoFilling(false);
    }
  };

  const calculateLaborCost = (shift: Shift | ShiftInput, employee: Employee): number => {
    if (!selectedStore) return 0;

    const startTime = new Date(`2000-01-01T${shift.start_time}`);
    const endTime = new Date(`2000-01-01T${shift.end_time}`);
    const workMinutes = differenceInMinutes(endTime, startTime) - (shift.break_minutes || 0);
    const workHours = workMinutes / 60;

    let hourlyRate = employee.hourly_wage || 0;

    // 時間外手当計算
    if (selectedStore.overtime_rate_enabled) {
      const specialDay = specialDays.find(sd => sd.date === shift.date);
      const dayOfWeek = new Date(shift.date).getDay();

      if (specialDay?.type === 1) {
        // 祝日
        hourlyRate += selectedStore.holiday_rate || 0;
      } else if (dayOfWeek === 0) {
        // 日曜日
        hourlyRate += selectedStore.sunday_rate || 0;
      } else if (dayOfWeek === 6) {
        // 土曜日
        hourlyRate += selectedStore.saturday_rate || 0;
      }
    }

    return Math.round(workHours * hourlyRate);
  };

  const calculateTotalLaborCost = () => {
    if (!selectedStore) return;

    let total = 0;
    shifts.forEach(shift => {
      const employee = employees.find(e => e.id === shift.employee_id);
      if (employee) {
        total += calculateLaborCost(shift, employee);
      }
    });
    setTotalLaborCost(total);
  };

  const handleAddShift = (employeeId: number, date: string) => {
    setEditingShift({
      employee_id: employeeId,
      date,
      start_time: selectedStore?.morning_start || '09:00',
      end_time: selectedStore?.morning_end || '17:00',
      break_minutes: 60
    });
    setShowShiftForm(true);
  };

  const handleEditShift = (shift: Shift) => {
    setEditingShift({
      id: shift.id,
      employee_id: shift.employee_id,
      date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_minutes: shift.break_minutes
    });
    setShowShiftForm(true);
  };

  const handleSaveShift = async () => {
    if (!editingShift || !selectedStoreId) return;

    setSaving(true);

    try {
      const employee = employees.find(e => e.id === editingShift.employee_id);
      if (!employee) return;

      const laborCost = calculateLaborCost(editingShift, employee);

      const shiftData = {
        ...editingShift,
        store_id: selectedStoreId,
        labor_cost: laborCost
      };

      if (editingShift.id) {
        // 更新
        await fetch(`/api/shifts/${editingShift.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(shiftData)
        });
      } else {
        // 新規作成
        await fetch('/api/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(shiftData)
        });
      }

      setShowShiftForm(false);
      setEditingShift(null);
      fetchShifts();
    } catch (error) {
      console.error('シフト保存エラー:', error);
      alert('シフトの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = async (shiftId: number) => {
    if (!confirm('このシフトを削除しますか?')) return;

    try {
      await fetch(`/api/shifts/${shiftId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      fetchShifts();
    } catch (error) {
      console.error('シフト削除エラー:', error);
      alert('シフトの削除に失敗しました');
    }
  };

  const weekEnd = endOfWeek(targetWeekStart, { locale: ja });
  const weekDates = eachDayOfInterval({ start: targetWeekStart, end: weekEnd });

  const getShiftForEmployeeAndDate = (employeeId: number, date: string): Shift | undefined => {
    return shifts.find(s => s.employee_id === employeeId && s.date === date);
  };

  const getSpecialDayInfo = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return specialDays.find(sd => sd.date === dateStr);
  };

  const budgetPercentage = selectedStore?.monthly_budget
    ? Math.round((totalLaborCost / selectedStore.monthly_budget) * 100)
    : 0;

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">シフト管理</h1>
          <div className="flex gap-2 no-print">
            <button
              onClick={handleAutoFillRequests}
              disabled={autoFilling}
              className="btn-primary disabled:opacity-50"
              title="表示中の週のシフト希望のみを自動的にシフトに反映します"
            >
              {autoFilling ? '反映中...' : '✨ シフト希望を自動反映（表示週のみ）'}
            </button>
            <button
              onClick={handleTogglePublication}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                isPublished
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {isPublished ? '🔓 公開中 (非公開にする)' : '🔒 未公開 (公開する)'}
            </button>
            <button
              onClick={() => window.print()}
              className="btn-secondary"
            >
              🖨️ 印刷
            </button>
          </div>
        </div>

        {/* コントロールパネル */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 店舗選択 */}
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

            {/* 週選択 */}
            <div className={role === 'admin' ? '' : 'col-span-2'}>
              <label className="block text-sm font-medium text-gray-700 mb-2">対象週</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTargetWeekStart(addWeeks(targetWeekStart, -1))}
                  className="btn-secondary"
                >
                  ← 前週
                </button>
                <div className="flex-1 flex items-center justify-center text-sm font-medium">
                  {format(targetWeekStart, 'yyyy年M月d日', { locale: ja })} - {format(weekEnd, 'M月d日', { locale: ja })}
                </div>
                <button
                  onClick={() => setTargetWeekStart(addWeeks(targetWeekStart, 1))}
                  className="btn-secondary"
                >
                  次週 →
                </button>
              </div>
            </div>

            {/* 人件費サマリー */}
            <div data-salary>
              <label className="block text-sm font-medium text-gray-700 mb-2">週間人件費</label>
              <div className="bg-gradient-to-r from-ocean-50 to-ocean-100 rounded-lg p-3">
                <div className="text-2xl font-bold text-ocean-900">
                  ¥{totalLaborCost.toLocaleString()}
                </div>
                {selectedStore?.monthly_budget && (
                  <div className="text-xs text-gray-600 mt-1">
                    月間予算の {budgetPercentage}%
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className={`h-2 rounded-full ${
                          budgetPercentage > 100 ? 'bg-red-500' :
                          budgetPercentage > 80 ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 公開状態インジケーター */}
          <div className={`mt-4 p-3 rounded-lg border-2 no-print ${
            isPublished
              ? 'bg-green-50 border-green-300'
              : 'bg-yellow-50 border-yellow-300'
          }`}>
            <div className="flex items-center gap-2">
              {isPublished ? (
                <>
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                  </svg>
                  <span className="text-sm font-medium text-green-800">
                    この週のシフトは従業員に<strong>公開されています</strong>
                  </span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium text-yellow-800">
                    この週のシフトは<strong>未公開</strong>です（従業員は閲覧できません）
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* シフト編集フォーム */}
        {showShiftForm && editingShift && (
          <div className="card bg-blue-50 border-2 border-blue-200">
            <h3 className="font-bold text-gray-800 mb-4">
              {editingShift.id ? 'シフト編集' : 'シフト追加'}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">従業員</label>
                <div className="input-field bg-gray-100">
                  {employees.find(e => e.id === editingShift.employee_id)?.name}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">日付</label>
                <div className="input-field bg-gray-100">
                  {format(new Date(editingShift.date), 'M月d日(E)', { locale: ja })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">開始時刻</label>
                <input
                  type="time"
                  value={editingShift.start_time}
                  onChange={(e) => setEditingShift({ ...editingShift, start_time: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">終了時刻</label>
                <input
                  type="time"
                  value={editingShift.end_time}
                  onChange={(e) => setEditingShift({ ...editingShift, end_time: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">休憩時間（分）</label>
                <input
                  type="number"
                  value={editingShift.break_minutes}
                  onChange={(e) => setEditingShift({ ...editingShift, break_minutes: Number(e.target.value) })}
                  className="input-field"
                  min="0"
                  step="15"
                />
              </div>
              <div className="col-span-2 flex items-end gap-2">
                <button
                  onClick={handleSaveShift}
                  disabled={saving}
                  className="btn-primary flex-1"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => {
                    setShowShiftForm(false);
                    setEditingShift(null);
                  }}
                  className="btn-secondary flex-1"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ガントチャート */}
        <div className="card overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r">
                  従業員
                </th>
                {weekDates.map(date => {
                  const specialDay = getSpecialDayInfo(date);
                  const dayOfWeek = date.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  
                  return (
                    <th
                      key={date.toISOString()}
                      className={`px-2 py-3 text-center text-xs font-medium uppercase border-r min-w-[120px] ${
                        specialDay?.type === 1 ? 'bg-red-100 text-red-700' :
                        isWeekend ? 'bg-blue-50 text-blue-700' :
                        'text-gray-500'
                      }`}
                    >
                      <div>{format(date, 'M/d', { locale: ja })}</div>
                      <div className="text-[10px] mt-1">{format(date, 'E', { locale: ja })}</div>
                      {specialDay && (
                        <div className="text-[9px] mt-1 font-normal">{specialDay.name}</div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employees.map(employee => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="sticky left-0 bg-white px-4 py-3 border-r">
                    <div className="font-medium text-gray-900">{employee.name}</div>
                    <div className="text-xs text-gray-500">
                      {employee.employment_type === 'part_time' && 'パート'}
                      {employee.employment_type === 'part_time_insured' && '社保パート'}
                      {employee.employment_type === 'full_time' && '正社員'}
                    </div>
                  </td>
                  {weekDates.map(date => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const shift = getShiftForEmployeeAndDate(employee.id, dateStr);
                    const specialDay = getSpecialDayInfo(date);
                    const dayOfWeek = date.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                    return (
                      <td
                        key={dateStr}
                        className={`px-2 py-2 border-r text-center ${
                          specialDay?.type === 1 ? 'bg-red-50' :
                          isWeekend ? 'bg-blue-50' :
                          ''
                        }`}
                      >
                        {shift ? (
                          <div
                            onClick={() => handleEditShift(shift)}
                            className="cursor-pointer bg-ocean-600 hover:bg-ocean-700 text-white rounded px-2 py-1 text-xs transition-colors"
                          >
                            <div className="font-medium">
                              {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                            </div>
                            {shift.break_minutes > 0 && (
                              <div className="text-[10px] opacity-80">休{shift.break_minutes}分</div>
                            )}
                            <div className="text-[10px] opacity-90 mt-1" data-salary>
                              ¥{calculateLaborCost(shift, employee).toLocaleString()}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteShift(shift.id);
                              }}
                              className="text-[10px] text-red-200 hover:text-red-100 mt-1"
                            >
                              削除
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAddShift(employee.id, dateStr)}
                            className="w-full py-2 text-gray-400 hover:text-ocean-600 hover:bg-ocean-50 rounded transition-colors text-xs"
                          >
                            +
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {employees.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              従業員が登録されていません
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
