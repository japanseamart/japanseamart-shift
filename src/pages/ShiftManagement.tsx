import { useState, useEffect } from 'react';
import { format, addWeeks, startOfWeek, endOfWeek, eachDayOfInterval, differenceInMinutes } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Role, Employee, Shift, Store, SpecialDay, ShiftRequest } from '../types';
import AdminLayout from '../components/AdminLayout';
import { getApiUrl } from '../config/api';

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
  const [shiftRequests, setShiftRequests] = useState<ShiftRequest[]>([]);
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  const [targetWeekStart, setTargetWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [editingShift, setEditingShift] = useState<ShiftInput | null>(null);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [totalLaborCost, setTotalLaborCost] = useState(0);
  const [monthlyLaborCostForecast, setMonthlyLaborCostForecast] = useState(0);
  const [saving, setSaving] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [showRequestsPanel, setShowRequestsPanel] = useState(true);
  
  // 予算アラート閾値（後から変更可能）
  const [warningThreshold, setWarningThreshold] = useState(95); // 警告閾値（デフォルト95%）
  const [dangerThreshold, setDangerThreshold] = useState(100); // 危険閾値（デフォルト100%）
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);
  
  // 印刷モード
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')]);
  
  // ビューモード（モバイル最適化）
  const [viewMode, setViewMode] = useState<'table' | 'list' | 'day'>('table');
  const [requestsViewMode, setRequestsViewMode] = useState<'card' | 'table'>('card');

  useEffect(() => {
    fetchStores();
    fetchSpecialDays();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      fetchStore(selectedStoreId);
      fetchEmployees(selectedStoreId);
      fetchShifts();
      fetchShiftRequests();
      fetchPublicationStatus();
    }
  }, [selectedStoreId, targetWeekStart]);

  useEffect(() => {
    calculateTotalLaborCost();
    calculateMonthlyForecast();
  }, [shifts, selectedStore, specialDays]);

  // 自動休憩時間計算: 開始・終了時刻変更時に6時間以上なら60分、未満なら0分に設定
  useEffect(() => {
    if (!editingShift) return;

    const { start_time, end_time } = editingShift;
    if (!start_time || !end_time) return;

    // 労働時間を計算（休憩時間を除外せず、純粋な開始〜終了の時間）
    const startTime = new Date(`2000-01-01T${start_time}`);
    const endTime = new Date(`2000-01-01T${end_time}`);
    const totalMinutes = differenceInMinutes(endTime, startTime);
    const totalHours = totalMinutes / 60;

    // 6時間以上の場合は60分、未満の場合は0分
    const autoBreakMinutes = totalHours >= 6 ? 60 : 0;

    // 現在の休憩時間と異なる場合のみ更新（無限ループ防止）
    if (editingShift.break_minutes !== autoBreakMinutes) {
      setEditingShift({ ...editingShift, break_minutes: autoBreakMinutes });
    }
  }, [editingShift?.start_time, editingShift?.end_time]);

  const fetchStores = async () => {
    try {
      const res = await fetch(getApiUrl('/api/stores'));
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
    
    try {
      const weekEnd = endOfWeek(targetWeekStart, { weekStartsOn: 1 });
      const res = await fetch(
        getApiUrl(`/api/shifts?store_id=${selectedStoreId}&start_date=${format(targetWeekStart, 'yyyy-MM-dd')}&end_date=${format(weekEnd, 'yyyy-MM-dd')}`)
      );
      const data = await res.json();
      setShifts(data);
    } catch (error) {
      console.error('シフト取得エラー:', error);
    }
  };

  const fetchShiftRequests = async () => {
    if (!selectedStoreId) return;
    
    try {
      const weekEnd = endOfWeek(targetWeekStart, { weekStartsOn: 1 });
      const res = await fetch(
        getApiUrl(`/api/shift-requests?store_id=${selectedStoreId}&start_date=${format(targetWeekStart, 'yyyy-MM-dd')}&end_date=${format(weekEnd, 'yyyy-MM-dd')}`)
      );
      const data = await res.json();
      setShiftRequests(data);
    } catch (error) {
      console.error('シフト希望取得エラー:', error);
    }
  };

  const fetchPublicationStatus = async () => {
    if (!selectedStoreId) return;
    
    try {
      const res = await fetch(
        `/api/weekly-publications?store_id=${selectedStoreId}&week_start_date=${format(targetWeekStart, 'yyyy-MM-dd')}`
      );
      const data = await res.json();
      console.log('公開状態取得:', data);
      // APIは単一オブジェクトを返す（配列ではない）
      setIsPublished(data.is_published === 1);
    } catch (error) {
      console.error('公開状態取得エラー:', error);
      setIsPublished(false);
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
      const response = await fetch(getApiUrl('/api/weekly-publications'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          store_id: selectedStoreId,
          week_start_date: format(targetWeekStart, 'yyyy-MM-dd'),
          is_published: newStatus
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('公開設定レスポンス:', data);
      
      // 公開状態を再取得して確実に反映
      await fetchPublicationStatus();
      
      alert(newStatus ? 'シフトを公開しました' : 'シフトを非公開にしました');
    } catch (error) {
      console.error('公開設定エラー:', error);
      alert('公開設定に失敗しました: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handlePrint = () => {
    // 選択された週が1つ以上あるか確認
    if (selectedWeeks.length === 0) {
      alert('印刷する週を選択してください');
      return;
    }
    
    // 印刷ダイアログを閉じる
    setShowPrintDialog(false);
    
    // 少し待ってから印刷
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const toggleWeekSelection = (weekStart: string) => {
    setSelectedWeeks(prev => {
      if (prev.includes(weekStart)) {
        return prev.filter(w => w !== weekStart);
      } else {
        return [...prev, weekStart].sort();
      }
    });
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
      const res = await fetch(getApiUrl('/api/shifts/auto-fill-requests'), {
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

    // 時間外手当計算（複数該当する場合は最も高い加算額を適用）
    if (selectedStore.overtime_rate_enabled) {
      const specialDay = specialDays.find(sd => sd.date === shift.date);
      const dayOfWeek = new Date(shift.date).getDay();
      
      const applicableRates: number[] = [];
      
      // 祝日チェック
      if (specialDay?.type === 1 && selectedStore.holiday_rate > 0) {
        applicableRates.push(selectedStore.holiday_rate);
      }
      
      // 日曜日チェック
      if (dayOfWeek === 0 && selectedStore.sunday_rate > 0) {
        applicableRates.push(selectedStore.sunday_rate);
      }
      
      // 土曜日チェック
      if (dayOfWeek === 6 && selectedStore.saturday_rate > 0) {
        applicableRates.push(selectedStore.saturday_rate);
      }
      
      // 複数の加算が該当する場合、最も高い金額を適用
      if (applicableRates.length > 0) {
        hourlyRate += Math.max(...applicableRates);
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

  const calculateMonthlyForecast = async () => {
    if (!selectedStoreId || !selectedStore) return;

    try {
      const now = new Date();
      const currentDay = now.getDate();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const totalDaysInMonth = monthEnd.getDate();

      // 今月の全シフトを取得
      const res = await fetch(
        getApiUrl(`/api/shifts?store_id=${selectedStoreId}&start_date=${format(monthStart, 'yyyy-MM-dd')}&end_date=${format(monthEnd, 'yyyy-MM-dd')}`)
      );
      const monthlyShifts: Shift[] = await res.json();

      // 既存シフトの人件費を計算
      let confirmedTotal = 0;
      const shiftsByDate = new Map<string, number>();
      
      monthlyShifts.forEach(shift => {
        const employee = employees.find(e => e.id === shift.employee_id);
        if (employee) {
          const cost = calculateLaborCost(shift, employee);
          confirmedTotal += cost;
          
          // 日別の人件費を記録
          const dateKey = shift.date;
          shiftsByDate.set(dateKey, (shiftsByDate.get(dateKey) || 0) + cost);
        }
      });

      // 予測ロジック：過去の平均から未来を予測
      let forecastTotal = confirmedTotal;
      
      if (currentDay < totalDaysInMonth) {
        // 既存シフトがある日の平均人件費を計算
        const daysWithShifts = shiftsByDate.size;
        
        if (daysWithShifts > 0) {
          const averageDailyCost = confirmedTotal / daysWithShifts;
          
          // 残りの日数分を予測
          const remainingDays = totalDaysInMonth - currentDay;
          const forecastForRemaining = averageDailyCost * remainingDays;
          
          forecastTotal = confirmedTotal + forecastForRemaining;
        } else {
          // シフトがまだ1つもない場合は確定分のみ
          forecastTotal = confirmedTotal;
        }
      }

      setMonthlyLaborCostForecast(Math.round(forecastTotal));
    } catch (error) {
      console.error('月間人件費予想計算エラー:', error);
    }
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
        await fetch(getApiUrl(`/api/shifts/${editingShift.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(shiftData)
        });
      } else {
        // 新規作成
        await fetch(getApiUrl('/api/shifts'), {
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
      await fetch(getApiUrl(`/api/shifts/${shiftId}`), {
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

  const getShiftRequestForEmployeeAndDate = (employeeId: number, date: string): ShiftRequest | undefined => {
    return shiftRequests.find(r => r.employee_id === employeeId && r.date === date);
  };

  const getSpecialDayInfo = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return specialDays.find(sd => sd.date === dateStr);
  };

  const formatShiftRequestPatterns = (request: ShiftRequest): string => {
    try {
      const patterns = JSON.parse(request.patterns);
      if (request.custom_start && request.custom_end) {
        return `${request.custom_start}-${request.custom_end}`;
      }
      const patternNames: { [key: string]: string } = {
        morning: '朝',
        afternoon: '昼',
        evening: '夜',
        full: '終日',
        off: '休み'
      };
      return patterns.map((p: string) => patternNames[p] || p).join('/');
    } catch {
      return '−';
    }
  };

  const weeklyBudget = selectedStore?.monthly_budget ? Math.round(selectedStore.monthly_budget / 4) : 0;
  const isBudgetExceeded = weeklyBudget > 0 && totalLaborCost > weeklyBudget;
  
  // 週間予算のアラートレベル判定
  const getWeeklyBudgetStatus = () => {
    if (weeklyBudget === 0) return 'normal';
    const percentage = (totalLaborCost / weeklyBudget) * 100;
    if (percentage >= dangerThreshold) return 'danger';
    if (percentage >= warningThreshold) return 'warning';
    return 'normal';
  };
  
  // 月間予算のアラートレベル判定
  const getMonthlyBudgetStatus = () => {
    if (!selectedStore || selectedStore.monthly_budget === 0) return 'normal';
    const percentage = (monthlyLaborCostForecast / selectedStore.monthly_budget) * 100;
    if (percentage >= dangerThreshold) return 'danger';
    if (percentage >= warningThreshold) return 'warning';
    return 'normal';
  };
  
  const weeklyStatus = getWeeklyBudgetStatus();
  const monthlyStatus = getMonthlyBudgetStatus();

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">シフト作成</h1>
          </div>

          {/* デスクトップ: 横並びボタン */}
          <div className="hidden md:flex gap-2 no-print">
            <button
              onClick={() => setShowThresholdSettings(!showThresholdSettings)}
              className="btn-secondary"
              title="予算アラート閾値を設定"
            >
              ⚙️ 予算アラート設定
            </button>
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
              onClick={() => setShowPrintDialog(true)}
              className="btn-secondary"
            >
              🖨️ 印刷設定
            </button>
          </div>

          {/* モバイル: 縦積みボタン */}
          <div className="md:hidden space-y-2 no-print">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleAutoFillRequests}
                disabled={autoFilling}
                className="h-12 bg-ocean-600 text-white rounded-lg font-bold hover:bg-ocean-700 transition-colors disabled:opacity-50 text-sm"
                title="表示中の週のシフト希望のみを自動的にシフトに反映します"
              >
                {autoFilling ? '⏳ 反映中...' : '✨ 自動反映'}
              </button>
              <button
                onClick={handleTogglePublication}
                className={`h-12 rounded-lg font-bold transition-colors text-sm ${
                  isPublished
                    ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {isPublished ? '🔓 公開中' : '🔒 公開する'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowThresholdSettings(!showThresholdSettings)}
                className="h-10 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors text-sm"
              >
                ⚙️ 予算設定
              </button>
              <button
                onClick={() => setShowPrintDialog(true)}
                className="h-10 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors text-sm"
              >
                🖨️ 印刷
              </button>
            </div>
          </div>
        </div>

        {/* 閾値設定パネル */}
        {showThresholdSettings && (
          <div className="card bg-blue-50 border-2 border-blue-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">⚙️ 予算アラート閾値設定</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  黄色警告閾値（％）
                </label>
                <input
                  type="number"
                  value={warningThreshold}
                  onChange={(e) => setWarningThreshold(Number(e.target.value))}
                  className="input-field"
                  min="0"
                  max="100"
                />
                <p className="text-xs text-gray-600 mt-1">
                  予算の{warningThreshold}%に達すると黄色で警告表示されます
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  赤色危険閾値（％）
                </label>
                <input
                  type="number"
                  value={dangerThreshold}
                  onChange={(e) => setDangerThreshold(Number(e.target.value))}
                  className="input-field"
                  min="0"
                  max="200"
                />
                <p className="text-xs text-gray-600 mt-1">
                  予算の{dangerThreshold}%に達すると赤色で危険表示されます
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowThresholdSettings(false)}
                className="btn-primary"
              >
                設定を閉じる
              </button>
            </div>
          </div>
        )}

        {/* 印刷設定ダイアログ */}
        {showPrintDialog && (
          <div className="card bg-green-50 border-2 border-green-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">🖨️ 印刷設定</h3>
            <p className="text-sm text-gray-700 mb-4">
              印刷したい週を選択してください（複数選択可）
            </p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {/* 前後4週間を表示 */}
              {Array.from({ length: 9 }, (_, i) => {
                const weekStart = addWeeks(targetWeekStart, i - 4);
                const weekEnd = endOfWeek(weekStart, { locale: ja });
                const weekKey = format(weekStart, 'yyyy-MM-dd');
                const isSelected = selectedWeeks.includes(weekKey);
                const isCurrent = format(weekStart, 'yyyy-MM-dd') === format(targetWeekStart, 'yyyy-MM-dd');
                
                return (
                  <label
                    key={weekKey}
                    className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition ${
                      isSelected
                        ? 'bg-green-100 border-green-500'
                        : 'bg-white border-gray-200 hover:border-green-300'
                    } ${isCurrent ? 'ring-2 ring-blue-400' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleWeekSelection(weekKey)}
                      className="w-5 h-5 text-green-600 rounded mr-3"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">
                        {format(weekStart, 'yyyy年M月d日', { locale: ja })} - {format(weekEnd, 'M月d日', { locale: ja })}
                      </div>
                      {isCurrent && (
                        <div className="text-xs text-blue-600 font-medium">現在表示中</div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                選択中: {selectedWeeks.length}週
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPrintDialog(false)}
                  className="btn-secondary"
                >
                  キャンセル
                </button>
                <button
                  onClick={handlePrint}
                  disabled={selectedWeeks.length === 0}
                  className="btn-primary disabled:opacity-50"
                >
                  🖨️ 印刷プレビュー
                </button>
              </div>
            </div>
          </div>
        )}

        {/* コントロールパネル */}
        <div className="card">
          {/* 上段：店舗選択と週選択 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
              
              {/* デスクトップ: 横並びレイアウト */}
              <div className="hidden md:flex gap-2">
                <button
                  onClick={() => setTargetWeekStart(addWeeks(targetWeekStart, -1))}
                  className="btn-secondary px-3 py-1 text-sm"
                >
                  ← 前週
                </button>
                <button
                  onClick={() => setTargetWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                  className="btn-primary px-3 py-1 text-sm"
                >
                  今週
                </button>
                <div className="flex-1 flex items-center justify-center text-sm font-medium bg-ocean-50 rounded px-2">
                  {format(targetWeekStart, 'yyyy年M月d日', { locale: ja })} - {format(weekEnd, 'M月d日', { locale: ja })}
                </div>
                <button
                  onClick={() => setTargetWeekStart(addWeeks(targetWeekStart, 1))}
                  className="btn-secondary px-3 py-1 text-sm"
                >
                  次週 →
                </button>
              </div>

              {/* モバイル: 縦積みレイアウト */}
              <div className="md:hidden space-y-2">
                {/* 日付表示 */}
                <div className="flex items-center justify-center h-12 text-base font-bold bg-ocean-100 text-ocean-900 rounded-lg px-4">
                  📅 {format(targetWeekStart, 'M/d', { locale: ja })} - {format(weekEnd, 'M/d', { locale: ja })}
                </div>
                
                {/* ボタングループ */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setTargetWeekStart(addWeeks(targetWeekStart, -1))}
                    className="h-12 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors flex items-center justify-center"
                  >
                    ← 前週
                  </button>
                  <button
                    onClick={() => setTargetWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                    className="h-12 bg-ocean-600 text-white rounded-lg font-bold hover:bg-ocean-700 transition-colors"
                  >
                    今週
                  </button>
                  <button
                    onClick={() => setTargetWeekStart(addWeeks(targetWeekStart, 1))}
                    className="h-12 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors flex items-center justify-center"
                  >
                    次週 →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 下段：人件費サマリー */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-salary>
            {/* 週間人件費予想 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                週間人件費予想
                {weeklyStatus === 'danger' && (
                  <span className="ml-2 text-xs text-red-600 font-bold">🔴 予算超過</span>
                )}
                {weeklyStatus === 'warning' && (
                  <span className="ml-2 text-xs text-yellow-600 font-bold">🟡 予算警告</span>
                )}
              </label>
              <div className={`rounded-lg p-3 ${
                weeklyStatus === 'danger' 
                  ? 'bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-300' 
                  : weeklyStatus === 'warning'
                  ? 'bg-gradient-to-r from-yellow-50 to-yellow-100 border-2 border-yellow-300'
                  : 'bg-gradient-to-r from-ocean-50 to-ocean-100'
              }`}>
                <div className={`text-xl font-bold ${
                  weeklyStatus === 'danger' ? 'text-red-900' : 
                  weeklyStatus === 'warning' ? 'text-yellow-900' : 
                  'text-ocean-900'
                }`}>
                  ¥{totalLaborCost.toLocaleString()}
                </div>
                {weeklyBudget > 0 && (
                  <div className="text-xs text-gray-600 mt-1">
                    <div className="flex justify-between items-center mb-1">
                      <span>週予算: ¥{weeklyBudget.toLocaleString()}</span>
                      <span className={`font-bold ${
                        weeklyStatus === 'danger' ? 'text-red-600' : 
                        weeklyStatus === 'warning' ? 'text-yellow-600' : 
                        'text-gray-700'
                      }`}>
                        {Math.round((totalLaborCost / weeklyBudget) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          weeklyStatus === 'danger' ? 'bg-red-500' :
                          weeklyStatus === 'warning' ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${Math.min((totalLaborCost / weeklyBudget) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 月間人件費予想 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                月間人件費予想（今月末予測）
                {monthlyStatus === 'danger' && (
                  <span className="ml-2 text-xs text-red-600 font-bold">🔴 予算超過予測</span>
                )}
                {monthlyStatus === 'warning' && (
                  <span className="ml-2 text-xs text-yellow-600 font-bold">🟡 予算警告</span>
                )}
              </label>
              <div className={`rounded-lg p-3 ${
                monthlyStatus === 'danger' 
                  ? 'bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-300' 
                  : monthlyStatus === 'warning'
                  ? 'bg-gradient-to-r from-yellow-50 to-yellow-100 border-2 border-yellow-300'
                  : 'bg-gradient-to-r from-blue-50 to-blue-100'
              }`}>
                <div className={`text-xl font-bold ${
                  monthlyStatus === 'danger' ? 'text-red-900' : 
                  monthlyStatus === 'warning' ? 'text-yellow-900' : 
                  'text-blue-900'
                }`}>
                  ¥{monthlyLaborCostForecast.toLocaleString()}
                </div>
                {selectedStore && selectedStore.monthly_budget > 0 && (
                  <div className="text-xs text-gray-600 mt-1">
                    <div className="flex justify-between items-center mb-1">
                      <span>月予算: ¥{selectedStore.monthly_budget.toLocaleString()}</span>
                      <span className={`font-bold ${
                        monthlyStatus === 'danger' ? 'text-red-600' : 
                        monthlyStatus === 'warning' ? 'text-yellow-600' : 
                        'text-gray-700'
                      }`}>
                        {Math.round((monthlyLaborCostForecast / selectedStore.monthly_budget) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          monthlyStatus === 'danger' ? 'bg-red-500' :
                          monthlyStatus === 'warning' ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${Math.min((monthlyLaborCostForecast / selectedStore.monthly_budget) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 予算超過アラート */}
          {isBudgetExceeded && (
            <div className="mt-4 p-4 rounded-lg border-2 bg-red-50 border-red-300 no-print">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-red-900 mb-1">⚠️ 週間人件費予算を超過しています</h4>
                  <p className="text-xs text-red-700">
                    現在の予想人件費（¥{totalLaborCost.toLocaleString()}）が週間予算（¥{weeklyBudget.toLocaleString()}）を
                    <strong className="text-red-900"> ¥{(totalLaborCost - weeklyBudget).toLocaleString()}</strong> 超過しています。
                    シフトの見直しを検討してください。
                  </p>
                </div>
              </div>
            </div>
          )}

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

          {/* ビューモード切り替え（モバイル最適化） */}
          <div className="mt-4 flex gap-2 no-print">
            <button
              onClick={() => setViewMode('table')}
              className={`flex-1 h-12 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'table'
                  ? 'bg-ocean-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📅 表ビュー
              <span className="hidden md:inline"> (PC向け)</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex-1 h-12 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'list'
                  ? 'bg-ocean-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              👥 リストビュー
              <span className="hidden md:inline"> (従業員別)</span>
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`flex-1 h-12 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'day'
                  ? 'bg-ocean-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📆 日別ビュー
              <span className="hidden md:inline"> (日付別)</span>
            </button>
          </div>
        </div>

        {/* シフト編集フォーム - デスクトップ版 */}
        {showShiftForm && editingShift && (
          <>
            {/* デスクトップ: 通常のカード表示 */}
            <div className="hidden md:block card bg-blue-50 border-2 border-blue-200">
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

            {/* モバイル: フルスクリーンモーダル */}
            <div className="md:hidden fixed inset-0 bg-white z-50 flex flex-col">
              {/* モーダルヘッダー */}
              <div className="bg-ocean-600 text-white px-4 py-4 flex items-center justify-between shadow-lg">
                <h3 className="text-lg font-bold">
                  {editingShift.id ? '✏️ シフト編集' : '➕ シフト追加'}
                </h3>
                <button
                  onClick={() => {
                    setShowShiftForm(false);
                    setEditingShift(null);
                  }}
                  className="text-white hover:bg-ocean-700 rounded-lg p-2 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* モーダルコンテンツ */}
              <div className="flex-1 overflow-y-auto p-4 pb-24 bg-gray-50">
                <div className="space-y-4">
                  {/* 従業員 */}
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <label className="block text-sm font-medium text-gray-700 mb-2">👤 従業員</label>
                    <div className="input-field bg-gray-100 text-base font-medium">
                      {employees.find(e => e.id === editingShift.employee_id)?.name}
                    </div>
                  </div>

                  {/* 日付 */}
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <label className="block text-sm font-medium text-gray-700 mb-2">📅 日付</label>
                    <div className="input-field bg-gray-100 text-base font-medium">
                      {format(new Date(editingShift.date), 'M月d日(E)', { locale: ja })}
                    </div>
                  </div>

                  {/* 開始時刻 */}
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <label className="block text-sm font-medium text-gray-700 mb-2">🕐 開始時刻</label>
                    <input
                      type="time"
                      value={editingShift.start_time}
                      onChange={(e) => setEditingShift({ ...editingShift, start_time: e.target.value })}
                      className="input-field text-lg"
                    />
                  </div>

                  {/* 終了時刻 */}
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <label className="block text-sm font-medium text-gray-700 mb-2">🕐 終了時刻</label>
                    <input
                      type="time"
                      value={editingShift.end_time}
                      onChange={(e) => setEditingShift({ ...editingShift, end_time: e.target.value })}
                      className="input-field text-lg"
                    />
                  </div>

                  {/* 休憩時間 */}
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <label className="block text-sm font-medium text-gray-700 mb-2">☕ 休憩時間（分）</label>
                    <input
                      type="number"
                      value={editingShift.break_minutes}
                      onChange={(e) => setEditingShift({ ...editingShift, break_minutes: Number(e.target.value) })}
                      className="input-field text-lg"
                      min="0"
                      step="15"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      💡 6時間以上の勤務で60分が自動設定されます
                    </p>
                  </div>
                </div>
              </div>

              {/* モーダルフッター（固定） */}
              <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 p-4 shadow-2xl">
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowShiftForm(false);
                      setEditingShift(null);
                    }}
                    className="flex-1 h-14 bg-gray-200 text-gray-800 rounded-lg font-bold text-base hover:bg-gray-300 transition-colors"
                  >
                    ✕ キャンセル
                  </button>
                  <button
                    onClick={handleSaveShift}
                    disabled={saving}
                    className="flex-1 h-14 bg-ocean-600 text-white rounded-lg font-bold text-base hover:bg-ocean-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? '⏳ 保存中...' : '✓ 保存'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* シフト希望表示パネル */}
        <div className="card no-print">
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="text-base md:text-lg font-bold text-gray-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-ocean-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                シフト希望一覧
              </h3>
              <button
                onClick={() => setShowRequestsPanel(!showRequestsPanel)}
                className="btn-secondary text-sm h-10 px-4"
              >
                {showRequestsPanel ? '非表示' : '表示'}
              </button>
            </div>

            {/* モバイル: ビューモード切り替え */}
            {showRequestsPanel && (
              <div className="md:hidden flex gap-2">
                <button
                  onClick={() => setRequestsViewMode('card')}
                  className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all ${
                    requestsViewMode === 'card'
                      ? 'bg-ocean-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  📋 カード
                </button>
                <button
                  onClick={() => setRequestsViewMode('table')}
                  className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all ${
                    requestsViewMode === 'table'
                      ? 'bg-ocean-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  📊 表
                </button>
              </div>
            )}
          </div>
          
          {showRequestsPanel && (
            <>
              {/* デスクトップ: テーブル表示 */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-ocean-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">従業員名</th>
                      {weekDates.map(date => (
                        <th key={date.toISOString()} className="px-3 py-2 text-center font-medium text-gray-700">
                          {format(date, 'M/d (E)', { locale: ja })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {employees.map(employee => (
                      <tr key={employee.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">
                          {employee.name}
                        </td>
                        {weekDates.map(date => {
                          const dateStr = format(date, 'yyyy-MM-dd');
                          const request = getShiftRequestForEmployeeAndDate(employee.id, dateStr);
                          const hasShift = getShiftForEmployeeAndDate(employee.id, dateStr);
                          
                          return (
                            <td key={date.toISOString()} className="px-3 py-2 text-center">
                              {request ? (
                                <div className={`text-xs px-2 py-1 rounded ${
                                  hasShift 
                                    ? 'bg-green-100 text-green-800 border border-green-300'
                                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                                }`}>
                                  {formatShiftRequestPatterns(request)}
                                  {hasShift && (
                                    <div className="text-[10px] text-green-600 mt-0.5">✓ 反映済</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">−</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* モバイル: カード表示 */}
              {requestsViewMode === 'card' && (
              <div className="md:hidden space-y-3 mt-4">
                {employees.map(employee => {
                  const employeeRequests = weekDates
                    .map(date => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const request = getShiftRequestForEmployeeAndDate(employee.id, dateStr);
                      const hasShift = getShiftForEmployeeAndDate(employee.id, dateStr);
                      return { date, request, hasShift };
                    })
                    .filter(item => item.request);

                  if (employeeRequests.length === 0) return null;

                  return (
                    <div key={employee.id} className="border-2 border-gray-200 rounded-lg bg-white">
                      {/* 従業員ヘッダー */}
                      <div className="bg-ocean-100 px-4 py-3 rounded-t-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">👤</span>
                          <h4 className="font-bold text-gray-900">{employee.name}</h4>
                          <span className="ml-auto text-xs px-2 py-1 bg-ocean-200 text-ocean-800 rounded">
                            {employeeRequests.length}日希望
                          </span>
                        </div>
                      </div>

                      {/* シフト希望リスト */}
                      <div className="p-3 space-y-2">
                        {employeeRequests.map(({ date, request, hasShift }) => (
                          <div
                            key={date.toISOString()}
                            className={`p-3 rounded-lg border-2 ${
                              hasShift
                                ? 'bg-green-50 border-green-300'
                                : 'bg-blue-50 border-blue-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-700">
                                  📅 {format(date, 'M/d (E)', { locale: ja })}
                                </span>
                              </div>
                              <div className={`text-xs px-2 py-1 rounded font-medium ${
                                hasShift
                                  ? 'bg-green-200 text-green-800'
                                  : 'bg-blue-200 text-blue-800'
                              }`}>
                                {formatShiftRequestPatterns(request!)}
                              </div>
                            </div>
                            {hasShift && (
                              <div className="mt-1 text-xs text-green-700 font-medium">
                                ✓ シフトに反映済み
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* 希望なしの場合 */}
                {employees.every(employee => 
                  weekDates.every(date => 
                    !getShiftRequestForEmployeeAndDate(employee.id, format(date, 'yyyy-MM-dd'))
                  )
                ) && (
                  <div className="text-center py-8 text-gray-500">
                    この週のシフト希望はありません
                  </div>
                )}
              </div>
              )}

              {/* モバイル: テーブル表示 */}
              {requestsViewMode === 'table' && (
              <div className="md:hidden overflow-x-auto mt-4">
                <table className="min-w-full text-sm">
                  <thead className="bg-ocean-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-700 sticky left-0 bg-ocean-50 z-10">従業員</th>
                      {weekDates.map(date => (
                        <th key={date.toISOString()} className="px-2 py-2 text-center font-medium text-gray-700 min-w-[80px]">
                          <div>{format(date, 'M/d', { locale: ja })}</div>
                          <div className="text-[10px] font-normal">{format(date, 'E', { locale: ja })}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {employees.map(employee => (
                      <tr key={employee.id}>
                        <td className="px-3 py-2 font-medium text-gray-800 sticky left-0 bg-white z-10 border-r border-gray-200">
                          {employee.name}
                        </td>
                        {weekDates.map(date => {
                          const dateStr = format(date, 'yyyy-MM-dd');
                          const request = getShiftRequestForEmployeeAndDate(employee.id, dateStr);
                          const hasShift = getShiftForEmployeeAndDate(employee.id, dateStr);
                          
                          return (
                            <td key={date.toISOString()} className="px-2 py-2 text-center">
                              {request ? (
                                <div className={`text-xs px-1 py-1 rounded ${
                                  hasShift 
                                    ? 'bg-green-100 text-green-800 border border-green-300'
                                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                                }`}>
                                  <div className="font-medium">
                                    {formatShiftRequestPatterns(request)}
                                  </div>
                                  {hasShift && (
                                    <div className="text-[9px] text-green-600 mt-0.5">✓</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">−</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </>
          )}
        </div>

        {/* 表ビュー（ガントチャート） */}
        {viewMode === 'table' && (
        <div className="card overflow-x-auto avoid-break">
          {/* 印刷用ヘッダー */}
          <div className="print-shift-header hidden print:block">
            <h1 className="text-xl font-bold">{selectedStore?.name || ''} シフト表</h1>
            <p className="text-sm mt-1">
              {format(targetWeekStart, 'yyyy年M月d日', { locale: ja })} - {format(weekEnd, 'M月d日', { locale: ja })}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              印刷日: {format(new Date(), 'yyyy年M月d日', { locale: ja })}
            </p>
          </div>
          
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
        )}

        {/* リストビュー（従業員別） */}
        {viewMode === 'list' && (
          <div className="space-y-4">
            {employees.length === 0 ? (
              <div className="card text-center py-12 text-gray-500">
                従業員が登録されていません
              </div>
            ) : (
              employees.map(employee => {
                const employeeShifts = shifts.filter(s => s.employee_id === employee.id);
                const totalWorkMinutes = employeeShifts.reduce((sum, shift) => {
                  const startTime = new Date(`2000-01-01T${shift.start_time}`);
                  const endTime = new Date(`2000-01-01T${shift.end_time}`);
                  return sum + (differenceInMinutes(endTime, startTime) - shift.break_minutes);
                }, 0);
                const totalLaborCost = employeeShifts.reduce((sum, shift) => sum + calculateLaborCost(shift, employee), 0);

                return (
                  <div key={employee.id} className="card border-2 border-gray-200">
                    {/* 従業員ヘッダー */}
                    <div className="bg-ocean-500 text-white px-4 py-3 -m-6 mb-4 rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold flex items-center gap-2">
                            👤 {employee.name}
                          </h3>
                          <p className="text-sm opacity-90 mt-1">
                            {employee.employment_type === 'part_time' && 'パート'}
                            {employee.employment_type === 'part_time_insured' && '社保パート'}
                            {employee.employment_type === 'full_time' && '正社員'}
                            {' / '}時給 ¥{employee.hourly_wage?.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm opacity-90">週間勤務</div>
                          <div className="text-xl font-bold">
                            {Math.floor(totalWorkMinutes / 60)}h {totalWorkMinutes % 60}m
                          </div>
                          <div className="text-sm font-bold mt-1" data-salary>
                            ¥{totalLaborCost.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* シフト一覧 */}
                    {employeeShifts.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        この週のシフトはありません
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {weekDates.map(date => {
                          const dateStr = format(date, 'yyyy-MM-dd');
                          const shift = getShiftForEmployeeAndDate(employee.id, dateStr);
                          if (!shift) return null;

                          const specialDay = getSpecialDayInfo(date);
                          const dayOfWeek = date.getDay();
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                          const workMinutes = differenceInMinutes(
                            new Date(`2000-01-01T${shift.end_time}`),
                            new Date(`2000-01-01T${shift.start_time}`)
                          ) - shift.break_minutes;

                          return (
                            <div
                              key={dateStr}
                              onClick={() => handleEditShift(shift)}
                              className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                                specialDay?.type === 1
                                  ? 'bg-red-50 border-red-200 hover:border-red-400'
                                  : isWeekend
                                  ? 'bg-blue-50 border-blue-200 hover:border-blue-400'
                                  : 'bg-white border-gray-200 hover:border-ocean-400'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-lg">
                                      {specialDay?.type === 1 ? '🎌' : isWeekend ? '📅' : '📆'}
                                    </span>
                                    <span className={`font-bold text-base ${
                                      specialDay?.type === 1 ? 'text-red-700' : 
                                      isWeekend ? 'text-blue-700' : 
                                      'text-gray-800'
                                    }`}>
                                      {format(date, 'M月d日(E)', { locale: ja })}
                                    </span>
                                    {specialDay && (
                                      <span className="text-xs px-2 py-0.5 bg-red-200 text-red-800 rounded">
                                        {specialDay.name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-ocean-700">
                                    <span className="text-xl">🕐</span>
                                    <span className="font-bold text-lg">
                                      {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                                    </span>
                                    {shift.break_minutes > 0 && (
                                      <span className="text-sm text-gray-600">
                                        (休憩{shift.break_minutes}分)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-gray-600 mt-1">
                                    実働: {Math.floor(workMinutes / 60)}時間{workMinutes % 60}分
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-lg font-bold text-ocean-700" data-salary>
                                    ¥{calculateLaborCost(shift, employee).toLocaleString()}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteShift(shift.id);
                                    }}
                                    className="mt-2 text-xs px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                                  >
                                    削除
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 日別ビュー */}
        {viewMode === 'day' && (
          <div className="space-y-4">
            {weekDates.map(date => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const dayShifts = shifts.filter(s => s.date === dateStr);
              const specialDay = getSpecialDayInfo(date);
              const dayOfWeek = date.getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              
              const totalDayLaborCost = dayShifts.reduce((sum, shift) => {
                const employee = employees.find(e => e.id === shift.employee_id);
                return sum + (employee ? calculateLaborCost(shift, employee) : 0);
              }, 0);

              return (
                <div key={dateStr} className="card border-2 border-gray-200">
                  {/* 日付ヘッダー */}
                  <div className={`px-4 py-3 -m-6 mb-4 rounded-t-lg ${
                    specialDay?.type === 1
                      ? 'bg-red-500 text-white'
                      : isWeekend
                      ? 'bg-blue-500 text-white'
                      : 'bg-ocean-500 text-white'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          {specialDay?.type === 1 ? '🎌' : isWeekend ? '📅' : '📆'}
                          {format(date, 'M月d日(E)', { locale: ja })}
                        </h3>
                        {specialDay && (
                          <p className="text-sm opacity-90 mt-1">{specialDay.name}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm opacity-90">出勤人数</div>
                        <div className="text-2xl font-bold">{dayShifts.length}名</div>
                        <div className="text-sm font-bold mt-1" data-salary>
                          ¥{totalDayLaborCost.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* シフト一覧 */}
                  {dayShifts.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      この日のシフトはありません
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dayShifts.map(shift => {
                        const employee = employees.find(e => e.id === shift.employee_id);
                        if (!employee) return null;

                        const workMinutes = differenceInMinutes(
                          new Date(`2000-01-01T${shift.end_time}`),
                          new Date(`2000-01-01T${shift.start_time}`)
                        ) - shift.break_minutes;

                        return (
                          <div
                            key={shift.id}
                            onClick={() => handleEditShift(shift)}
                            className="p-4 rounded-lg border-2 border-gray-200 bg-white cursor-pointer transition-all hover:shadow-md hover:border-ocean-400"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-lg">👤</span>
                                  <span className="font-bold text-base text-gray-800">
                                    {employee.name}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                                    {employee.employment_type === 'part_time' && 'パート'}
                                    {employee.employment_type === 'part_time_insured' && '社保パート'}
                                    {employee.employment_type === 'full_time' && '正社員'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-ocean-700">
                                  <span className="text-xl">🕐</span>
                                  <span className="font-bold text-lg">
                                    {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                                  </span>
                                  {shift.break_minutes > 0 && (
                                    <span className="text-sm text-gray-600">
                                      (休憩{shift.break_minutes}分)
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm text-gray-600 mt-1">
                                  実働: {Math.floor(workMinutes / 60)}時間{workMinutes % 60}分 / 時給: ¥{employee.hourly_wage?.toLocaleString()}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-bold text-ocean-700" data-salary>
                                  ¥{calculateLaborCost(shift, employee).toLocaleString()}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteShift(shift.id);
                                  }}
                                  className="mt-2 text-xs px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                                >
                                  削除
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
