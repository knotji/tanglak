import type { ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { MoneyAmount, type MoneyAmountTone } from "@/components/MoneyAmount";

export function FinancialMetricCard({
  label,
  amountSatang,
  tone = "neutral",
  comparison,
  trend = "flat",
  action,
  loading = false,
  warning = false,
}: {
  label: string;
  amountSatang: number;
  tone?: MoneyAmountTone;
  comparison?: string;
  trend?: "up" | "down" | "flat";
  action?: ReactNode;
  loading?: boolean;
  warning?: boolean;
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : ArrowRight;

  return (
    <section className={`rounded-lg border bg-surface p-4 shadow-sm ${warning ? "border-debt/40" : "border-border"}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-secondary">{label}</p>
          {loading ? (
            <div className="mt-2 h-8 w-32 animate-pulse rounded bg-muted" aria-hidden />
          ) : (
            <MoneyAmount satang={amountSatang} tone={tone} className="mt-1 block text-2xl font-bold leading-tight sm:text-3xl" />
          )}
        </div>
        {warning ? <AlertTriangle className="h-5 w-5 shrink-0 text-debt" aria-label="คำเตือน" /> : null}
      </div>
      <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
        {comparison ? (
          <p className="flex min-w-0 items-center gap-1 text-xs font-medium text-text-secondary">
            <TrendIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{comparison}</span>
          </p>
        ) : <span />}
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </section>
  );
}
