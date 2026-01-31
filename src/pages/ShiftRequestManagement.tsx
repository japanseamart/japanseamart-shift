import { useState, useEffect } from 'react';
import { format, eachDayOfInterval, getDaysInMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Role, Employee, ShiftRequest, Store } from '../types';
import AdminLayout from '../components/AdminLayout';
import { getApiUrl } from '../config/api';
import { getPeriodDates } from '../utils/dateUtils';

interface ShiftRequestManagementProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

interface EmployeeSubmissionStatus {
  employee: Employee;
  submittedDates: string[];
  missingDates: string[];
  submissionRate: number;
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

export default function ShiftRequestManagement({ role, storeId, onLogout }: ShiftRequestManagementProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(storeId);
  
  // 期間選択（年/月/前半・後半）
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [targetMonth, setTargetMonth] = useState(new Date().getMonth() + 1);
  const [targetPeriod, setTargetPeriod] = useState<'first' | 'second'>(new Date().getDate() <= 15 ? 'first' : 'second');
  
  const [submissionStatuses, setSubmissionStatuses] = useState<EmployeeSubmissionStatus[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 締切関連
  const [deadline, setDeadline] = useState<ShiftDeadline | null>(null);
  const [isEditingDeadline, setIsEditingDeadline] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);

  // 期間の日付リストを計算
  const { start: periodStart, end: periodEnd } = getPeriodDates(targetYear, targetMonth, targetPeriod);
  const periodDates = eachDayOfInterval({ start: periodStart, end: periodEnd });

  useEffect(() => {
    fetchStores();
    if (role === 'admin') {
      fetchAllEmployees();
    }
  }, []);

  useEffect(() => {
    if (selectedStoreId !== null) {
      fetchSubmissionStatus();
      fetchDeadline();
    } else if (role === 'admin') {
      fetchSubmissionStatus();
    }
  }, [selectedStoreId, targetYear, targetMonth, targetPeriod]);

  const fetchStores = async () => {
    try {
      const res = await fetch(getApiUrl('/api/stores'));
      const data = await res.json();
      setStores(data.filter((s: Store) => s.id !== 8));
      
      if (role === 'admin' && selectedStoreId === null) {
        setSelectedStoreId(null);
      } else if (!selectedStoreId && data.length > 0) {
        setSelectedStoreId(data[0].id);
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  };

  const fetchAllEmployees = async () => {
    try {
      const res = await fetch(getApiUrl('/api/employees'));
      const data = await res.json();
      setAllEmployees(data.filter((e: Employee) => e.store_id !== 8));
    } catch (error) {
      console.error('全従業員取得エラー:', error);
    }
  };

  const fetchDeadline = async () => {
    if (!selectedStoreId) {
      setDeadline(null);
      return;
    }
    
    try {
      const res = await fetch(getApiUrl(
        `/api/shift-deadlines?store_id=${selectedStoreId}&target_year=${targetYear}&target_month=${targetMonth}&target_period=${targetPeriod}`
      ));
      const data = await res.json();
      if (data.length > 0) {
        setDeadline(data[0]);
      } else {
        setDeadline(null);
      }
    } catch (error) {
      console.error('締切取得エラー:', error);
      setDeadline(null);
    }
  };

  const fetchSubmissionStatus = async () => {
    setLoading(true);
    
    try {
      const dateStrings = periodDates.map(d => format(d, 'yyyy-MM-dd'));
      const startDate = format(periodStart, 'yyyy-MM-dd');
      const endDate = format(periodEnd, 'yyyy-MM-dd');

      let employees: Employee[] = [];
      let requests: ShiftRequest[] = [];

      if (selectedStoreId !== null) {
        const empRes = await fetch(getApiUrl(`/api/employees?store_id=${selectedStoreId}`));
        employees = await empRes.json();

        const reqRes = await fetch(
          getApiUrl(`/api/shift-requests?store_id=${selectedStoreId}&start_date=${startDate}&end_date=${endDate}`)
        );
        requests = await reqRes.json();
      } else {
        employees = allEmployees;
        const reqRes = await fetch(
          getApiUrl(`/api/shift-requests?start_date=${startDate}&end_date=${endDate}`)
        );
        requests = await reqRes.json();
      }

      const statuses: EmployeeSubmissionStatus[] = employees.map(employee => {
        const employeeRequests = requests.filter(r => r.employee_id === employee.id);
        const submittedDates = employeeRequests.map(r => r.date);
        const missingDates = dateStrings.filter(date => !submittedDates.includes(date));
        const submissionRate = Math.round((submittedDates.length / dateStrings.length) * 100);

        return {
          employee,
          submittedDates,
          missingDates,
          submissionRate
        };
      });

      statuses.sort((a, b) => a.submissionRate - b.submissionRate);
      setSubmissionStatuses(statuses);
    } catch (error) {
      console.error('提出状況取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeadlineEdit = () => {
    if (deadline) {
      setDeadlineInput(deadline.deadline_date);
      setNotificationMessage(deadline.notification_message || '');
    } else {
      // デフォルト: 対象期間の5日前
      const defaultDate = new Date(periodStart);
      defaultDate.setDate(defaultDate.getDate() - 5);
      setDeadlineInput(format(defaultDate, 'yyyy-MM-dd'));
      setNotificationMessage('');
    }
    setIsEditingDeadline(true);
  };

  const handleSaveDeadline = async () => {
    if (!selectedStoreId || !deadlineInput) return;

    try {
      if (deadline) {
        // 更新
        await fetch(getApiUrl(`/api/shift-deadlines/${deadline.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ 
            deadline_date: deadlineInput,
            notification_message: notificationMessage || null
          })
        });
      } else {
        // 新規作成
        await fetch(getApiUrl('/api/shift-deadlines'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            store_id: selectedStoreId,
            target_year: targetYear,
            target_month: targetMonth,
            target_period: targetPeriod,
            deadline_date: deadlineInput,
            notification_message: notificationMessage || null
          })
        });
      }

      setIsEditingDeadline(false);
      fetchDeadline();
      alert(deadline ? '締切を変更しました。従業員に再告知されます。' : '締切を設定しました。従業員に告知されます。');
    } catch (error) {
      console.error('締切設定エラー:', error);
      alert('締切の設定に失敗しました');
    }
  };

  const handleDeleteDeadline = async () => {
    if (!deadline) return;
    if (!confirm('この締切を削除しますか？')) return;

    try {
      await fetch(getApiUrl(`/api/shift-deadlines/${deadline.id}`), {
        method: 'DELETE',
        credentials: 'include'
      });
      setDeadline(null);
      alert('締切を削除しました');
    } catch (error) {
      console.error('締切削除エラー:', error);
      alert('締切の削除に失敗しました');
    }
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

  const unsubmittedEmployees = submissionStatuses.filter(s => s.submissionRate < 100);
  const fullySubmittedEmployees = submissionStatuses.filter(s => s.submissionRate === 100);

  // 締切までの日数計算
  const getDaysUntilDeadline = () => {
    if (!deadline) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(deadline.deadline_date);
    deadlineDate.setHours(0, 0, 0, 0);
    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysUntilDeadline = getDaysUntilDeadline();

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">シフト希望提出状況</h1>
        </div>

        {/* フィルター */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 店舗選択 */}
            {role === 'admin' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">店舗</label>
                <select
                  value={selectedStoreId === null ? 'all' : selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value === 'all' ? null : Number(e.target.value))}
                  className="input-field"
                >
                  <option value="all">全店舗</option>
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 対象期間選択（前半/後半） */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">対象期間</label>
              <div className="flex gap-2 items-center">
                <button onClick={handlePrevPeriod} className="btn-secondary px-3">
                  ←
                </button>
                <div className="flex-1 flex items-center justify-center gap-2">
                  <select
                    value={targetYear}
                    onChange={(e) => setTargetYear(Number(e.target.value))}
                    className="input-field w-24"
                  >
                    {[targetYear - 1, targetYear, targetYear + 1].map(y => (
                      <option key={y} value={y}>{y}年</option>
                    ))}
                  </select>
                  <select
                    value={targetMonth}
                    onChange={(e) => setTargetMonth(Number(e.target.value))}
                    className="input-field w-20"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>{m}月</option>
                    ))}
                  </select>
                  <select
                    value={targetPeriod}
                    onChange={(e) => setTargetPeriod(e.target.value as 'first' | 'second')}
                    className="input-field w-24"
                  >
                    <option value="first">前半</option>
                    <option value="second">後半</option>
                  </select>
                </div>
                <button onClick={handleNextPeriod} className="btn-secondary px-3">
                  →
                </button>
                <button onClick={handleCurrentPeriod} className="btn-secondary px-3 text-xs">
                  今期
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 締切設定カード */}
        {selectedStoreId !== null && (
          <div className={`card ${
            deadline ? (
              daysUntilDeadline !== null && daysUntilDeadline < 0 ? 'bg-gray-100 border-gray-300' :
              daysUntilDeadline !== null && daysUntilDeadline <= 3 ? 'bg-red-50 border-red-300' :
              daysUntilDeadline !== null && daysUntilDeadline <= 7 ? 'bg-yellow-50 border-yellow-300' :
              'bg-green-50 border-green-300'
            ) : 'bg-orange-50 border-orange-300'
          } border-2`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800">
                  📅 {targetMonth}月{targetPeriod === 'first' ? '前半' : '後半'}の提出締切
                </h3>
                {!isEditingDeadline ? (
                  <div className="mt-2">
                    {deadline ? (
                      <div className="space-y-1">
                        <div className="text-xl font-bold">
                          {format(new Date(deadline.deadline_date), 'yyyy年M月d日(E)', { locale: ja })}
                          {daysUntilDeadline !== null && (
                            <span className={`ml-3 text-sm ${
                              daysUntilDeadline < 0 ? 'text-gray-500' :
                              daysUntilDeadline === 0 ? 'text-red-600 font-bold' :
                              daysUntilDeadline <= 3 ? 'text-red-600' :
                              daysUntilDeadline <= 7 ? 'text-yellow-600' :
                              'text-green-600'
                            }`}>
                              {daysUntilDeadline < 0 ? '（締切終了）' :
                               daysUntilDeadline === 0 ? '⚠️ 本日締切！' :
                               `あと${daysUntilDeadline}日`}
                            </span>
                          )}
                        </div>
                        {deadline.notification_message && (
                          <div className="text-sm text-gray-600 bg-white/50 px-3 py-2 rounded">
                            💬 {deadline.notification_message}
                          </div>
                        )}
                        {deadline.change_count > 0 && (
                          <div className="text-xs text-orange-600">
                            ⚠️ {deadline.change_count}回変更されました（最終更新: {format(new Date(deadline.updated_at), 'M/d H:mm')}）
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-orange-700">未設定 - 締切を設定してください</div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">締切日</label>
                      <input
                        type="date"
                        value={deadlineInput}
                        onChange={(e) => setDeadlineInput(e.target.value)}
                        className="input-field w-48"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">告知メッセージ（オプション）</label>
                      <input
                        type="text"
                        value={notificationMessage}
                        onChange={(e) => setNotificationMessage(e.target.value)}
                        placeholder="例: 早めの提出をお願いします"
                        className="input-field w-full"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {!isEditingDeadline ? (
                  <>
                    <button onClick={handleOpenDeadlineEdit} className="btn-primary whitespace-nowrap">
                      {deadline ? '変更' : '設定'}
                    </button>
                    {deadline && (
                      <button onClick={handleDeleteDeadline} className="btn-secondary text-red-600 whitespace-nowrap text-sm">
                        削除
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button onClick={handleSaveDeadline} className="btn-primary whitespace-nowrap">
                      💾 保存
                    </button>
                    <button onClick={() => setIsEditingDeadline(false)} className="btn-secondary whitespace-nowrap">
                      キャンセル
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="card text-center py-12">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        ) : (
          <>
            {/* サマリー */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="card bg-gradient-to-br from-blue-50 to-blue-100">
                <div className="text-sm text-blue-700 mb-1">総従業員数</div>
                <div className="text-3xl font-bold text-blue-900">{submissionStatuses.length}</div>
              </div>
              <div className="card bg-gradient-to-br from-green-50 to-green-100">
                <div className="text-sm text-green-700 mb-1">完全提出</div>
                <div className="text-3xl font-bold text-green-900">{fullySubmittedEmployees.length}</div>
              </div>
              <div className="card bg-gradient-to-br from-red-50 to-red-100">
                <div className="text-sm text-red-700 mb-1">未提出者</div>
                <div className="text-3xl font-bold text-red-900">{unsubmittedEmployees.length}</div>
              </div>
              <div className="card bg-gradient-to-br from-yellow-50 to-yellow-100">
                <div className="text-sm text-yellow-700 mb-1">平均提出率</div>
                <div className="text-3xl font-bold text-yellow-900">
                  {submissionStatuses.length > 0
                    ? Math.round(submissionStatuses.reduce((sum, s) => sum + s.submissionRate, 0) / submissionStatuses.length)
                    : 0}%
                </div>
              </div>
            </div>

            {/* 未提出者リスト */}
            {unsubmittedEmployees.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-800">
                    ⚠️ 未提出・未完了従業員 ({unsubmittedEmployees.length}名)
                  </h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">従業員名</th>
                        {selectedStoreId === null && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">所属店舗</th>
                        )}
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">雇用形態</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">提出率</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">未提出日</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {unsubmittedEmployees.map(status => {
                        const employeeStore = stores.find(s => s.id === status.employee.store_id);
                        return (
                        <tr key={status.employee.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-medium text-gray-900">{status.employee.name}</div>
                          </td>
                          {selectedStoreId === null && (
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {employeeStore?.name || '-'}
                            </td>
                          )}
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {status.employee.employment_type === 'part_time' && 'パート'}
                            {status.employee.employment_type === 'part_time_insured' && '社保パート'}
                            {status.employee.employment_type === 'full_time' && '正社員'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className={`text-sm font-bold ${
                                status.submissionRate === 0 ? 'text-red-600' :
                                status.submissionRate < 50 ? 'text-orange-600' :
                                'text-yellow-600'
                              }`}>
                                {status.submissionRate}%
                              </div>
                              <div className="w-24 bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    status.submissionRate === 0 ? 'bg-red-500' :
                                    status.submissionRate < 50 ? 'bg-orange-500' :
                                    'bg-yellow-500'
                                  }`}
                                  style={{ width: `${status.submissionRate}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {status.missingDates.map(date => (
                                <span
                                  key={date}
                                  className="inline-block px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded"
                                >
                                  {format(new Date(date), 'M/d(E)', { locale: ja })}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 提出完了者リスト */}
            {fullySubmittedEmployees.length > 0 && (
              <div className="card">
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  ✅ 提出完了従業員 ({fullySubmittedEmployees.length}名)
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {fullySubmittedEmployees.map(status => (
                    <div
                      key={status.employee.id}
                      className="p-3 bg-green-50 border border-green-200 rounded-lg"
                    >
                      <div className="font-medium text-gray-900 text-sm">{status.employee.name}</div>
                      <div className="text-xs text-green-600 mt-1">
                        {status.employee.employment_type === 'part_time' && 'パート'}
                        {status.employee.employment_type === 'part_time_insured' && '社保パート'}
                        {status.employee.employment_type === 'full_time' && '正社員'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 対象日一覧 */}
            <div className="card">
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                対象期間: {targetMonth}月{targetPeriod === 'first' ? '前半（1〜15日）' : `後半（16〜${getDaysInMonth(new Date(targetYear, targetMonth - 1))}日）`}
              </h2>
              <div className="flex flex-wrap gap-2">
                {periodDates.map(date => {
                  const dayOfWeek = date.getDay();
                  return (
                    <div
                      key={date.toISOString()}
                      className={`px-4 py-2 rounded-lg text-sm ${
                        dayOfWeek === 0 ? 'bg-red-100 text-red-700' :
                        dayOfWeek === 6 ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {format(date, 'M/d(E)', { locale: ja })}
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
