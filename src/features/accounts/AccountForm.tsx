"use client";

import { useActionState, useEffect } from "react";
import { saveAccountAction } from "@/app/actions/accounts";
import { InlineError } from "@/components/feedback/InlineError";
import { LoadingButton } from "@/components/feedback/LoadingButton";
import { accountTypeLabels } from "@/features/accounts/account-labels";
import type { Account, AccountType } from "@/types/domain";

const accountTypes = Object.keys(accountTypeLabels) as AccountType[];

export function AccountForm({
  account,
  onSaved,
}: {
  account?: Account;
  onSaved?: (message?: string) => void;
}) {
  const [state, action, pending] = useActionState(saveAccountAction, { ok: false });

  useEffect(() => {
    if (state.ok) onSaved?.(state.message);
  }, [onSaved, state.ok, state.message]);

  return (
    <form action={action} className="rounded-[16px] border border-border bg-surface p-4">
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      <div className="grid gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">ชื่อบัญชี</span>
          <input name="name" defaultValue={account?.name ?? ""} className="min-h-11 w-full rounded-[16px] border border-border px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">สถาบัน</span>
          <input
            name="institutionName"
            defaultValue={account?.institutionName ?? ""}
            className="min-h-11 w-full rounded-[16px] border border-border px-3"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">ประเภท</span>
            <select
              name="accountType"
              defaultValue={account?.accountType ?? "bank_account"}
              className="min-h-11 w-full rounded-[16px] border border-border px-3"
            >
              {accountTypes.map((type) => (
                <option key={type} value={type}>
                  {accountTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">เลขท้าย 4 หลัก</span>
            <input
              name="lastFour"
              inputMode="numeric"
              maxLength={4}
              defaultValue={account?.lastFour ?? ""}
              className="min-h-11 w-full rounded-[16px] border border-border px-3"
            />
          </label>
        </div>
        <input type="hidden" name="currency" value="THB" />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input name="isOwnedByUser" type="checkbox" defaultChecked={account?.isOwnedByUser ?? true} />
          บัญชีนี้เป็นของฉัน
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input name="isDefault" type="checkbox" defaultChecked={account?.isDefault ?? false} />
          ตั้งเป็นบัญชีหลัก
        </label>
        <input type="hidden" name="isActive" value={account?.isActive === false ? "off" : "on"} />
        <label className="space-y-1 text-sm">
          <span className="font-medium">โน้ต</span>
          <textarea
            name="notes"
            defaultValue={account?.notes ?? ""}
            className="min-h-24 w-full rounded-[16px] border border-border px-3 py-2"
          />
        </label>
      </div>
      <div className="mt-3">
        <InlineError message={state.ok ? undefined : state.message} />
      </div>
      <LoadingButton pending={pending} className="mt-4 w-full">
        {account ? "บันทึกการแก้ไข" : "เพิ่มบัญชี"}
      </LoadingButton>
    </form>
  );
}
