export function RouteSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="กำลังโหลด">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-[16px] border border-border bg-muted" />
      ))}
    </div>
  );
}
