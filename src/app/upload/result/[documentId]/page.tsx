import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getTransactionById } from "@/lib/data/finance-repository";
import { findAutopilotActionByEntity } from "@/lib/autopilot/autopilot-audit";
import { AutopilotResultClient } from "./AutopilotResultClient";

export default async function AutopilotResultPage({
  searchParams,
}: {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ tx?: string }>;
}) {
  const user = await requireUser();
  const { tx } = await searchParams;
  if (!tx) {
    redirect("/transactions");
  }

  const transaction = await getTransactionById(user.id, tx);
  if (!transaction) {
    redirect("/transactions");
  }

  const auditRecord = await findAutopilotActionByEntity(user.id, "transaction", tx);

  return <AutopilotResultClient transaction={transaction} auditRecord={auditRecord} />;
}
