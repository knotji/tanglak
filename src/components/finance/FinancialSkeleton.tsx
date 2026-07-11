export function FinancialSkeleton({
  rows = 3,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-surface p-4">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-6 w-36 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-2 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
