import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockState } from "@/lib/data/mock-store";
import {
  createReconciliationCandidate,
  findReconciliationCandidateByIdempotencyKey,
  invalidateReconciliationCandidate,
  listReconciliationCandidates,
  listReconciliationCandidatesByTransactionId,
} from "@/lib/reconciliation/reconciliation-candidates-repository";
import type { ReconciliationCandidateDraft } from "@/lib/reconciliation/reconciliation-types";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

const USER_ID = "repo-test-user";
const OTHER_USER_ID = "repo-test-other-user";

function draft(overrides: Partial<ReconciliationCandidateDraft> = {}): ReconciliationCandidateDraft {
  return {
    userId: USER_ID,
    candidateType: "own_account_transfer",
    sourceTransactionIds: ["tx-a", "tx-b"],
    evidence: [{ reasonCode: "opposite_direction" }],
    confidence: "medium",
    evidenceSnapshots: [
      { type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00" },
      { type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:01:00+07:00" },
    ],
    ...overrides,
  };
}

describe("reconciliation candidates repository", () => {
  beforeEach(() => {
    getMockState().reconciliationCandidates = [];
  });

  it("creates a new candidate row with a computed idempotency key", async () => {
    const { record, created } = await createReconciliationCandidate({
      draft: draft(),
      policyOutcome: "suggest_with_notice",
      requiresReview: true,
    });

    expect(created).toBe(true);
    expect(record.status).toBe("needs_review");
    expect(record.idempotencyKey).toHaveLength(64); // sha256 hex
  });

  it("is idempotent: creating the same draft twice returns the existing row, not a second insert", async () => {
    const input = { draft: draft(), policyOutcome: "suggest_with_notice" as const, requiresReview: true };

    const first = await createReconciliationCandidate(input);
    const second = await createReconciliationCandidate(input);

    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
    expect(getMockState().reconciliationCandidates).toHaveLength(1);
  });

  it("treats a reversed source-id-order draft as the same candidate (same idempotency key)", async () => {
    const forward = await createReconciliationCandidate({
      draft: draft({ sourceTransactionIds: ["tx-a", "tx-b"] }),
      policyOutcome: "suggest_with_notice",
      requiresReview: true,
    });
    const reversed = await createReconciliationCandidate({
      draft: draft({ sourceTransactionIds: ["tx-b", "tx-a"] }),
      policyOutcome: "suggest_with_notice",
      requiresReview: true,
    });

    expect(reversed.record.id).toBe(forward.record.id);
    expect(getMockState().reconciliationCandidates).toHaveLength(1);
  });

  it("keeps two different users' otherwise-identical candidates separate", async () => {
    await createReconciliationCandidate({ draft: draft({ userId: USER_ID }), policyOutcome: "suggest_with_notice", requiresReview: true });
    await createReconciliationCandidate({ draft: draft({ userId: OTHER_USER_ID }), policyOutcome: "suggest_with_notice", requiresReview: true });

    expect(getMockState().reconciliationCandidates).toHaveLength(2);
    expect(await listReconciliationCandidates(USER_ID)).toHaveLength(1);
    expect(await listReconciliationCandidates(OTHER_USER_ID)).toHaveLength(1);
  });

  it("finds a candidate by idempotency key", async () => {
    const { record } = await createReconciliationCandidate({ draft: draft(), policyOutcome: "suggest_with_notice", requiresReview: true });
    const found = await findReconciliationCandidateByIdempotencyKey(USER_ID, record.idempotencyKey);
    expect(found?.id).toBe(record.id);
  });

  it("lists candidates referencing a given source transaction id", async () => {
    await createReconciliationCandidate({ draft: draft({ sourceTransactionIds: ["tx-a", "tx-b"] }), policyOutcome: "suggest_with_notice", requiresReview: true });
    const found = await listReconciliationCandidatesByTransactionId(USER_ID, "tx-a");
    expect(found).toHaveLength(1);
  });

  it("invalidates a candidate without deleting it, and is idempotent", async () => {
    const { record } = await createReconciliationCandidate({ draft: draft(), policyOutcome: "suggest_with_notice", requiresReview: true });

    const invalidated = await invalidateReconciliationCandidate({ userId: USER_ID, id: record.id, reason: "transaction_modified" });
    expect(invalidated.status).toBe("invalidated");
    expect(invalidated.invalidationReason).toBe("transaction_modified");
    expect(getMockState().reconciliationCandidates).toHaveLength(1); // never deleted

    const invalidatedAgain = await invalidateReconciliationCandidate({ userId: USER_ID, id: record.id, reason: "transaction_deleted" });
    expect(invalidatedAgain.invalidationReason).toBe("transaction_modified"); // unchanged, first reason wins
  });

  it("refuses to invalidate another user's candidate", async () => {
    const { record } = await createReconciliationCandidate({ draft: draft({ userId: USER_ID }), policyOutcome: "suggest_with_notice", requiresReview: true });

    await expect(
      invalidateReconciliationCandidate({ userId: OTHER_USER_ID, id: record.id, reason: "transaction_modified" }),
    ).rejects.toThrow();
  });
});
