export type Status = "Not Started" | "In Progress" | "Done" | "Partially Done" | "Missed";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  region: string;
  business_type: string;
  target: number;
  kpi_type: string;
  weekly_kpi_expectations: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  commitments_total: number;
  commitments_done: number;
  commitments_pending: number;
  weekly_kpis_assigned: number;
  weekly_kpis_met: number;
  weekly_kpis_behind: number;
  overdue_followups: number;
  reviews_completed: number;
  manoj_workload: number;
}

export interface ApiResponse<T> {
  data: T;
}
