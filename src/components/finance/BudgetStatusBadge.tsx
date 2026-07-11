import { financialStatusMeta, type FinancialStatus } from "./status";

export function BudgetStatusBadge({
  status,
  className = "",
}: {
  status: FinancialStatus;
  className?: string;
}) {
  const meta = financialStatusMeta[status];
  const Icon = meta.icon;

  return (
    <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold ${meta.className} ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{meta.label}</span>
      <span className="sr-only">{meta.cue}</span>
    </span>
  );
}
