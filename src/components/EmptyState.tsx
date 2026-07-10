export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-[16px] border border-dashed border-border bg-surface p-5 text-center">
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{body}</p>
    </section>
  );
}
