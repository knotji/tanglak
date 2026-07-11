import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, RotateCcw } from "lucide-react";
import type { TransactionType } from "@/types/domain";

const indicatorMeta: Record<TransactionType, { label: string; className: string; icon: typeof ArrowUpRight }> = {
  income: { label: "รายรับ", className: "bg-income/10 text-income", icon: ArrowDownLeft },
  expense: { label: "รายจ่าย", className: "bg-muted text-expense", icon: ArrowUpRight },
  debt_payment: { label: "จ่ายหนี้", className: "bg-debt/10 text-debt", icon: ArrowUpRight },
  transfer: { label: "โอนเงิน", className: "bg-muted text-text-secondary", icon: ArrowRightLeft },
  refund: { label: "คืนเงิน", className: "bg-income/10 text-income", icon: RotateCcw },
};

export function IncomeExpenseIndicator({
  type,
  showLabel = true,
}: {
  type: TransactionType;
  showLabel?: boolean;
}) {
  const meta = indicatorMeta[type];
  const Icon = meta.icon;

  return (
    <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {showLabel ? <span>{meta.label}</span> : <span className="sr-only">{meta.label}</span>}
    </span>
  );
}
