import type { Transaction } from "@/types/domain";
import { normalizeMerchant, type LearnedCategoryMatch } from "./category-fallback";
import { isCategoryProvenanceProtected } from "@/lib/autopilot/autopilot-provenance";

export function resolveLearnedCategoryForMerchant(
  transactions: Transaction[],
  merchantName: string | undefined | null
): LearnedCategoryMatch | null {
  const normMerchant = merchantName ? normalizeMerchant(merchantName) : null;
  if (!normMerchant) return null;

  // Filter eligible transactions:
  // - status === "confirmed"
  // - categorySource in ["manual", "user_correction"] (protected provenance sources)
  // - merchant matches the normalized name
  // - has valid, non-empty category
  const eligibleTransactions = transactions.filter((tx) => {
    if (tx.status !== "confirmed") return false;

    // We only learn from manual or user_correction category sources.
    const source = tx.categorySource;
    if (source !== "manual" && source !== "user_correction") return false;
    if (!isCategoryProvenanceProtected(source)) return false;

    if (!tx.merchant) return false;
    if (normalizeMerchant(tx.merchant) !== normMerchant) return false;

    if (!tx.category) return false;
    const normCat = tx.category.trim();
    if (!normCat) return false;

    return true;
  });

  const eligibleCount = eligibleTransactions.length;
  if (eligibleCount === 0) return null;

  // Group by normalized category label to consolidate duplicates
  const groups = new Map<
    string,
    {
      displayLabel: string;
      count: number;
      latestOccurredAt: string;
      firstIndex: number;
    }
  >();

  for (let i = 0; i < eligibleTransactions.length; i++) {
    const tx = eligibleTransactions[i];
    const catLabel = tx.category!;
    const normCat = catLabel.trim().toLowerCase();
    const occurredAt = tx.occurredAt || "";

    const existing = groups.get(normCat);
    if (existing) {
      existing.count += 1;
      if (occurredAt.localeCompare(existing.latestOccurredAt) > 0) {
        existing.latestOccurredAt = occurredAt;
      }
    } else {
      groups.set(normCat, {
        displayLabel: catLabel.trim(),
        count: 1,
        latestOccurredAt: occurredAt,
        firstIndex: i,
      });
    }
  }

  // Find the best category group based on:
  // 1. highest count (supportCount)
  // 2. latestOccurredAt
  // 3. original array index (firstIndex) for stable deterministic tie-breaking
  let bestGroup: {
    displayLabel: string;
    count: number;
    latestOccurredAt: string;
    firstIndex: number;
  } | null = null;

  for (const group of groups.values()) {
    if (!bestGroup) {
      bestGroup = group;
      continue;
    }

    if (group.count > bestGroup.count) {
      bestGroup = group;
    } else if (group.count === bestGroup.count) {
      const timeCompare = group.latestOccurredAt.localeCompare(bestGroup.latestOccurredAt);
      if (timeCompare > 0) {
        bestGroup = group;
      } else if (timeCompare === 0) {
        if (group.firstIndex < bestGroup.firstIndex) {
          bestGroup = group;
        }
      }
    }
  }

  if (!bestGroup) return null;

  const agreementRatio = bestGroup.count / eligibleCount;

  return {
    categoryLabel: bestGroup.displayLabel,
    supportCount: bestGroup.count,
    eligibleTransactionCount: eligibleCount,
    agreementRatio,
    latestOccurredAt: bestGroup.latestOccurredAt || null,
  };
}

export function computeLearnedCategoryConfidence(
  match: LearnedCategoryMatch
): "high" | "medium" | "low" {
  // Conservative thresholds:
  // - High: supportCount >= 3, agreementRatio >= 0.75
  // - Medium: supportCount >= 2, agreementRatio >= 0.5
  // - Low: otherwise
  if (match.supportCount >= 3 && match.agreementRatio >= 0.75) {
    return "high";
  }
  if (match.supportCount >= 2 && match.agreementRatio >= 0.5) {
    return "medium";
  }
  return "low";
}
