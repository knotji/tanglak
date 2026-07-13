import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockState } from "@/lib/data/mock-store";
import { getMonthlyFinanceSnapshot } from "@/lib/finance/monthly-snapshot";
import {
  bangkokDateTimeLocalToInstant,
  formatThaiDateTimeLabel,
  getBangkokDateOf,
  getBangkokMonthOf,
  getBangkokMonthString,
  getBangkokNowDateTimeLocalString,
} from "@/lib/finance/date";
import { parseDocumentTimestamp } from "@/lib/ai/timestamp";
import { calculateMonthlyTotals } from "@/lib/finance/calculations";
import { budget, budgetCategory, JULY_2026, resetMockFinanceState, tx, USER_ID } from "./financial-integrity-fixtures";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

beforeEach(() => {
  resetMockFinanceState();
});

describe("Bangkok month boundary integrity", () => {
  it.each([
    ["2026-06-30T16:59:59.999Z", "2026-06-30", "2026-06"],
    ["2026-06-30T17:00:00.000Z", "2026-07-01", "2026-07"],
    ["2026-07-05T13:44:00+07:00", "2026-07-05", "2026-07"],
    ["2026-07-05T06:44:00.000Z", "2026-07-05", "2026-07"],
    ["2026-12-31T16:59:59.999Z", "2026-12-31", "2026-12"],
    ["2026-12-31T17:00:00.000Z", "2027-01-01", "2027-01"],
    ["2028-02-29T12:00:00+07:00", "2028-02-29", "2028-02"],
  ])("buckets %s by Bangkok wall clock", (instant, dateKey, monthKey) => {
    expect(getBangkokDateOf(instant)).toBe(dateKey);
    expect(getBangkokMonthOf(instant)).toBe(monthKey);
    expect(getBangkokMonthString(new Date(instant))).toBe(monthKey);
  });

  it("monthly totals include only the Bangkok-local month, never a naive string prefix", () => {
    const juneLastInstant = tx({ id: "june-last", amountSatang: 10_000, occurredAt: "2026-06-30T16:59:59.999Z" });
    const julyFirstInstant = tx({ id: "july-first", amountSatang: 20_000, occurredAt: "2026-06-30T17:00:00.000Z" });
    const julyDirectOffset = tx({ id: "july-offset", amountSatang: 30_000, occurredAt: "2026-07-15T09:00:00+07:00" });

    expect(calculateMonthlyTotals([juneLastInstant, julyFirstInstant, julyDirectOffset], "2026-06").livingExpenseSatang).toBe(10_000);
    expect(calculateMonthlyTotals([juneLastInstant, julyFirstInstant, julyDirectOffset], JULY_2026).livingExpenseSatang).toBe(50_000);
  });

  it("getMonthlyFinanceSnapshot uses the Bangkok-aware mock repository path too", async () => {
    const state = getMockState();
    state.monthlyBudgets.push(budget());
    state.budgetCategories.push(budgetCategory({ label: "food", amountSatang: 100_000 }));
    state.transactions.push(
      tx({ id: "utc-prefix-june-but-bangkok-july", amountSatang: 20_000, occurredAt: "2026-06-30T17:00:00.000Z", category: "food" }),
      tx({ id: "actual-june", amountSatang: 99_000, occurredAt: "2026-06-30T16:59:59.999Z", category: "food" }),
    );

    const snapshot = await getMonthlyFinanceSnapshot(USER_ID, JULY_2026);

    expect(snapshot.transactions.map((transaction) => transaction.id)).toEqual(["utc-prefix-june-but-bangkok-july"]);
    expect(snapshot.totals.livingExpenseSatang).toBe(20_000);
    expect(snapshot.budgetSummary.spentTotalSatang).toBe(20_000);
  });
});

describe("Buddhist Era and Bangkok wall-clock date compatibility", () => {
  it.each([
    ["05 ก.ค. 2569 - 13:44", "2026-07-05T13:44:00+07:00"],
    ["2569-07-05T13:44:00+07:00", "2026-07-05T13:44:00+07:00"],
    ["2026-07-05T13:44:00+07:00", "2026-07-05T13:44:00+07:00"],
  ])("normalizes %s without shifting wall-clock time", (raw, expectedIso) => {
    const parsed = parseDocumentTimestamp(raw);
    expect(parsed.state).toBe("extracted");
    expect(parsed.iso).toBe(expectedIso);
    expect(parsed.iso).not.toContain("2569");
  });

  it("rejects invalid BE-shaped dates instead of creating a future or swapped transaction", () => {
    expect(parseDocumentTimestamp("32 ก.ค. 2569 - 13:44").state).toBe("invalid");
    expect(parseDocumentTimestamp("2569-13-05T13:44:00+07:00").state).toBe("invalid");
  });

  it("normalizes datetime-local values without UTC conversion or hour swaps", () => {
    expect(bangkokDateTimeLocalToInstant("2026-07-05T13:44")).toBe("2026-07-05T13:44:00+07:00");
    expect(formatThaiDateTimeLabel("2026-07-05T13:44")).not.toContain("Invalid Date");
    expect(getBangkokNowDateTimeLocalString(new Date("2026-07-05T06:44:00.000Z"))).toBe("2026-07-05T13:44");
  });
});
