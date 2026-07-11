import type { ReactNode } from "react";
import { ReceiptText } from "lucide-react";

export function FinancialEmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-dashed border-border bg-surface p-5 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-text-secondary">
        <ReceiptText className="h-5 w-5" aria-hidden />
      </div>
      <p className="mt-3 font-bold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-text-secondary">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}
