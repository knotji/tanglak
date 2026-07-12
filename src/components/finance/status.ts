import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleSlash,
  TrendingDown,
} from "lucide-react";
import { statusForCategory } from "@/lib/finance/budget-calculations";

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
    label: "ยังไม่ได้ตั้งงบ",
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

/**
 * Canonical budget status for UI display, delegating to the budget domain
 * layer's `statusForCategory` (src/lib/finance/budget-calculations.ts) --
 * the single source of truth for thresholds (80% near-limit, 100% overspent
 * boundary; a category with no positive budget is always "no_budget",
 * regardless of spending -- see that function's doc comment). No threshold
 * logic is duplicated here. Note the argument order is flipped relative to
 * `statusForCategory` to match this module's existing (spent, budget) call
 * sites.
 */
export function statusForBudget(spentSatang: number, budgetSatang: number): FinancialStatus {
  return statusForCategory(budgetSatang, spentSatang);
}
