import { MoneyAmount } from "@/components/MoneyAmount";

export function FinancialSummaryCard({
  label,
  amountSatang,
  tone = "default",
}: {
  label: string;
  amountSatang: number;
  tone?: "default" | "income" | "warning";
}) {
  const toneClass =
    tone === "income"
      ? "text-primary"
    : tone === "warning"
        ? "text-debt"
        : "text-foreground";

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm text-foreground/65">{label}</p>
      <MoneyAmount
        satang={amountSatang}
        className={`mt-1 block text-3xl font-semibold ${toneClass}`}
      />
    </section>
  );
}
