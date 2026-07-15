import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockState } from "@/lib/data/mock-store";
import { requireUser } from "@/lib/auth/session";
import { saveTransactionAction, updateDebtPaymentAction } from "@/app/actions/finance";
import { addDebtPayment, createDebt, getTransactionById } from "@/lib/data/finance-repository";
import { parseAndValidateDateTime } from "@/lib/finance/date";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
    requireUser: vi.fn(async () => ({ id: "user-a", email: "user-a@example.test" })),
  };
});

function fd(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("parseAndValidateDateTime Helper", () => {
  it("parses valid date-only format YYYY-MM-DD", () => {
    const res = parseAndValidateDateTime("2026-07-10");
    expect(res).toEqual({
      ok: true,
      isoInstant: "2026-07-10T12:00:00+07:00",
      type: "date-only",
    });
  });

  it("parses valid datetime-local format YYYY-MM-DDTHH:mm", () => {
    const res = parseAndValidateDateTime("2026-07-10T15:30");
    expect(res).toEqual({
      ok: true,
      isoInstant: "2026-07-10T15:30:00+07:00",
      type: "datetime",
    });
  });

  it("accepts valid leap year Feb 29", () => {
    const res = parseAndValidateDateTime("2024-02-29");
    expect(res.ok).toBe(true);
    expect(res.ok ? res.isoInstant : "").toBe("2024-02-29T12:00:00+07:00");
  });

  it("rejects non-leap year Feb 29", () => {
    const res = parseAndValidateDateTime("2025-02-29");
    expect(res).toEqual({ ok: false, error: "วันที่นี้ไม่มีอยู่จริง" });
  });

  it("rejects non-existent calendar date Feb 31", () => {
    const res = parseAndValidateDateTime("2026-02-31");
    expect(res).toEqual({ ok: false, error: "วันที่นี้ไม่มีอยู่จริง" });
  });

  it("rejects invalid month 13", () => {
    const res = parseAndValidateDateTime("2026-13-01");
    expect(res).toEqual({ ok: false, error: "วันที่นี้ไม่มีอยู่จริง" });
  });

  it("rejects month zero", () => {
    const res = parseAndValidateDateTime("2026-00-01");
    expect(res).toEqual({ ok: false, error: "วันที่นี้ไม่มีอยู่จริง" });
  });

  it("rejects day zero", () => {
    const res = parseAndValidateDateTime("2026-07-00");
    expect(res).toEqual({ ok: false, error: "วันที่นี้ไม่มีอยู่จริง" });
  });

  it("rejects invalid hour 24", () => {
    const res = parseAndValidateDateTime("2026-07-10T24:00");
    expect(res).toEqual({ ok: false, error: "กรุณาระบุเวลาให้ถูกต้อง" });
  });

  it("rejects invalid minute 60", () => {
    const res = parseAndValidateDateTime("2026-07-10T12:60");
    expect(res).toEqual({ ok: false, error: "กรุณาระบุเวลาให้ถูกต้อง" });
  });

  it("rejects empty input", () => {
    const res = parseAndValidateDateTime("");
    expect(res).toEqual({ ok: false, error: "กรุณาระบุวันที่ให้ถูกต้อง" });
  });

  it("rejects whitespace input", () => {
    const res = parseAndValidateDateTime("   ");
    expect(res).toEqual({ ok: false, error: "กรุณาระบุวันที่ให้ถูกต้อง" });
  });

  it("rejects malformed separators", () => {
    const res = parseAndValidateDateTime("2026/07/10");
    expect(res).toEqual({ ok: false, error: "วันและเวลาไม่ถูกต้อง" });
  });
});

describe("saveTransactionAction Date/Time Validation", () => {
  beforeEach(() => {
    const state = getMockState();
    state.transactions = [];
    state.debts = [];
    vi.mocked(requireUser).mockResolvedValue({ id: "user-a", email: "user-a@example.test" });
  });

  it("accepts a valid date-only value", async () => {
    const result = await saveTransactionAction(
      { ok: false },
      fd({ type: "expense", amount: "150", label: "Lunch", date: "2026-07-15" }),
    );
    expect(result.ok).toBe(true);
    expect(getMockState().transactions).toHaveLength(1);
    expect(getMockState().transactions[0]?.occurredAt).toBe("2026-07-15T12:00:00+07:00");
  });

  it("accepts a valid datetime-local value", async () => {
    const result = await saveTransactionAction(
      { ok: false },
      fd({ type: "expense", amount: "150", label: "Lunch", date: "2026-07-15T14:45" }),
    );
    expect(result.ok).toBe(true);
    expect(getMockState().transactions).toHaveLength(1);
    expect(getMockState().transactions[0]?.occurredAt).toBe("2026-07-15T14:45:00+07:00");
  });

  it("rejects an invalid calendar date", async () => {
    const result = await saveTransactionAction(
      { ok: false },
      fd({ type: "expense", amount: "150", label: "Lunch", date: "2026-02-31" }),
    );
    expect(result).toEqual({ ok: false, message: "วันที่นี้ไม่มีอยู่จริง" });
    expect(getMockState().transactions).toHaveLength(0);
  });

  it("rejects an invalid time", async () => {
    const result = await saveTransactionAction(
      { ok: false },
      fd({ type: "expense", amount: "150", label: "Lunch", date: "2026-07-15T25:00" }),
    );
    expect(result).toEqual({ ok: false, message: "กรุณาระบุเวลาให้ถูกต้อง" });
    expect(getMockState().transactions).toHaveLength(0);
  });
});

describe("updateDebtPaymentAction Date/Time Validation and Preservation", () => {
  beforeEach(() => {
    const state = getMockState();
    state.transactions = [];
    state.debts = [];
    vi.mocked(requireUser).mockResolvedValue({ id: "user-a", email: "user-a@example.test" });
  });

  it("preserves the original time when updating with the same date", async () => {
    const debt = await createDebt("user-a", {
      name: "Citi",
      amountDueSatang: 1000_00,
      minimumPaymentSatang: 100_00,
      dueDate: "2026-07-25",
    });

    const { transaction } = await addDebtPayment("user-a", debt.id, 500_00, "2026-07-15T09:45:00+07:00");
    expect(transaction.occurredAt).toBe("2026-07-15T09:45:00+07:00");

    // Perform an edit where only amount is changed and date is passed as date-only (same date)
    const result = await updateDebtPaymentAction(
      { ok: false },
      fd({ id: transaction.id, debtId: debt.id, amount: "600", date: "2026-07-15" }),
    );

    expect(result.ok).toBe(true);
    const updated = await getTransactionById("user-a", transaction.id);
    expect(updated?.occurredAt).toBe("2026-07-15T09:45:00+07:00"); // time preserved!
    expect(updated?.amountSatang).toBe(600_00);
  });

  it("uses noon default time when date is changed to a new date-only", async () => {
    const debt = await createDebt("user-a", {
      name: "Citi",
      amountDueSatang: 1000_00,
      minimumPaymentSatang: 100_00,
      dueDate: "2026-07-25",
    });

    const { transaction } = await addDebtPayment("user-a", debt.id, 500_00, "2026-07-15T09:45:00+07:00");

    // Date changed from 15th to 16th
    const result = await updateDebtPaymentAction(
      { ok: false },
      fd({ id: transaction.id, debtId: debt.id, amount: "500", date: "2026-07-16" }),
    );

    expect(result.ok).toBe(true);
    const updated = await getTransactionById("user-a", transaction.id);
    expect(updated?.occurredAt).toBe("2026-07-16T12:00:00+07:00"); // defaults to noon on new date
  });

  it("rejects invalid date and does not call repository write", async () => {
    const debt = await createDebt("user-a", {
      name: "Citi",
      amountDueSatang: 1000_00,
      minimumPaymentSatang: 100_00,
      dueDate: "2026-07-25",
    });

    const { transaction } = await addDebtPayment("user-a", debt.id, 500_00, "2026-07-15T09:45:00+07:00");

    const result = await updateDebtPaymentAction(
      { ok: false },
      fd({ id: transaction.id, debtId: debt.id, amount: "500", date: "2026-07-32" }),
    );

    expect(result).toEqual({ ok: false, message: "วันที่นี้ไม่มีอยู่จริง" });
    const unchanged = await getTransactionById("user-a", transaction.id);
    expect(unchanged?.occurredAt).toBe("2026-07-15T09:45:00+07:00");
  });
});
