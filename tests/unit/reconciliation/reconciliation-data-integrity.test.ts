import { describe, expect, it } from "vitest";
import { confidenceTierFromScore, HIGH_CONFIDENCE_SCORE, LOW_CONFIDENCE_SCORE, MEDIUM_CONFIDENCE_SCORE } from "@/lib/reconciliation/reconciliation-confidence";
import { generateOwnAccountTransferCandidates } from "@/lib/reconciliation/own-account-transfer";
import { generatePossibleDuplicateCandidates } from "@/lib/reconciliation/possible-duplicate";
import { generateLikelyDebtPaymentCandidates } from "@/lib/reconciliation/likely-debt-payment";
import { generatePossibleRefundCandidates } from "@/lib/reconciliation/possible-refund";
import { USER_ID, debt, resetReconciliationFixtureIds, tx } from "./fixtures";
import { beforeEach } from "vitest";

describe("confidenceTierFromScore data integrity", () => {
  it("never returns high/medium/low for NaN or Infinity -- always unknown", () => {
    expect(confidenceTierFromScore(NaN)).toBe("unknown");
    expect(confidenceTierFromScore(Infinity)).toBe("unknown");
    expect(confidenceTierFromScore(-Infinity)).toBe("unknown");
  });

  it("treats negative zero the same as zero (below the low floor)", () => {
    expect(confidenceTierFromScore(-0)).toBe("unknown");
  });

  it("respects the documented tier boundaries exactly", () => {
    expect(confidenceTierFromScore(HIGH_CONFIDENCE_SCORE)).toBe("high");
    expect(confidenceTierFromScore(HIGH_CONFIDENCE_SCORE - 1)).toBe("medium");
    expect(confidenceTierFromScore(MEDIUM_CONFIDENCE_SCORE)).toBe("medium");
    expect(confidenceTierFromScore(MEDIUM_CONFIDENCE_SCORE - 1)).toBe("low");
    expect(confidenceTierFromScore(LOW_CONFIDENCE_SCORE)).toBe("low");
    expect(confidenceTierFromScore(LOW_CONFIDENCE_SCORE - 1)).toBe("unknown");
  });
});

describe("candidate payload bounds and stability", () => {
  beforeEach(() => resetReconciliationFixtureIds());

  function allGeneratedCandidates() {
    const out = tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00", merchant: "Kasikorn Credit Card", referenceNumber: "REF-1" });
    const inc = tx({ type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:01:00+07:00", referenceNumber: "REF-1" });
    const refundExpense = tx({ type: "expense", amountSatang: 40_000, merchant: "Lazada", occurredAt: "2026-07-01T10:00:00+07:00" });
    const refund = tx({ type: "refund", amountSatang: 40_000, merchant: "Lazada", occurredAt: "2026-07-03T10:00:00+07:00" });
    const debtExpense = tx({ type: "expense", amountSatang: 50_000, merchant: "Kasikorn Credit Card", occurredAt: "2026-07-20T09:00:00+07:00" });
    const theDebt = debt({ name: "Kasikorn Credit Card", minimumPaymentSatang: 50_000 });
    const transactions = [out, inc, refundExpense, refund, debtExpense];

    return [
      ...generateOwnAccountTransferCandidates(USER_ID, transactions),
      ...generatePossibleDuplicateCandidates(USER_ID, transactions),
      ...generateLikelyDebtPaymentCandidates(USER_ID, transactions, [theDebt]),
      ...generatePossibleRefundCandidates(USER_ID, transactions),
    ];
  }

  it("never persists a non-finite or negative-zero amount in evidence snapshots", () => {
    for (const candidate of allGeneratedCandidates()) {
      for (const snapshot of candidate.evidenceSnapshots) {
        expect(Number.isFinite(snapshot.amountSatang)).toBe(true);
        expect(Object.is(snapshot.amountSatang, -0)).toBe(false);
      }
    }
  });

  it("never embeds raw image/base64/credential-shaped data in evidence or snapshots", () => {
    for (const candidate of allGeneratedCandidates()) {
      const serialized = JSON.stringify({ evidence: candidate.evidence, snapshots: candidate.evidenceSnapshots });
      expect(serialized).not.toMatch(/data:image\//);
      expect(serialized.length).toBeLessThan(5_000); // bounded payload -- no raw document content
      expect(serialized).not.toMatch(/base64|service_role|supabase_url|postgres:\/\//i);
    }
  });

  it("every candidate has at least one stable, recognized reason code", () => {
    for (const candidate of allGeneratedCandidates()) {
      expect(candidate.evidence.length).toBeGreaterThan(0);
      for (const item of candidate.evidence) {
        expect(typeof item.reasonCode).toBe("string");
      }
    }
  });
});
