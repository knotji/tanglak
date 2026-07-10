import { isMockAuthEnabled } from "@/lib/auth/session";
import { getMockState } from "@/lib/data/mock-store";
import { mapDebt, mapTransaction, mapDocument, mapDocumentExtraction, mapImportBatch, mapImportRow } from "@/lib/data/mappers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Debt, Transaction, FinanceDocument, DocumentExtraction, ImportBatch, ImportRow, Account } from "@/types/domain";

export type TransactionInput = {
  type: Transaction["type"];
  amountSatang: number;
  occurredAt: string;
  merchant?: string;
  category?: string;
  debtId?: string;
  note?: string;
  paymentMethod?: string;
  accountLastFour?: string;
  destinationAccountLastFour?: string;
  bank?: string;
  source?: Transaction["source"];
  documentId?: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  importBatchId?: string;
  importRowId?: string;
  isHistorical?: boolean;
};

export type DebtInput = {
  name: string;
  creditor?: string;
  outstandingBalanceSatang?: number;
  amountDueSatang: number;
  minimumPaymentSatang: number;
  dueDate: string;
  recurringDueDay?: number;
  paymentMode?: Debt["paymentMode"];
  notes?: string;
};

function assertOwner(userId: string, ownerId: string) {
  if (userId !== ownerId) throw new Error("Cannot access another user's data");
}

export async function listTransactions(userId: string, month: string): Promise<Transaction[]> {
  if (isMockAuthEnabled()) {
    return getMockState().transactions
      .filter((transaction) => transaction.userId === userId && transaction.occurredAt.startsWith(month))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .gte("occurred_at", `${month}-01T00:00:00+07:00`)
    .lt("occurred_at", nextMonthStart(month))
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTransaction);
}

