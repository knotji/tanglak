import { AccountsClient } from "@/features/accounts/AccountsClient";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/data/account-repository";

export default async function AccountsPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);
  const accounts = await listAccounts(user.id);
  return <AccountsClient accounts={accounts} />;
}
