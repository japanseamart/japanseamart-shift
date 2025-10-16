import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isBefore, parseISO, addWeeks } from 'date-fns';
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
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { locale: ja }));
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
      const targetMonth = format(addWeeks(currentWeekStart, 2), 'yyyy-MM');
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
      const weekEnd = endOfWeek(currentWeekStart, { locale: ja });
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
    end: endOfWeek(currentWeekStart, { locale: ja })
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
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 to-blue-50">
      <header className="bg-white shadow-md border-b-4 border-ocean-500">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-gradient-to-br from-ocean-500 to-ocean-700 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">シフト希望提出</h1>
                <p className="text-xs text-gray-500">従業員用画面</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link to="/employee/shift" className="btn-secondary text-sm">
                シフト確認
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 店舗・従業員選択 */}
        <div className="card mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">店舗</label>
              <select
                value={selectedStoreId || ''}
                onChange={(e) => {
                  setSelectedStoreId(Number(e.target.value));
                  setSelectedEmployeeId(null);
                }}
                className="input-field"
              >
                <option value="">店舗を選択</option>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">従業員名</label>
              <select
                value={selectedEmployeeId || ''}
                onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
                className="input-field"
                disabled={!selectedStoreId}
              >
                <option value="">従業員を選択</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>

          {deadline && (
            <div className={`mt-4 p-3 rounded-lg ${isDeadlinePassed ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'}`}>
              <p className={`text-sm ${isDeadlinePassed ? 'text-red-700' : 'text-blue-700'}`}>
                📅 提出締切: {format(parseISO(deadline), 'yyyy年MM月dd日', { locale: ja })}
                {isDeadlinePassed && ' (締切が過ぎています)'}
              </p>
            </div>
          )}
        </div>

        {selectedEmployeeId && (
          <>
            {/* 週選択 */}
            <div className="card mb-6">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
                  className="btn-secondary"
                >
                  ← 前週
                </button>
                <h2 className="text-lg font-bold text-gray-800">
                  {format(currentWeekStart, 'yyyy年MM月dd日', { locale: ja })} 〜 {format(endOfWeek(currentWeekStart, { locale: ja }), 'MM月dd日', { locale: ja })}
                </h2>
                <button
                  onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
                  className="btn-secondary"
                >
                  次週 →
                </button>
              </div>
            </div>

            {/* シフトパターン選択 */}
            <div className="card mb-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">シフト希望パターン</h3>
              <div className="space-y-4">
                {weekDays.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dayPatterns = selectedPatterns.get(dateStr) || [];
                  const specialDay = getSpecialDayInfo(day);
                  const existingRequest = requests.get(dateStr);

                  return (
                    <div key={dateStr} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-bold text-gray-800">
                            {format(day, 'M月d日(E)', { locale: ja })}
                          </h4>
                          {specialDay && (
                            <span className={`text-xs px-2 py-1 rounded ${
                              specialDay.type === 1 ? 'bg-red-100 text-red-700' :
                              specialDay.type === 2 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {specialDay.name}
                            </span>
                          )}
                        </div>
                        {existingRequest && (
                          <span className={`text-xs px-2 py-1 rounded ${
                            existingRequest.status === 'approved' ? 'bg-green-100 text-green-700' :
                            existingRequest.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {existingRequest.status === 'approved' ? '承認済み' :
                             existingRequest.status === 'rejected' ? '却下' :
                             '承認待ち'}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {SHIFT_PATTERNS.map(pattern => {
                          const isSelected = dayPatterns.includes(pattern.id);
                          
                          return (
                            <div key={pattern.id}>
                              <button
                                onClick={() => togglePattern(dateStr, pattern.id)}
                                disabled={isDeadlinePassed}
                                className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  isSelected
                                    ? 'bg-ocean-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                {pattern.name}
                                {pattern.start && pattern.end && (
                                  <div className="text-xs mt-1">
                                    {pattern.start} - {pattern.end}
                                  </div>
                                )}
                              </button>

                              {/* カスタム時間入力 */}
                              {pattern.id === 'custom' && isSelected && (
                                <div className="mt-2 space-y-2">
                                  <input
                                    type="time"
                                    value={customTimes.get(dateStr)?.start || '07:00'}
                                    onChange={(e) => updateCustomTime(dateStr, 'start', e.target.value)}
                                    disabled={isDeadlinePassed}
                                    className="input-field text-sm"
                                  />
                                  <input
                                    type="time"
                                    value={customTimes.get(dateStr)?.end || '22:00'}
                                    onChange={(e) => updateCustomTime(dateStr, 'end', e.target.value)}
                                    disabled={isDeadlinePassed}
                                    className="input-field text-sm"
                                  />
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
            </div>

            {/* メッセージ表示 */}
            {message && (
              <div className={`card mb-6 ${
                message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                <p className={`${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                  {message.text}
                </p>
              </div>
            )}

            {/* 提出ボタン */}
            <div className="card">
              <button
                onClick={handleSubmit}
                disabled={saving || isDeadlinePassed}
                className="btn-primary w-full py-3 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '提出中...' : 'シフト希望を提出'}
              </button>
              <p className="text-xs text-gray-500 mt-2 text-center">
                ※複数のパターンを選択可能です（休み希望・カスタムは単独選択）
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
