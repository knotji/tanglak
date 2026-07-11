import Link from "next/link";

export function NextActionCard({
  title,
  body,
  action,
  actionHref,
  tone = "primary",
}: {
  title: string;
  body: string;
  action?: string;
  actionHref?: string;
  tone?: "primary" | "overdue" | "debt";
}) {
  const toneClass =
    tone === "overdue"
      ? "border-overdue/25 bg-overdue/5"
      : tone === "debt"
        ? "border-debt/25 bg-debt/5"
        : "border-primary/15 bg-primary-soft";
  const headingClass = tone === "overdue" ? "text-overdue" : tone === "debt" ? "text-debt" : "text-primary";
  const buttonClass =
    tone === "overdue" ? "bg-overdue" : tone === "debt" ? "bg-debt" : "bg-primary";

  return (
    <section className={`rounded-[16px] border p-4 ${toneClass}`}>
      <p className={`text-[12px] font-bold uppercase tracking-wide ${headingClass}`}>สิ่งที่ควรทำต่อ</p>
      <h2 className="mt-1.5 text-lg font-bold leading-snug text-foreground">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{body}</p>
      {action ? (
        actionHref ? (
          <Link
            href={actionHref}
            className={`mt-3 inline-flex min-h-11 items-center rounded-[16px] px-4 text-sm font-bold text-white ${buttonClass}`}
          >
            {action}
          </Link>
        ) : (
          <button className={`mt-3 min-h-11 rounded-[16px] px-4 text-sm font-bold text-white ${buttonClass}`}>
            {action}
          </button>
        )
      ) : null}
    </section>
  );
}
