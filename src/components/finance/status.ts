import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleSlash,
  TrendingDown,
} from "lucide-react";

export type FinancialStatus =
  | "healthy"
  | "near_limit"
  | "overspent"
  | "no_budget"
  | "due_soon"
  | "overdue"
  | "neutral";

export const financialStatusMeta = {
  healthy: {
    label: "ปกติ",
    cue: "อยู่ในแผน",
    className: "border-income/30 bg-income/10 text-income",
    icon: CheckCircle2,
  },
  near_limit: {
    label: "ใกล้ถึงงบ",
    cue: "ใกล้เต็มวงเงิน",
    className: "border-debt/35 bg-debt/10 text-debt",
    icon: AlertTriangle,
  },
  overspent: {
    label: "เกินงบ",
    cue: "ใช้เกินงบ",
    className: "border-overdue/35 bg-overdue/10 text-overdue",
    icon: TrendingDown,
  },
  no_budget: {
    label: "ยังไม่ตั้งงบ",
    cue: "ไม่มีงบ",
    className: "border-border bg-muted text-text-secondary",
    icon: CircleSlash,
  },
  due_soon: {
    label: "ใกล้ครบกำหนด",
    cue: "ถึงกำหนดเร็ว ๆ นี้",
    className: "border-debt/35 bg-debt/10 text-debt",
    icon: CalendarClock,
  },
  overdue: {
    label: "เลยกำหนด",
    cue: "เลยกำหนดแล้ว",
    className: "border-overdue/35 bg-overdue/10 text-overdue",
    icon: AlertTriangle,
  },
  neutral: {
    label: "ทั่วไป",
    cue: "สถานะทั่วไป",
    className: "border-border bg-muted text-text-secondary",
    icon: Circle,
  },
} satisfies Record<FinancialStatus, {
  label: string;
  cue: string;
  className: string;
  icon: typeof Circle;
}>;

export function statusForBudget(spentSatang: number, budgetSatang: number): FinancialStatus {
  if (budgetSatang <= 0) return "no_budget";
  const percentage = (spentSatang / budgetSatang) * 100;
  if (percentage > 100) return "overspent";
  if (percentage >= 85) return "near_limit";
  return "healthy";
}
