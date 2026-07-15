/**
 * Deterministic merchant/keyword fallback categorization -- used whenever
 * AI categorization is unavailable, times out, returns an invalid schema,
 * or the request quota is exceeded, and by import adapters that never call
 * AI at all (plain CSV/statement parsing). Centralizes the merchant-hint
 * rules declared on each category in categories.ts into one maintainable,
 * unit-tested layer, replacing the ad-hoc keyword checks that used to live
 * separately inside individual import adapters.
 *
 * Priority (see Part D of the category system spec): explicit user
 * selection and prior user corrections always outrank this layer -- this
 * module has no knowledge of either and must only be consulted when
 * neither applies. Within this module: the most specific (longest)
 * matching merchant hint wins, so a compound hint like "grabfood" (food)
 * correctly outranks the shorter, unrelated "grab" (transport) hint that
 * would otherwise also match as a substring.
 */

import { ALL_CATEGORIES, getCategoryById, getCategoryByLabel, resolveCategoryFromLegacyLabel, DEFAULT_EXPENSE_CATEGORY_ID, type CategoryDefinition } from "./categories";

export type LearnedCategoryMatch = {
  categoryLabel: string;
  supportCount: number;
  eligibleTransactionCount: number;
  agreementRatio: number;
  latestOccurredAt: string | null;
};

export type MerchantRuleMatch = {
  category: CategoryDefinition;
  matchedHint: string;
};

export function normalizeMerchant(text: string): string {
  return text.trim().toLowerCase();
}

function normalize(text: string): string {
  return normalizeMerchant(text);
}

/**
 * Matches merchant name / description text against every category's
 * `merchantHints` (case-insensitive substring match). Returns the
 * longest-matching hint's category, or undefined if nothing matches --
 * callers decide the safe fallback (typically DEFAULT_EXPENSE_CATEGORY_ID),
 * never guessing a specific category with no signal.
 *
 * Only the input text is trimmed; hints are only lowercased, never
 * trimmed -- a hint's leading/trailing whitespace can be intentional
 * (disambiguating a short abbreviation from matching inside an unrelated
 * word), and trimming it would silently defeat that.
 */
export function categorizeByMerchantRule(text: string | undefined | null): MerchantRuleMatch | undefined {
  if (!text) return undefined;
  const normalized = normalize(text);
  if (!normalized) return undefined;

  let best: MerchantRuleMatch | undefined;
  for (const category of ALL_CATEGORIES) {
    if (!category.merchantHints) continue;
    for (const hint of category.merchantHints) {
      if (normalized.includes(hint.toLowerCase()) && (!best || hint.length > best.matchedHint.length)) {
        best = { category, matchedHint: hint };
      }
    }
  }
  return best;
}

/**
 * Description-keyword rules for bank/credit-card statement rows, layered
 * on top of categorizeByMerchantRule -- these are financial-statement
 * vocabulary (fee/interest/payment wording), not merchant names, so they
 * live as a separate, explicit rule set rather than as merchantHints.
 * Order matters: fee and interest are checked before payment so a row like
 * "Late Payment Fee" is categorized as a fee, not misread as a generic
 * debt payment.
 */
export function categorizeStatementDescription(description: string | undefined | null): CategoryDefinition {
  const merchantMatch = categorizeByMerchantRule(description);
  if (merchantMatch) return merchantMatch.category;

  const normalized = description ? normalize(description) : "";
  if (normalized.includes("fee") || normalized.includes("ค่าธรรมเนียม")) {
    return getCategoryById("taxes_fees")!;
  }
  if (normalized.includes("interest") || normalized.includes("ดอกเบี้ย")) {
    return getCategoryById("debt")!;
  }

  return getCategoryById(DEFAULT_EXPENSE_CATEGORY_ID)!;
}

/**
 * Resolves a document-confirm write path's category label using merchant
 * text, falling back to an explicit default category id (chosen by the
 * caller based on document context, e.g. "food" for a delivery receipt)
 * when there's no merchant-hint signal. Used by the document confirm
 * actions (src/app/actions/documents.ts) in place of a single hardcoded
 * category string per document type.
 */
export function resolveExpenseCategoryLabel(
  merchant: string | undefined | null,
  fallbackCategoryId: string,
  learnedMatch?: LearnedCategoryMatch | null
): string {
  if (learnedMatch) {
    const canonical = getCategoryByLabel(learnedMatch.categoryLabel) ?? resolveCategoryFromLegacyLabel(learnedMatch.categoryLabel);
    if (canonical?.active) {
      return canonical.label;
    }
  }
  const merchantMatch = categorizeByMerchantRule(merchant);
  if (merchantMatch) return merchantMatch.category.label;
  return (getCategoryById(fallbackCategoryId) ?? getCategoryById(DEFAULT_EXPENSE_CATEGORY_ID)!).label;
}

export type ExtractedCategoryResolution = {
  category: CategoryDefinition;
  /** Where the final category came from -- for internal debugging/observability, per Part C. */
  source: "ai" | "rule" | "default" | "learned";
  learnedMatch?: LearnedCategoryMatch | null;
};

/**
 * Resolves the AI extraction's category suggestion into a guaranteed-valid
 * canonical category (Part C: "AI must select only from active catalog
 * entries. AI must never invent category IDs or labels"). This is the
 * actual enforcement point -- the AI schema's `categoryId` field is
 * intentionally unconstrained (see schemas.ts) so a hallucinated value
 * never fails validation for the whole document; this function is what
 * guarantees the id that finally gets used is real.
 *
 * Priority: a categoryId that matches an active catalog entry (the AI
 * result) > a merchant-hint deterministic match on merchant/description
 * text > the caller-supplied default category id.
 */
export function resolveExtractedCategory(input: {
  categoryId?: string;
  merchant?: string | null;
  description?: string | null;
  defaultCategoryId: string;
  learnedMatch?: LearnedCategoryMatch | null;
}): ExtractedCategoryResolution {
  if (input.learnedMatch) {
    const canonical = getCategoryByLabel(input.learnedMatch.categoryLabel) ?? resolveCategoryFromLegacyLabel(input.learnedMatch.categoryLabel);
    if (canonical?.active) {
      return { category: canonical, source: "learned", learnedMatch: input.learnedMatch };
    }
  }

  const aiCategory = input.categoryId ? getCategoryById(input.categoryId) : undefined;
  if (aiCategory?.active) {
    return { category: aiCategory, source: "ai" };
  }

  const merchantMatch = categorizeByMerchantRule(input.merchant) ?? categorizeByMerchantRule(input.description);
  if (merchantMatch) {
    return { category: merchantMatch.category, source: "rule" };
  }

  const fallback =
    getCategoryById(input.defaultCategoryId) ??
    getCategoryById(DEFAULT_EXPENSE_CATEGORY_ID)!;
  return { category: fallback, source: "default" };
}
