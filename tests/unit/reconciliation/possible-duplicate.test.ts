import { describe, expect, it, beforeEach } from "vitest";
import { generateOwnAccountTransferCandidates } from "@/lib/reconciliation/own-account-transfer";
import { generatePossibleDuplicateCandidates } from "@/lib/reconciliation/possible-duplicate";
import { OTHER_USER_ID, USER_ID, resetReconciliationFixtureIds, tx } from "./fixtures";

describe("generatePossibleDuplicateCandidates", () => {
  beforeEach(() => resetReconciliationFixtureIds());

  it("flags an exact duplicate (amount + merchant + reference + close time) as high confidence", () => {
    const a = tx({
      amountSatang: 120_000,
      merchant: "7-Eleven",
      referenceNumber: "REF-EXACT",
      occurredAt: "2026-07-10T10:00:00+07:00",
      source: "receipt",
    });
    const b = tx({
      amountSatang: 120_000,
      merchant: "7-Eleven",
      referenceNumber: "REF-EXACT",
      occurredAt: "2026-07-10T10:03:00+07:00",
      source: "manual",
    });

    const [candidate] = generatePossibleDuplicateCandidates(USER_ID, [a, b]);

    expect(candidate.confidence).toBe("high");
    expect(candidate.evidence.map((e) => e.reasonCode)).toEqual(expect.arrayContaining(["reference_match", "amount_exact_match"]));
  });

  it("flags same document id as strong evidence", () => {
    const a = tx({ amountSatang: 50_000, documentId: "doc-1", occurredAt: "2026-07-10T10:00:00+07:00" });
    const b = tx({ amountSatang: 50_000, documentId: "doc-1", occurredAt: "2026-07-11T10:00:00+07:00" });

    const [candidate] = generatePossibleDuplicateCandidates(USER_ID, [a, b]);

    expect(candidate.evidence.map((e) => e.reasonCode)).toContain("same_document_id");
    expect(candidate.confidence).toBe("high");
  });

  it("flags same reference number as strong evidence", () => {
    const a = tx({ amountSatang: 60_000, referenceNumber: "REF-9", occurredAt: "2026-07-10T10:00:00+07:00" });
    const b = tx({ amountSatang: 60_000, referenceNumber: "REF-9", occurredAt: "2026-07-14T10:00:00+07:00" });

    const [candidate] = generatePossibleDuplicateCandidates(USER_ID, [a, b]);

    expect(candidate.evidence.map((e) => e.reasonCode)).toContain("reference_match");
  });

  it("flags a slip-vs-manual duplicate with different_import_source evidence", () => {
    const slip = tx({ amountSatang: 45_000, merchant: "Grab", source: "receipt", occurredAt: "2026-07-10T10:00:00+07:00" });
    const manual = tx({ amountSatang: 45_000, merchant: "Grab", source: "manual", occurredAt: "2026-07-10T10:04:00+07:00" });

    const [candidate] = generatePossibleDuplicateCandidates(USER_ID, [slip, manual]);

    expect(candidate.evidence.map((e) => e.reasonCode)).toContain("different_import_source");
  });

  it("flags a slip-vs-csv duplicate", () => {
    const slip = tx({ amountSatang: 45_000, merchant: "Grab", source: "receipt", occurredAt: "2026-07-10T10:00:00+07:00" });
    const csv = tx({ amountSatang: 45_000, merchant: "Grab", source: "history_import", occurredAt: "2026-07-10T10:04:00+07:00" });

    const [candidate] = generatePossibleDuplicateCandidates(USER_ID, [slip, csv]);

    expect(candidate.evidence.map((e) => e.reasonCode)).toContain("different_import_source");
  });

  it("flags a manual-vs-csv duplicate", () => {
    const manual = tx({ amountSatang: 45_000, merchant: "Grab", source: "manual", occurredAt: "2026-07-10T10:00:00+07:00" });
    const csv = tx({ amountSatang: 45_000, merchant: "Grab", source: "history_import", occurredAt: "2026-07-10T10:04:00+07:00" });

    const [candidate] = generatePossibleDuplicateCandidates(USER_ID, [manual, csv]);

    expect(candidate.evidence.map((e) => e.reasonCode)).toContain("different_import_source");
  });

  it("still flags (at low/medium confidence, never destroying the second row) a same-amount-and-time pair that is a legitimate separate purchase", () => {
    const first = tx({ amountSatang: 30_000, merchant: "Coffee Shop A", occurredAt: "2026-07-10T08:00:00+07:00" });
    const second = tx({ amountSatang: 30_000, merchant: "Coffee Shop B", occurredAt: "2026-07-10T08:05:00+07:00" });

    const candidates = generatePossibleDuplicateCandidates(USER_ID, [first, second]);

    expect(candidates).toHaveLength(1);
    expect(["low", "medium"]).toContain(candidates[0].confidence);
    // Both source rows remain independently referenced -- nothing about
    // this candidate implies either was deleted or merged.
    expect(candidates[0].sourceTransactionIds).toHaveLength(2);
  });

  it("scores same merchant and amount on different days lower than a same-day match", () => {
    const sameDay = [
      tx({ amountSatang: 40_000, merchant: "Big C", occurredAt: "2026-07-10T08:00:00+07:00" }),
      tx({ amountSatang: 40_000, merchant: "Big C", occurredAt: "2026-07-10T08:05:00+07:00" }),
    ];
    const differentDay = [
      tx({ amountSatang: 40_000, merchant: "Big C", occurredAt: "2026-07-01T08:00:00+07:00" }),
      tx({ amountSatang: 40_000, merchant: "Big C", occurredAt: "2026-07-20T08:00:00+07:00" }),
    ];

    const [sameDayCandidate] = generatePossibleDuplicateCandidates(USER_ID, sameDay);
    const [differentDayCandidate] = generatePossibleDuplicateCandidates(USER_ID, differentDay);

    expect(differentDayCandidate.evidence.map((e) => e.reasonCode)).not.toContain("same_bangkok_day");
    expect(sameDayCandidate.evidence.map((e) => e.reasonCode)).toContain("same_bangkok_day");
  });

  it("treats an ambiguous duplicate (weak signal) as low confidence, not exact", () => {
    const a = tx({ amountSatang: 88_000, occurredAt: "2026-07-01T08:00:00+07:00" });
    const b = tx({ amountSatang: 88_000, occurredAt: "2026-07-25T20:00:00+07:00" });

    const [candidate] = generatePossibleDuplicateCandidates(USER_ID, [a, b]);

    expect(candidate.confidence).not.toBe("high");
  });

  it("uses the Bangkok calendar day, not a naive UTC slice, at the local midnight boundary", () => {
    // 2026-07-09T18:00:00Z is 2026-07-10T01:00:00+07:00 -- same Bangkok day
    // as 2026-07-10T04:00:00+07:00, even though their UTC date differs.
    const a = tx({ amountSatang: 55_000, occurredAt: "2026-07-09T18:00:00Z" });
    const b = tx({ amountSatang: 55_000, occurredAt: "2026-07-10T04:00:00+07:00" });

    const [candidate] = generatePossibleDuplicateCandidates(USER_ID, [a, b]);

    expect(candidate.evidence.map((e) => e.reasonCode)).toContain("same_bangkok_day");
  });

  it("is stable across a repeated import retry (same input, same output)", () => {
    const a = tx({ amountSatang: 20_000, referenceNumber: "REF-RETRY", occurredAt: "2026-07-10T10:00:00+07:00" });
    const b = tx({ amountSatang: 20_000, referenceNumber: "REF-RETRY", occurredAt: "2026-07-10T10:00:00+07:00" });

    const first = generatePossibleDuplicateCandidates(USER_ID, [a, b]);
    const second = generatePossibleDuplicateCandidates(USER_ID, [a, b]);

    expect(second).toEqual(first);
  });

  it("keeps different users' transactions isolated", () => {
    const a = tx({ amountSatang: 20_000, referenceNumber: "REF-SAME", occurredAt: "2026-07-10T10:00:00+07:00" });
    const b = tx({
      userId: OTHER_USER_ID,
      amountSatang: 20_000,
      referenceNumber: "REF-SAME",
      occurredAt: "2026-07-10T10:00:00+07:00",
    });

    expect(generatePossibleDuplicateCandidates(USER_ID, [a, b])).toHaveLength(0);
  });

  it("does not emit possible_duplicate for an expense + income same movement", () => {
    const out = tx({
      type: "expense",
      amountSatang: 100_000,
      occurredAt: "2026-07-10T10:00:00+07:00",
      referenceNumber: "TRANSFER-1",
      source: "transfer_slip",
    });
    const inc = tx({
      type: "income",
      amountSatang: 100_000,
      occurredAt: "2026-07-10T10:02:00+07:00",
      referenceNumber: "TRANSFER-1",
    });

    expect(generatePossibleDuplicateCandidates(USER_ID, [out, inc])).toHaveLength(0);
  });

  it("still lets the own-account-transfer engine produce the expense + income candidate", () => {
    const out = tx({
      type: "expense",
      amountSatang: 100_000,
      occurredAt: "2026-07-10T10:00:00+07:00",
      referenceNumber: "TRANSFER-2",
      source: "transfer_slip",
    });
    const inc = tx({
      type: "income",
      amountSatang: 100_000,
      occurredAt: "2026-07-10T10:02:00+07:00",
      referenceNumber: "TRANSFER-2",
    });

    const [candidate] = generateOwnAccountTransferCandidates(USER_ID, [out, inc]);

    expect(candidate.candidateType).toBe("own_account_transfer");
    expect(candidate.sourceTransactionIds).toEqual(expect.arrayContaining([out.id, inc.id]));
  });

  it("keeps expense + expense duplicate detection intact", () => {
    const first = tx({
      type: "expense",
      amountSatang: 45_000,
      merchant: "Grab",
      referenceNumber: "EXP-DUP",
      occurredAt: "2026-07-10T10:00:00+07:00",
    });
    const second = tx({
      type: "expense",
      amountSatang: 45_000,
      merchant: "Grab",
      referenceNumber: "EXP-DUP",
      occurredAt: "2026-07-10T10:02:00+07:00",
    });

    const [candidate] = generatePossibleDuplicateCandidates(USER_ID, [first, second]);

    expect(candidate.candidateType).toBe("possible_duplicate");
    expect(candidate.evidence.map((e) => e.reasonCode)).toContain("reference_match");
  });

  it("keeps income + income duplicate detection intact", () => {
    const first = tx({
      type: "income",
      amountSatang: 75_000,
      merchant: "Payroll",
      referenceNumber: "INC-DUP",
      occurredAt: "2026-07-10T10:00:00+07:00",
    });
    const second = tx({
      type: "income",
      amountSatang: 75_000,
      merchant: "Payroll",
      referenceNumber: "INC-DUP",
      occurredAt: "2026-07-10T10:02:00+07:00",
    });

    const [candidate] = generatePossibleDuplicateCandidates(USER_ID, [first, second]);

    expect(candidate.candidateType).toBe("possible_duplicate");
    expect(candidate.evidence.map((e) => e.reasonCode)).toContain("reference_match");
  });

  it("does not emit possible_duplicate for unrelated opposite-direction transactions", () => {
    const expense = tx({
      type: "expense",
      amountSatang: 20_000,
      merchant: "Coffee",
      occurredAt: "2026-07-10T10:00:00+07:00",
    });
    const income = tx({
      type: "income",
      amountSatang: 99_000,
      merchant: "Refund from friend",
      occurredAt: "2026-07-10T10:02:00+07:00",
    });

    expect(generatePossibleDuplicateCandidates(USER_ID, [expense, income])).toHaveLength(0);
  });
});