export async function listAllTransactions(userId: string): Promise<Transaction[]> {
  if (isMockAuthEnabled()) {
    return getMockState().transactions
      .filter((transaction) => transaction.userId === userId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTransaction);
}

export async function createTransaction(userId: string, input: TransactionInput): Promise<Transaction> {
  if (isMockAuthEnabled()) {
    const transaction: Transaction = {
      id: crypto.randomUUID(),
      userId,
      type: input.type,
      status: "confirmed",
      amountSatang: input.amountSatang,
      currency: "THB",
      occurredAt: input.occurredAt,
      merchant: input.merchant,
      category: input.category,
      debtId: input.debtId,
      documentId: input.documentId,
      paymentMethod: input.paymentMethod,
      accountLastFour: input.accountLastFour,
      destinationAccountLastFour: input.destinationAccountLastFour,
      bank: input.bank,
      note: input.note,
      source: input.source || "manual",
      sourceAccountId: input.sourceAccountId,
      destinationAccountId: input.destinationAccountId,
      importBatchId: input.importBatchId,
      importRowId: input.importRowId,
      isHistorical: input.isHistorical,
    };
    getMockState().transactions.unshift(transaction);
    if (transaction.debtId) recalculateMockDebtPaid(userId, transaction.debtId);
    return transaction;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      type: input.type,
      status: "confirmed",
      amount_satang: input.amountSatang,
      currency: "THB",
      occurred_at: input.occurredAt,
      merchant: input.merchant,
      category_label: input.category,
      debt_id: input.debtId,
      document_id: input.documentId,
      note: input.note,
      payment_method: input.paymentMethod,
      account_last_four: input.accountLastFour,
      destination_account_last_four: input.destinationAccountLastFour,
      bank: input.bank,
      source: input.source || "manual",
      source_account_id: input.sourceAccountId,
      destination_account_id: input.destinationAccountId,
      import_batch_id: input.importBatchId,
      import_row_id: input.importRowId,
      is_historical: input.isHistorical || false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const transaction = mapTransaction(data);
  if (transaction.debtId) await recalculateDebtPaidThisCycle(userId, transaction.debtId);
  return transaction;
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: Partial<TransactionInput>,
): Promise<Transaction> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.transactions.findIndex((transaction) => transaction.id === id);
    if (index < 0) throw new Error("Transaction not found");
    assertOwner(userId, state.transactions[index].userId);
    const previousDebtId = state.transactions[index].debtId;
    state.transactions[index] = { ...state.transactions[index], ...input };
    if (previousDebtId) recalculateMockDebtPaid(userId, previousDebtId);
    if (state.transactions[index].debtId) recalculateMockDebtPaid(userId, state.transactions[index].debtId);
    return state.transactions[index];
  }

  const supabase = await createSupabaseServerClient();
  const { data: previous } = await supabase
    .from("transactions")
    .select("debt_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  const { data, error } = await supabase
    .from("transactions")
    .update({
      type: input.type,
      amount_satang: input.amountSatang,
      occurred_at: input.occurredAt,
      merchant: input.merchant,
      category_label: input.category,
      debt_id: input.debtId,
      document_id: input.documentId,
      note: input.note,
      payment_method: input.paymentMethod,
      account_last_four: input.accountLastFour,
      destination_account_last_four: input.destinationAccountLastFour,
      bank: input.bank,
      source: input.source,
      source_account_id: input.sourceAccountId,
      destination_account_id: input.destinationAccountId,
      import_batch_id: input.importBatchId,
      import_row_id: input.importRowId,
      is_historical: input.isHistorical,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const transaction = mapTransaction(data);
  if (previous?.debt_id) await recalculateDebtPaidThisCycle(userId, previous.debt_id);
  if (transaction.debtId) await recalculateDebtPaidThisCycle(userId, transaction.debtId);
  return transaction;
}

export async function deleteTransaction(userId: string, id: string) {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const existing = state.transactions.find((transaction) => transaction.id === id);
    if (!existing) return;
    assertOwner(userId, existing.userId);
    state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
    if (existing.debtId) recalculateMockDebtPaid(userId, existing.debtId);
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("transactions")
    .select("debt_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (existing?.debt_id) await recalculateDebtPaidThisCycle(userId, existing.debt_id);
}

export async function listDebts(userId: string, includeClosed = false): Promise<Debt[]> {
  if (isMockAuthEnabled()) {
    return getMockState().debts.filter((debt) => debt.userId === userId && (includeClosed || debt.status !== "paid_off"));
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("debts").select("*").eq("user_id", userId).order("due_date", { ascending: true });
  if (!includeClosed) query = query.neq("status", "paid_off");
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapDebt);
}

export async function createDebt(userId: string, input: DebtInput): Promise<Debt> {
  if (isMockAuthEnabled()) {
    const debt: Debt = {
      id: crypto.randomUUID(),
      userId,
      name: input.name,
      creditor: input.creditor,
      debtType: "other",
      paymentMode: input.paymentMode ?? "variable_monthly",
      outstandingBalanceSatang: input.outstandingBalanceSatang ?? input.amountDueSatang,
      amountDueSatang: input.amountDueSatang,
      minimumPaymentSatang: input.minimumPaymentSatang,
      amountPaidThisCycleSatang: 0,
      dueDate: input.dueDate,
      recurringDueDay: input.recurringDueDay,
      status: "active",
      notes: input.notes,
    };
    getMockState().debts.unshift(debt);
    return debt;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("debts")
    .insert({
      user_id: userId,
      name: input.name,
      creditor: input.creditor,
      debt_type: "other",
      payment_mode: input.paymentMode ?? "variable_monthly",
      outstanding_balance_satang: input.outstandingBalanceSatang ?? input.amountDueSatang,
      amount_due_satang: input.amountDueSatang,
      minimum_payment_satang: input.minimumPaymentSatang,
      amount_paid_this_cycle_satang: 0,
      due_date: input.dueDate,
      recurring_due_day: input.recurringDueDay,
      status: "active",
      notes: input.notes,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapDebt(data);
}

export async function updateDebt(userId: string, id: string, input: Partial<DebtInput>): Promise<Debt> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.debts.findIndex((debt) => debt.id === id);
    if (index < 0) throw new Error("Debt not found");
    assertOwner(userId, state.debts[index].userId);
    state.debts[index] = {
      ...state.debts[index],
      name: input.name ?? state.debts[index].name,
      creditor: input.creditor ?? state.debts[index].creditor,
      outstandingBalanceSatang: input.outstandingBalanceSatang ?? state.debts[index].outstandingBalanceSatang,
      amountDueSatang: input.amountDueSatang ?? state.debts[index].amountDueSatang,
      minimumPaymentSatang: input.minimumPaymentSatang ?? state.debts[index].minimumPaymentSatang,
      dueDate: input.dueDate ?? state.debts[index].dueDate,
      recurringDueDay: input.recurringDueDay ?? state.debts[index].recurringDueDay,
      paymentMode: input.paymentMode ?? state.debts[index].paymentMode,
      notes: input.notes ?? state.debts[index].notes,
    };
    return state.debts[index];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("debts")
    .update({
      name: input.name,
      creditor: input.creditor,
      outstanding_balance_satang: input.outstandingBalanceSatang,
      amount_due_satang: input.amountDueSatang,
      minimum_payment_satang: input.minimumPaymentSatang,
      due_date: input.dueDate,
      recurring_due_day: input.recurringDueDay,
      payment_mode: input.paymentMode,
      notes: input.notes,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapDebt(data);
}

export async function markDebtPaidOff(userId: string, id: string): Promise<Debt> {
  return setDebtStatus(userId, id, "paid_off");
}

export async function reopenDebt(userId: string, id: string): Promise<Debt> {
  return setDebtStatus(userId, id, "active");
}

async function setDebtStatus(userId: string, id: string, status: Debt["status"]): Promise<Debt> {
  if (isMockAuthEnabled()) {
    const debt = getMockState().debts.find((item) => item.id === id);
    if (!debt) throw new Error("Debt not found");
    assertOwner(userId, debt.userId);
    debt.status = status;
    return debt;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("debts")
    .update({
      status,
      paid_off_at: status === "paid_off" ? new Date().toISOString() : undefined,
      reopened_at: status === "active" ? new Date().toISOString() : undefined,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapDebt(data);
}

export async function addDebtPayment(userId: string, debtId: string, amountSatang: number) {
  const now = new Date().toISOString();
  const debt = await getDebtForUser(userId, debtId);
  const transaction = await createTransaction(userId, {
    type: "debt_payment",
    amountSatang,
    occurredAt: now,
    merchant: `ชำระ ${debt.name}`,
    debtId,
  });

  if (!isMockAuthEnabled()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("debt_payments").insert({
      user_id: userId,
      debt_id: debtId,
      transaction_id: transaction.id,
      amount_satang: amountSatang,
      paid_at: now,
    });
    if (error) throw new Error(error.message);
  }

  await recalculateDebtPaidThisCycle(userId, debtId);
  const [updatedDebt] = await listDebts(userId, true).then((debts) => debts.filter((item) => item.id === debtId));
  return { debt: updatedDebt ?? debt, transaction };
}

async function getDebtForUser(userId: string, debtId: string): Promise<Debt> {
  const debt = (await listDebts(userId, true)).find((item) => item.id === debtId);
  if (!debt) throw new Error("Debt not found");
  return debt;
}

export async function recalculateDebtPaidThisCycle(userId: string, debtId: string) {
  if (isMockAuthEnabled()) {
    recalculateMockDebtPaid(userId, debtId);
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("amount_satang")
    .eq("user_id", userId)
    .eq("debt_id", debtId)
    .eq("type", "debt_payment")
    .eq("status", "confirmed");
  if (error) throw new Error(error.message);
  const total = (data ?? []).reduce((sum, row) => sum + Number(row.amount_satang), 0);
  const { error: updateError } = await supabase
    .from("debts")
    .update({ amount_paid_this_cycle_satang: total })
    .eq("id", debtId)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);
}

function recalculateMockDebtPaid(userId: string, debtId: string) {
  const state = getMockState();
  const debt = state.debts.find((item) => item.id === debtId && item.userId === userId);
  if (!debt) return;
  debt.amountPaidThisCycleSatang = state.transactions
    .filter(
      (transaction) =>
        transaction.userId === userId &&
        transaction.debtId === debtId &&
        transaction.type === "debt_payment" &&
        transaction.status === "confirmed",
    )
    .reduce((sum, transaction) => sum + transaction.amountSatang, 0);
}

function nextMonthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.toISOString().slice(0, 10)}T00:00:00+07:00`;
}

export async function createDocument(
  userId: string,
  input: {
    id?: string;
    status: FinanceDocument["status"];
    documentType?: string;
    storageBucket: string;
    storagePath: string;
    originalFilename?: string;
    mimeType: string;
    fileSizeBytes: number;
    errorMessage?: string;
  },
): Promise<FinanceDocument> {
  if (isMockAuthEnabled()) {
    const document: FinanceDocument = {
      id: input.id || crypto.randomUUID(),
      userId,
      status: input.status,
      documentType: input.documentType,
      storageBucket: input.storageBucket,
      storagePath: input.storagePath,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      errorMessage: input.errorMessage,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    getMockState().documents.unshift(document);
    return document;
  }

  const supabase = await createSupabaseServerClient();
  const insertPayload: Record<string, unknown> = {
    user_id: userId,
    status: input.status,
    document_type: input.documentType,
    storage_bucket: input.storageBucket,
    storage_path: input.storagePath,
    original_filename: input.originalFilename,
    mime_type: input.mimeType,
    file_size_bytes: input.fileSizeBytes,
    error_message: input.errorMessage,
  };
  if (input.id) {
    insertPayload.id = input.id;
  }

  const { data, error } = await supabase
    .from("documents")
    .insert(insertPayload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapDocument(data);
}

export async function getDocument(userId: string, id: string): Promise<FinanceDocument | null> {
  if (isMockAuthEnabled()) {
    const doc = getMockState().documents.find((d) => d.id === id && d.userId === userId);
    return doc ?? null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDocument(data) : null;
}

export async function updateDocument(
  userId: string,
  id: string,
  input: Partial<{
    status: FinanceDocument["status"];
    documentType: string;
    errorMessage: string | null;
  }>,
): Promise<FinanceDocument> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.documents.findIndex((d) => d.id === id && d.userId === userId);
    if (index < 0) throw new Error("Document not found");
    state.documents[index] = {
      ...state.documents[index],
      status: input.status ?? state.documents[index].status,
      documentType: input.hasOwnProperty("documentType") ? input.documentType : state.documents[index].documentType,
      errorMessage: input.hasOwnProperty("errorMessage") ? (input.errorMessage ?? undefined) : state.documents[index].errorMessage,
      updatedAt: new Date().toISOString(),
    };
    return state.documents[index];
  }

  const supabase = await createSupabaseServerClient();
  const updatePayload: Record<string, unknown> = {};
  if (input.status !== undefined) updatePayload.status = input.status;
  if (input.documentType !== undefined) updatePayload.document_type = input.documentType;
  if (input.errorMessage !== undefined) updatePayload.error_message = input.errorMessage;

  const { data, error } = await supabase
    .from("documents")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapDocument(data);
}

export async function deleteDocument(userId: string, id: string): Promise<void> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    state.documents = state.documents.filter((d) => !(d.id === id && d.userId === userId));
    state.documentExtractions = state.documentExtractions.filter((e) => !(e.documentId === id && e.userId === userId));
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function createDocumentExtraction(
  userId: string,
  input: {
    documentId: string;
    model: string;
    rawOutput: unknown;
    normalizedPreview: unknown;
    confidence?: number;
    warnings: string[];
    unclearFields: string[];
    requiresReview?: boolean;
  },
): Promise<DocumentExtraction> {
  if (isMockAuthEnabled()) {
    const extraction: DocumentExtraction = {
      id: crypto.randomUUID(),
      userId,
      documentId: input.documentId,
      model: input.model,
      rawOutput: input.rawOutput,
      normalizedPreview: input.normalizedPreview,
      confidence: input.confidence,
      warnings: input.warnings,
      unclearFields: input.unclearFields,
      requiresReview: input.requiresReview ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    getMockState().documentExtractions.unshift(extraction);
    return extraction;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_extractions")
    .insert({
      user_id: userId,
      document_id: input.documentId,
      model: input.model,
      raw_output: input.rawOutput,
      normalized_preview: input.normalizedPreview,
      confidence: input.confidence,
      warnings: input.warnings,
      unclear_fields: input.unclearFields,
      requires_review: input.requiresReview ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapDocumentExtraction(data);
}

export async function getDocumentExtraction(
  userId: string,
  documentId: string,
): Promise<DocumentExtraction | null> {
  if (isMockAuthEnabled()) {
    const ext = getMockState().documentExtractions.find((e) => e.documentId === documentId && e.userId === userId);
    return ext ?? null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_extractions")
    .select("*")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDocumentExtraction(data) : null;
}

export async function listRecentConfirmedTransactions(userId: string): Promise<Transaction[]> {
  if (isMockAuthEnabled()) {
    return getMockState().transactions
      .filter((tx) => tx.userId === userId && tx.status === "confirmed")
      .slice(0, 100);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTransaction);
}

// === History Import Batches Repository ===

export async function createImportBatch(
  userId: string,
  input: {
    sourceType: string;
    sourceName?: string;
    accountId?: string;
    originalFilename?: string;
    storagePath: string;
    mimeType: string;
    fileSize: number;
    periodStart?: string;
    periodEnd?: string;
    statementDate?: string;
  },
): Promise<ImportBatch> {
  if (isMockAuthEnabled()) {
    const batch: ImportBatch = {
      id: crypto.randomUUID(),
      userId,
      sourceType: input.sourceType,
      sourceName: input.sourceName,
      accountId: input.accountId,
      originalFilename: input.originalFilename,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      statementDate: input.statementDate,
      status: "uploaded",
      totalRows: 0,
      parsedRows: 0,
      readyRows: 0,
      duplicateRows: 0,
      reviewRows: 0,
      skippedRows: 0,
      importedRows: 0,
      failedRows: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    getMockState().importBatches.unshift(batch);
    return batch;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      user_id: userId,
      source_type: input.sourceType,
      source_name: input.sourceName,
      account_id: input.accountId,
      original_filename: input.originalFilename,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size: input.fileSize,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      statement_date: input.statementDate,
      status: "uploaded",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapImportBatch(data);
}

export async function getImportBatch(userId: string, id: string): Promise<ImportBatch | null> {
  if (isMockAuthEnabled()) {
    const batch = getMockState().importBatches.find((b) => b.id === id && b.userId === userId);
    return batch ?? null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapImportBatch(data) : null;
}

export async function updateImportBatch(
  userId: string,
  id: string,
  input: Partial<Omit<ImportBatch, "id" | "userId" | "createdAt" | "updatedAt">>,
): Promise<ImportBatch> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const idx = state.importBatches.findIndex((b) => b.id === id && b.userId === userId);
    if (idx < 0) throw new Error("Import batch not found");
    state.importBatches[idx] = {
      ...state.importBatches[idx],
      ...input,
      updatedAt: new Date().toISOString(),
    } as ImportBatch;
    return state.importBatches[idx];
  }

  const supabase = await createSupabaseServerClient();
  const payload: Record<string, unknown> = {};
  if (input.status !== undefined) payload.status = input.status;
  if (input.totalRows !== undefined) payload.total_rows = input.totalRows;
  if (input.parsedRows !== undefined) payload.parsed_rows = input.parsedRows;
  if (input.readyRows !== undefined) payload.ready_rows = input.readyRows;
  if (input.duplicateRows !== undefined) payload.duplicate_rows = input.duplicateRows;
  if (input.reviewRows !== undefined) payload.review_rows = input.reviewRows;
  if (input.skippedRows !== undefined) payload.skipped_rows = input.skippedRows;
  if (input.importedRows !== undefined) payload.imported_rows = input.importedRows;
  if (input.accountId !== undefined) payload.account_id = input.accountId;
  if (input.periodStart !== undefined) payload.period_start = input.periodStart;
  if (input.periodEnd !== undefined) payload.period_end = input.periodEnd;
  if (input.completedAt !== undefined) payload.completed_at = input.completedAt;
  if (input.rolledBackAt !== undefined) payload.rolled_back_at = input.rolledBackAt;

  const { data, error } = await supabase
    .from("import_batches")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapImportBatch(data);
}

export async function listImportBatches(userId: string): Promise<ImportBatch[]> {
  if (isMockAuthEnabled()) {
    return getMockState().importBatches.filter((b) => b.userId === userId);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapImportBatch);
}

export async function deleteImportBatch(userId: string, id: string): Promise<void> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    state.importBatches = state.importBatches.filter((b) => !(b.id === id && b.userId === userId));
    state.importRows = state.importRows.filter((r) => !(r.importBatchId === id && r.userId === userId));
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("import_batches")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// === History Import Staging Rows Repository ===

export async function createImportRows(
  userId: string,
  rows: Omit<ImportRow, "id" | "createdAt" | "updatedAt">[],
): Promise<ImportRow[]> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const created: ImportRow[] = rows.map((r) => ({
      ...r,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    state.importRows.push(...created);
    return created;
  }

  const supabase = await createSupabaseServerClient();
  const payloads = rows.map((r) => ({
    user_id: userId,
    import_batch_id: r.importBatchId,
    source_row_index: r.sourceRowIndex,
    raw_text: r.rawText,
    raw_data: r.rawData,
    occurred_at: r.occurredAt,
    posted_at: r.postedAt,
    description: r.description,
    merchant: r.merchant,
    amount_satang: r.amountSatang,
    direction: r.direction,
    running_balance_satang: r.runningBalanceSatang,
    currency: r.currency,
    reference_number: r.referenceNumber,
    source_account_last_four: r.sourceAccountLastFour,
    destination_account_last_four: r.destinationAccountLastFour,
    suggested_transaction_type: r.suggestedTransactionType,
    suggested_category: r.suggestedCategory,
    suggested_debt_id: r.suggestedDebtId,
    suggested_account_id: r.suggestedAccountId,
    confidence: r.confidence,
    duplicate_score: r.duplicateScore,
    duplicate_transaction_id: r.duplicateTransactionId,
    review_status: r.reviewStatus,
    import_decision: r.importDecision,
    validation_warnings: r.validationWarnings,
  }));

  const { data, error } = await supabase
    .from("import_rows")
    .insert(payloads)
    .select("*");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapImportRow);
}

export async function listImportRows(userId: string, importBatchId: string): Promise<ImportRow[]> {
  if (isMockAuthEnabled()) {
    return getMockState().importRows
      .filter((r) => r.importBatchId === importBatchId && r.userId === userId)
      .sort((a, b) => a.sourceRowIndex - b.sourceRowIndex);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_rows")
    .select("*")
    .eq("import_batch_id", importBatchId)
    .eq("user_id", userId)
    .order("source_row_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapImportRow);
}

export async function updateImportRow(
  userId: string,
  id: string,
  input: Partial<Omit<ImportRow, "id" | "userId" | "importBatchId" | "createdAt" | "updatedAt">>,
): Promise<ImportRow> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const idx = state.importRows.findIndex((r) => r.id === id && r.userId === userId);
    if (idx < 0) throw new Error("Staging row not found");
    state.importRows[idx] = {
      ...state.importRows[idx],
      ...input,
      updatedAt: new Date().toISOString(),
    } as ImportRow;
    return state.importRows[idx];
  }

  const supabase = await createSupabaseServerClient();
  const payload: Record<string, unknown> = {};
  if (input.reviewStatus !== undefined) payload.review_status = input.reviewStatus;
  if (input.importDecision !== undefined) payload.import_decision = input.importDecision;
  if (input.suggestedTransactionType !== undefined) payload.suggested_transaction_type = input.suggestedTransactionType;
  if (input.suggestedCategory !== undefined) payload.suggested_category = input.suggestedCategory;
  if (input.suggestedDebtId !== undefined) payload.suggested_debt_id = input.suggestedDebtId;
  if (input.createdTransactionId !== undefined) payload.created_transaction_id = input.createdTransactionId;
  if (input.amountSatang !== undefined) payload.amount_satang = input.amountSatang;
  if (input.merchant !== undefined) payload.merchant = input.merchant;
  if (input.description !== undefined) payload.description = input.description;

  const { data, error } = await supabase
    .from("import_rows")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapImportRow(data);
}

// === History Staging Batch Commit Logic ===

export async function importReviewedRows(
  userId: string,
  batchId: string,
  accountId: string | undefined,
  rowDecisions: {
    rowId: string;
    decision: "import" | "merge_existing" | "skip";
    transactionType?: Transaction["type"];
    category?: string;
    debtId?: string;
    occurredAt?: string;
    merchant?: string;
    amountSatang?: number;
    duplicateTransactionId?: string;
  }[],
): Promise<{ importedCount: number; mergedCount: number; skippedCount: number }> {
  let importedCount = 0;
  let mergedCount = 0;
  let skippedCount = 0;

  for (const dec of rowDecisions) {
    if (dec.decision === "import") {
      const type = dec.transactionType || "expense";
      const amount = dec.amountSatang || 0;

      // Idempotency guard: skip rows already linked to a transaction
      const existingRow = getMockState().importRows.find((r) => r.id === dec.rowId && r.userId === userId);
      if (isMockAuthEnabled() && existingRow?.createdTransactionId) {
        importedCount++; // count as imported but don't create duplicate
        continue;
      }

      let createdTxId = "";
      if (type === "debt_payment" && dec.debtId) {
        // Debt payment path
        const dp = await addDebtPayment(userId, dec.debtId, amount);
        createdTxId = dp.transaction.id;
        // If a transaction was created, link it back to the batch/row
        if (createdTxId) {
          await updateTransaction(userId, createdTxId, {
            importBatchId: batchId,
            importRowId: dec.rowId,
            isHistorical: true,
            source: "history_import",
          });
        }
      } else {
        // Normal transaction path
        // Decide sourceAccountId and destinationAccountId based on accountId ownership
        const sourceAccountId = type === "expense" || type === "transfer" ? accountId : undefined;
        const destinationAccountId = type === "income" || type === "transfer" ? accountId : undefined;

        const tx = await createTransaction(userId, {
          type,
          amountSatang: amount,
          occurredAt: dec.occurredAt || new Date().toISOString(),
          merchant: dec.merchant,
          category: dec.category,
          sourceAccountId,
          destinationAccountId,
          debtId: dec.debtId,
          source: "history_import",
          documentId: undefined,
        });

        // Set the link on the created transaction
        await updateTransaction(userId, tx.id, {
          importBatchId: batchId,
          importRowId: dec.rowId,
          isHistorical: true,
        });
        createdTxId = tx.id;
      }

      // Update staging row status
      await updateImportRow(userId, dec.rowId, {
        reviewStatus: "imported",
        importDecision: "import",
        createdTransactionId: createdTxId,
      });
      importedCount++;
    } else if (dec.decision === "merge_existing" && dec.duplicateTransactionId) {
      // Merge transaction path
      // Link the existing transaction to this batch and staging row as evidence
      await updateTransaction(userId, dec.duplicateTransactionId, {
        importBatchId: batchId,
        importRowId: dec.rowId,
      });

      // Update staging row status
      await updateImportRow(userId, dec.rowId, {
        reviewStatus: "imported",
        importDecision: "merge_existing",
        createdTransactionId: dec.duplicateTransactionId,
      });
      mergedCount++;
    } else if (dec.decision === "skip") {
      // Skip path
      await updateImportRow(userId, dec.rowId, {
        reviewStatus: "skipped",
        importDecision: "skip",
      });
      skippedCount++;
    }
  }

  // Update batch progress
  const batch = await getImportBatch(userId, batchId);
  if (batch) {
    const newImported = (batch.importedRows || 0) + importedCount;
    const newSkipped = (batch.skippedRows || 0) + skippedCount;
    // status is 'completed' if all staging rows are resolved, else 'partially_imported'
    const stagingRows = await listImportRows(userId, batchId);
    const unresolvedCount = stagingRows.filter((r) => r.importDecision === "unresolved").length;
    const status = unresolvedCount === 0 ? "completed" : "partially_imported";

    await updateImportBatch(userId, batchId, {
      importedRows: newImported,
      skippedRows: newSkipped,
      status,
      completedAt: new Date().toISOString(),
      accountId,
    });
  }

  return { importedCount, mergedCount, skippedCount };
}

// === History Staging Batch Rollback Logic ===

export async function rollbackImportBatch(userId: string, batchId: string): Promise<void> {
  if (isMockAuthEnabled()) {
    const state = getMockState();

    // Idempotency: already rolled back — safe no-op
    const batch = state.importBatches.find((b) => b.id === batchId && b.userId === userId);
    if (!batch) throw new Error("ไม่พบชุดนำเข้าข้อมูล");
    if (batch.status === "rolled_back") return; // safe re-entry
    if (batch.status !== "completed" && batch.status !== "partially_imported") {
      throw new Error("ไม่สามารถ Rollback ชุดข้อมูลที่ยังไม่ได้นำเข้า");
    }

    // 1. Delete transactions created by this batch
    const targetTxs = state.transactions.filter(
      (tx) => tx.importBatchId === batchId && tx.isHistorical === true && tx.userId === userId
    );
    const targetTxIds = targetTxs.map((tx) => tx.id);

    // Delete associated debt payments
    state.debts.forEach((_debt) => {
      // Recalculate debt progress logic handled by repository usually, mock state needs manual recalculation
    });
    // In mock store, delete transactions
    state.transactions = state.transactions.filter((tx) => !targetTxIds.includes(tx.id));

    // 2. Unlink pre-existing merged transactions
    state.transactions.forEach((tx) => {
      if (tx.importBatchId === batchId && tx.userId === userId) {
        tx.importBatchId = undefined;
        tx.importRowId = undefined;
      }
    });

    // 3. Reset staging rows
    state.importRows.forEach((row) => {
      if (row.importBatchId === batchId && row.userId === userId) {
        row.reviewStatus = "ready";
        row.importDecision = "unresolved";
        row.createdTransactionId = undefined;
      }
    });

    // 4. Set batch status
    const batchIdx = state.importBatches.findIndex((b) => b.id === batchId && b.userId === userId);
    if (batchIdx >= 0) {
      state.importBatches[batchIdx] = {
        ...state.importBatches[batchIdx],
        status: "rolled_back",
        importedRows: 0,
        skippedRows: 0,
        rolledBackAt: new Date().toISOString(),
      };
    }
    return;
  }

  const supabase = await createSupabaseServerClient();

  // State validation: check batch is rollbackable
  const { data: batchData, error: batchFetchError } = await supabase
    .from("import_batches")
    .select("status")
    .eq("id", batchId)
    .eq("user_id", userId)
    .maybeSingle();
  if (batchFetchError) throw new Error(batchFetchError.message);
  if (!batchData) throw new Error("ไม่พบชุดนำเข้าข้อมูล");
  if (batchData.status === "rolled_back") return; // idempotent: safe re-entry
  if (batchData.status !== "completed" && batchData.status !== "partially_imported") {
    throw new Error("ไม่สามารถ Rollback ชุดข้อมูลที่ยังไม่ได้นำเข้า");
  }

  // 1. Get transactions created by this batch
  const { data: txs, error: txError } = await supabase
    .from("transactions")
    .select("id")
    .eq("import_batch_id", batchId)
    .eq("user_id", userId)
    .eq("is_historical", true);

  if (txError) throw new Error(txError.message);
  const txIds = (txs ?? []).map((t) => t.id);

  if (txIds.length > 0) {
    // Delete associated debt payments first to prevent orphans
    const { error: dpError } = await supabase
      .from("debt_payments")
      .delete()
      .in("transaction_id", txIds)
      .eq("user_id", userId);
    if (dpError) throw new Error(dpError.message);

    // Delete historical transactions
    const { error: delTxError } = await supabase
      .from("transactions")
      .delete()
      .in("id", txIds)
      .eq("user_id", userId);
    if (delTxError) throw new Error(delTxError.message);
  }

  // 2. Unlink merged transactions
  const { error: unlinkError } = await supabase
    .from("transactions")
    .update({ import_batch_id: null, import_row_id: null })
    .eq("import_batch_id", batchId)
    .eq("user_id", userId);
  if (unlinkError) throw new Error(unlinkError.message);

  // 3. Reset staging rows
  const { error: resetRowsError } = await supabase
    .from("import_rows")
    .update({
      review_status: "ready",
      import_decision: "unresolved",
      created_transaction_id: null,
    })
    .eq("import_batch_id", batchId)
    .eq("user_id", userId);
  if (resetRowsError) throw new Error(resetRowsError.message);

  // 4. Mark batch rolled_back
  const { error: batchUpdateError } = await supabase
    .from("import_batches")
    .update({
      status: "rolled_back",
      imported_rows: 0,
      skipped_rows: 0,
      rolled_back_at: new Date().toISOString(),
    })
    .eq("id", batchId)
    .eq("user_id", userId);
  if (batchUpdateError) throw new Error(batchUpdateError.message);
}

export async function listAccounts(userId: string): Promise<Account[]> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    if (state.accounts.length === 0) {
      state.accounts = [
        { id: "acc-1", name: "KBank Savings", isOwnedByUser: true, accountLastFour: "1234" },
        { id: "acc-2", name: "SCB Easy", isOwnedByUser: true, accountLastFour: "4321" },
        { id: "acc-3", name: "KTC Credit Card", isOwnedByUser: true, accountLastFour: "8888" },
      ];
    }
    return state.accounts;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    isOwnedByUser: row.is_owned_by_user as boolean,
    accountLastFour: (row.account_last_four as string | null) ?? undefined,
  }));
}

export async function createAccount(
  userId: string,
  input: { name: string; isOwnedByUser?: boolean; accountLastFour?: string },
): Promise<Account> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const acc: Account = {
      id: crypto.randomUUID(),
      name: input.name,
      isOwnedByUser: input.isOwnedByUser ?? true,
      accountLastFour: input.accountLastFour,
    };
    state.accounts.push(acc);
    return acc;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userId,
      name: input.name,
      is_owned_by_user: input.isOwnedByUser ?? true,
      account_last_four: input.accountLastFour,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    name: data.name,
    isOwnedByUser: data.is_owned_by_user,
    accountLastFour: data.account_last_four ?? undefined,
  };
}


