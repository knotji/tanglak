import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmDocumentAction } from "@/app/actions/documents";
import {
  createDocument,
  createTransaction,
  getDocument,
  listTransactions,
  getTransactionByDocumentId,
} from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";
import { TRANSACTION_OCCURRED_AT_REQUIRED_TH } from "@/lib/finance/date";

const USER_ID = "mock-user-confirmation";

const repositoryMocks = vi.hoisted(() => ({
  createTransaction: vi.fn(),
  updateDocument: vi.fn(),
  originalCreateTransaction: undefined as unknown as typeof import("@/lib/data/finance-repository").createTransaction,
  originalUpdateDocument: undefined as unknown as typeof import("@/lib/data/finance-repository").updateDocument,
}));

const provenanceMocks = vi.hoisted(() => ({
  setTransactionCategoryProvenance: vi.fn(),
}));

const sessionMocks = vi.hoisted(() => ({
  isMockAuthEnabled: vi.fn(() => true),
}));

const supabaseMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => supabaseMocks.createSupabaseServerClient(),
}));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => sessionMocks.isMockAuthEnabled(),
    requireUser: async () => ({ id: USER_ID, email: "mock-user-confirmation@example.test" }),
  };
});

vi.mock("@/lib/data/finance-repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/data/finance-repository")>();
  repositoryMocks.originalCreateTransaction = original.createTransaction;
  repositoryMocks.originalUpdateDocument = original.updateDocument;
  repositoryMocks.createTransaction.mockImplementation(original.createTransaction);
  repositoryMocks.updateDocument.mockImplementation(original.updateDocument);
  return {
    ...original,
    createTransaction: repositoryMocks.createTransaction,
    updateDocument: repositoryMocks.updateDocument,
  };
});

vi.mock("@/lib/autopilot/autopilot-provenance", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/autopilot/autopilot-provenance")>();
  return {
    ...original,
    setTransactionCategoryProvenance: provenanceMocks.setTransactionCategoryProvenance,
  };
});

function resetState() {
  const state = getMockState();
  state.documents = [];
  state.documentExtractions = [];
  state.transactions = [];
  state.debts = [];
  state.accounts = [];
  state.autopilotActions = [];
  state.users.clear();
}

async function seedDocument(documentType: string) {
  return createDocument(USER_ID, {
    status: "needs_review",
    documentType,
    storageBucket: "financial-documents",
    storagePath: `${USER_ID}/${documentType}.png`,
    originalFilename: `${documentType}.png`,
    mimeType: "image/png",
    fileSizeBytes: 10,
  });
}

async function seedLearnedHistory(merchant = "Special Café") {
  for (let index = 0; index < 3; index += 1) {
    await createTransaction(USER_ID, {
      type: "expense",
      amountSatang: 1_000 + index,
      occurredAt: `2026-07-0${index + 1}T12:00:00+07:00`,
      merchant: `${merchant} `,
      category: "ช้อปปิ้ง",
      source: "manual",
    });
  }
  getMockState().transactions.forEach((transaction) => {
    transaction.categorySource = "manual";
  });
  repositoryMocks.createTransaction.mockClear();
}

function receiptFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("documentType", "receipt");
  fd.set("merchant", "Special Café");
  fd.set("occurredAt", "2026-07-15T09:30");
  fd.set("totalPaid", "250");
  fd.set("paymentMethod", "card");
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

function transferExpenseFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("documentType", "transfer_slip");
  fd.set("amount", "250");
  fd.set("occurredAt", "2026-07-15T09:30");
  fd.set("destinationName", "Special Café");
  fd.set("referenceNumber", "REF123");
  fd.set("bank", "KBank");
  fd.set("accountLastFour", "1234");
  fd.set("destinationAccountLastFour", "5678");
  fd.set("type", "expense");
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

function genericExpenseFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("documentType", "other");
  fd.set("merchant", "Special Café");
  fd.set("occurredAt", "2026-07-15T09:30");
  fd.set("totalPaid", "250");
  fd.set("type", "expense");
  fd.set("paymentMethod", "card");
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  resetState();
  repositoryMocks.createTransaction.mockReset();
  repositoryMocks.createTransaction.mockImplementation(repositoryMocks.originalCreateTransaction);
  repositoryMocks.updateDocument.mockReset();
  repositoryMocks.updateDocument.mockImplementation(repositoryMocks.originalUpdateDocument);
  provenanceMocks.setTransactionCategoryProvenance.mockReset();
  provenanceMocks.setTransactionCategoryProvenance.mockResolvedValue({ applied: true });
  sessionMocks.isMockAuthEnabled.mockReset();
  sessionMocks.isMockAuthEnabled.mockReturnValue(true);
  supabaseMocks.createSupabaseServerClient.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("confirmDocumentAction idempotency and provenance failure handling", () => {
  it("confirms a learned receipt with document-linked transaction provenance metadata", async () => {
    await seedLearnedHistory();
    const doc = await seedDocument("receipt");

    const result = await confirmDocumentAction(doc.id, receiptFormData());

    expect(result.ok).toBe(true);
    const transactions = await listTransactions(USER_ID, "2026-07");
    const saved = transactions.find((transaction) => transaction.documentId === doc.id);
    expect(saved).toMatchObject({
      amountSatang: 25_000,
      occurredAt: "2026-07-15T09:30:00+07:00",
      category: "ช้อปปิ้ง",
      documentId: doc.id,
    });
    expect(provenanceMocks.setTransactionCategoryProvenance).toHaveBeenCalledWith(USER_ID, saved?.id, "learned_rule", 0.9);
  });

  it("confirms a learned transfer-slip expense with a document link", async () => {
    await seedLearnedHistory();
    const doc = await seedDocument("transfer_slip");

    const result = await confirmDocumentAction(doc.id, transferExpenseFormData());

    expect(result.ok).toBe(true);
    const transactions = await listTransactions(USER_ID, "2026-07");
    const saved = transactions.find((transaction) => transaction.documentId === doc.id);
    expect(saved).toMatchObject({ type: "expense", category: "ช้อปปิ้ง", documentId: doc.id });
    expect(provenanceMocks.setTransactionCategoryProvenance).toHaveBeenCalledWith(USER_ID, saved?.id, "learned_rule", 0.9);
  });

  it("confirms a learned generic expense with a stable document link", async () => {
    await seedLearnedHistory();
    const doc = await seedDocument("other");

    const result = await confirmDocumentAction(doc.id, genericExpenseFormData());

    expect(result.ok).toBe(true);
    const transactions = await listTransactions(USER_ID, "2026-07");
    const saved = transactions.find((transaction) => transaction.documentId === doc.id);
    expect(saved).toMatchObject({ type: "expense", category: "ช้อปปิ้ง", documentId: doc.id });
    expect(provenanceMocks.setTransactionCategoryProvenance).toHaveBeenCalledWith(USER_ID, saved?.id, "learned_rule", 0.9);
  });

  it("continues confirmation when optional provenance metadata fails, without duplicating on retry", async () => {
    await seedLearnedHistory();
    const doc = await seedDocument("receipt");
    provenanceMocks.setTransactionCategoryProvenance.mockRejectedValueOnce(new Error("provenance columns unavailable"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const first = await confirmDocumentAction(doc.id, receiptFormData());
    const second = await confirmDocumentAction(doc.id, receiptFormData());

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const transactions = (await listTransactions(USER_ID, "2026-07")).filter((transaction) => transaction.documentId === doc.id);
    expect(transactions).toHaveLength(1);
    expect((await getDocument(USER_ID, doc.id))?.status).toBe("confirmed");
    const serializedLog = JSON.stringify(logSpy.mock.calls);
    expect(serializedLog).toContain("category-provenance");
    expect(serializedLog).not.toContain("250");
    expect(serializedLog).not.toContain("Special Café");
  });

  it("fails transaction-create without provenance, document confirmation, or partial records", async () => {
    await seedLearnedHistory();
    const doc = await seedDocument("receipt");
    repositoryMocks.createTransaction.mockRejectedValueOnce(new Error("transaction insert failed"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await confirmDocumentAction(doc.id, receiptFormData());

    expect(result.ok).toBe(false);
    expect(provenanceMocks.setTransactionCategoryProvenance).not.toHaveBeenCalled();
    expect((await listTransactions(USER_ID, "2026-07")).filter((transaction) => transaction.documentId === doc.id)).toHaveLength(0);
    expect((await getDocument(USER_ID, doc.id))?.status).toBe("needs_review");
    expect(JSON.stringify(logSpy.mock.calls)).toContain("transaction-create");
  });

  it("reuses the existing transaction after document-status failure and converges on retry", async () => {
    await seedLearnedHistory();
    const doc = await seedDocument("receipt");
    repositoryMocks.updateDocument.mockRejectedValueOnce(new Error("document status update failed"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const first = await confirmDocumentAction(doc.id, receiptFormData());
    const afterFirst = (await listTransactions(USER_ID, "2026-07")).filter((transaction) => transaction.documentId === doc.id);
    const second = await confirmDocumentAction(doc.id, receiptFormData());
    const afterSecond = (await listTransactions(USER_ID, "2026-07")).filter((transaction) => transaction.documentId === doc.id);

    expect(first.ok).toBe(false);
    expect(afterFirst).toHaveLength(1);
    expect(second.ok).toBe(true);
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].id).toBe(afterFirst[0].id);
    expect((await getDocument(USER_ID, doc.id))?.status).toBe("confirmed");
    expect(JSON.stringify(logSpy.mock.calls)).toContain("document-status");
  });

  it("duplicate confirmation of the same document returns success without creating a second transaction", async () => {
    const doc = await seedDocument("other");

    const first = await confirmDocumentAction(doc.id, genericExpenseFormData({ merchant: "Corner Shop" }));
    const created = (await listTransactions(USER_ID, "2026-07")).find((transaction) => transaction.documentId === doc.id);
    const second = await confirmDocumentAction(doc.id, genericExpenseFormData({ merchant: "Corner Shop" }));
    const transactions = (await listTransactions(USER_ID, "2026-07")).filter((transaction) => transaction.documentId === doc.id);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].id).toBe(created?.id);
    expect(repositoryMocks.createTransaction).toHaveBeenCalledTimes(1);
  });

  it("logs transaction-items as an optional substage without failing the financial confirmation", async () => {
    const doc = await seedDocument("receipt");
    const fd = receiptFormData({ merchant: "Corner Shop" });
    fd.set("items", "{");
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await confirmDocumentAction(doc.id, fd);

    expect(result.ok).toBe(true);
    expect((await listTransactions(USER_ID, "2026-07")).filter((transaction) => transaction.documentId === doc.id)).toHaveLength(1);
    expect(JSON.stringify(logSpy.mock.calls)).toContain("transaction-items");
  });

  it("keeps non-learned confirmation behavior unchanged", async () => {
    const doc = await seedDocument("receipt");

    const result = await confirmDocumentAction(doc.id, receiptFormData({ merchant: "Corner Shop" }));

    expect(result.ok).toBe(true);
    const transactions = (await listTransactions(USER_ID, "2026-07")).filter((transaction) => transaction.documentId === doc.id);
    expect(transactions).toHaveLength(1);
    expect(provenanceMocks.setTransactionCategoryProvenance).not.toHaveBeenCalled();
  });

  it("validation failure creates nothing and leaves the document unconfirmed", async () => {
    const doc = await seedDocument("receipt");
    const fd = receiptFormData({ occurredAt: "" });

    const result = await confirmDocumentAction(doc.id, fd);

    expect(result.ok).toBe(false);
    expect(result.message).toBe(TRANSACTION_OCCURRED_AT_REQUIRED_TH);
    expect(repositoryMocks.createTransaction).not.toHaveBeenCalled();
    expect((await listTransactions(USER_ID, "2026-07")).filter((transaction) => transaction.documentId === doc.id)).toHaveLength(0);
    expect((await getDocument(USER_ID, doc.id))?.status).toBe("needs_review");
  });

  // Helper for mocking Supabase chain
  function mockSupabaseChain(options: {
    transactionData?: unknown;
    transactionError?: unknown;
    documentData?: unknown;
    documentError?: unknown;
  }) {
    const selectSpy = vi.fn().mockReturnThis();
    const eqSpy = vi.fn().mockReturnThis();
    const orderSpy = vi.fn().mockReturnThis();
    const limitSpy = vi.fn().mockReturnThis();

    let currentTable = "";

    const maybeSingleSpy = vi.fn().mockImplementation(() => {
      if (currentTable === "documents") {
        return Promise.resolve({ data: options.documentData ?? null, error: options.documentError ?? null });
      }
      return Promise.resolve({ data: options.transactionData ?? null, error: options.transactionError ?? null });
    });

    const client = {
      from: vi.fn().mockImplementation((table) => {
        currentTable = table;
        return {
          select: selectSpy,
          eq: eqSpy,
          order: orderSpy,
          limit: limitSpy,
          maybeSingle: maybeSingleSpy,
        };
      }),
    };

    supabaseMocks.createSupabaseServerClient.mockResolvedValue(client);
    return { client, selectSpy, eqSpy, orderSpy, limitSpy, maybeSingleSpy };
  }

  describe("stale schema compatibility and diagnostics regression tests", () => {
    it("getTransactionByDocumentId query does not request optional category provenance columns", async () => {
      sessionMocks.isMockAuthEnabled.mockReturnValue(false);
      const mockTx = {
        id: "tx-123",
        user_id: USER_ID,
        type: "expense",
        status: "confirmed",
        amount_satang: 25000,
        currency: "THB",
        occurred_at: "2026-07-15T09:30:00+07:00",
        merchant: "Café",
        category_label: "Food",
        document_id: "doc-123",
        is_historical: false,
      };

      const { selectSpy, eqSpy } = mockSupabaseChain({ transactionData: mockTx });

      const res = await getTransactionByDocumentId(USER_ID, "doc-123");

      expect(res).not.toBeNull();
      expect(res?.id).toBe("tx-123");
      expect(selectSpy).toHaveBeenCalled();

      const queryCols = selectSpy.mock.calls[0][0];
      expect(queryCols).toContain("document_id");
      expect(queryCols).not.toContain("category_source");
      expect(queryCols).not.toContain("category_confidence");
      expect(eqSpy).toHaveBeenCalledWith("user_id", USER_ID);
    });

    it("simulates stale provenance schema: minimal document-id lookup succeeds and existing transaction is reused without insert", async () => {
      const doc = await seedDocument("receipt");

      const docRow = {
        id: doc.id,
        user_id: USER_ID,
        status: "needs_review",
        document_type: "receipt",
        storage_bucket: "financial-documents",
        storage_path: `${USER_ID}/receipt.png`,
        mime_type: "image/png",
        file_size_bytes: 10,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const existingTx = {
        id: "existing-tx-123",
        user_id: USER_ID,
        type: "expense",
        status: "confirmed",
        amount_satang: 25000,
        currency: "THB",
        occurred_at: "2026-07-15T09:30:00+07:00",
        merchant: "Special Café",
        category_label: "Food",
        document_id: doc.id,
        is_historical: false,
      };

      sessionMocks.isMockAuthEnabled.mockReturnValue(false);
      mockSupabaseChain({ transactionData: existingTx, documentData: docRow });
      repositoryMocks.updateDocument.mockResolvedValue({ ...doc, status: "confirmed" });

      const result = await confirmDocumentAction(doc.id, receiptFormData());

      expect(result.ok).toBe(true);
      expect(repositoryMocks.createTransaction).not.toHaveBeenCalled();
    });

    it("no existing transaction: lookup returns null and createTransaction is called once with documentId", async () => {
      const doc = await seedDocument("receipt");

      const docRow = {
        id: doc.id,
        user_id: USER_ID,
        status: "needs_review",
        document_type: "receipt",
        storage_bucket: "financial-documents",
        storage_path: `${USER_ID}/receipt.png`,
        mime_type: "image/png",
        file_size_bytes: 10,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      sessionMocks.isMockAuthEnabled.mockReturnValue(false);
      mockSupabaseChain({ transactionData: null, documentData: docRow });
      repositoryMocks.createTransaction.mockResolvedValue({
        id: "new-tx-456",
        userId: USER_ID,
        type: "expense",
        status: "confirmed",
        amountSatang: 25000,
        occurredAt: "2026-07-15T09:30:00+07:00",
        merchant: "Special Café",
        documentId: doc.id,
        isHistorical: false,
      });
      repositoryMocks.updateDocument.mockResolvedValue({ ...doc, status: "confirmed" });

      const result = await confirmDocumentAction(doc.id, receiptFormData());

      expect(result.ok).toBe(true);
      expect(repositoryMocks.createTransaction).toHaveBeenCalledTimes(1);
      expect(repositoryMocks.createTransaction.mock.calls[0][1].documentId).toBe(doc.id);
    });

    it("required document_id missing/error is not silently ignored, logs transaction-idempotency-lookup", async () => {
      const doc = await seedDocument("receipt");

      const docRow = {
        id: doc.id,
        user_id: USER_ID,
        status: "needs_review",
        document_type: "receipt",
        storage_bucket: "financial-documents",
        storage_path: `${USER_ID}/receipt.png`,
        mime_type: "image/png",
        file_size_bytes: 10,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const lookupError = {
        code: "42703",
        message: 'column "document_id" of relation "transactions" does not exist',
      };

      sessionMocks.isMockAuthEnabled.mockReturnValue(false);
      mockSupabaseChain({ transactionData: null, transactionError: lookupError, documentData: docRow });

      const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const result = await confirmDocumentAction(doc.id, receiptFormData());

      expect(result.ok).toBe(false);
      expect(repositoryMocks.createTransaction).not.toHaveBeenCalled();

      const serializedLog = JSON.stringify(logSpy.mock.calls);
      expect(serializedLog).toContain("transaction-idempotency-lookup");
      expect(serializedLog).toContain("42703");
      expect(serializedLog).toContain("DatabaseError");
    });

    it("transaction insert failure is logged under transaction-create stage and document remains needs_review", async () => {
      const doc = await seedDocument("receipt");

      const docRow = {
        id: doc.id,
        user_id: USER_ID,
        status: "needs_review",
        document_type: "receipt",
        storage_bucket: "financial-documents",
        storage_path: `${USER_ID}/receipt.png`,
        mime_type: "image/png",
        file_size_bytes: 10,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      sessionMocks.isMockAuthEnabled.mockReturnValue(false);
      mockSupabaseChain({ transactionData: null, documentData: docRow });

      const insertError = new Error("Failed to insert transaction");
      repositoryMocks.createTransaction.mockRejectedValueOnce(insertError);

      const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const result = await confirmDocumentAction(doc.id, receiptFormData());

      expect(result.ok).toBe(false);
      expect(repositoryMocks.updateDocument).not.toHaveBeenCalled();
      expect(provenanceMocks.setTransactionCategoryProvenance).not.toHaveBeenCalled();

      const serializedLog = JSON.stringify(logSpy.mock.calls);
      expect(serializedLog).toContain("transaction-create");
    });

    it("financial invariants are preserved during confirmation", async () => {
      const doc = await seedDocument("receipt");
      // Keep mock auth enabled (default true) for validation test
      const fdInvalid = receiptFormData({ totalPaid: "-100" }); // Invalid amount

      const result = await confirmDocumentAction(doc.id, fdInvalid);

      expect(result.ok).toBe(false);
      expect(repositoryMocks.createTransaction).not.toHaveBeenCalled();
    });
  });
});
