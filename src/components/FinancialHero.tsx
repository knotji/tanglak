import { CompactStat } from "@/components/CompactStat";
import { MoneyAmount } from "@/components/MoneyAmount";
import { ProgressBar } from "@/components/ProgressBar";

export function FinancialHero({
  label,
  amountSatang,
  budgetLabel,
  remainingLabel,
  progress,
  stats,
}: {
  label: string;
  amountSatang: number;
  budgetLabel?: string;
  remainingLabel?: string;
  progress?: number;
  stats?: Array<{
    label: string;
    amountSatang: number;
    tone?: "default" | "income" | "debt";
  }>;
}) {
  return (
    <section className="rounded-[16px] border border-border bg-surface p-5 shadow-[0_12px_30px_rgba(24,32,29,0.05)]">
      <p className="text-sm font-semibold text-text-secondary">{label}</p>
      <MoneyAmount satang={amountSatang} className="mt-2 block text-[40px] font-bold leading-none text-foreground" />
      {(budgetLabel || remainingLabel) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-text-secondary">
          {budgetLabel ? <span>{budgetLabel}</span> : <span />}
          {remainingLabel ? <span className="text-primary">{remainingLabel}</span> : null}
        </div>
      )}
      {typeof progress === "number" ? (
        <div className="mt-3">
          <ProgressBar value={progress} />
        </div>
      ) : null}
      {stats?.length ? (
        <div className="mt-5 grid grid-cols-3 gap-2">
          {stats.map((stat) => (
            <CompactStat key={stat.label} {...stat} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
