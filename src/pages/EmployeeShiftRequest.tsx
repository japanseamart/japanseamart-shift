import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, isBefore, parseISO, eachDayOfInterval } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { Store, Employee, ShiftRequest, SpecialDay } from '../types';
import { getApiUrl } from '../config/api';
import { getPeriodDates } from '../utils/dateUtils';
import HelpPanel from '../components/HelpPanel';

interface ShiftPattern {
  id: string;
  name: string;
  start?: string;
  end?: string;
}

interface ShiftDeadline {
  id: number;
  store_id: number;
  target_year: number;
  target_month: number;
  target_period: 'first' | 'second';
  deadline_date: string;
  notification_message: string | null;
  is_changed: number;
  change_count: number;
  created_at: string;
  updated_at: string;
}

const SHIFT_PATTERNS: ShiftPattern[] = [
  { id: 'morning', name: '朝', start: '07:00', end: '12:00' },
  { id: 'afternoon', name: '昼', start: '12:00', end: '17:00' },
  { id: 'evening', name: '夜', start: '17:00', end: '22:00' },
  { id: 'full', name: '全日', start: '07:00', end: '22:00' },
  { id: 'custom', name: 'カスタム', start: undefined, end: undefined },
  { id: 'off', name: '休み希望', start: undefined, end: undefined }
];

