import { describe, expect, it } from "vitest";
import {
  buildDeterministicReconciliationExplanation,
  buildReconciliationEvidenceSummary,
  reconciliationReasonCodeText,
} from "@/lib/reconciliation/reconciliation-explanations";
import type { ReconciliationReasonCode } from "@/lib/reconciliation/reconciliation-types";

const ALL_REASON_CODES: ReconciliationReasonCode[] = [
  "amount_exact_match",
  "reference_match",
  "merchant_similar",
  "merchant_exact_match",
  "same_document_id",
  "distinct_source_records",
  "timestamp_within_window",
  "insufficient_evidence",
  "multiple_possible_matches",
  "opposite_direction",
  "self_match_rejected",
  "cross_user_rejected",
  "account_hint_match",
  "transfer_like_source",
  "same_import_source",
  "different_import_source",
  "same_bangkok_day",
  "explicit_debt_destination",
  "due_date_proximity",
  "multiple_debt_matches",
  "partial_refund_amount",
  "multiple_earlier_expenses",
];

describe("reconciliationReasonCodeText", () => {
  it("has non-empty stable Thai copy for every reason code", () => {
    for (const code of ALL_REASON_CODES) {
      const text = reconciliationReasonCodeText(code);
      expect(text.length).toBeGreaterThan(0);
      expect(reconciliationReasonCodeText(code)).toBe(text); // stable for stable input
    }
  });

  it("never contains raw prose markers (no ellipsis-style chain-of-thought, no credentials-like tokens)", () => {
    for (const code of ALL_REASON_CODES) {
      const text = reconciliationReasonCodeText(code);
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toMatch(/sk-|service_role|postgres:\/\//i);
    }
  });
});

describe("buildReconciliationEvidenceSummary", () => {
  it("returns empty string for no evidence", () => {
    expect(buildReconciliationEvidenceSummary([])).toBe("");
  });

  it("joins reason code text deterministically", () => {
    const summary = buildReconciliationEvidenceSummary([{ reasonCode: "amount_exact_match" }, { reasonCode: "reference_match" }]);
    expect(summary).toBe(`${reconciliationReasonCodeText("amount_exact_match")} · ${reconciliationReasonCodeText("reference_match")}`);
  });
});

describe("buildDeterministicReconciliationExplanation", () => {
  it("never claims execution happened for auto_match_safe (PR A never executes)", () => {
    const text = buildDeterministicReconciliationExplanation({
      candidateType: "own_account_transfer",
      policyOutcome: "auto_match_safe",
      evidence: [],
    });
    expect(text).not.toMatch(/บันทึกแล้ว|สำเร็จ/);
  });

  it("is stable for stable input", () => {
    const context = {
      candidateType: "possible_duplicate" as const,
      policyOutcome: "require_confirmation" as const,
      evidence: [{ reasonCode: "amount_exact_match" as const }],
    };
    expect(buildDeterministicReconciliationExplanation(context)).toBe(buildDeterministicReconciliationExplanation(context));
  });

  it("produces distinct copy for reject_candidate driven by the primary reason code", () => {
    const text = buildDeterministicReconciliationExplanation({
      candidateType: "own_account_transfer",
      policyOutcome: "reject_candidate",
      evidence: [{ reasonCode: "self_match_rejected" }],
    });
    expect(text).toBe(reconciliationReasonCodeText("self_match_rejected"));
  });
});
