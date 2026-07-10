export function ProgressBar({
  value,
  tone = "primary",
}: {
  value: number;
  tone?: "primary" | "debt" | "overdue";
}) {
  const width = `${Math.max(0, Math.min(100, value))}%`;
  const color =
    tone === "debt"
      ? "bg-debt"
      : tone === "overdue"
        ? "bg-overdue"
        : "bg-primary";

  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className={`h-full rounded-full ${color}`} style={{ width }} />
    </div>
  );
}
