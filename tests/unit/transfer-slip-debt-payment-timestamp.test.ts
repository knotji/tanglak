import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmDocumentAction } from "@/app/actions/documents";
import { createDebt, createDocument, listDebts, listTransactions } from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";
import { TRANSACTION_OCCURRED_AT_REQUIRED_TH } from "@/lib/finance/date";

const USER_ID = "mock-user-1";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
    requireUser: async () => ({ id: USER_ID, email: "mock-user-1@example.test" }),
  };
});

function seedDocument(documentType: string) {
  return createDocument(USER_ID, {
    status: "needs_review",
    documentType,
    storageBucket: "financial-documents",
    storagePath: `${USER_ID}/doc/transfer_slip.png`,
    originalFilename: "transfer_slip.png",
    mimeType: "image/png",
    fileSizeBytes: 10,
  });
}

function transferSlipFormData(overrides: Record<string, string> = {}, debtId?: string) {
  const fd = new FormData();
  fd.set("documentType", "transfer_slip");
  fd.set("amount", "500");
  fd.set("occurredAt", "2026-07-15T09:30");
  fd.set("destinationName", "KTC");
  fd.set("referenceNumber", "REF123");
  fd.set("bank", "KBank");
  fd.set("accountLastFour", "1234");
  fd.set("destinationAccountLastFour", "5678");
  fd.set("type", "debt_payment");
  if (debtId) fd.set("debtId", debtId);
  for (const [key, value] of Object.entries(overrides)) {
    fd.set(key, value);
  }
  return fd;
}

