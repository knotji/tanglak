import { accountTypeLabels } from "@/features/accounts/account-labels";
import type { AccountType } from "@/types/domain";

export function AccountTypeBadge({ type = "other" }: { type?: AccountType }) {
  return (
    <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-primary">
      {accountTypeLabels[type]}
    </span>
  );
}
