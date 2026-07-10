import type { Account } from "@/types/domain";

export function AccountStatusBadge({ account }: { account: Account }) {
  if (account.isActive === false) {
    return <span className="rounded-full bg-border px-3 py-1 text-xs font-bold text-text-secondary">ปิดใช้งาน</span>;
  }
  if (account.isDefault) {
    return <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">บัญชีหลัก</span>;
  }
  return <span className="rounded-full bg-income/10 px-3 py-1 text-xs font-bold text-income">ใช้งานอยู่</span>;
}
