import { Role } from '../types';
import AdminLayout from '../components/AdminLayout';

interface SpecialDayManagementProps {
  role: Role;
  onLogout: () => void;
}

export default function SpecialDayManagement({ role, onLogout }: SpecialDayManagementProps) {
  return (
    <AdminLayout role={role} storeId={null} onLogout={onLogout}>
      <div className="card text-center py-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">特別日設定機能</h2>
        <p className="text-gray-600 mb-4">祝日・繁忙日・イベント日を設定します</p>
        <p className="text-sm text-gray-500">この機能は実装中です</p>
      </div>
    </AdminLayout>
  );
}
