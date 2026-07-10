import { MoneyAmount } from "@/components/MoneyAmount";
import {
  daysUntilDue,
  paymentProgress,
  remainingToMinimum,
} from "@/lib/finance/calculations";
import type { Debt } from "@/types/domain";
import { ProgressBar } from "@/components/ProgressBar";

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
  const dueIn = debt.dueDate ? daysUntilDue(debt.dueDate, today) : null;

  return (
    <article className="rounded-[16px] border border-border bg-surface p-5 shadow-[0_10px_24px_rgba(24,32,29,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{debt.name}</h2>
          <p className="mt-0.5 text-sm font-medium text-text-secondary">•••• 4821</p>
        </div>
        {dueIn !== null ? (
          <span className="rounded-[14px] bg-debt/10 px-3 py-1.5 text-xs font-bold text-debt">
            อีก {dueIn} วัน
          </span>
        ) : null}
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
          <p className="text-text-secondary">ขั้นต่ำเดือนนี้</p>
          <MoneyAmount satang={debt.minimumPaymentSatang ?? 0} className="mt-1 block text-xl font-bold" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-text-secondary">จ่ายแล้ว</span>
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
        <button className="min-h-11 rounded-[16px] border border-border bg-surface text-sm font-bold text-primary">
          ดูรายละเอียด
        </button>
      </div>
      {remaining > 0 ? (
        <p className="mt-3 text-sm font-medium text-debt">
          ยังขาดขั้นต่ำ <MoneyAmount satang={remaining} />
        </p>
      ) : null}
    </article>
  );
}
