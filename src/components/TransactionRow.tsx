import { CategoryIcon } from "@/components/CategoryIcon";
import { MoneyAmount } from "@/components/MoneyAmount";
import type { Transaction } from "@/types/domain";

export function TransactionRow({
  transaction,
  onClick,
}: {
  transaction: Transaction;
  onClick?: (transaction: Transaction) => void;
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
  const time = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(transaction.occurredAt));
  const actionContext = transaction.merchant ?? transaction.note ?? "รายการ";

  return (
    <button
      type="button"
      onClick={() => onClick?.(transaction)}
      className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:bg-muted/50 focus-visible:outline-none"
      aria-label={`เปิดรายละเอียดรายการ ${actionContext}`}
    >
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
      <MoneyAmount
        satang={signedSatang}
        tone={tone}
        showSign={isIncoming}
        className="shrink-0 text-sm font-bold"
      />
    </button>
  );
}
