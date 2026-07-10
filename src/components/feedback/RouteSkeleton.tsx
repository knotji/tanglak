export function RouteSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-24 rounded-[16px] border border-border bg-muted" />
      ))}
    </div>
  );
}
