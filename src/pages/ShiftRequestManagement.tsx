import { Role } from '../types';
import AdminLayout from '../components/AdminLayout';

interface ShiftRequestManagementProps {
  role: Role;
  storeId: number | null;
  onLogout: () => void;
}

export default function ShiftRequestManagement({ role, storeId, onLogout }: ShiftRequestManagementProps) {
  return (
    <AdminLayout role={role} storeId={storeId} onLogout={onLogout}>
      <div className="card text-center py-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">シフト希望管理機能</h2>
        <p className="text-gray-600 mb-4">従業員からのシフト希望を承認・却下します</p>
        <p className="text-sm text-gray-500">この機能は実装中です</p>
      </div>
    </AdminLayout>
  );
}
