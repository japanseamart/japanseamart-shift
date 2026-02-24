import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, isBefore, parseISO, eachDayOfInterval } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { Store, Employee, ShiftRequest, SpecialDay } from '../types';
import { getApiUrl } from '../config/api';
import { getPeriodDates } from '../utils/dateUtils';

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

    // 締切チェック
    if (currentDeadline && isBefore(parseISO(currentDeadline.deadline_date), new Date())) {
      setMessage({ type: 'error', text: 'シフト希望の締切が過ぎています' });
      return;
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

  const isDeadlinePassed = currentDeadline ? isBefore(parseISO(currentDeadline.deadline_date), new Date()) : false;

  // 締切までの日数計算
  const getDaysUntilDeadline = (deadline: ShiftDeadline) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(deadline.deadline_date);
    deadlineDate.setHours(0, 0, 0, 0);
    const diffTime = deadlineDate.getTime() - today.getTime();
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

        {selectedEmployeeId && (
          <>
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
    </div>
  );
}
