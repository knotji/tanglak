export function NextActionCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: string;
}) {
  return (
    <section className="rounded-[16px] border border-primary/15 bg-primary-soft p-5 shadow-[0_10px_30px_rgba(36,76,61,0.06)]">
      <p className="text-[13px] font-bold text-primary">สิ่งที่ควรทำต่อ</p>
      <h2 className="mt-2 text-xl font-bold leading-snug text-primary">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-foreground">{body}</p>
      {action ? (
        <button className="mt-4 min-h-11 rounded-[16px] bg-primary px-4 py-2 text-sm font-bold text-white">
          {action}
        </button>
      ) : null}
    </section>
  );
}
