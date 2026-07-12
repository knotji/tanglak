import { MoneyAmount } from "@/components/MoneyAmount";

export function MoneyFlowRow({
  label,
  amountSatang,
  direction,
}: {
  label: string;
  amountSatang: number;
  direction: "in" | "out";
}) {
  const isExpense = direction === "out";
  // Sign and amount render as one MoneyAmount span in one color -- never a
  // raw "+"/"-" text node colored separately from the digits next to it
  // (that split-coloring was the bug: the "+" inherited an outer green
  // span's color while MoneyAmount's own inner span painted the digits
  // neutral). Green is reserved for meaningful positive status elsewhere,
  // not applied here just because a value is incoming/positive.
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm font-medium text-text-secondary">{label}</span>
      <MoneyAmount
        satang={isExpense ? -amountSatang : amountSatang}
        tone={isExpense ? "expense" : "neutral"}
        showSign={!isExpense}
        className="text-base font-bold"
      />
    </div>
  );
}
