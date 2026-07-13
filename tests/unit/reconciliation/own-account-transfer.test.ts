import { describe, expect, it, beforeEach } from "vitest";
import { generateOwnAccountTransferCandidates } from "@/lib/reconciliation/own-account-transfer";
import { OTHER_USER_ID, USER_ID, resetReconciliationFixtureIds, tx } from "./fixtures";

describe("generateOwnAccountTransferCandidates", () => {
  beforeEach(() => resetReconciliationFixtureIds());

  it("matches exact amount, opposite direction, close timestamp", () => {
    const out = tx({ type: "expense", amountSatang: 200_000, occurredAt: "2026-07-10T10:00:00+07:00" });
    const inc = tx({ type: "income", amountSatang: 200_000, occurredAt: "2026-07-10T10:05:00+07:00" });

    const candidates = generateOwnAccountTransferCandidates(USER_ID, [out, inc]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].candidateType).toBe("own_account_transfer");
    expect(candidates[0].sourceTransactionIds).toContain(out.id);
    expect(candidates[0].sourceTransactionIds).toContain(inc.id);
    expect(candidates[0].evidence.map((e) => e.reasonCode)).toEqual(
      expect.arrayContaining(["opposite_direction", "amount_exact_match", "timestamp_within_window"]),
    );
  });

  it("sender and receiver account hints strengthen the match to high confidence", () => {
    const out = tx({
      type: "expense",
      amountSatang: 150_000,
      occurredAt: "2026-07-10T10:00:00+07:00",
      destinationAccountLastFour: "9911",
      referenceNumber: "REF-1",
    });
    const inc = tx({
      type: "income",
      amountSatang: 150_000,
      occurredAt: "2026-07-10T10:02:00+07:00",
      accountLastFour: "9911",
      referenceNumber: "REF-1",
    });

    const [candidate] = generateOwnAccountTransferCandidates(USER_ID, [out, inc]);

    expect(candidate.confidence).toBe("high");
    expect(candidate.evidence.map((e) => e.reasonCode)).toEqual(
      expect.arrayContaining(["account_hint_match", "reference_match"]),
    );
  });

  it("same amount but unrelated parties never reaches more than low confidence", () => {
    const out = tx({ type: "expense", amountSatang: 75_000, occurredAt: "2026-07-10T09:00:00+07:00" });
    const inc = tx({ type: "income", amountSatang: 75_000, occurredAt: "2026-07-10T09:30:00+07:00" });

    const [candidate] = generateOwnAccountTransferCandidates(USER_ID, [out, inc]);

    expect(candidate.confidence).toBe("low");
  });

  it("rejects a same-direction pair (no candidate at all)", () => {
    const a = tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00" });
    const b = tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:02:00+07:00" });

    expect(generateOwnAccountTransferCandidates(USER_ID, [a, b])).toHaveLength(0);
  });

  it("rejects a self-match even if the same id appears in both direction buckets (defensive)", () => {
    const sharedId = "duplicate-read-id";
    const asExpense = tx({ id: sharedId, type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00" });
    const asIncome = tx({ id: sharedId, type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00" });

    expect(generateOwnAccountTransferCandidates(USER_ID, [asExpense, asIncome])).toHaveLength(0);
  });

  it("rejects when the time window is exceeded", () => {
    const out = tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T00:00:00+07:00" });
    const inc = tx({ type: "income", amountSatang: 100_000, occurredAt: "2026-07-12T00:00:00+07:00" });

    expect(generateOwnAccountTransferCandidates(USER_ID, [out, inc], { windowMinutes: 60 })).toHaveLength(0);
  });

  it("rejects when the amount mismatches outside tolerance", () => {
    const out = tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00" });
    const inc = tx({ type: "income", amountSatang: 100_500, occurredAt: "2026-07-10T10:01:00+07:00" });

    expect(generateOwnAccountTransferCandidates(USER_ID, [out, inc])).toHaveLength(0);
  });

  it("flags multiple potential matches as ambiguous and caps confidence low", () => {
    const out = tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00" });
    const incA = tx({ type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:01:00+07:00" });
    const incB = tx({ type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:02:00+07:00" });

    const candidates = generateOwnAccountTransferCandidates(USER_ID, [out, incA, incB]);

    expect(candidates).toHaveLength(2);
    for (const candidate of candidates) {
      expect(candidate.confidence).toBe("low");
      expect(candidate.evidence.map((e) => e.reasonCode)).toContain("multiple_possible_matches");
    }
  });

  it("is idempotent across repeated scans of the same input", () => {
    const out = tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00" });
    const inc = tx({ type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:01:00+07:00" });

    const first = generateOwnAccountTransferCandidates(USER_ID, [out, inc]);
    const second = generateOwnAccountTransferCandidates(USER_ID, [out, inc]);

    expect(second).toEqual(first);
  });

  it("produces the same sourceTransactionIds regardless of input order (reversed source-id order)", () => {
    const out = tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00" });
    const inc = tx({ type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:01:00+07:00" });

    const forward = generateOwnAccountTransferCandidates(USER_ID, [out, inc]);
    const reversed = generateOwnAccountTransferCandidates(USER_ID, [inc, out]);

    expect(reversed[0].sourceTransactionIds).toEqual(forward[0].sourceTransactionIds);
  });

  it("makes a cross-user candidate impossible", () => {
    const out = tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00" });
    const inc = tx({ userId: OTHER_USER_ID, type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:01:00+07:00" });

    expect(generateOwnAccountTransferCandidates(USER_ID, [out, inc])).toHaveLength(0);
  });
});
