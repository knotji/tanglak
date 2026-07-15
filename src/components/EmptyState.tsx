export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-border bg-surface p-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <div className="h-8 w-8 rounded-full border-4 border-primary/20 border-t-primary/60" />
      </div>
      <p className="font-bold text-foreground">{title}</p>
      <p className="mt-2 max-w-xs text-sm leading-6 text-text-secondary">{body}</p>
    </section>
  );
}
