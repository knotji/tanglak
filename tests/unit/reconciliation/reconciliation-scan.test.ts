import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockState } from "@/lib/data/mock-store";
import { scanForReconciliationCandidates } from "@/lib/reconciliation/reconciliation-scan";
import { tx, debt, USER_ID, OTHER_USER_ID, resetReconciliationFixtureIds } from "./fixtures";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

describe("scanForReconciliationCandidates (integration seam)", () => {
  beforeEach(() => {
    resetReconciliationFixtureIds();
    const state = getMockState();
    state.transactions = [];
    state.debts = [];
    state.reconciliationCandidates = [];
  });

  it("generates and persists candidates from confirmed transactions only", async () => {
    const state = getMockState();
    state.transactions = [
      tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00", status: "confirmed" }),
      tx({ type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:01:00+07:00", status: "confirmed" }),
      // A draft transaction should never be considered.
      tx({ type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:02:00+07:00", status: "draft" }),
    ];

    const result = await scanForReconciliationCandidates(USER_ID);

    expect(result.scanned).toBe(2);
    expect(result.created).toBeGreaterThan(0);
    expect(getMockState().reconciliationCandidates.every((c) => c.userId === USER_ID)).toBe(true);
  });

  it("never mutates transactions or debts", async () => {
    const state = getMockState();
    const transaction = tx({ type: "expense", amountSatang: 50_000, merchant: "Kasikorn Credit Card" });
    const theDebt = debt({ name: "Kasikorn Credit Card", minimumPaymentSatang: 50_000 });
    state.transactions = [transaction];
    state.debts = [theDebt];
    const txSnapshot = { ...transaction };
    const debtSnapshot = { ...theDebt };

    await scanForReconciliationCandidates(USER_ID);

    expect(getMockState().transactions[0]).toEqual(txSnapshot);
    expect(getMockState().debts[0]).toEqual(debtSnapshot);
  });

  it("is idempotent across repeated scans -- no duplicate rows", async () => {
    const state = getMockState();
    state.transactions = [
      tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00" }),
      tx({ type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:01:00+07:00" }),
    ];

    const first = await scanForReconciliationCandidates(USER_ID);
    const second = await scanForReconciliationCandidates(USER_ID);

    expect(second.created).toBe(0);
    expect(second.skippedExisting).toBe(first.created);
  });

  it("stays safe under overlapping/concurrent scans -- no duplicate rows for the same user", async () => {
    const state = getMockState();
    state.transactions = [
      tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00" }),
      tx({ type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:01:00+07:00" }),
    ];

    const [first, second] = await Promise.all([scanForReconciliationCandidates(USER_ID), scanForReconciliationCandidates(USER_ID)]);

    const totalCreated = first.created + second.created;
    const idempotencyKeys = getMockState().reconciliationCandidates.map((c) => c.idempotencyKey);
    expect(new Set(idempotencyKeys).size).toBe(idempotencyKeys.length); // no duplicate keys persisted
    expect(totalCreated).toBe(getMockState().reconciliationCandidates.length);
  });

  it("keeps two users' scans fully isolated", async () => {
    const state = getMockState();
    state.transactions = [
      tx({ userId: USER_ID, type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00" }),
      tx({ userId: USER_ID, type: "income", amountSatang: 100_000, occurredAt: "2026-07-10T10:01:00+07:00" }),
      tx({ userId: OTHER_USER_ID, type: "expense", amountSatang: 200_000, occurredAt: "2026-07-11T10:00:00+07:00" }),
      tx({ userId: OTHER_USER_ID, type: "income", amountSatang: 200_000, occurredAt: "2026-07-11T10:01:00+07:00" }),
    ];

    await scanForReconciliationCandidates(USER_ID);
    await scanForReconciliationCandidates(OTHER_USER_ID);

    const candidates = getMockState().reconciliationCandidates;
    expect(candidates.some((c) => c.userId === USER_ID)).toBe(true);
    expect(candidates.some((c) => c.userId === OTHER_USER_ID)).toBe(true);
    for (const candidate of candidates) {
      // No candidate's source ids should ever mix in a transaction belonging to the other user.
      const owner = candidate.userId;
      const txIds = new Set(
        state.transactions.filter((t) => t.userId === owner).map((t) => t.id),
      );
      for (const id of candidate.sourceTransactionIds) {
        expect(txIds.has(id)).toBe(true);
      }
    }
  });
});
