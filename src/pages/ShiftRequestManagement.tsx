import { useState, useEffect } from 'react';
import { format, addWeeks, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Role, Employee, ShiftRequest, Store } from '../types';
import AdminLayout from '../components/AdminLayout';

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

export default function ShiftRequestManagement({ role, storeId, onLogout }: ShiftRequestManagementProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(storeId);
  const [targetWeekStart, setTargetWeekStart] = useState(startOfWeek(addWeeks(new Date(), 1), { locale: ja }));
  const [submissionStatuses, setSubmissionStatuses] = useState<EmployeeSubmissionStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [isEditingDeadline, setIsEditingDeadline] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState('');

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      fetchSubmissionStatus();
      fetchDeadline();
    }
  }, [selectedStoreId, targetWeekStart]);

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/stores');
      const data = await res.json();
      setStores(data.filter((s: Store) => s.id !== 8)); // 本部以外
      
      if (!selectedStoreId && data.length > 0) {
        setSelectedStoreId(data[0].id);
      }
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  };

  const fetchDeadline = async () => {
    if (!selectedStoreId) return;
    
    try {
      const targetMonth = format(targetWeekStart, 'yyyy-MM');
      const res = await fetch(`/api/shift-deadlines?store_id=${selectedStoreId}&target_month=${targetMonth}`);
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

  const fetchSubmissionStatus = async () => {
    if (!selectedStoreId) return;
    
    setLoading(true);
    
    try {
      // 従業員一覧を取得
      const empRes = await fetch(`/api/employees?store_id=${selectedStoreId}`);
      const employees: Employee[] = await empRes.json();

      // 対象週の日付リスト
      const weekEnd = endOfWeek(targetWeekStart, { locale: ja });
      const weekDates = eachDayOfInterval({ start: targetWeekStart, end: weekEnd });
      const dateStrings = weekDates.map(d => format(d, 'yyyy-MM-dd'));

      // シフト希望一覧を取得
      const reqRes = await fetch(
        `/api/shift-requests?store_id=${selectedStoreId}&start_date=${format(targetWeekStart, 'yyyy-MM-dd')}&end_date=${format(weekEnd, 'yyyy-MM-dd')}`
      );
      const requests: ShiftRequest[] = await reqRes.json();

      // 従業員ごとの提出状況を集計
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

      // 提出率の低い順にソート
      statuses.sort((a, b) => a.submissionRate - b.submissionRate);

      setSubmissionStatuses(statuses);
    } catch (error) {
      console.error('提出状況取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeadlineEdit = () => {
    setDeadlineInput(deadline || format(new Date(), 'yyyy-MM-dd'));
    setIsEditingDeadline(true);
  };

  const handleSaveDeadline = async () => {
    if (!selectedStoreId || !deadlineInput) return;

    try {
      const targetMonth = format(targetWeekStart, 'yyyy-MM');
      
      // 既存の締切があるか確認
      const existingRes = await fetch(`/api/shift-deadlines?store_id=${selectedStoreId}&target_month=${targetMonth}`);
      const existing = await existingRes.json();

      if (existing.length > 0) {
        // 更新
        await fetch(`/api/shift-deadlines/${existing[0].id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ deadline_date: deadlineInput })
        });
      } else {
        // 新規作成
        await fetch('/api/shift-deadlines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            store_id: selectedStoreId,
            target_month: targetMonth,
            deadline_date: deadlineInput
          })
        });
      }

      setIsEditingDeadline(false);
      fetchDeadline();
    } catch (error) {
      console.error('締切設定エラー:', error);
      alert('締切の設定に失敗しました');
    }
  };

  const unsubmittedEmployees = submissionStatuses.filter(s => s.submissionRate < 100);
  const fullySubmittedEmployees = submissionStatuses.filter(s => s.submissionRate === 100);

  const weekEnd = endOfWeek(targetWeekStart, { locale: ja });
  const weekDates = eachDayOfInterval({ start: targetWeekStart, end: weekEnd });

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">シフト希望提出状況</h1>
        </div>

        {/* フィルター */}
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

            {/* 対象週選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">対象週</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTargetWeekStart(addWeeks(targetWeekStart, -1))}
                  className="btn-secondary"
                >
                  ← 前週
                </button>
                <div className="flex-1 flex items-center justify-center text-sm font-medium">
                  {format(targetWeekStart, 'M/d', { locale: ja })} - {format(weekEnd, 'M/d', { locale: ja })}
                </div>
                <button
                  onClick={() => setTargetWeekStart(addWeeks(targetWeekStart, 1))}
                  className="btn-secondary"
                >
                  次週 →
                </button>
              </div>
            </div>

            {/* 締切設定 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">提出締切</label>
              {!isEditingDeadline ? (
                <div className="flex gap-2">
                  <div className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-sm">
                    {deadline ? format(new Date(deadline), 'yyyy年M月d日(E)', { locale: ja }) : '未設定'}
                  </div>
                  <button
                    onClick={handleOpenDeadlineEdit}
                    className="btn-secondary whitespace-nowrap"
                  >
                    設定
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={deadlineInput}
                    onChange={(e) => setDeadlineInput(e.target.value)}
                    className="input-field flex-1"
                  />
                  <button
                    onClick={handleSaveDeadline}
                    className="btn-primary whitespace-nowrap"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setIsEditingDeadline(false)}
                    className="btn-secondary whitespace-nowrap"
                  >
                    キャンセル
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">雇用形態</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">提出率</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">未提出日</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {unsubmittedEmployees.map(status => (
                        <tr key={status.employee.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-medium text-gray-900">{status.employee.name}</div>
                          </td>
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
                      ))}
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
              <h2 className="text-lg font-bold text-gray-800 mb-4">対象期間</h2>
              <div className="flex flex-wrap gap-2">
                {weekDates.map(date => (
                  <div
                    key={date.toISOString()}
                    className="px-4 py-2 bg-gray-100 rounded-lg text-sm"
                  >
                    {format(date, 'M月d日(E)', { locale: ja })}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
