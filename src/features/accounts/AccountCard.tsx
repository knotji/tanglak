"use client";

import { AccountStatusBadge } from "@/features/accounts/AccountStatusBadge";
import { AccountTypeBadge } from "@/features/accounts/AccountTypeBadge";
import { maskLastFour } from "@/features/accounts/account-labels";
import type { Account } from "@/types/domain";

export function AccountCard({
  account,
  busy,
  onEdit,
  onDefault,
  onDeactivate,
  onReactivate,
  onDelete,
}: {
  account: Account;
  busy?: boolean;
  onEdit: () => void;
  onDefault: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  return (
    <section className="rounded-[16px] border border-border bg-surface p-4 shadow-[0_12px_30px_rgba(24,32,29,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{account.name}</h2>
          <p className="text-sm text-text-secondary">{account.institutionName || "ไม่ระบุสถาบัน"}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{maskLastFour(account.lastFour)}</p>
        </div>
        <AccountStatusBadge account={account} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <AccountTypeBadge type={account.accountType} />
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-text-secondary">
          {account.isOwnedByUser ? "ของฉัน" : "ไม่ได้ถือเอง"}
        </span>
      </div>
      {account.notes ? <p className="mt-3 text-sm leading-6 text-text-secondary">{account.notes}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button disabled={busy} onClick={onEdit} aria-label={`แก้ไขบัญชี ${account.name}`} className="min-h-11 rounded-[16px] bg-muted px-3 text-sm font-bold text-primary">
          แก้ไข
        </button>
        <button
          disabled={busy || account.isDefault || account.isActive === false}
          onClick={onDefault}
          aria-label={`ตั้งบัญชี ${account.name} เป็นบัญชีหลัก`}
          className="min-h-11 rounded-[16px] bg-muted px-3 text-sm font-bold text-primary disabled:opacity-50"
        >
          ตั้งหลัก
        </button>
        {account.isActive === false ? (
          <button disabled={busy} onClick={onReactivate} aria-label={`เปิดใช้บัญชี ${account.name}`} className="min-h-11 rounded-[16px] bg-muted px-3 text-sm font-bold text-primary">
            เปิดใช้
          </button>
        ) : (
          <button disabled={busy} onClick={onDeactivate} aria-label={`ปิดใช้บัญชี ${account.name}`} className="min-h-11 rounded-[16px] bg-muted px-3 text-sm font-bold text-primary">
            ปิดใช้
          </button>
        )}
        <button disabled={busy} onClick={onDelete} aria-label={`ลบบัญชี ${account.name}`} className="min-h-11 rounded-[16px] bg-muted px-3 text-sm font-bold text-overdue">
          ลบ
        </button>
      </div>
    </section>
  );
}
