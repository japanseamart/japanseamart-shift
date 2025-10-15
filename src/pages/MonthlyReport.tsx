import { Role } from '../types';
import AdminLayout from '../components/AdminLayout';

interface MonthlyReportProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

export default function MonthlyReport({ role, storeId, onLogout }: MonthlyReportProps) {
  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="card text-center py-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">月間レポート機能</h2>
        <p className="text-gray-600 mb-4">人件費・労働時間の分析レポートを表示します</p>
        <p className="text-sm text-gray-500">この機能は実装中です</p>
      </div>
    </AdminLayout>
  );
}