describe("transfer-slip debt_payment confirmation requires an explicit, validated occurredAt", () => {
  beforeEach(() => {
    const state = getMockState();
    state.documents = [];
    state.documentExtractions = [];
    state.transactions = [];
    state.debts = [];
    state.accounts = [];
    state.users.clear();
  });

  it("succeeds with a valid occurredAt and persists it on both the transaction and the debt payment", async () => {
    const debt = await createDebt(USER_ID, {
      name: "KTC",
      amountDueSatang: 100_000,
      minimumPaymentSatang: 50_000,
      dueDate: "2026-07-18",
    });
    const doc = await seedDocument("transfer_slip");

    const result = await confirmDocumentAction(doc.id, transferSlipFormData({}, debt.id));

    expect(result.ok).toBe(true);
    const transactions = await listTransactions(USER_ID, "2026-07");
    const debtPaymentTx = transactions.find((t) => t.type === "debt_payment" && t.debtId === debt.id);
    expect(debtPaymentTx).toBeDefined();
    expect(debtPaymentTx?.occurredAt).toBe("2026-07-15T09:30:00+07:00");
  });

  it("rejects a missing occurredAt with the required Thai copy and creates no transaction", async () => {
    const debt = await createDebt(USER_ID, {
      name: "KTC",
      amountDueSatang: 100_000,
      minimumPaymentSatang: 50_000,
      dueDate: "2026-07-18",
    });
    const doc = await seedDocument("transfer_slip");
    const fd = transferSlipFormData({}, debt.id);
    fd.delete("occurredAt");

    const result = await confirmDocumentAction(doc.id, fd);

    expect(result.ok).toBe(false);
    expect(result.message).toBe(TRANSACTION_OCCURRED_AT_REQUIRED_TH);
    const transactions = await listTransactions(USER_ID, "2026-07");
    expect(transactions.filter((t) => t.debtId === debt.id)).toHaveLength(0);
  });

  it("rejects an empty-string occurredAt with the required Thai copy and creates no transaction", async () => {
    const debt = await createDebt(USER_ID, {
      name: "KTC",
      amountDueSatang: 100_000,
      minimumPaymentSatang: 50_000,
      dueDate: "2026-07-18",
    });
    const doc = await seedDocument("transfer_slip");

    const result = await confirmDocumentAction(doc.id, transferSlipFormData({ occurredAt: "" }, debt.id));

    expect(result.ok).toBe(false);
    expect(result.message).toBe(TRANSACTION_OCCURRED_AT_REQUIRED_TH);
    const transactions = await listTransactions(USER_ID, "2026-07");
    expect(transactions.filter((t) => t.debtId === debt.id)).toHaveLength(0);
  });

  it("rejects a malformed occurredAt string with the required Thai copy and creates no transaction", async () => {
    const debt = await createDebt(USER_ID, {
      name: "KTC",
      amountDueSatang: 100_000,
      minimumPaymentSatang: 50_000,
      dueDate: "2026-07-18",
    });
    const doc = await seedDocument("transfer_slip");

    const result = await confirmDocumentAction(
      doc.id,
      transferSlipFormData({ occurredAt: "not-a-real-timestamp" }, debt.id),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe(TRANSACTION_OCCURRED_AT_REQUIRED_TH);
    const transactions = await listTransactions(USER_ID, "2026-07");
    expect(transactions.filter((t) => t.debtId === debt.id)).toHaveLength(0);
  });

  it("rejects an out-of-range calendar/time occurredAt (e.g. day 32, hour 25) as invalid, not as a rolled-over date", async () => {
    const debt = await createDebt(USER_ID, {
      name: "KTC",
      amountDueSatang: 100_000,
      minimumPaymentSatang: 50_000,
      dueDate: "2026-07-18",
    });
    const doc = await seedDocument("transfer_slip");

    const result = await confirmDocumentAction(
      doc.id,
      transferSlipFormData({ occurredAt: "2026-07-32T25:99" }, debt.id),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe(TRANSACTION_OCCURRED_AT_REQUIRED_TH);
  });

  it("a rejected confirmation does not alter paid-this-cycle progress", async () => {
    const debt = await createDebt(USER_ID, {
      name: "KTC",
      amountDueSatang: 100_000,
      minimumPaymentSatang: 50_000,
      dueDate: "2026-07-18",
      cycleStartDate: "2026-07-01",
      cycleEndDate: "2026-07-31",
    });
    const doc = await seedDocument("transfer_slip");

    await confirmDocumentAction(doc.id, transferSlipFormData({ occurredAt: "" }, debt.id));

    const [reloaded] = await listDebts(USER_ID, true).then((debts) => debts.filter((d) => d.id === debt.id));
    expect(reloaded?.amountPaidThisCycleSatang).toBe(0);
  });

  it("a rejected confirmation creates no debt_payment-linked transaction (the debt_payments row insert never runs)", async () => {
    const debt = await createDebt(USER_ID, {
      name: "KTC",
      amountDueSatang: 100_000,
      minimumPaymentSatang: 50_000,
      dueDate: "2026-07-18",
    });
    const doc = await seedDocument("transfer_slip");

    await confirmDocumentAction(doc.id, transferSlipFormData({ occurredAt: "not-a-real-timestamp" }, debt.id));

    // addDebtPayment always creates its transaction row before the
    // (real-DB-only) debt_payments insert; proving no transaction exists at
    // all is the strongest available proof that the debt_payments write --
    // which depends on it -- never ran either.
    const state = getMockState();
    expect(state.transactions.filter((t) => t.debtId === debt.id)).toHaveLength(0);
  });

  it("never falls back to the current time -- the persisted occurredAt exactly matches the reviewed value, never `now`", async () => {
    const debt = await createDebt(USER_ID, {
      name: "KTC",
      amountDueSatang: 100_000,
      minimumPaymentSatang: 50_000,
      dueDate: "2026-07-18",
    });
    const doc = await seedDocument("transfer_slip");

    // A date far from "now" (this test suite's fixed reference point is
    // 2026-07; if a current-time fallback ever crept back in, the
    // persisted value would drift towards the real wall-clock time this
    // test happens to run at instead of staying exactly 2020-01-01).
    await confirmDocumentAction(doc.id, transferSlipFormData({ occurredAt: "2020-01-01T00:00" }, debt.id));

    const transactions = await listTransactions(USER_ID, "2020-01");
    const debtPaymentTx = transactions.find((t) => t.type === "debt_payment" && t.debtId === debt.id);
    expect(debtPaymentTx?.occurredAt).toBe("2020-01-01T00:00:00+07:00");
  });

  it("preserves the Bangkok-local date/time without shifting across a UTC day boundary", async () => {
    const debt = await createDebt(USER_ID, {
      name: "KTC",
      amountDueSatang: 100_000,
      minimumPaymentSatang: 50_000,
      dueDate: "2026-07-18",
    });
    const doc = await seedDocument("transfer_slip");

    // 00:30 Bangkok time -- if this were misinterpreted as UTC or the
    // server's own local time, the calendar date could shift to the
    // previous day.
    await confirmDocumentAction(doc.id, transferSlipFormData({ occurredAt: "2026-07-15T00:30" }, debt.id));

    const transactions = await listTransactions(USER_ID, "2026-07");
    const debtPaymentTx = transactions.find((t) => t.type === "debt_payment" && t.debtId === debt.id);
    expect(debtPaymentTx?.occurredAt).toBe("2026-07-15T00:30:00+07:00");
  });

  it("rejects a debt_payment with a missing debtId regardless of occurredAt validity (unchanged existing behavior)", async () => {
    const doc = await seedDocument("transfer_slip");

    const result = await confirmDocumentAction(doc.id, transferSlipFormData());

    expect(result.ok).toBe(false);
    expect(result.message).toBe("กรุณาระบุบัญชีหนี้สินที่เกี่ยวข้องกับการชำระ");
  });

  it("a non-debt-payment transfer-slip transaction still requires occurredAt (regression check)", async () => {
    const doc = await seedDocument("transfer_slip");
    const fd = transferSlipFormData({ type: "transfer", occurredAt: "" });
    fd.delete("debtId");

    const result = await confirmDocumentAction(doc.id, fd);

    expect(result.ok).toBe(false);
    expect(result.message).toBe(TRANSACTION_OCCURRED_AT_REQUIRED_TH);
  });

  it("a non-debt-payment transfer-slip transaction with a valid occurredAt still succeeds (regression check)", async () => {
    const doc = await seedDocument("transfer_slip");
    const fd = transferSlipFormData({ type: "transfer" });
    fd.delete("debtId");

    const result = await confirmDocumentAction(doc.id, fd);

    expect(result.ok).toBe(true);
    const transactions = await listTransactions(USER_ID, "2026-07");
    expect(transactions.some((t) => t.type === "transfer")).toBe(true);
  });
});
