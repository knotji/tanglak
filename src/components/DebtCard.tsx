import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { MoneyAmount } from "@/components/MoneyAmount";
import { paymentProgress, remainingToMinimum } from "@/lib/finance/calculations";
import { debtDueStatus, DEBT_DUE_STATUS_LABEL_TH } from "@/lib/finance/debt-status";
import { formatInterestRateSummary } from "@/lib/finance/debt-interest";
import type { Debt } from "@/types/domain";
import { ProgressBar } from "@/components/ProgressBar";

const STATUS_ICON = {
  not_yet_due: CalendarClock,
  due_soon: CalendarClock,
  due_today: AlertTriangle,
  overdue: AlertTriangle,
  minimum_paid: CheckCircle2,
  cycle_paid_in_full: CheckCircle2,
} as const;

const STATUS_TONE_CLASS = {
  not_yet_due: "bg-muted text-text-secondary",
  due_soon: "bg-debt/10 text-debt",
  due_today: "bg-overdue/10 text-overdue",
  overdue: "bg-overdue/10 text-overdue",
  minimum_paid: "bg-income/10 text-income",
  cycle_paid_in_full: "bg-income/10 text-income",
} as const;

export function DebtCard({
  debt,
  today,
  onAddPayment,
}: {
  debt: Debt;
  today?: Date;
  onAddPayment?: () => void;
}) {
  const remaining = remainingToMinimum(debt);
  const progress = paymentProgress(debt) * 100;
  const status = debtDueStatus(debt, today);
  const StatusIcon = STATUS_ICON[status];

  return (
    <article className="rounded-[16px] border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold">{debt.name}</h2>
        <span
          className={`flex shrink-0 items-center gap-1 rounded-[14px] px-3 py-1.5 text-xs font-bold ${STATUS_TONE_CLASS[status]}`}
        >
          <StatusIcon size={14} aria-hidden />
          {DEBT_DUE_STATUS_LABEL_TH[status]}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-text-secondary">ยอดคงเหลือ</p>
          <MoneyAmount
            satang={debt.outstandingBalanceSatang ?? 0}
            className="mt-1 block text-xl font-bold"
          />
        </div>
        <div>
          <p className="text-text-secondary">ยอดเรียกเก็บรอบนี้</p>
          <MoneyAmount satang={debt.amountDueSatang ?? 0} className="mt-1 block text-xl font-bold" />
        </div>
        <div>
          <p className="text-text-secondary">ขั้นต่ำเดือนนี้</p>
          <MoneyAmount satang={debt.minimumPaymentSatang ?? 0} className="mt-1 block text-xl font-bold" />
        </div>
        <div>
          <p className="text-text-secondary">ครบกำหนด</p>
          <p className="mt-1 text-xl font-bold">{debt.dueDate ?? "ยังไม่ระบุ"}</p>
        </div>
      </div>
      {debt.interestRateAnnual !== undefined ? (
        <p className="mt-3 text-xs font-medium text-text-secondary">
          {formatInterestRateSummary(debt.interestRateAnnual)}
        </p>
      ) : null}
      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-text-secondary">จ่ายแล้วรอบนี้</span>
          <span className="font-bold">
            <MoneyAmount satang={debt.amountPaidThisCycleSatang} /> จาก{" "}
            <MoneyAmount satang={debt.minimumPaymentSatang ?? 0} />
          </span>
        </div>
        <ProgressBar value={progress} tone="debt" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          onClick={onAddPayment}
          className="min-h-11 rounded-[16px] bg-primary text-sm font-bold text-white"
        >
          เพิ่มการชำระ
        </button>
        <Link
          href={`/debts/${debt.id}`}
          className="flex min-h-11 items-center justify-center rounded-[16px] border border-border bg-surface text-sm font-bold text-primary"
        >
          ดูรายละเอียด
        </Link>
      </div>
      {remaining > 0 ? (
        <p className="mt-3 text-sm font-medium text-debt">
          ยังขาดขั้นต่ำ <MoneyAmount satang={remaining} />
        </p>
      ) : null}
    </article>
  );
}
