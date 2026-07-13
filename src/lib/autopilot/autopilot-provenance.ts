/**
 * Category provenance -- Part G, "Manual correction priority". Manual
 * user decisions always win: no automated writer (autopilot executor,
 * reprocessing, learned rules) may ever overwrite a transaction whose
 * category_source is already "manual" or "user_correction". This module
 * is the single write path for `transactions.category_source` /
 * `category_confidence`, so that guarantee lives in exactly one place.
 */

import { isMockAuthEnabled } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMockState } from "@/lib/data/mock-store";
import type { CategorySource } from "./autopilot-types";

const PROTECTED_SOURCES: readonly CategorySource[] = ["manual", "user_correction"];

export type SetCategoryProvenanceResult = {
  applied: boolean;
  /** Present (and applied=false) when a protected manual category blocked the write. */
  reason?: "protected_manual_category" | "not_found";
};

/**
 * Sets category provenance for a transaction, refusing silently-but-
 * visibly (via the returned result, never a thrown error for this
 * expected case) if the transaction's current category_source is
 * protected. Callers that need to know whether the write actually
 * happened must check `.applied`.
 */
export async function setTransactionCategoryProvenance(
  userId: string,
  transactionId: string,
  source: CategorySource,
  confidence: number | undefined,
): Promise<SetCategoryProvenanceResult> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.transactions.findIndex((transaction) => transaction.id === transactionId && transaction.userId === userId);
    if (index < 0) return { applied: false, reason: "not_found" };
    const current = state.transactions[index].categorySource as CategorySource | undefined;
    if (current && PROTECTED_SOURCES.includes(current) && source !== current) {
      return { applied: false, reason: "protected_manual_category" };
    }
    state.transactions[index] = {
      ...state.transactions[index],
      categorySource: source,
      categoryConfidence: confidence,
    };
    return { applied: true };
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing, error: fetchError } = await supabase
    .from("transactions")
    .select("category_source")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) return { applied: false, reason: "not_found" };

  const current = existing.category_source as CategorySource | null;
  if (current && PROTECTED_SOURCES.includes(current) && source !== current) {
    return { applied: false, reason: "protected_manual_category" };
  }

  const { error } = await supabase
    .from("transactions")
    .update({ category_source: source, category_confidence: confidence ?? null })
    .eq("id", transactionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { applied: true };
}

/** True if this category may be safely re-categorized by an automated writer (i.e. not protected). */
export function isCategoryProvenanceProtected(source: CategorySource | undefined | null): boolean {
  return Boolean(source && PROTECTED_SOURCES.includes(source));
}
