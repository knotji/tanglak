import { maskLastFour } from "@/features/accounts/account-labels";
import type { Account } from "@/types/domain";

export function AccountSelector({
  accounts,
  name,
  defaultValue,
}: {
  accounts: Account[];
  name: string;
  defaultValue?: string;
}) {
  const activeAccounts = accounts.filter((account) => account.isActive !== false);
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className="min-h-11 w-full rounded-[16px] border border-border px-3">
      <option value="">ไม่ระบุบัญชี</option>
      {activeAccounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name} {account.lastFour ? `(${maskLastFour(account.lastFour)})` : ""}
        </option>
      ))}
    </select>
  );
}
