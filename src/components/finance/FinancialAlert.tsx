import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";

export function FinancialAlert({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children: ReactNode;
  tone?: "info" | "warning" | "danger";
}) {
  const Icon = tone === "info" ? Info : AlertTriangle;
  const toneClass =
    tone === "danger"
      ? "border-overdue/35 bg-overdue/10 text-overdue"
      : tone === "warning"
        ? "border-debt/35 bg-debt/10 text-debt"
        : "border-border bg-muted text-foreground";

  return (
    <section role={tone === "info" ? "status" : "alert"} className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-bold">{title}</p>
          <div className="mt-1 text-sm leading-6 text-foreground/80">{children}</div>
        </div>
      </div>
    </section>
  );
}
