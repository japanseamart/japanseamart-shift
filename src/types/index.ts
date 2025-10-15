// 従業員区分
export type EmploymentType = 'part_time' | 'part_time_insured' | 'full_time';

// 権限レベル
export type Role = 'admin' | 'store_manager' | 'employee';

// シフトパターン
export type ShiftPattern = 'off' | 'morning' | 'afternoon' | 'evening' | 'all_day' | 'custom';

// シフト希望のステータス
export type RequestStatus = 'pending' | 'approved' | 'rejected';

// 店舗
export interface Store {
  id: number;
  name: string;
  monthly_budget: number;
  overtime_rate_enabled: boolean;
  saturday_rate: number;
  sunday_rate: number;
  holiday_rate: number;
  business_hours_start: string; // "07:00"
  business_hours_end: string; // "22:00"
  morning_start: string;
  morning_end: string;
  afternoon_start: string;
  afternoon_end: string;
  evening_start: string;
  evening_end: string;
  created_at: string;
  updated_at: string;
}

// 従業員
export interface Employee {
  id: number;
  name: string;
  store_id: number;
  employment_type: EmploymentType;
  hourly_wage: number | null; // 正社員はnull
  created_at: string;
  updated_at: string;
}

// 特別日
export interface SpecialDay {
  id: number;
  date: string; // "2025-01-01"
  type: 1 | 2 | 3; // 1: 祝日・休日, 2: 繁忙日, 3: イベント日
  name: string;
  description: string;
  created_at: string;
}

// シフト希望
export interface ShiftRequest {
  id: number;
  employee_id: number;
  store_id: number;
  date: string;
  patterns: ShiftPattern[]; // 複数選択可能
  custom_start?: string; // "07:00"
  custom_end?: string; // "13:00"
  status: RequestStatus;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: number; // 承認者のID
}

// シフト実績
export interface Shift {
  id: number;
  employee_id: number;
  store_id: number;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  labor_cost: number;
  created_at: string;
  updated_at: string;
}

// シフト提出期限
export interface ShiftDeadline {
  id: number;
  store_id: number;
  target_month: string; // "2025-09"
  deadline_date: string; // "2025-08-25"
  created_at: string;
}

// お知らせ
export interface Announcement {
  id: number;
  title: string;
  content: string;
  created_at: string;
  is_active: boolean;
}

// パスワード管理
export interface Password {
  id: number;
  role: 'admin' | 'store_manager';
  store_id: number | null; // adminの場合はnull
  password_hash: string;
  auto_logout_minutes: number;
  updated_at: string;
}

// 変更履歴
export interface ShiftHistory {
  id: number;
  shift_id: number;
  changed_by: string; // 変更者の権限レベル
  changed_at: string;
  before_data: string; // JSON文字列
  after_data: string; // JSON文字列
}

// シフト統計
export interface ShiftStatistics {
  date: string;
  total_hours: number;
  total_employees: number;
  total_cost: number;
}

// 月間レポート
export interface MonthlyReport {
  month: string;
  store_id: number;
  store_name: string;
  total_cost: number;
  total_hours: number;
  budget: number;
  budget_usage_rate: number;
  employee_stats: EmployeeStats[];
  daily_stats: ShiftStatistics[];
}

// 従業員統計
export interface EmployeeStats {
  employee_id: number;
  employee_name: string;
  total_hours: number;
  total_cost: number;
  shifts_count: number;
}

// 認証コンテキスト
export interface AuthContext {
  role: Role | null;
  storeId: number | null;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}
