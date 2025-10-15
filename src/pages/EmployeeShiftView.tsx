import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Store, Employee, Shift, Announcement } from '../types';

export default function EmployeeShiftView() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number>(1);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPublished, setIsPublished] = useState(false);

  useEffect(() => {
    fetchStores();
    fetchAnnouncements();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      fetchShifts();
      fetchEmployees();
    }
  }, [selectedStoreId, currentWeek]);

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/stores');
      const data = await res.json();
      setStores(data);
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch('/api/announcements');
      const data = await res.json();
      setAnnouncements(data);
    } catch (error) {
      console.error('お知らせ取得エラー:', error);
    }
  };

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
      
      // 週の公開状態を確認
      const pubRes = await fetch(
        `/api/weekly-publications?store_id=${selectedStoreId}&week_start_date=${format(weekStart, 'yyyy-MM-dd')}`
      );
      const pubData = await pubRes.json();
      const published = pubData.length > 0 && pubData[0].is_published === 1;
      setIsPublished(published);
      
      // 公開済みの場合のみシフトを取得
      if (published) {
        const res = await fetch(
          `/api/shifts?store_id=${selectedStoreId}&start_date=${format(weekStart, 'yyyy-MM-dd')}&end_date=${format(weekEnd, 'yyyy-MM-dd')}`
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
      const res = await fetch(`/api/employees?store_id=${selectedStoreId}`);
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
      <header className="bg-white shadow-md border-b-4 border-ocean-500">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-gradient-to-br from-ocean-500 to-ocean-700 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">シフト確認</h1>
                <p className="text-xs text-gray-500">従業員用画面</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="btn-secondary text-sm no-print"
              >
                🖨️ 印刷
              </button>
              <Link to="/employee/request" className="btn-primary text-sm no-print">
                シフト希望提出
              </Link>
              <Link to="/admin/login" className="btn-secondary text-sm no-print">
                管理者ログイン
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* お知らせ */}
        {announcements.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-ocean-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
              本部からのお知らせ
            </h2>
            <div className="space-y-3">
              {announcements.slice(0, 3).map((announcement) => (
                <div key={announcement.id} className="border-l-4 border-ocean-500 bg-ocean-50 p-3 rounded-r-lg">
                  <h3 className="font-semibold text-gray-800 text-sm">{announcement.title}</h3>
                  <p className="text-gray-600 text-xs mt-1">{announcement.content}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(announcement.created_at).toLocaleString('ja-JP')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 店舗選択と週選択 */}
        <div className="card">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="w-full md:w-auto">
              <label className="block text-sm font-medium text-gray-700 mb-2">店舗選択</label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(Number(e.target.value))}
                className="input-field"
              >
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="text-center min-w-[200px]">
                <div className="text-lg font-bold text-gray-800">
                  {format(weekStart, 'M月d日', { locale: ja })} - {format(weekEnd, 'M月d日', { locale: ja })}
                </div>
                <div className="text-sm text-gray-600">
                  {format(currentWeek, 'yyyy年', { locale: ja })}
                </div>
              </div>
              <button
                onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <button
              onClick={() => setCurrentWeek(new Date())}
              className="btn-secondary"
            >
              今週
            </button>
          </div>
        </div>

        {/* ガントチャート */}
        <div className="card overflow-x-auto">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            {selectedStore?.name} - 週間シフト表
          </h2>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-ocean-700"></div>
              <p className="text-gray-600 mt-4">読み込み中...</p>
            </div>
          ) : !isPublished ? (
            <div className="text-center py-12 bg-yellow-50 rounded-lg border-2 border-yellow-200">
              <svg className="w-16 h-16 mx-auto text-yellow-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-lg font-bold text-gray-800 mb-2">この週のシフトはまだ公開されていません</p>
              <p className="text-gray-600">管理者がシフトを公開するまでお待ちください</p>
            </div>
          ) : (
            <div className="min-w-[800px]">
              {/* ヘッダー */}
              <div className="grid grid-cols-8 gap-2 mb-2">
                <div className="font-semibold text-gray-700 p-2">従業員名</div>
                {weekDays.map((day) => (
                  <div key={day.toISOString()} className="text-center">
                    <div className="font-semibold text-gray-700">{format(day, 'M/d (E)', { locale: ja })}</div>
                  </div>
                ))}
              </div>

              {/* シフト表 */}
              {employees.length === 0 ? (
                <div className="text-center py-8 text-gray-500">従業員が登録されていません</div>
              ) : (
                employees.map((employee) => (
                  <div key={employee.id} className="grid grid-cols-8 gap-2 mb-2">
                    <div className="p-3 bg-ocean-50 rounded-lg font-medium text-gray-800 flex items-center">
                      {employee.name}
                    </div>
                    {weekDays.map((day) => {
                      const dayShifts = getShiftsForDay(day, employee.id);
                      return (
                        <div key={day.toISOString()} className="gantt-cell p-2">
                          {dayShifts.length === 0 ? (
                            <div className="text-center text-gray-400 text-sm">-</div>
                          ) : (
                            dayShifts.map((shift) => (
                              <div
                                key={shift.id}
                                className="bg-ocean-500 text-white text-xs p-2 rounded mb-1"
                              >
                                <div className="font-semibold">{shift.start_time} - {shift.end_time}</div>
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
          )}
        </div>
      </div>
    </div>
  );
}
