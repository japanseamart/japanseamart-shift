import { useState, useEffect } from 'react';
import { format, addMonths, eachDayOfInterval, differenceInMinutes } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Role, Employee, Shift, Store, SpecialDay, ShiftRequest } from '../types';
import AdminLayout from '../components/AdminLayout';
import { getApiUrl } from '../config/api';
import { getPeriodDates } from '../utils/dateUtils';

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
  const [isAllStores, setIsAllStores] = useState(false); // 全店フィルタモード（本部のみ）
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]); // 全従業員データ
  
  // 前半/後半期間選択
  const today = new Date();
  const [targetYear, setTargetYear] = useState(today.getFullYear());
  const [targetMonth, setTargetMonth] = useState(today.getMonth() + 1);
  const [targetPeriod, setTargetPeriod] = useState<'first' | 'second'>(today.getDate() <= 15 ? 'first' : 'second');
  
  const [editingShift, setEditingShift] = useState<ShiftInput | null>(null);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [breakManuallySet, setBreakManuallySet] = useState(false); // 休憩時間を手動で変更したかどうか
  const [totalLaborCost, setTotalLaborCost] = useState(0);
  const [monthlyLaborCostForecast, setMonthlyLaborCostForecast] = useState(0);
  const [saving, setSaving] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [showRequestsPanel, setShowRequestsPanel] = useState(true);
  
  // 予算アラート閾値
  const [warningThreshold, setWarningThreshold] = useState(95);
  const [dangerThreshold, setDangerThreshold] = useState(100);
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);
  
  // 印刷モード
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  
  // ビューモード
  const [viewMode, setViewMode] = useState<'table' | 'list' | 'day' | 'heatmap' | 'cost'>('table');
  // const [requestsViewMode, setRequestsViewMode] = useState<'card' | 'table'>('card');
  
  // 従業員並び順（期間ごとにlocalStorageで保持）
  const [orderedEmployees, setOrderedEmployees] = useState<Employee[]>([]);
  const [draggedEmployee, setDraggedEmployee] = useState<Employee | null>(null);
  
  // 期間キーを生成（店舗ID-年-月-期間）
  const getPeriodKey = () => {
    const storeKey = isAllStores ? 'all' : selectedStoreId;
    return `employee_order_${storeKey}_${targetYear}_${targetMonth}_${targetPeriod}`;
  };

  // 期間の日付リストを計算
  const { start: periodStart, end: periodEnd } = getPeriodDates(targetYear, targetMonth, targetPeriod);
  const periodDates = eachDayOfInterval({ start: periodStart, end: periodEnd });

  useEffect(() => {
    fetchStores();
    fetchSpecialDays();
    if (role === 'admin') {
      fetchAllEmployees();
    }
  }, []);

  useEffect(() => {
    if (isAllStores) {
      // 全店フィルタモード
      fetchAllShifts();
    } else if (selectedStoreId) {
      fetchStore(selectedStoreId);
      fetchEmployees(selectedStoreId);
      fetchShifts();
      fetchShiftRequests();
      fetchPublicationStatus();
    }
  }, [selectedStoreId, targetYear, targetMonth, targetPeriod, isAllStores]);

  // 従業員リスト更新時に保存された並び順を復元、なければデフォルト順
  useEffect(() => {
    if (employees.length === 0) {
      setOrderedEmployees([]);
      return;
    }
    
    const periodKey = getPeriodKey();
    const savedOrder = localStorage.getItem(periodKey);
    
    if (savedOrder) {
      try {
        const savedIds: number[] = JSON.parse(savedOrder);
        // 保存された順序に従って従業員を並べ替え
        const orderedList: Employee[] = [];
        const employeeMap = new Map(employees.map(e => [e.id, e]));
        
        // 保存された順序の従業員を追加
        savedIds.forEach(id => {
          const emp = employeeMap.get(id);
          if (emp) {
            orderedList.push(emp);
            employeeMap.delete(id);
          }
        });
        
        // 新しく追加された従業員（保存されていなかった）を末尾に追加
        employeeMap.forEach(emp => orderedList.push(emp));
        
        setOrderedEmployees(orderedList);
      } catch {
        setOrderedEmployees(employees);
      }
    } else {
      setOrderedEmployees(employees);
    }
  }, [employees, targetYear, targetMonth, targetPeriod, selectedStoreId, isAllStores]);

  useEffect(() => {
    calculateTotalLaborCost();
    calculateMonthlyForecast();
  }, [shifts, selectedStore, specialDays, employees, isAllStores, stores, allEmployees]);

  // 自動休憩時間計算（6時間ちょうど→休憩なし、6時間超→60分）
  // 手動で変更された場合は自動計算しない
  useEffect(() => {
    if (!editingShift || breakManuallySet) return;
    const { start_time, end_time } = editingShift;
    if (!start_time || !end_time) return;

    const startTime = new Date(`2000-01-01T${start_time}`);
    const endTime = new Date(`2000-01-01T${end_time}`);
    const totalMinutes = differenceInMinutes(endTime, startTime);
    // 6時間ちょうど（360分）は休憩なし、6時間超（361分以上）で60分休憩
    const autoBreakMinutes = totalMinutes > 360 ? 60 : 0;

    if (editingShift.break_minutes !== autoBreakMinutes) {
      setEditingShift({ ...editingShift, break_minutes: autoBreakMinutes });
    }
  }, [editingShift?.start_time, editingShift?.end_time, breakManuallySet]);

  const fetchStores = async () => {
    try {
      const res = await fetch(getApiUrl('/api/stores'));
      const data = await res.json();
      // 本部も含めて全店舗を表示（管理者は本部のシフトも管理可能）
      setStores(data);
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

  const fetchAllEmployees = async () => {
    try {
      const res = await fetch(getApiUrl('/api/employees'));
      const data = await res.json();
      setAllEmployees(data.filter((e: Employee) => e.store_id !== 8)); // 本部以外
    } catch (error) {
      console.error('全従業員取得エラー:', error);
    }
  };

  const fetchAllShifts = async () => {
    try {
      const res = await fetch(
        getApiUrl(`/api/shifts?start_date=${format(periodStart, 'yyyy-MM-dd')}&end_date=${format(periodEnd, 'yyyy-MM-dd')}`)
      );
      const data = await res.json();
      setShifts(data);
      // 全店モードでは従業員リストも全従業員を使用
      setEmployees(allEmployees);
    } catch (error) {
      console.error('全店シフト取得エラー:', error);
    }
  };

  const fetchShifts = async () => {
    if (!selectedStoreId) return;
    try {
      const res = await fetch(
        getApiUrl(`/api/shifts?store_id=${selectedStoreId}&start_date=${format(periodStart, 'yyyy-MM-dd')}&end_date=${format(periodEnd, 'yyyy-MM-dd')}`)
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
      const res = await fetch(
        getApiUrl(`/api/shift-requests?store_id=${selectedStoreId}&start_date=${format(periodStart, 'yyyy-MM-dd')}&end_date=${format(periodEnd, 'yyyy-MM-dd')}`)
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
        `/api/weekly-publications?store_id=${selectedStoreId}&week_start_date=${format(periodStart, 'yyyy-MM-dd')}`
      );
      const data = await res.json();
      setIsPublished(data.is_published === 1);
    } catch (error) {
      console.error('公開状態取得エラー:', error);
      setIsPublished(false);
    }
  };

  const handleTogglePublication = async () => {
    if (!selectedStoreId) return;
    const newStatus = !isPublished;
    const confirmMessage = newStatus ? 'この期間のシフトを従業員に公開しますか？' : 'この期間のシフトを非公開にしますか？';
    if (!confirm(confirmMessage)) return;

    try {
      const response = await fetch(getApiUrl('/api/weekly-publications'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          store_id: selectedStoreId,
          week_start_date: format(periodStart, 'yyyy-MM-dd'),
          is_published: newStatus
        })
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      await fetchPublicationStatus();
      alert(newStatus ? 'シフトを公開しました' : 'シフトを非公開にしました');
    } catch (error) {
      console.error('公開設定エラー:', error);
      alert('公開設定に失敗しました');
    }
  };

  const handlePrint = () => {
    setShowPrintDialog(false);
    setTimeout(() => window.print(), 100);
  };

  const handleAutoFillRequests = async () => {
    if (!selectedStoreId) return;
    const periodLabel = `${targetMonth}月${targetPeriod === 'first' ? '前半' : '後半'}`;
    if (!confirm(`【${periodLabel}】のシフト希望を自動的にシフトに反映しますか？`)) return;

    setAutoFilling(true);
    try {
      const res = await fetch(getApiUrl('/api/shifts/auto-fill-requests'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          store_id: selectedStoreId,
          start_date: format(periodStart, 'yyyy-MM-dd'),
          end_date: format(periodEnd, 'yyyy-MM-dd')
        })
      });
      const result = await res.json();
      if (result.success) {
        alert(`シフト希望の自動反映が完了しました\n作成: ${result.createdCount}件`);
        fetchShifts();
      } else {
        alert('シフト希望の自動反映に失敗しました: ' + (result.error || ''));
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

  const calculateTotalLaborCost = () => {
    // 全店計モードまたは単一店舗モードの両方に対応
    if (!isAllStores && !selectedStore) return;
    
    let total = 0;
    const employeeList = isAllStores ? allEmployees : employees;
    
    shifts.forEach(shift => {
      const employee = employeeList.find(e => e.id === shift.employee_id);
      if (employee) {
        // 全店計モードでは保存されたlabor_costを使用
        if (isAllStores && shift.labor_cost) {
          total += shift.labor_cost;
        } else {
          total += calculateLaborCost(shift, employee);
        }
      }
    });
    setTotalLaborCost(total);
  };

  const calculateMonthlyForecast = async () => {
    // 全店計モードまたは単一店舗モードの両方に対応
    if (!isAllStores && (!selectedStoreId || !selectedStore)) return;
    
    try {
      const monthStart = new Date(targetYear, targetMonth - 1, 1);
      const monthEnd = new Date(targetYear, targetMonth, 0);
      const daysInMonth = monthEnd.getDate();
      const today = new Date();
      
      // 対象月が過去か将来かを判定
      const isPastMonth = targetYear < today.getFullYear() || 
                         (targetYear === today.getFullYear() && targetMonth < today.getMonth() + 1);
      const isFutureMonth = targetYear > today.getFullYear() ||
                           (targetYear === today.getFullYear() && targetMonth > today.getMonth() + 1);
      
      // 全店計モードでは全店舗のシフトを取得、単一店舗モードでは店舗指定
      let apiUrl = '';
      if (isAllStores) {
        apiUrl = getApiUrl(`/api/shifts?start_date=${format(monthStart, 'yyyy-MM-dd')}&end_date=${format(monthEnd, 'yyyy-MM-dd')}`);
      } else {
        apiUrl = getApiUrl(`/api/shifts?store_id=${selectedStoreId}&start_date=${format(monthStart, 'yyyy-MM-dd')}&end_date=${format(monthEnd, 'yyyy-MM-dd')}`);
      }
      
      const res = await fetch(apiUrl);
      const monthlyShifts: Shift[] = await res.json();
      const employeeList = isAllStores ? allEmployees : employees;

      // 前半（1-15日）と後半（16日以降）に分けて集計
      let firstHalfCost = 0;
      let secondHalfCost = 0;
      const firstHalfShiftDays = new Set<string>();
      const secondHalfShiftDays = new Set<string>();
      
      monthlyShifts.forEach(shift => {
        const day = parseInt(shift.date.split('-')[2]);
        // シフトに保存されたlabor_costを使用（なければ計算）
        let cost = shift.labor_cost || 0;
        if (!cost) {
          const employee = employeeList.find(e => e.id === shift.employee_id);
          if (employee) {
            cost = calculateLaborCost(shift, employee);
          }
        }
        
        if (day <= 15) {
          firstHalfCost += cost;
          firstHalfShiftDays.add(shift.date);
        } else {
          secondHalfCost += cost;
          secondHalfShiftDays.add(shift.date);
        }
      });

      // 月末予測ロジック
      // 基本方針: 前半実績（確定） + 後半予測（入力済み + 残日数分の予測）
      let forecast = 0;
      const totalCurrentCost = firstHalfCost + secondHalfCost;
      const secondHalfDays = daysInMonth - 15;
      
      if (isPastMonth) {
        // 過去の月: 実績をそのまま表示
        forecast = totalCurrentCost;
      } else if (isFutureMonth) {
        // 将来の月: 入力済みシフトの合計を表示
        // シフトが入力されていない日は予測しない（まだ先の話なので）
        forecast = totalCurrentCost;
      } else {
        // 現在の月
        const currentDay = today.getDate();
        
        // 前半の日平均を計算（シフト入力済み日数ベース）
        const firstHalfDailyAverage = firstHalfShiftDays.size > 0 
          ? firstHalfCost / firstHalfShiftDays.size 
          : 0;
        
        if (currentDay <= 15) {
          // === 現在が前半の場合 ===
          // 前半の入力済み実績から日平均を算出し、月末を予測
          if (firstHalfShiftDays.size > 0) {
            // 前半の日平均 × 月の日数
            forecast = Math.round(firstHalfDailyAverage * daysInMonth);
          } else {
            forecast = 0;
          }
        } else {
          // === 現在が後半の場合 ===
          // 前半実績（確定） + 後半予測
          
          // 後半のシフト入力済み日数
          const secondHalfInputDays = secondHalfShiftDays.size;
          // 後半の残り日数（シフト未入力日数）
          const secondHalfRemainingDays = secondHalfDays - secondHalfInputDays;
          
          // 後半の予測 = 入力済み後半シフト + (前半の日平均 × 未入力日数)
          let secondHalfForecast = secondHalfCost; // 入力済み後半シフト
          
          if (secondHalfRemainingDays > 0 && firstHalfDailyAverage > 0) {
            // 未入力日数分を前半の日平均で予測
            secondHalfForecast += firstHalfDailyAverage * secondHalfRemainingDays;
          }
          
          forecast = Math.round(firstHalfCost + secondHalfForecast);
        }
      }
      
      setMonthlyLaborCostForecast(forecast);
    } catch (error) {
      console.error('月間人件費計算エラー:', error);
    }
  };

  const handleAddShift = (employeeId: number, date: string) => {
    setBreakManuallySet(false); // 新規追加時は自動計算を有効に
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
    // 全店モードでは編集不可
    if (isAllStores) return;
    
    setBreakManuallySet(true); // 編集時は既存の休憩時間を保持（手動設定済みとして扱う）
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
      const shiftData = { ...editingShift, store_id: selectedStoreId, labor_cost: laborCost };

      if (editingShift.id) {
        await fetch(getApiUrl(`/api/shifts/${editingShift.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(shiftData)
        });
      } else {
        await fetch(getApiUrl('/api/shifts'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(shiftData)
        });
      }
      setShowShiftForm(false);
      setEditingShift(null);
      setBreakManuallySet(false);
      fetchShifts();
    } catch (error) {
      console.error('シフト保存エラー:', error);
      alert('シフトの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = async (shiftId: number) => {
    // 全店モードでは削除不可
    if (isAllStores) return;
    
    if (!confirm('このシフトを削除しますか?')) return;
    try {
      await fetch(getApiUrl(`/api/shifts/${shiftId}`), { method: 'DELETE', credentials: 'include' });
      fetchShifts();
    } catch (error) {
      console.error('シフト削除エラー:', error);
      alert('シフトの削除に失敗しました');
    }
  };

  // 期間移動
  const handlePrevPeriod = () => {
    if (targetPeriod === 'second') {
      setTargetPeriod('first');
    } else {
      const prevMonth = new Date(targetYear, targetMonth - 2, 1);
      setTargetYear(prevMonth.getFullYear());
      setTargetMonth(prevMonth.getMonth() + 1);
      setTargetPeriod('second');
    }
  };

  const handleNextPeriod = () => {
    if (targetPeriod === 'first') {
      setTargetPeriod('second');
    } else {
      const nextMonth = new Date(targetYear, targetMonth, 1);
      setTargetYear(nextMonth.getFullYear());
      setTargetMonth(nextMonth.getMonth() + 1);
      setTargetPeriod('first');
    }
  };

  const handleCurrentPeriod = () => {
    const now = new Date();
    setTargetYear(now.getFullYear());
    setTargetMonth(now.getMonth() + 1);
    setTargetPeriod(now.getDate() <= 15 ? 'first' : 'second');
  };

  const getShiftForEmployeeAndDate = (employeeId: number, date: string) => 
    shifts.find(s => s.employee_id === employeeId && s.date === date);

  const getShiftRequestForEmployeeAndDate = (employeeId: number, date: string) => 
    shiftRequests.find(r => r.employee_id === employeeId && r.date === date);

  const getSpecialDayInfo = (date: Date) => 
    specialDays.find(sd => sd.date === format(date, 'yyyy-MM-dd'));

  const formatShiftRequestPatterns = (request: ShiftRequest): string => {
    try {
      const patterns = JSON.parse(request.patterns);
      if (request.custom_start && request.custom_end) return `${request.custom_start}-${request.custom_end}`;
      const patternNames: { [key: string]: string } = { morning: '朝', afternoon: '昼', evening: '夜', full: '終日', off: '休み' };
      return patterns.map((p: string) => patternNames[p] || p).join('/');
    } catch { return '−'; }
  };

  // シフト希望が「休み」かどうか判定
  const isOffRequest = (request: ShiftRequest): boolean => {
    try {
      const patterns = JSON.parse(request.patterns);
      return patterns.includes('off');
    } catch { return false; }
  };

  // シフト希望からシフト追加（クリック時）
  const handleAddShiftFromRequest = async (employeeId: number, date: string, request: ShiftRequest) => {
    // 「休み」の場合は追加しない
    if (isOffRequest(request)) return;
    
    // 既にシフトがある場合は削除
    const existingShift = getShiftForEmployeeAndDate(employeeId, date);
    if (existingShift) {
      if (confirm('このシフトを削除しますか？')) {
        await handleDeleteShiftSilent(existingShift.id);
      }
      return;
    }
    
    // シフト希望からシフトを作成
    let startTime = selectedStore?.morning_start || '09:00';
    let endTime = selectedStore?.morning_end || '17:00';
    
    // カスタム時間がある場合はそれを使用
    if (request.custom_start && request.custom_end) {
      startTime = request.custom_start;
      endTime = request.custom_end;
    } else {
      // パターンから時間を決定
      try {
        const patterns = JSON.parse(request.patterns);
        if (patterns.includes('morning')) {
          startTime = selectedStore?.morning_start || '09:00';
          endTime = selectedStore?.morning_end || '13:00';
        } else if (patterns.includes('afternoon')) {
          startTime = selectedStore?.afternoon_start || '13:00';
          endTime = selectedStore?.afternoon_end || '17:00';
        } else if (patterns.includes('evening')) {
          startTime = selectedStore?.evening_start || '17:00';
          endTime = selectedStore?.evening_end || '21:00';
        } else if (patterns.includes('full')) {
          startTime = selectedStore?.morning_start || '09:00';
          endTime = selectedStore?.evening_end || '21:00';
        }
      } catch {}
    }
    
    // 休憩時間の自動計算
    const startDt = new Date(`2000-01-01T${startTime}`);
    const endDt = new Date(`2000-01-01T${endTime}`);
    const totalMinutes = differenceInMinutes(endDt, startDt);
    const totalHours = totalMinutes / 60;
    const breakMinutes = totalHours >= 6 ? 60 : 0;
    
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return;
    
    const shiftInput: ShiftInput = {
      employee_id: employeeId,
      date,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMinutes
    };
    const laborCost = calculateLaborCost(shiftInput, employee);
    
    try {
      await fetch(getApiUrl('/api/shifts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...shiftInput, store_id: selectedStoreId, labor_cost: laborCost })
      });
      fetchShifts();
    } catch (error) {
      console.error('シフト追加エラー:', error);
    }
  };

  // 確認なしでシフト削除
  const handleDeleteShiftSilent = async (shiftId: number) => {
    try {
      await fetch(getApiUrl(`/api/shifts/${shiftId}`), { method: 'DELETE', credentials: 'include' });
      fetchShifts();
    } catch (error) {
      console.error('シフト削除エラー:', error);
    }
  };

  // ドラッグ＆ドロップハンドラ
  const handleDragStart = (employee: Employee) => {
    setDraggedEmployee(employee);
  };

  const handleDragOver = (e: React.DragEvent, targetEmployee: Employee) => {
    e.preventDefault();
    if (!draggedEmployee || draggedEmployee.id === targetEmployee.id) return;
    
    const newOrder = [...orderedEmployees];
    const draggedIndex = newOrder.findIndex(e => e.id === draggedEmployee.id);
    const targetIndex = newOrder.findIndex(e => e.id === targetEmployee.id);
    
    if (draggedIndex !== -1 && targetIndex !== -1) {
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedEmployee);
      setOrderedEmployees(newOrder);
      
      // 選択期間ごとにlocalStorageに保存
      const periodKey = getPeriodKey();
      const orderIds = newOrder.map(e => e.id);
      localStorage.setItem(periodKey, JSON.stringify(orderIds));
    }
  };

  const handleDragEnd = () => {
    setDraggedEmployee(null);
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

  // ヒートマップ用: 最大人数を計算（月間レポートと同じ濃淡表示のため）
  const getMaxHourlyStaffCount = () => {
    let max = 0;
    for (const date of periodDates) {
      for (let hour = 6; hour <= 21; hour++) {
        const count = getHourlyStaffCount(date, hour);
        if (count > max) max = count;
      }
    }
    return max || 1; // 0除算防止
  };

  // ヒートマップのカラー計算（月間レポートと同じ青系グラデーション）
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

  // 全店計モードでは全店舗の予算合計、単一店舗では選択店舗の予算
  const allStoresBudget = stores.reduce((sum, store) => sum + (store.monthly_budget || 0), 0);
  const totalMonthlyBudget = isAllStores ? allStoresBudget : (selectedStore?.monthly_budget || 0);
  const periodBudget = totalMonthlyBudget ? Math.round(totalMonthlyBudget / 2) : 0;
  const budgetUsagePercent = periodBudget > 0 ? (totalLaborCost / periodBudget) * 100 : 0;
  const periodStatus = budgetUsagePercent >= dangerThreshold ? 'danger' : budgetUsagePercent >= warningThreshold ? 'warning' : 'normal';
  const monthlyStatus = totalMonthlyBudget && monthlyLaborCostForecast > 0
    ? (monthlyLaborCostForecast / totalMonthlyBudget * 100 >= dangerThreshold ? 'danger' 
      : monthlyLaborCostForecast / totalMonthlyBudget * 100 >= warningThreshold ? 'warning' : 'normal')
    : 'normal';

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className={`space-y-6 ${showShiftForm ? 'pb-48 md:pb-32' : ''}`}>
        {/* ヘッダー */}
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">シフト作成</h1>
          </div>

          {/* デスクトップ: 横並びボタン */}
          <div className="hidden md:flex gap-2 no-print">
            <button onClick={() => setShowThresholdSettings(!showThresholdSettings)} className="btn-secondary">
              ⚙️ 予算アラート設定
            </button>
            <button onClick={handleAutoFillRequests} disabled={autoFilling} className="btn-primary disabled:opacity-50">
              {autoFilling ? '反映中...' : '✨ シフト希望を自動反映'}
            </button>
            <button onClick={handleTogglePublication}
              className={`px-4 py-2 rounded-lg font-medium transition ${isPublished ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}>
              {isPublished ? '🔓 公開中 (非公開にする)' : '🔒 未公開 (公開する)'}
            </button>
            <button onClick={() => setShowPrintDialog(true)} className="btn-secondary">🖨️ 印刷</button>
          </div>

          {/* モバイル: 縦積みボタン */}
          <div className="md:hidden space-y-2 no-print">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleAutoFillRequests} disabled={autoFilling}
                className="h-12 bg-ocean-600 text-white rounded-lg font-bold hover:bg-ocean-700 disabled:opacity-50 text-sm">
                {autoFilling ? '⏳ 反映中...' : '✨ 自動反映'}
              </button>
              <button onClick={handleTogglePublication}
                className={`h-12 rounded-lg font-bold text-sm ${isPublished ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white'}`}>
                {isPublished ? '🔓 公開中' : '🔒 公開する'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowThresholdSettings(!showThresholdSettings)}
                className="h-10 bg-gray-200 text-gray-800 rounded-lg font-medium text-sm">⚙️ 予算設定</button>
              <button onClick={() => setShowPrintDialog(true)}
                className="h-10 bg-gray-200 text-gray-800 rounded-lg font-medium text-sm">🖨️ 印刷</button>
            </div>
          </div>
        </div>

        {/* 閾値設定パネル */}
        {showThresholdSettings && (
          <div className="card bg-blue-50 border-2 border-blue-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">⚙️ 予算アラート閾値設定</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">黄色警告閾値（％）</label>
                <input type="number" value={warningThreshold} onChange={(e) => setWarningThreshold(Number(e.target.value))}
                  className="input-field" min="0" max="100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">赤色危険閾値（％）</label>
                <input type="number" value={dangerThreshold} onChange={(e) => setDangerThreshold(Number(e.target.value))}
                  className="input-field" min="0" max="200" />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowThresholdSettings(false)} className="btn-primary">設定を閉じる</button>
            </div>
          </div>
        )}

        {/* 印刷ダイアログ */}
        {showPrintDialog && (
          <div className="card bg-green-50 border-2 border-green-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">🖨️ 印刷</h3>
            <p className="text-sm text-gray-700 mb-4">
              現在表示中の期間（{targetMonth}月{targetPeriod === 'first' ? '前半' : '後半'}）を印刷します。
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowPrintDialog(false)} className="btn-secondary">キャンセル</button>
              <button onClick={handlePrint} className="btn-primary">🖨️ 印刷</button>
            </div>
          </div>
        )}

        {/* コントロールパネル */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* 店舗選択 */}
            {role === 'admin' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">店舗</label>
                <select 
                  value={isAllStores ? 'all' : (selectedStoreId || '')} 
                  onChange={(e) => {
                    if (e.target.value === 'all') {
                      setIsAllStores(true);
                      setSelectedStoreId(null);
                      setSelectedStore(null);
                    } else {
                      setIsAllStores(false);
                      setSelectedStoreId(Number(e.target.value));
                    }
                  }} 
                  className="input-field"
                >
                  <option value="all">🏢 全店</option>
                  {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </div>
            )}

            {/* 期間選択（前半/後半） */}
            <div className={role === 'admin' ? '' : 'col-span-2'}>
              <label className="block text-sm font-medium text-gray-700 mb-2">対象期間</label>
              <div className="flex flex-col gap-2">
                {/* 年月選択 */}
                <div className="flex gap-2">
                  <select value={`${targetYear}-${targetMonth.toString().padStart(2, '0')}`}
                    onChange={(e) => {
                      const [y, m] = e.target.value.split('-');
                      setTargetYear(parseInt(y));
                      setTargetMonth(parseInt(m));
                    }}
                    className="input-field flex-1">
                    {Array.from({ length: 12 }, (_, i) => {
                      const d = addMonths(new Date(), i - 3);
                      return (
                        <option key={i} value={format(d, 'yyyy-MM')}>
                          {format(d, 'yyyy年M月', { locale: ja })}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 前半/後半ボタン */}
                <div className="grid grid-cols-4 gap-2">
                  <button onClick={handlePrevPeriod}
                    className="h-12 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors">
                    ← 前
                  </button>
                  <button onClick={() => setTargetPeriod('first')}
                    className={`h-12 rounded-lg font-bold transition-colors ${targetPeriod === 'first' ? 'bg-ocean-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    前半
                  </button>
                  <button onClick={() => setTargetPeriod('second')}
                    className={`h-12 rounded-lg font-bold transition-colors ${targetPeriod === 'second' ? 'bg-ocean-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    後半
                  </button>
                  <button onClick={handleNextPeriod}
                    className="h-12 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors">
                    次 →
                  </button>
                </div>

                {/* 現在の期間表示 & 今期ボタン */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-12 flex items-center justify-center text-base font-bold bg-ocean-100 text-ocean-900 rounded-lg">
                    📅 {targetMonth}月{targetPeriod === 'first' ? '前半' : '後半'}（{format(periodStart, 'M/d')}〜{format(periodEnd, 'M/d')}）
                  </div>
                  <button onClick={handleCurrentPeriod}
                    className="h-12 px-4 bg-ocean-600 text-white rounded-lg font-bold hover:bg-ocean-700 transition-colors">
                    今期
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 全店モード時の表示 */}
          {isAllStores && (
            <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 text-blue-800">
                <span className="text-xl">🏢</span>
                <span className="font-bold">全店フィルタモード</span>
                <span className="text-sm text-blue-600">（閲覧専用）</span>
              </div>
              <p className="text-sm text-blue-700 mt-2">
                全店舗のシフトを一覧表示しています。シフトの編集・追加は、個別の店舗を選択してください。
              </p>
            </div>
          )}

          {/* 人件費サマリー */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-salary>
            {/* 期間人件費 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {isAllStores ? '🏢 全店計 ' : ''}{targetPeriod === 'first' ? '前半' : '後半'}人件費
                {periodStatus === 'danger' && <span className="ml-2 text-xs text-red-600 font-bold">🔴 予算超過</span>}
                {periodStatus === 'warning' && <span className="ml-2 text-xs text-yellow-600 font-bold">🟡 予算警告</span>}
              </label>
              <div className={`rounded-lg p-3 ${
                periodStatus === 'danger' ? 'bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-300' :
                periodStatus === 'warning' ? 'bg-gradient-to-r from-yellow-50 to-yellow-100 border-2 border-yellow-300' :
                'bg-gradient-to-r from-ocean-50 to-ocean-100'
              }`}>
                <div className={`text-xl font-bold ${
                  periodStatus === 'danger' ? 'text-red-900' : periodStatus === 'warning' ? 'text-yellow-900' : 'text-ocean-900'
                }`}>
                  ¥{totalLaborCost.toLocaleString()}
                </div>
                {periodBudget > 0 && (
                  <div className="text-xs text-gray-600 mt-1">
                    <div className="flex justify-between items-center mb-1">
                      <span>半期予算: ¥{periodBudget.toLocaleString()}</span>
                      <span className={`font-bold ${
                        periodStatus === 'danger' ? 'text-red-600' : periodStatus === 'warning' ? 'text-yellow-600' : 'text-gray-700'
                      }`}>{Math.round(budgetUsagePercent)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${
                        periodStatus === 'danger' ? 'bg-red-500' : periodStatus === 'warning' ? 'bg-yellow-500' : 'bg-green-500'
                      }`} style={{ width: `${Math.min(budgetUsagePercent, 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 月末人件費予想 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {isAllStores ? '🏢 全店計 ' : ''}{targetMonth}月末 人件費予想
                {monthlyStatus === 'danger' && <span className="ml-2 text-xs text-red-600 font-bold">🔴 予算超過</span>}
                {monthlyStatus === 'warning' && <span className="ml-2 text-xs text-yellow-600 font-bold">🟡 予算警告</span>}
              </label>
              <div className={`rounded-lg p-3 ${
                monthlyStatus === 'danger' ? 'bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-300' :
                monthlyStatus === 'warning' ? 'bg-gradient-to-r from-yellow-50 to-yellow-100 border-2 border-yellow-300' :
                'bg-gradient-to-r from-blue-50 to-blue-100'
              }`}>
                <div className={`text-xl font-bold ${
                  monthlyStatus === 'danger' ? 'text-red-900' : monthlyStatus === 'warning' ? 'text-yellow-900' : 'text-blue-900'
                }`}>
                  ¥{monthlyLaborCostForecast.toLocaleString()}
                </div>
                {totalMonthlyBudget > 0 && (
                  <div className="text-xs text-gray-600 mt-1">
                    <div className="flex justify-between items-center mb-1">
                      <span>月予算: ¥{totalMonthlyBudget.toLocaleString()}</span>
                      <span className="font-bold">{Math.round(monthlyLaborCostForecast / totalMonthlyBudget * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${
                        monthlyStatus === 'danger' ? 'bg-red-500' : monthlyStatus === 'warning' ? 'bg-yellow-500' : 'bg-green-500'
                      }`} style={{ width: `${Math.min(monthlyLaborCostForecast / totalMonthlyBudget * 100, 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 公開状態インジケーター */}
          <div className={`mt-4 p-3 rounded-lg border-2 no-print ${isPublished ? 'bg-green-50 border-green-300' : 'bg-yellow-50 border-yellow-300'}`}>
            <div className="flex items-center gap-2">
              {isPublished ? (
                <>
                  <span className="text-green-600">🔓</span>
                  <span className="text-sm font-medium text-green-800">この期間のシフトは従業員に<strong>公開されています</strong></span>
                </>
              ) : (
                <>
                  <span className="text-yellow-600">🔒</span>
                  <span className="text-sm font-medium text-yellow-800">この期間のシフトは<strong>未公開</strong>です</span>
                </>
              )}
            </div>
          </div>

          {/* ビューモード切り替え */}
          <div className="mt-4 grid grid-cols-3 md:grid-cols-5 gap-2 no-print">
            {[
              { mode: 'table', label: '📅 表', desc: '' },
              { mode: 'list', label: '👥 従業員', desc: '' },
              { mode: 'day', label: '📆 日別', desc: '' },
              { mode: 'heatmap', label: '🔥 ヒート', desc: '' },
              { mode: 'cost', label: '💰 人件費', desc: '' }
            ].map(({ mode, label }) => (
              <button key={mode} onClick={() => setViewMode(mode as typeof viewMode)}
                className={`h-12 rounded-lg text-sm font-medium transition-all ${
                  viewMode === mode ? 'bg-ocean-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* シフト編集フォーム - 画面下部に固定表示 */}
        {showShiftForm && editingShift && (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-blue-50 border-t-4 border-blue-400 shadow-2xl p-4 md:p-6 no-print">
            <div className="max-w-6xl mx-auto">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-gray-800 text-lg">
                  {editingShift.id ? '✏️ シフト編集' : '➕ シフト追加'}
                </h3>
                <button 
                  onClick={() => { setShowShiftForm(false); setEditingShift(null); setBreakManuallySet(false); }} 
                  className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">従業員</label>
                  <div className="input-field bg-white text-sm py-2">{employees.find(e => e.id === editingShift.employee_id)?.name}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">日付</label>
                  <div className="input-field bg-white text-sm py-2">{format(new Date(editingShift.date), 'M/d(E)', { locale: ja })}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">開始</label>
                  <input type="time" value={editingShift.start_time}
                    onChange={(e) => setEditingShift({ ...editingShift, start_time: e.target.value })} 
                    className="input-field text-sm py-2" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">終了</label>
                  <input type="time" value={editingShift.end_time}
                    onChange={(e) => setEditingShift({ ...editingShift, end_time: e.target.value })} 
                    className="input-field text-sm py-2" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    休憩(分)
                    {!breakManuallySet && <span className="text-[10px] text-blue-500 ml-1">自動</span>}
                  </label>
                  <input type="number" value={editingShift.break_minutes}
                    onChange={(e) => {
                      setBreakManuallySet(true); // 手動変更フラグを設定
                      setEditingShift({ ...editingShift, break_minutes: Number(e.target.value) });
                    }}
                    className="input-field text-sm py-2" min="0" step="15" />
                </div>
                <div className="flex items-end gap-2">
                  <button onClick={handleSaveShift} disabled={saving} className="btn-primary flex-1 py-2 text-sm">
                    {saving ? '保存中...' : '💾 保存'}
                  </button>
                  {editingShift.id && (
                    <button onClick={() => { handleDeleteShift(editingShift.id!); setShowShiftForm(false); setEditingShift(null); setBreakManuallySet(false); }} 
                      className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm">
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* シフト希望パネル */}
        <div className="card no-print">
          <div className="flex flex-col gap-2 mb-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base md:text-lg font-bold text-gray-800">📋 シフト希望一覧</h3>
              <button onClick={() => setShowRequestsPanel(!showRequestsPanel)} className="btn-secondary text-sm">
                {showRequestsPanel ? '非表示' : '表示'}
              </button>
            </div>
            {showRequestsPanel && (
              <p className="text-xs text-gray-500">💡 クリックでシフト追加/削除、従業員名をドラッグして並び替え（画面内のみ）</p>
            )}
          </div>
          {showRequestsPanel && (
            <div className="overflow-auto max-h-[400px] border rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-ocean-50 sticky top-0 z-20">
                  <tr>
                    <th className="sticky left-0 z-30 bg-ocean-50 px-3 py-2 text-left font-medium text-gray-700 min-w-[100px] border-b border-r">従業員</th>
                    {periodDates.map(date => {
                      const dayOfWeek = date.getDay();
                      return (
                        <th key={date.toISOString()} className={`px-2 py-2 text-center font-medium min-w-[60px] border-b ${
                          dayOfWeek === 0 ? 'bg-red-100 text-red-700' : dayOfWeek === 6 ? 'bg-blue-100 text-blue-700' : 'bg-ocean-50 text-gray-700'
                        }`}>
                          <div className="font-bold">{format(date, 'd', { locale: ja })}</div>
                          <div className="text-[10px]">{format(date, 'E', { locale: ja })}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {orderedEmployees.map(employee => (
                    <tr key={employee.id} 
                      className={`hover:bg-gray-50 ${draggedEmployee?.id === employee.id ? 'opacity-50 bg-blue-50' : ''}`}
                      draggable
                      onDragStart={() => handleDragStart(employee)}
                      onDragOver={(e) => handleDragOver(e, employee)}
                      onDragEnd={handleDragEnd}
                    >
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-gray-800 border-r cursor-move hover:bg-gray-100">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">⠿</span>
                          {employee.name}
                        </div>
                      </td>
                      {periodDates.map(date => {
                        const dateStr = format(date, 'yyyy-MM-dd');
                        const request = getShiftRequestForEmployeeAndDate(employee.id, dateStr);
                        const hasShift = getShiftForEmployeeAndDate(employee.id, dateStr);
                        const isOff = request && isOffRequest(request);
                        return (
                          <td key={date.toISOString()} className="px-2 py-2 text-center">
                            {request ? (
                              <div 
                                onClick={() => handleAddShiftFromRequest(employee.id, dateStr, request)}
                                className={`text-xs px-1 py-1 rounded cursor-pointer transition-all hover:scale-105 hover:shadow ${
                                  isOff ? 'bg-red-100 text-red-700 border border-red-300' :
                                  hasShift ? 'bg-green-100 text-green-800 border border-green-300' : 
                                  'bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200'
                                }`}
                                title={isOff ? '休み希望（クリック不可）' : hasShift ? 'クリックで削除' : 'クリックでシフト追加'}
                              >
                                {formatShiftRequestPatterns(request)}
                                {hasShift && !isOff && <div className="text-[9px] text-green-600 font-bold">✓</div>}
                              </div>
                            ) : <span className="text-gray-400">−</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 表ビュー */}
        {viewMode === 'table' && (
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
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    return (
                      <th key={date.toISOString()}
                        className={`px-2 py-3 text-center text-xs font-medium uppercase border-r border-b min-w-[80px] ${
                          specialDay?.type === 1 ? 'bg-red-100 text-red-700' : dayOfWeek === 0 ? 'bg-red-50 text-red-600' : isWeekend ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-500'
                        }`}>
                        <div className="font-bold">{format(date, 'd', { locale: ja })}</div>
                        <div className="text-[10px] mt-1">{format(date, 'E', { locale: ja })}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orderedEmployees.map(employee => {
                  const employeeStore = isAllStores ? stores.find(s => s.id === employee.store_id) : null;
                  return (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r">
                      <div className="font-medium text-gray-900">{employee.name}</div>
                      <div className="text-xs text-gray-500">
                        {isAllStores && employeeStore && <span className="text-ocean-600 mr-1">[{employeeStore.name}]</span>}
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
                        <td key={dateStr}
                          className={`px-2 py-2 border-r text-center ${
                            specialDay?.type === 1 ? 'bg-red-50' : dayOfWeek === 0 ? 'bg-red-50' : dayOfWeek === 6 ? 'bg-blue-50' : ''
                          }`}>
                          {shift ? (
                            <div onClick={() => handleEditShift(shift)}
                              className={`${isAllStores ? '' : 'cursor-pointer hover:bg-ocean-700'} bg-ocean-600 text-white rounded px-1 py-1 text-xs transition-colors`}>
                              <div className="font-medium">{shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}</div>
                              {shift.break_minutes > 0 && <div className="text-[9px] opacity-75">休{shift.break_minutes}分</div>}
                              <div className="text-[10px] opacity-90" data-salary>¥{calculateLaborCost(shift, employee).toLocaleString()}</div>
                            </div>
                          ) : (
                            !isAllStores && (
                              <button onClick={() => handleAddShift(employee.id, dateStr)}
                                className="w-full py-2 text-gray-400 hover:text-ocean-600 hover:bg-ocean-50 rounded text-xs">+</button>
                            )
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* リストビュー */}
        {viewMode === 'list' && (
          <div className="space-y-4">
            {orderedEmployees.map(employee => {
              const employeeShifts = shifts.filter(s => s.employee_id === employee.id);
              const totalCost = employeeShifts.reduce((sum, s) => sum + calculateLaborCost(s, employee), 0);
              const employeeStore = isAllStores ? stores.find(s => s.id === employee.store_id) : null;
              return (
                <div key={employee.id} className="card border-2 border-gray-200">
                  <div className="bg-ocean-500 text-white px-4 py-3 -m-6 mb-4 rounded-t-lg flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-bold">👤 {employee.name}</h3>
                      {isAllStores && employeeStore && <p className="text-sm opacity-90">[{employeeStore.name}]</p>}
                      <p className="text-sm opacity-90">時給 ¥{employee.hourly_wage?.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">シフト数</div>
                      <div className="text-2xl font-bold">{employeeShifts.length}日</div>
                      <div className="text-sm" data-salary>¥{totalCost.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {periodDates.map(date => {
                      const shift = getShiftForEmployeeAndDate(employee.id, format(date, 'yyyy-MM-dd'));
                      if (!shift) return null;
                      return (
                        <div key={date.toISOString()} onClick={() => handleEditShift(shift)}
                          className={`p-3 rounded-lg border-2 border-gray-200 flex justify-between items-center ${isAllStores ? '' : 'hover:border-ocean-400 cursor-pointer'}`}>
                          <div>
                            <div className="font-bold">{format(date, 'M/d(E)', { locale: ja })}</div>
                            <div className="text-ocean-700">
                              {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                              {shift.break_minutes > 0 && <span className="text-gray-500 text-xs ml-2">休{shift.break_minutes}分</span>}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold" data-salary>¥{calculateLaborCost(shift, employee).toLocaleString()}</div>
                            {!isAllStores && (
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteShift(shift.id); }}
                                className="text-xs text-red-600 hover:text-red-800">削除</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 日別ビュー */}
        {viewMode === 'day' && (
          <div className="space-y-4">
            {periodDates.map(date => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const dayShifts = shifts.filter(s => s.date === dateStr);
              const totalDayCost = getDailyCost(date);
              const specialDay = getSpecialDayInfo(date);
              const dayOfWeek = date.getDay();
              return (
                <div key={dateStr} className="card border-2 border-gray-200">
                  <div className={`px-4 py-3 -m-6 mb-4 rounded-t-lg flex justify-between items-center ${
                    specialDay?.type === 1 ? 'bg-red-500 text-white' : dayOfWeek === 0 ? 'bg-red-400 text-white' : dayOfWeek === 6 ? 'bg-blue-500 text-white' : 'bg-ocean-500 text-white'
                  }`}>
                    <div>
                      <h3 className="text-lg font-bold">{format(date, 'M月d日(E)', { locale: ja })}</h3>
                      {specialDay && <p className="text-sm opacity-90">{specialDay.name}</p>}
                    </div>
                    <div className="text-right">
                      <div className="text-sm">出勤</div>
                      <div className="text-2xl font-bold">{dayShifts.length}名</div>
                      <div className="text-sm" data-salary>¥{totalDayCost.toLocaleString()}</div>
                    </div>
                  </div>
                  {dayShifts.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">シフトなし</div>
                  ) : (
                    <div className="space-y-2">
                      {dayShifts.map(shift => {
                        const emp = employees.find(e => e.id === shift.employee_id);
                        if (!emp) return null;
                        const empStore = isAllStores ? stores.find(s => s.id === emp.store_id) : null;
                        return (
                          <div key={shift.id} onClick={() => handleEditShift(shift)}
                            className={`p-3 rounded-lg border-2 border-gray-200 flex justify-between items-center ${isAllStores ? '' : 'hover:border-ocean-400 cursor-pointer'}`}>
                            <div>
                              <div className="font-bold">
                                {emp.name}
                                {isAllStores && empStore && <span className="text-sm font-normal text-ocean-600 ml-2">[{empStore.name}]</span>}
                              </div>
                              <div className="text-ocean-700">
                                {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                                {shift.break_minutes > 0 && <span className="text-gray-500 text-xs ml-2">休{shift.break_minutes}分</span>}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold" data-salary>¥{calculateLaborCost(shift, emp).toLocaleString()}</div>
                              {!isAllStores && (
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteShift(shift.id); }}
                                  className="text-xs text-red-600 hover:text-red-800">削除</button>
                              )}
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

        {/* ヒートマップビュー */}
        {viewMode === 'heatmap' && (() => {
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

        {/* 日別人件費ビュー */}
        {viewMode === 'cost' && (
          <div className="card">
            <h3 className="text-lg font-bold text-gray-800 mb-4">💰 日別人件費一覧</h3>
            {/* 予算目安 */}
            {periodBudget > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-gray-50 border">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">半期予算: </span>
                    <span className="font-bold">¥{periodBudget.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">1日あたり目安: </span>
                    <span className="font-bold text-ocean-700">¥{Math.round(periodBudget / periodDates.length).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">現在の消化率: </span>
                    <span className={`font-bold ${periodStatus === 'danger' ? 'text-red-600' : periodStatus === 'warning' ? 'text-yellow-600' : 'text-green-600'}`}>
                      {Math.round(budgetUsagePercent)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">日付</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500">出勤人数</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">人件費</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">予算目安比</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-500">状態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(() => {
                    const dailyBudget = periodBudget > 0 ? Math.round(periodBudget / periodDates.length) : 0;
                    return periodDates.map(date => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const dayShifts = shifts.filter(s => s.date === dateStr);
                      const dayCost = getDailyCost(date);
                      const specialDay = getSpecialDayInfo(date);
                      const dayOfWeek = date.getDay();
                      const ratio = dailyBudget > 0 ? (dayCost / dailyBudget * 100) : 0;
                      const status = ratio === 0 ? 'none' : ratio <= 80 ? 'good' : ratio <= 100 ? 'normal' : ratio <= 120 ? 'warning' : 'danger';
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
                          <td className="px-4 py-3 text-right font-bold" data-salary>¥{dayCost.toLocaleString()}</td>
                          <td className={`px-4 py-3 text-right font-medium ${
                            status === 'danger' ? 'text-red-600' : status === 'warning' ? 'text-yellow-600' : status === 'good' ? 'text-green-600' : 'text-gray-600'
                          }`}>
                            {ratio > 0 ? `${Math.round(ratio)}%` : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {status === 'none' && <span className="text-gray-400">-</span>}
                            {status === 'good' && <span className="text-green-600 text-lg">✅</span>}
                            {status === 'normal' && <span className="text-blue-600 text-lg">📊</span>}
                            {status === 'warning' && <span className="text-yellow-600 text-lg">⚠️</span>}
                            {status === 'danger' && <span className="text-red-600 text-lg">🔴</span>}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
                <tfoot className="bg-ocean-50">
                  <tr>
                    <td className="px-4 py-3 font-bold text-gray-800">合計</td>
                    <td className="px-4 py-3 text-center font-bold">{shifts.length}件</td>
                    <td className="px-4 py-3 text-right font-bold text-ocean-700" data-salary>¥{totalLaborCost.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-600" colSpan={2}>
                      日平均: ¥{Math.round(totalLaborCost / periodDates.length).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* 凡例 */}
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              <span className="flex items-center gap-1"><span className="text-green-600">✅</span>予算以下（80%以下）</span>
              <span className="flex items-center gap-1"><span className="text-blue-600">📊</span>予算範囲内（81-100%）</span>
              <span className="flex items-center gap-1"><span className="text-yellow-600">⚠️</span>やや超過（101-120%）</span>
              <span className="flex items-center gap-1"><span className="text-red-600">🔴</span>超過（120%超）</span>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
