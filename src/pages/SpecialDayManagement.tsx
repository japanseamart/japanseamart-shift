import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Role, SpecialDay } from '../types';
import AdminLayout from '../components/AdminLayout';

interface SpecialDayManagementProps {
  role: Role;
  onLogout: () => void;
}

export default function SpecialDayManagement({ role, onLogout }: SpecialDayManagementProps) {
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 1 as 1 | 2 | 3,
    name: '',
    description: '',
  });

  useEffect(() => {
    fetchSpecialDays();
  }, []);

  const fetchSpecialDays = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/special-days');
      const data = await res.json();
      setSpecialDays(data);
    } catch (error) {
      console.error('特別日取得エラー:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await fetch('http://localhost:3001/api/special-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        fetchSpecialDays();
        resetForm();
      } else {
        const error = await res.json();
        alert(error.error || '追加に失敗しました');
      }
    } catch (error) {
      console.error('特別日追加エラー:', error);
      alert('追加に失敗しました');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('この特別日を削除してもよろしいですか？')) return;

    try {
      const res = await fetch(`http://localhost:3001/api/special-days/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        fetchSpecialDays();
      }
    } catch (error) {
      console.error('特別日削除エラー:', error);
    }
  };

  const resetForm = () => {
    setIsCreating(false);
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      type: 1,
      name: '',
      description: '',
    });
  };

  const typeLabel = (type: 1 | 2 | 3) => {
    switch (type) {
      case 1: return '祝日・休日';
      case 2: return '繁忙日';
      case 3: return 'イベント日';
    }
  };

  const typeColor = (type: 1 | 2 | 3) => {
    switch (type) {
      case 1: return 'bg-fish-red text-white';
      case 2: return 'bg-fish-orange text-white';
      case 3: return 'bg-ocean-500 text-white';
    }
  };

  // 月別にグループ化
  const groupedByMonth: { [key: string]: SpecialDay[] } = {};
  specialDays.forEach(day => {
    const month = day.date.substring(0, 7); // "2025-09"
    if (!groupedByMonth[month]) {
      groupedByMonth[month] = [];
    }
    groupedByMonth[month].push(day);
  });

  if (role !== 'admin') {
    return (
      <AdminLayout role={role} storeId={null} onLogout={onLogout}>
        <div className="card text-center py-12">
          <p className="text-red-600 text-lg">この機能は本部管理者のみアクセス可能です</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout role={role} storeId={null} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-800">特別日設定</h1>
          <button
            onClick={() => setIsCreating(true)}
            className="btn-primary"
          >
            + 新規特別日追加
          </button>
        </div>

        {/* 説明カード */}
        <div className="card bg-ocean-50">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-ocean-600 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-semibold text-gray-800 mb-2">特別日の種類</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li><span className="font-semibold">祝日・休日:</span> 加算時給が適用される日（店舗設定で有効な場合）</li>
                <li><span className="font-semibold">繁忙日:</span> 年末年始など、特に忙しい日</li>
                <li><span className="font-semibold">イベント日:</span> セールなど、店舗独自のイベント日</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 特別日追加フォーム */}
        {isCreating && (
          <div className="card">
            <h2 className="text-xl font-bold text-gray-800 mb-6">新規特別日追加</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    日付 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    種類 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: Number(e.target.value) as 1 | 2 | 3 })}
                    className="input-field"
                  >
                    <option value={1}>祝日・休日</option>
                    <option value={2}>繁忙日</option>
                    <option value={3}>イベント日</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input-field"
                    placeholder="例: 元日、年末セール"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    説明
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input-field"
                    placeholder="任意の説明文"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn-primary">
                  追加
                </button>
                <button type="button" onClick={resetForm} className="btn-secondary">
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 特別日一覧 */}
        <div className="card">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            特別日一覧 ({specialDays.length}件)
          </h2>

          {specialDays.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500">特別日が登録されていません</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.keys(groupedByMonth).sort().reverse().map(month => (
                <div key={month}>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-ocean-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {format(new Date(month + '-01'), 'yyyy年M月')}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {groupedByMonth[month].sort((a, b) => a.date.localeCompare(b.date)).map(day => (
                      <div
                        key={day.id}
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="text-lg font-semibold text-gray-800 mb-1">
                              {format(new Date(day.date), 'M月d日 (E)', { locale: ja })}
                            </div>
                            <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${typeColor(day.type)}`}>
                              {typeLabel(day.type)}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDelete(day.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="削除"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        <div className="text-sm font-medium text-gray-700 mb-1">{day.name}</div>
                        {day.description && (
                          <div className="text-xs text-gray-500">{day.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* クイック登録テンプレート */}
        <div className="card bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">💡 よく使う日本の祝日</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="p-2 bg-white rounded border">元日 (1/1)</div>
            <div className="p-2 bg-white rounded border">成人の日 (1月第2月曜)</div>
            <div className="p-2 bg-white rounded border">建国記念の日 (2/11)</div>
            <div className="p-2 bg-white rounded border">天皇誕生日 (2/23)</div>
            <div className="p-2 bg-white rounded border">春分の日 (3/20頃)</div>
            <div className="p-2 bg-white rounded border">昭和の日 (4/29)</div>
            <div className="p-2 bg-white rounded border">憲法記念日 (5/3)</div>
            <div className="p-2 bg-white rounded border">みどりの日 (5/4)</div>
            <div className="p-2 bg-white rounded border">こどもの日 (5/5)</div>
            <div className="p-2 bg-white rounded border">海の日 (7月第3月曜)</div>
            <div className="p-2 bg-white rounded border">山の日 (8/11)</div>
            <div className="p-2 bg-white rounded border">敬老の日 (9月第3月曜)</div>
            <div className="p-2 bg-white rounded border">秋分の日 (9/23頃)</div>
            <div className="p-2 bg-white rounded border">スポーツの日 (10月第2月曜)</div>
            <div className="p-2 bg-white rounded border">文化の日 (11/3)</div>
            <div className="p-2 bg-white rounded border">勤労感謝の日 (11/23)</div>
          </div>
          <p className="text-xs text-gray-500 mt-3">※ 上記を参考に、必要な祝日を手動で登録してください</p>
        </div>
      </div>
    </AdminLayout>
  );
}
