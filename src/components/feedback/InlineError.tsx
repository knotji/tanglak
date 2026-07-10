export function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="rounded-[16px] bg-overdue/10 px-3 py-2 text-sm font-medium text-overdue">{message}</p>;
}
