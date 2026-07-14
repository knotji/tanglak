/**
 * Shared, bounded transaction snapshot builder -- reused by every
 * matching engine so "what counts as reconciliation-relevant evidence"
 * is defined once. Deliberately narrow, mirroring
 * `AutopilotTransactionSnapshot` (src/lib/autopilot/autopilot-types.ts):
 * never a full row dump, never raw extraction output, never an
 * image/base64/credential.
 */

import type { Transaction } from "@/types/domain";
import type { ReconciliationTransactionSnapshot } from "./reconciliation-types";

export function buildReconciliationSnapshot(transaction: Transaction): ReconciliationTransactionSnapshot {
  return {
    type: transaction.type,
    amountSatang: transaction.amountSatang,
    occurredAt: transaction.occurredAt,
    merchant: transaction.merchant,
    category: transaction.category,
    updatedAt: transaction.updatedAt,
  };
}
