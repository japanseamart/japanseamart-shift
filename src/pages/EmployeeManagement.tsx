import { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { Role, Employee, Store, EmploymentType } from '../types';
import AdminLayout from '../components/AdminLayout';

interface EmployeeManagementProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

export default function EmployeeManagement({ role, storeId, onLogout }: EmployeeManagementProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [filterStoreId, setFilterStoreId] = useState<number | string>('all');
  const [sortBy, setSortBy] = useState<'store' | 'wage'>('store');
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    store_id: storeId || 1,
    employment_type: 'part_time' as EmploymentType,
    hourly_wage: 1000,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchEmployees();
    fetchStores();
  }, []);

  const fetchEmployees = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/employees');
      const data = await res.json();
      setEmployees(data);
    } catch (error) {
      console.error('従業員取得エラー:', error);
    }
  };

  const fetchStores = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/stores');
      const data = await res.json();
      setStores(data);
    } catch (error) {
      console.error('店舗取得エラー:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 店舗責任者は自店舗のみ
    if (role === 'store_manager' && formData.store_id !== storeId) {
      alert('自店舗の従業員のみ追加できます');
      return;
    }

    try {
      const url = editingEmployee
        ? `http://localhost:3001/api/employees/${editingEmployee.id}`
        : 'http://localhost:3001/api/employees';
      
      const method = editingEmployee ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          hourly_wage: formData.employment_type === 'full_time' ? null : formData.hourly_wage,
        }),
      });

      if (res.ok) {
        fetchEmployees();
        resetForm();
      }
    } catch (error) {
      console.error('従業員保存エラー:', error);
    }
  };

  const handleEdit = (employee: Employee) => {
    // 店舗責任者は自店舗のみ
    if (role === 'store_manager' && employee.store_id !== storeId) {
      alert('自店舗の従業員のみ編集できます');
      return;
    }

    setEditingEmployee(employee);
    setFormData({
      name: employee.name,
      store_id: employee.store_id,
      employment_type: employee.employment_type,
      hourly_wage: employee.hourly_wage || 1000,
    });
    setIsCreating(true);
  };

  const handleDelete = async (employee: Employee) => {
    // 店舗責任者は自店舗のみ
    if (role === 'store_manager' && employee.store_id !== storeId) {
      alert('自店舗の従業員のみ削除できます');
      return;
    }

    if (!confirm(`${employee.name} を削除してもよろしいですか？`)) return;

    try {
      const res = await fetch(`http://localhost:3001/api/employees/${employee.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        fetchEmployees();
      }
    } catch (error) {
      console.error('従業員削除エラー:', error);
    }
  };

  const resetForm = () => {
    setIsCreating(false);
    setEditingEmployee(null);
    setFormData({
      name: '',
      store_id: storeId || 1,
      employment_type: 'part_time',
      hourly_wage: 1000,
    });
  };

  // CSVエクスポート
  const handleExportCSV = () => {
    const csvData = filteredEmployees.map(emp => {
      const store = stores.find(s => s.id === emp.store_id);
      const employmentTypeLabel = {
        part_time: 'パート・アルバイト',
        part_time_insured: 'パート社員',
        full_time: '正社員',
      }[emp.employment_type];

      return {
        従業員ID: emp.id,
        氏名: emp.name,
        所属店舗: store?.name || '',
        給与タイプ: employmentTypeLabel,
        時給: emp.hourly_wage || '-',
        登録日: emp.created_at,
      };
    });

    const csv = Papa.unparse(csvData, { header: true });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `従業員一覧_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // CSVインポート
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const data = results.data as any[];
        
        for (const row of data) {
          if (!row.氏名 || !row.所属店舗) continue;

          const store = stores.find(s => s.name === row.所属店舗);
          if (!store) continue;

          const employmentType = {
            'パート・アルバイト': 'part_time',
            'パート社員': 'part_time_insured',
            '正社員': 'full_time',
          }[row.給与タイプ] || 'part_time';

          const employeeData = {
            name: row.氏名,
            store_id: store.id,
            employment_type: employmentType,
            hourly_wage: employmentType === 'full_time' ? null : Number(row.時給) || 1000,
          };

          try {
            // IDがある場合は更新、ない場合は新規作成
            if (row.従業員ID) {
              await fetch(`http://localhost:3001/api/employees/${row.従業員ID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(employeeData),
              });
            } else {
              await fetch('http://localhost:3001/api/employees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(employeeData),
              });
            }
          } catch (error) {
            console.error('従業員インポートエラー:', error);
          }
        }

        fetchEmployees();
        alert('CSVのインポートが完了しました');
      },
    });

    // ファイル選択をリセット
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // フィルタリング・ソート
  const filteredEmployees = employees
    .filter(emp => {
      if (filterStoreId === 'all') return true;
      return emp.store_id === Number(filterStoreId);
    })
    .sort((a, b) => {
      if (sortBy === 'store') {
        return a.store_id - b.store_id;
      } else {
        return (b.hourly_wage || 0) - (a.hourly_wage || 0);
      }
    });

  const employmentTypeLabel = (type: EmploymentType) => {
    switch (type) {
      case 'part_time': return 'パート・アルバイト';
      case 'part_time_insured': return 'パート社員';
      case 'full_time': return '正社員';
    }
  };

  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-800">従業員管理</h1>
          <div className="flex gap-2">
            <button onClick={handleExportCSV} className="btn-secondary">
              <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CSVエクスポート
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary"
            >
              <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              CSVインポート
            </button>
            <button onClick={() => setIsCreating(true)} className="btn-primary">
              + 新規従業員追加
            </button>
          </div>
        </div>

        {/* 従業員フォーム */}
        {isCreating && (
          <div className="card">
            <h2 className="text-xl font-bold text-gray-800 mb-6">
              {editingEmployee ? '従業員編集' : '新規従業員追加'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    氏名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    所属店舗 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.store_id}
                    onChange={(e) => setFormData({ ...formData, store_id: Number(e.target.value) })}
                    className="input-field"
                    disabled={role === 'store_manager'}
                  >
                    {stores
                      .filter(store => role === 'admin' || store.id === storeId)
                      .map(store => (
                        <option key={store.id} value={store.id}>{store.name}</option>
                      ))
                    }
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    給与タイプ <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.employment_type}
                    onChange={(e) => setFormData({ ...formData, employment_type: e.target.value as EmploymentType })}
                    className="input-field"
                  >
                    <option value="part_time">パート・アルバイト</option>
                    <option value="part_time_insured">パート社員</option>
                    <option value="full_time">正社員</option>
                  </select>
                </div>

                {formData.employment_type !== 'full_time' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      時給（円） <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.hourly_wage}
                      onChange={(e) => setFormData({ ...formData, hourly_wage: Number(e.target.value) })}
                      className="input-field"
                      min="0"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn-primary">
                  {editingEmployee ? '更新' : '追加'}
                </button>
                <button type="button" onClick={resetForm} className="btn-secondary">
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}

        {/* フィルター・ソート */}
        <div className="card">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">店舗でフィルター</label>
              <select
                value={filterStoreId}
                onChange={(e) => setFilterStoreId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="input-field"
              >
                <option value="all">全店舗</option>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">並び替え</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'store' | 'wage')}
                className="input-field"
              >
                <option value="store">所属店舗順</option>
                <option value="wage">時給順（高い順）</option>
              </select>
            </div>
          </div>
        </div>

        {/* 従業員一覧 */}
        <div className="card">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            従業員一覧 ({filteredEmployees.length}名)
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">氏名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">所属店舗</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">給与タイプ</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">時給</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEmployees.map((employee) => {
                  const store = stores.find(s => s.id === employee.store_id);
                  return (
                    <tr key={employee.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {employee.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {employee.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {store?.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {employmentTypeLabel(employee.employment_type)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {employee.hourly_wage ? `¥${employee.hourly_wage.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleEdit(employee)}
                          className="text-ocean-600 hover:text-ocean-900"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDelete(employee)}
                          className="text-red-600 hover:text-red-900"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
