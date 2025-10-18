import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isBefore, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { Store, Employee, ShiftRequest, SpecialDay } from '../types';
import { getApiUrl } from '../config/api';

interface ShiftPattern {
  id: string;
  name: string;
  start?: string;
  end?: string;
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
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [requests, setRequests] = useState<Map<string, ShiftRequest>>(new Map());
  const [selectedPatterns, setSelectedPatterns] = useState<Map<string, string[]>>(new Map());
  const [customTimes, setCustomTimes] = useState<Map<string, { start: string; end: string }>>(new Map());
  const [deadline, setDeadline] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchStores();
    fetchSpecialDays();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      fetchEmployees(selectedStoreId);
      fetchDeadline(selectedStoreId);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    if (selectedEmployeeId) {
      fetchExistingRequests();
    }
  }, [selectedEmployeeId, currentWeekStart]);

  const fetchStores = async () => {
    try {
      const res = await fetch(getApiUrl('/api/stores'));
      const data = await res.json();
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

  const fetchDeadline = async (storeId: number) => {
    try {
      // 現在の週が属する月の締切を取得（2週間後ではなく）
      const targetMonth = format(currentWeekStart, 'yyyy-MM');
      const res = await fetch(getApiUrl(`/api/shift-deadlines?store_id=${storeId}&target_month=${targetMonth}`));
      const data = await res.json();
      if (data.length > 0) {
        setDeadline(data[0].deadline_date);
      } else {
        setDeadline(null);
      }
    } catch (error) {
      console.error('締切取得エラー:', error);
    }
  };

  const fetchExistingRequests = async () => {
    if (!selectedEmployeeId) return;
    
    try {
      const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
      const res = await fetch(
        `/api/shift-requests?employee_id=${selectedEmployeeId}&start_date=${format(currentWeekStart, 'yyyy-MM-dd')}&end_date=${format(weekEnd, 'yyyy-MM-dd')}`
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

  const weekDays = eachDayOfInterval({
    start: currentWeekStart,
    end: endOfWeek(currentWeekStart, { weekStartsOn: 1 })
  });

  const togglePattern = (date: string, patternId: string) => {
    const datePatterns = selectedPatterns.get(date) || [];
    
    // 「休み希望」または「カスタム」は単独選択
    if (patternId === 'off' || patternId === 'custom') {
      setSelectedPatterns(new Map(selectedPatterns.set(date, [patternId])));
      return;
    }
    
    // 既存のパターンに「休み希望」や「カスタム」が含まれていたらクリア
    const filteredPatterns = datePatterns.filter(p => p !== 'off' && p !== 'custom');
    
    if (filteredPatterns.includes(patternId)) {
      // 既に選択されていたら削除
      const newPatterns = filteredPatterns.filter(p => p !== patternId);
      setSelectedPatterns(new Map(selectedPatterns.set(date, newPatterns)));
    } else {
      // 新規選択
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
    if (deadline && isBefore(parseISO(deadline), new Date())) {
      setMessage({ type: 'error', text: 'シフト希望の締切が過ぎています' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const submissionData = weekDays
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

      // 一括送信
      for (const data of submissionData) {
        const existingRequest = requests.get(data.date);
        
        if (existingRequest) {
          // 更新
          await fetch(getApiUrl(`/api/shift-requests/${existingRequest.id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
        } else {
          // 新規作成
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

  const isDeadlinePassed = deadline ? isBefore(parseISO(deadline), new Date()) : false;

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
            {deadline ? (
              <div className={`p-3 sm:p-4 rounded-lg ${isDeadlinePassed ? 'bg-red-50 border-2 border-red-300' : 'bg-blue-50 border-2 border-blue-300'}`}>
                <p className={`text-sm sm:text-base font-bold ${isDeadlinePassed ? 'text-red-700' : 'text-blue-700'}`}>
                  {isDeadlinePassed ? '⚠️ 締切が過ぎています' : '📅 提出締切'}
                </p>
                <p className={`text-base sm:text-lg font-bold mt-1 ${isDeadlinePassed ? 'text-red-900' : 'text-blue-900'}`}>
                  {format(parseISO(deadline), 'yyyy年M月d日(E) まで', { locale: ja })}
                </p>
                {!isDeadlinePassed && (
                  <p className="text-xs text-blue-600 mt-2">
                    この日までにシフト希望を提出してください
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3 sm:p-4 rounded-lg bg-gray-50 border-2 border-gray-300">
                <p className="text-sm sm:text-base font-medium text-gray-700">
                  ℹ️ この月の提出締切は設定されていません
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
            {/* 週選択 */}
            <div className="card mb-4 sm:mb-6">
              <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-0 sm:justify-between">
                <button
                  onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                  className="btn-primary w-full sm:w-auto order-1 sm:order-2 h-12"
                >
                  📅 今週に戻る
                </button>
                <h2 className="text-base sm:text-lg font-bold text-gray-800 text-center order-2 sm:order-1 w-full sm:w-auto">
                  {format(currentWeekStart, 'yyyy年M月d日', { locale: ja })} 〜<br className="sm:hidden" /> {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), 'M月d日', { locale: ja })}
                </h2>
                <div className="flex gap-2 w-full sm:w-auto order-3">
                  <button
                    onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
                    className="btn-secondary flex-1 sm:flex-initial h-12"
                  >
                    ← 前週
                  </button>
                  <button
                    onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
                    className="btn-secondary flex-1 sm:flex-initial h-12"
                  >
                    次週 →
                  </button>
                </div>
              </div>
            </div>

            {/* シフトパターン選択 */}
            <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-800 px-4 sm:px-0">📋 シフト希望を選択</h3>
              {weekDays.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayPatterns = selectedPatterns.get(dateStr) || [];
                const specialDay = getSpecialDayInfo(day);
                const existingRequest = requests.get(dateStr);
                const hasSelection = dayPatterns.length > 0;

                return (
                  <div key={dateStr} className="card bg-white">
                    {/* 日付ヘッダー */}
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <h4 className="text-lg sm:text-xl font-bold text-gray-800">
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
                           '⏱ 承認待ち'}
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
                                  ? 'bg-ocean-600 text-white shadow-lg scale-105'
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
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">開始</label>
                                  <input
                                    type="time"
                                    value={customTimes.get(dateStr)?.start || '07:00'}
                                    onChange={(e) => updateCustomTime(dateStr, 'start', e.target.value)}
                                    disabled={isDeadlinePassed}
                                    className="input-field text-base h-12"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">終了</label>
                                  <input
                                    type="time"
                                    value={customTimes.get(dateStr)?.end || '22:00'}
                                    onChange={(e) => updateCustomTime(dateStr, 'end', e.target.value)}
                                    disabled={isDeadlinePassed}
                                    className="input-field text-base h-12"
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

            {/* メッセージ表示 */}
            {message && (
              <div className={`card mb-4 sm:mb-6 ${
                message.type === 'success' ? 'bg-green-50 border-2 border-green-300' : 'bg-red-50 border-2 border-red-300'
              }`}>
                <p className={`text-sm sm:text-base font-medium ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                  {message.type === 'success' ? '✓ ' : '✗ '}
                  {message.text}
                </p>
              </div>
            )}

            {/* スマホ用の余白（固定フッターの下に隠れないように） */}
            <div className="h-4 sm:hidden"></div>
          </>
        )}
      </div>

      {/* 固定フッター提出ボタン（スマホ最適化） */}
      {selectedEmployeeId && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 shadow-2xl z-40 safe-area-pb">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <button
              onClick={handleSubmit}
              disabled={saving || isDeadlinePassed}
              className="btn-primary w-full h-14 sm:h-12 text-base sm:text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {saving ? '⏳ 提出中...' : `✓ シフト希望を提出 (${Array.from(selectedPatterns.values()).filter(p => p.length > 0).length}日選択中)`}
            </button>
            <p className="text-xs text-gray-500 mt-2 text-center">
              ※複数パターン選択可（休み・カスタムは単独選択）
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
