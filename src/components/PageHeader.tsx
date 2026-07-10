export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="space-y-1">
      <p className="text-[13px] font-semibold text-primary">ตั้งหลัก</p>
      <h1 className="text-[26px] font-bold leading-tight text-foreground">{title}</h1>
      {subtitle ? <p className="text-sm leading-6 text-text-secondary">{subtitle}</p> : null}
    </header>
  );
}
