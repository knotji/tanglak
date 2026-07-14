import { CategoryIcon } from "@/components/CategoryIcon";
import { MoneyAmount } from "@/components/MoneyAmount";
import { formatThaiDateTime } from "@/lib/finance/date";
import type { Transaction } from "@/types/domain";

export function TransactionRow({
  transaction,
  onEdit,
  onDelete,
  busy,
}: {
  transaction: Transaction;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
  busy?: boolean;
}) {
  const isIncoming = transaction.type === "income" || transaction.type === "refund";
  const isTransfer = transaction.type === "transfer";
  const tone: "income" | "expense" | "debt" | "neutral" = isIncoming
    ? "income"
    : transaction.type === "debt_payment"
      ? "debt"
      : isTransfer
        ? "neutral"
        : "expense";
  // Signed amount fed to MoneyAmount itself (not a separately-colored raw
  // "+"/"-" text node next to it) -- see MoneyFlowRow.tsx for why that
  // split ends up rendering the sign and the digits in different colors.
  const signedSatang = isIncoming || isTransfer ? transaction.amountSatang : -transaction.amountSatang;
  const dateTime = formatThaiDateTime(transaction.occurredAt);
  const time = dateTime.split(" เวลา ")[1];
  const actionContext = transaction.merchant ?? transaction.note ?? "รายการ";

  return (
    <div className="flex items-center gap-3 py-3">
      <CategoryIcon category={transaction.category} type={transaction.type} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">
          {transaction.merchant ?? transaction.note ?? "รายการ"}
        </p>
        <p className="mt-0.5 text-xs font-medium text-text-secondary">
          {time}
          {transaction.type === "debt_payment" ? " · จ่ายหนี้" : ""}
        </p>
      </div>
      <MoneyAmount satang={signedSatang} tone={tone} showSign={isIncoming || isTransfer} className="text-sm font-bold" />
      {(onEdit || onDelete) && (
        <div className="flex gap-1 rounded-[14px] bg-muted p-1">
          {onEdit ? (
            <button
              className="min-h-11 rounded-[12px] bg-surface px-3 text-xs font-bold text-primary"
              aria-label={`แก้ไขรายการ ${actionContext}`}
              onClick={() => onEdit(transaction)}
            >
              แก้
            </button>
          ) : null}
          {onDelete ? (
            <button
              disabled={busy}
              className="min-h-11 rounded-[12px] px-3 text-xs font-bold text-overdue disabled:opacity-60"
              aria-label={`ลบรายการ ${actionContext}`}
              onClick={() => onDelete(transaction)}
            >
              {busy ? "กำลังลบ" : "ลบรายการนี้"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