export default function EmployeeShiftRequest() {
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  
  // 期間選択（年/月/前半・後半）
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [targetMonth, setTargetMonth] = useState(new Date().getMonth() + 1);
  const [targetPeriod, setTargetPeriod] = useState<'first' | 'second'>(new Date().getDate() <= 15 ? 'first' : 'second');
  
  const [requests, setRequests] = useState<Map<string, ShiftRequest>>(new Map());
  const [selectedPatterns, setSelectedPatterns] = useState<Map<string, string[]>>(new Map());
  const [customTimes, setCustomTimes] = useState<Map<string, { start: string; end: string }>>(new Map());
  
  // 締切関連（複数の締切を保持）
  const [deadlines, setDeadlines] = useState<ShiftDeadline[]>([]);
  const [currentDeadline, setCurrentDeadline] = useState<ShiftDeadline | null>(null);
  const [dismissedDeadlineIds, setDismissedDeadlineIds] = useState<Set<number>>(new Set());
  
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 暗証番号認証関連
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState(['', '', '', '']);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isDefaultPin, setIsDefaultPin] = useState(false);
  const [showPinChangeModal, setShowPinChangeModal] = useState(false);
  const [currentPinForChange, setCurrentPinForChange] = useState('');
  const [newPinInput, setNewPinInput] = useState(['', '', '', '']);
  const [confirmPinInput, setConfirmPinInput] = useState(['', '', '', '']);
  const [pinChangeError, setPinChangeError] = useState<string | null>(null);
  const [pinChangeSuccess, setPinChangeSuccess] = useState(false);

  // 期間の日付リストを計算
  const { start: periodStart, end: periodEnd } = getPeriodDates(targetYear, targetMonth, targetPeriod);
  const periodDates = eachDayOfInterval({ start: periodStart, end: periodEnd });

  useEffect(() => {
    fetchStores();
    fetchSpecialDays();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      fetchEmployees(selectedStoreId);
      fetchDeadlines(selectedStoreId);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    // 現在の期間に対応する締切を設定
    const deadline = deadlines.find(d => 
      d.target_year === targetYear && 
      d.target_month === targetMonth && 
      d.target_period === targetPeriod
    );
    setCurrentDeadline(deadline || null);
  }, [deadlines, targetYear, targetMonth, targetPeriod]);

  useEffect(() => {
    if (selectedEmployeeId) {
      fetchExistingRequests();
    }
  }, [selectedEmployeeId, targetYear, targetMonth, targetPeriod]);

  // 従業員変更時に認証をリセット
  useEffect(() => {
    setIsAuthenticated(false);
    setPinInput(['', '', '', '']);
    setPinError(null);
    setIsDefaultPin(false);
  }, [selectedEmployeeId]);

  const fetchStores = async () => {
    try {
      const res = await fetch(getApiUrl('/api/stores'));
      const data = await res.json();
      // 全店舗を表示（本部含む）
      setStores(data);
      if (data.length > 0) {
        setSelectedStoreId(data[0].id);
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
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

  const fetchDeadlines = async (storeId: number) => {
    try {
      const res = await fetch(getApiUrl(`/api/shift-deadlines/for-employee?store_id=${storeId}`));
      const data = await res.json();
      setDeadlines(data);
    } catch (error) {
      console.error('締切取得エラー:', error);
      setDeadlines([]);
    }
  };

  // 暗証番号入力ハンドラー
  const handlePinInputChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // 数字のみ許可
    
    const newPinInput = [...pinInput];
    newPinInput[index] = value.slice(-1); // 1文字のみ
    setPinInput(newPinInput);
    setPinError(null);
    
    // 次の入力欄に自動フォーカス
    if (value && index < 3) {
      const nextInput = document.getElementById(`pin-${index + 1}`);
      nextInput?.focus();
    }
    
    // 4桁入力完了時に自動認証
    if (newPinInput.every(p => p !== '') && index === 3) {
      verifyPin(newPinInput.join(''));
    }
  };

  // 暗証番号認証
  const verifyPin = async (pin: string) => {
    if (!selectedEmployeeId) return;
    
    try {
      const res = await fetch(getApiUrl(`/api/employees/${selectedEmployeeId}/verify-pin`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      
      if (data.valid) {
        setIsAuthenticated(true);
        setIsDefaultPin(data.isDefaultPin);
        setPinError(null);
      } else {
        setPinError('暗証番号が正しくありません');
        setPinInput(['', '', '', '']);
        // 最初の入力欄にフォーカス
        setTimeout(() => {
          document.getElementById('pin-0')?.focus();
        }, 100);
      }
    } catch (error) {
      console.error('認証エラー:', error);
      setPinError('認証処理中にエラーが発生しました');
    }
  };

  // 暗証番号変更ハンドラー（新しいPIN入力）
  const handleNewPinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newPin = [...newPinInput];
    newPin[index] = value.slice(-1);
    setNewPinInput(newPin);
    setPinChangeError(null);
    if (value && index < 3) {
      document.getElementById(`new-pin-${index + 1}`)?.focus();
    }
  };

  // 暗証番号変更ハンドラー（確認用PIN入力）
  const handleConfirmPinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const confirmPin = [...confirmPinInput];
    confirmPin[index] = value.slice(-1);
    setConfirmPinInput(confirmPin);
    setPinChangeError(null);
    if (value && index < 3) {
      document.getElementById(`confirm-pin-${index + 1}`)?.focus();
    }
  };

  // 暗証番号変更実行
  const handlePinChange = async () => {
    if (!selectedEmployeeId) return;
    
    const newPin = newPinInput.join('');
    const confirmPin = confirmPinInput.join('');
    
    if (newPin.length !== 4) {
      setPinChangeError('新しい暗証番号を4桁入力してください');
      return;
    }
    
    if (newPin !== confirmPin) {
      setPinChangeError('新しい暗証番号が一致しません');
      return;
    }
    
    if (newPin === '0000') {
      setPinChangeError('0000以外の暗証番号を設定してください');
      return;
    }
    
    try {
      const res = await fetch(getApiUrl(`/api/employees/${selectedEmployeeId}/pin`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentPin: currentPinForChange || pinInput.join(''),
          newPin 
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        setPinChangeSuccess(true);
        setIsDefaultPin(false);
        setTimeout(() => {
          setShowPinChangeModal(false);
          setPinChangeSuccess(false);
          setNewPinInput(['', '', '', '']);
          setConfirmPinInput(['', '', '', '']);
          setCurrentPinForChange('');
        }, 2000);
      } else {
        setPinChangeError(data.error || '暗証番号の変更に失敗しました');
      }
    } catch (error) {
      console.error('PIN変更エラー:', error);
      setPinChangeError('暗証番号変更中にエラーが発生しました');
    }
  };

  // 暗証番号変更モーダルを開く
  const openPinChangeModal = () => {
    setCurrentPinForChange(pinInput.join(''));
    setNewPinInput(['', '', '', '']);
    setConfirmPinInput(['', '', '', '']);
    setPinChangeError(null);
    setPinChangeSuccess(false);
    setShowPinChangeModal(true);
  };

  const fetchExistingRequests = async () => {
    if (!selectedEmployeeId) return;
    
    try {
      const startDate = format(periodStart, 'yyyy-MM-dd');
      const endDate = format(periodEnd, 'yyyy-MM-dd');
      
      const res = await fetch(
        getApiUrl(`/api/shift-requests?employee_id=${selectedEmployeeId}&start_date=${startDate}&end_date=${endDate}`)
      );
      const data = await res.json();
      
      const requestMap = new Map<string, ShiftRequest>();
      const patternMap = new Map<string, string[]>();
      const timeMap = new Map<string, { start: string; end: string }>();
      
      data.forEach((req: ShiftRequest) => {
        requestMap.set(req.date, req);
        const patterns = JSON.parse(req.patterns);
        patternMap.set(req.date, patterns);
        
        if (req.custom_start && req.custom_end) {
          timeMap.set(req.date, { start: req.custom_start, end: req.custom_end });
        }
      });
      
      setRequests(requestMap);
      setSelectedPatterns(patternMap);
      setCustomTimes(timeMap);
    } catch (error) {
      console.error('既存希望取得エラー:', error);
    }
  };

  const togglePattern = (date: string, patternId: string) => {
    const datePatterns = selectedPatterns.get(date) || [];
    
    if (patternId === 'off' || patternId === 'custom') {
      setSelectedPatterns(new Map(selectedPatterns.set(date, [patternId])));
      return;
    }
    
    const filteredPatterns = datePatterns.filter(p => p !== 'off' && p !== 'custom');
    
    if (filteredPatterns.includes(patternId)) {
      const newPatterns = filteredPatterns.filter(p => p !== patternId);
      setSelectedPatterns(new Map(selectedPatterns.set(date, newPatterns)));
    } else {
      setSelectedPatterns(new Map(selectedPatterns.set(date, [...filteredPatterns, patternId])));
    }
  };

  const updateCustomTime = (date: string, field: 'start' | 'end', value: string) => {
    const current = customTimes.get(date) || { start: '07:00', end: '22:00' };
    setCustomTimes(new Map(customTimes.set(date, { ...current, [field]: value })));
  };

  const handleSubmit = async () => {
    if (!selectedEmployeeId || !selectedStoreId) {
      setMessage({ type: 'error', text: '従業員を選択してください' });
      return;
    }

    // 締切チェック（締切日の23:59:59まで有効）
    if (currentDeadline) {
      const deadlineDateTime = new Date(currentDeadline.deadline_date);
      deadlineDateTime.setHours(23, 59, 59, 999);
      if (isBefore(deadlineDateTime, new Date())) {
        setMessage({ type: 'error', text: 'シフト希望の締切が過ぎています' });
        return;
      }
    }

    setSaving(true);
    setMessage(null);

    try {
      const submissionData = periodDates
        .filter(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const patterns = selectedPatterns.get(dateStr);
          return patterns && patterns.length > 0;
        })
        .map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const patterns = selectedPatterns.get(dateStr) || [];
          const customTime = customTimes.get(dateStr);

          return {
            employee_id: selectedEmployeeId,
            store_id: selectedStoreId,
            date: dateStr,
            patterns: JSON.stringify(patterns),
            custom_start: patterns.includes('custom') ? customTime?.start : null,
            custom_end: patterns.includes('custom') ? customTime?.end : null
          };
        });

      if (submissionData.length === 0) {
        setMessage({ type: 'error', text: '少なくとも1日分のシフト希望を選択してください' });
        setSaving(false);
        return;
      }

      for (const data of submissionData) {
        const existingRequest = requests.get(data.date);
        
        if (existingRequest) {
          await fetch(getApiUrl(`/api/shift-requests/${existingRequest.id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
        } else {
          await fetch(getApiUrl('/api/shift-requests'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
        }
      }

      setMessage({ type: 'success', text: 'シフト希望を提出しました' });
      fetchExistingRequests();
    } catch (error) {
      console.error('提出エラー:', error);
      setMessage({ type: 'error', text: 'シフト希望の提出に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  const getSpecialDayInfo = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return specialDays.find(sd => sd.date === dateStr);
  };

  // 期間ナビゲーション
  const handlePrevPeriod = () => {
    if (targetPeriod === 'second') {
      setTargetPeriod('first');
    } else {
      setTargetPeriod('second');
      if (targetMonth === 1) {
        setTargetMonth(12);
        setTargetYear(targetYear - 1);
      } else {
        setTargetMonth(targetMonth - 1);
      }
    }
  };

  const handleNextPeriod = () => {
    if (targetPeriod === 'first') {
      setTargetPeriod('second');
    } else {
      setTargetPeriod('first');
      if (targetMonth === 12) {
        setTargetMonth(1);
        setTargetYear(targetYear + 1);
      } else {
        setTargetMonth(targetMonth + 1);
      }
    }
  };

  const handleCurrentPeriod = () => {
    const now = new Date();
    setTargetYear(now.getFullYear());
    setTargetMonth(now.getMonth() + 1);
    setTargetPeriod(now.getDate() <= 15 ? 'first' : 'second');
  };

  // 締切判定（締切日の23:59:59まで有効）
  const isDeadlinePassed = (() => {
    if (!currentDeadline) return false;
    const deadlineDateTime = new Date(currentDeadline.deadline_date);
    deadlineDateTime.setHours(23, 59, 59, 999);
    return isBefore(deadlineDateTime, new Date());
  })();

  // 締切までの日数計算
  const getDaysUntilDeadline = (deadline: ShiftDeadline) => {
    const now = new Date();
    const deadlineDate = new Date(deadline.deadline_date);
    deadlineDate.setHours(23, 59, 59, 999);
    // 締切日が過ぎていれば負の値
    if (isBefore(deadlineDate, now)) {
      return -1;
    }
    // 今日の0時からの日数計算
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDay = new Date(deadline.deadline_date);
    deadlineDay.setHours(0, 0, 0, 0);
    const diffTime = deadlineDay.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // 未確認の締切告知をフィルタ（変更された or 新規設定された）
  const urgentDeadlines = deadlines.filter(d => {
    if (dismissedDeadlineIds.has(d.id)) return false;
    const daysUntil = getDaysUntilDeadline(d);
    // 締切が過ぎていなくて、7日以内、または変更されたもの
    return daysUntil >= 0 && (daysUntil <= 7 || d.is_changed);
  });

  const dismissDeadlineNotification = (id: number) => {
    setDismissedDeadlineIds(new Set(dismissedDeadlineIds.add(id)));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 to-blue-50 pb-24">
      <header className="bg-white shadow-md border-b-4 border-ocean-500 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-ocean-500 to-ocean-700 rounded-lg flex items-center justify-center mr-2 sm:mr-3">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-800">シフト希望提出</h1>
                <p className="text-xs text-gray-500 hidden sm:block">従業員用画面</p>
              </div>
            </div>
            <Link to="/employee/shift" className="btn-secondary text-sm px-3 py-2 sm:px-4">
              確認
            </Link>
          </div>
        </div>
      </header>

      {/* 締切告知バナー（緊急通知） */}
      {urgentDeadlines.length > 0 && (
        <div className="bg-gradient-to-r from-red-500 to-orange-500 text-white">
          {urgentDeadlines.map(deadline => {
            const daysUntil = getDaysUntilDeadline(deadline);
            return (
              <div key={deadline.id} className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{daysUntil <= 3 ? '🚨' : '📢'}</span>
                  <div>
                    <p className="font-bold">
                      {deadline.target_month}月{deadline.target_period === 'first' ? '前半' : '後半'}の締切
                      {deadline.is_changed ? '（変更されました！）' : ''}
                    </p>
                    <p className="text-sm opacity-90">
                      {format(new Date(deadline.deadline_date), 'M月d日(E)', { locale: ja })}まで
                      {daysUntil === 0 ? ' - 本日締切！' : daysUntil > 0 ? ` - あと${daysUntil}日` : ''}
                    </p>
                    {deadline.notification_message && (
                      <p className="text-xs opacity-80 mt-1">💬 {deadline.notification_message}</p>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => dismissDeadlineNotification(deadline.id)}
                  className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-sm"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-8">
        {/* 店舗・従業員選択 */}
        <div className="card mb-4 sm:mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">🏪 店舗</label>
              <select
                value={selectedStoreId || ''}
                onChange={(e) => {
                  setSelectedStoreId(Number(e.target.value));
                  setSelectedEmployeeId(null);
                }}
                className="input-field text-base h-12"
              >
                <option value="">店舗を選択してください</option>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">👤 従業員名</label>
              <select
                value={selectedEmployeeId || ''}
                onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
                className="input-field text-base h-12"
                disabled={!selectedStoreId}
              >
                <option value="">従業員を選択してください</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 締切情報表示 */}
          <div className="mt-4">
            {currentDeadline ? (
              <div className={`p-3 sm:p-4 rounded-lg ${
                isDeadlinePassed ? 'bg-red-50 border-2 border-red-300' : 
                getDaysUntilDeadline(currentDeadline) <= 3 ? 'bg-orange-50 border-2 border-orange-300' :
                'bg-blue-50 border-2 border-blue-300'
              }`}>
                <p className={`text-sm sm:text-base font-bold ${
                  isDeadlinePassed ? 'text-red-700' : 
                  getDaysUntilDeadline(currentDeadline) <= 3 ? 'text-orange-700' :
                  'text-blue-700'
                }`}>
                  {isDeadlinePassed ? '⚠️ 締切が過ぎています' : '📅 提出締切'}
                  {currentDeadline.is_changed ? ' - 変更されました！' : ''}
                </p>
                <p className={`text-base sm:text-lg font-bold mt-1 ${
                  isDeadlinePassed ? 'text-red-900' : 
                  getDaysUntilDeadline(currentDeadline) <= 3 ? 'text-orange-900' :
                  'text-blue-900'
                }`}>
                  {format(parseISO(currentDeadline.deadline_date), 'yyyy年M月d日(E) まで', { locale: ja })}
                  {!isDeadlinePassed && (
                    <span className="text-sm ml-2">
                      （あと{getDaysUntilDeadline(currentDeadline)}日）
                    </span>
                  )}
                </p>
                {currentDeadline.notification_message && (
                  <p className="text-sm text-gray-700 mt-2 bg-white/50 px-3 py-2 rounded">
                    💬 {currentDeadline.notification_message}
                  </p>
                )}
                {currentDeadline.change_count > 0 && (
                  <p className="text-xs text-orange-600 mt-2">
                    ※ この締切は{currentDeadline.change_count}回変更されています
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3 sm:p-4 rounded-lg bg-gray-50 border-2 border-gray-300">
                <p className="text-sm sm:text-base font-medium text-gray-700">
                  ℹ️ {targetMonth}月{targetPeriod === 'first' ? '前半' : '後半'}の提出締切は設定されていません
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  いつでもシフト希望を提出できます
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 暗証番号入力画面（従業員選択後、未認証時に表示） */}
        {selectedEmployeeId && !isAuthenticated && (
          <div className="card mb-4 sm:mb-6">
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-ocean-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔐</span>
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">暗証番号を入力してください</h3>
              <p className="text-sm text-gray-600 mb-6">
                {employees.find(e => e.id === selectedEmployeeId)?.name}さんのシフト希望を編集するには<br />
                4桁の暗証番号を入力してください
              </p>
              
              {/* 4桁PIN入力 */}
              <div className="flex justify-center gap-3 mb-4">
                {[0, 1, 2, 3].map((index) => (
                  <input
                    key={index}
                    id={`pin-${index}`}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={pinInput[index]}
                    onChange={(e) => handlePinInputChange(index, e.target.value)}
                    onKeyDown={(e) => {
                      // バックスペースで前の入力欄に戻る
                      if (e.key === 'Backspace' && !pinInput[index] && index > 0) {
                        document.getElementById(`pin-${index - 1}`)?.focus();
                      }
                    }}
                    className="w-14 h-16 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-ocean-500 focus:ring-2 focus:ring-ocean-200 outline-none"
                    autoFocus={index === 0}
                  />
                ))}
              </div>
              
              {pinError && (
                <p className="text-red-600 font-medium mb-4">{pinError}</p>
              )}
              
              <p className="text-xs text-gray-500">
                初期暗証番号は「0000」です
              </p>
            </div>
          </div>
        )}

        {/* 初期暗証番号アラート */}
        {selectedEmployeeId && isAuthenticated && isDefaultPin && (
          <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 mb-4 sm:mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <p className="font-bold text-yellow-800">暗証番号が初期値のままです</p>
                <p className="text-sm text-yellow-700 mt-1">
                  セキュリティのため、暗証番号を変更することをお勧めします。<br />
                  他の人にシフト希望を変更される可能性があります。
                </p>
                <button
                  onClick={openPinChangeModal}
                  className="mt-3 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-bold"
                >
                  🔑 暗証番号を変更する
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 暗証番号変更モーダル */}
        {showPinChangeModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full">
              <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">🔑 暗証番号を変更</h3>
              
              {pinChangeSuccess ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">✅</span>
                  </div>
                  <p className="text-green-700 font-bold">暗証番号を変更しました</p>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">新しい暗証番号（4桁）</label>
                    <div className="flex justify-center gap-3">
                      {[0, 1, 2, 3].map((index) => (
                        <input
                          key={index}
                          id={`new-pin-${index}`}
                          type="password"
                          inputMode="numeric"
                          maxLength={1}
                          value={newPinInput[index]}
                          onChange={(e) => handleNewPinChange(index, e.target.value)}
                          className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-300 rounded-lg focus:border-ocean-500 focus:ring-2 focus:ring-ocean-200 outline-none"
                        />
                      ))}
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">確認用（もう一度入力）</label>
                    <div className="flex justify-center gap-3">
                      {[0, 1, 2, 3].map((index) => (
                        <input
                          key={index}
                          id={`confirm-pin-${index}`}
                          type="password"
                          inputMode="numeric"
                          maxLength={1}
                          value={confirmPinInput[index]}
                          onChange={(e) => handleConfirmPinChange(index, e.target.value)}
                          className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-300 rounded-lg focus:border-ocean-500 focus:ring-2 focus:ring-ocean-200 outline-none"
                        />
                      ))}
                    </div>
                  </div>
                  
                  {pinChangeError && (
                    <p className="text-red-600 text-sm text-center mb-4">{pinChangeError}</p>
                  )}
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowPinChangeModal(false)}
                      className="flex-1 btn-secondary h-12"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handlePinChange}
                      className="flex-1 btn-primary h-12"
                    >
                      変更する
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {selectedEmployeeId && isAuthenticated && (
          <>
            {/* 認証済み: 暗証番号変更ボタン */}
            <div className="flex justify-end mb-2">
              <button
                onClick={openPinChangeModal}
                className="text-sm text-ocean-600 hover:text-ocean-800 underline"
              >
                🔑 暗証番号を変更
              </button>
            </div>
            
            {/* 期間選択 */}
            <div className="card mb-4 sm:mb-6">
              <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-0 sm:justify-between">
                <button
                  onClick={handleCurrentPeriod}
                  className="btn-primary w-full sm:w-auto order-1 sm:order-2 h-12"
                >
                  📅 今期に戻る
                </button>
                <h2 className="text-base sm:text-lg font-bold text-gray-800 text-center order-2 sm:order-1 w-full sm:w-auto">
                  {targetYear}年{targetMonth}月 {targetPeriod === 'first' ? '前半（1〜15日）' : '後半（16日〜）'}
                </h2>
                <div className="flex gap-2 w-full sm:w-auto order-3">
                  <button
                    onClick={handlePrevPeriod}
                    className="btn-secondary flex-1 sm:flex-initial h-12"
                  >
                    ← 前期
                  </button>
                  <button
                    onClick={handleNextPeriod}
                    className="btn-secondary flex-1 sm:flex-initial h-12"
                  >
                    次期 →
                  </button>
                </div>
              </div>
            </div>

            {/* シフトパターン選択 */}
            <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-800 px-4 sm:px-0">📋 シフト希望を選択</h3>
              {periodDates.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayPatterns = selectedPatterns.get(dateStr) || [];
                const specialDay = getSpecialDayInfo(day);
                const existingRequest = requests.get(dateStr);
                const hasSelection = dayPatterns.length > 0;
                const dayOfWeek = day.getDay();

                return (
                  <div key={dateStr} className={`card ${
                    dayOfWeek === 0 ? 'border-l-4 border-red-400' :
                    dayOfWeek === 6 ? 'border-l-4 border-blue-400' : ''
                  }`}>
                    {/* 日付ヘッダー */}
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <h4 className={`text-lg sm:text-xl font-bold ${
                          dayOfWeek === 0 ? 'text-red-600' :
                          dayOfWeek === 6 ? 'text-blue-600' : 'text-gray-800'
                        }`}>
                          {format(day, 'M月d日(E)', { locale: ja })}
                        </h4>
                        {specialDay && (
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            specialDay.type === 1 ? 'bg-red-100 text-red-700' :
                            specialDay.type === 2 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {specialDay.name}
                          </span>
                        )}
                      </div>
                      {existingRequest && (
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          existingRequest.status === 'approved' ? 'bg-green-100 text-green-700' :
                          existingRequest.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {existingRequest.status === 'approved' ? '✓ 承認済' :
                           existingRequest.status === 'rejected' ? '✗ 却下' :
                           '⏱ 提出済'}
                        </span>
                      )}
                    </div>

                    {/* 選択済みパターン表示 */}
                    {hasSelection && (
                      <div className="mb-3 p-3 bg-ocean-50 rounded-lg border border-ocean-200">
                        <p className="text-xs text-ocean-700 font-medium mb-1">選択中:</p>
                        <p className="text-sm font-bold text-ocean-900">
                          {dayPatterns.map(p => SHIFT_PATTERNS.find(sp => sp.id === p)?.name).join(', ')}
                        </p>
                      </div>
                    )}

                    {/* パターン選択ボタン */}
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      {SHIFT_PATTERNS.map(pattern => {
                        const isSelected = dayPatterns.includes(pattern.id);
                        
                        return (
                          <div key={pattern.id} className={pattern.id === 'custom' || pattern.id === 'off' ? 'col-span-2' : ''}>
                            <button
                              onClick={() => togglePattern(dateStr, pattern.id)}
                              disabled={isDeadlinePassed}
                              className={`w-full px-4 py-3 sm:py-4 rounded-lg text-sm sm:text-base font-bold transition-all min-h-[56px] ${
                                isSelected
                                  ? pattern.id === 'off' 
                                    ? 'bg-red-500 text-white shadow-lg scale-105'
                                    : 'bg-ocean-600 text-white shadow-lg scale-105'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-lg sm:text-xl">
                                  {pattern.id === 'morning' && '🌅'}
                                  {pattern.id === 'afternoon' && '☀️'}
                                  {pattern.id === 'evening' && '🌙'}
                                  {pattern.id === 'full' && '📅'}
                                  {pattern.id === 'custom' && '⚙️'}
                                  {pattern.id === 'off' && '🏖️'}
                                </span>
                                <span>{pattern.name}</span>
                                {pattern.start && pattern.end && (
                                  <span className="text-xs opacity-80">
                                    {pattern.start} - {pattern.end}
                                  </span>
                                )}
                              </div>
                            </button>
                            
                            {/* カスタム時間入力 */}
                            {pattern.id === 'custom' && isSelected && (
                              <div className="mt-2 p-3 bg-gray-50 rounded-lg grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">開始時刻</label>
                                  <input
                                    type="time"
                                    value={customTimes.get(dateStr)?.start || '07:00'}
                                    onChange={(e) => updateCustomTime(dateStr, 'start', e.target.value)}
                                    className="input-field"
                                    disabled={isDeadlinePassed}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">終了時刻</label>
                                  <input
                                    type="time"
                                    value={customTimes.get(dateStr)?.end || '22:00'}
                                    onChange={(e) => updateCustomTime(dateStr, 'end', e.target.value)}
                                    className="input-field"
                                    disabled={isDeadlinePassed}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 提出ボタン */}
            {!isDeadlinePassed && (
              <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 p-4 shadow-lg z-40">
                <div className="max-w-6xl mx-auto">
                  {message && (
                    <div className={`mb-3 p-3 rounded-lg text-sm ${
                      message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {message.text}
                    </div>
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="w-full btn-primary h-14 text-lg font-bold"
                  >
                    {saving ? '送信中...' : '📤 シフト希望を提出する'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ヘルプパネル */}
      <HelpPanel isAdmin={false} />
    </div>
  );
}
