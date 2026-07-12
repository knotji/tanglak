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

import { ALL_CATEGORIES, getCategoryById, DEFAULT_EXPENSE_CATEGORY_ID, type CategoryDefinition } from "./categories";

export type MerchantRuleMatch = {
  category: CategoryDefinition;
  matchedHint: string;
};

function normalize(text: string): string {
  return text.trim().toLowerCase();
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
