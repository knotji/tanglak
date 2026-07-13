import type { Debt, Transaction, FinanceDocument, DocumentExtraction, ImportBatch, ImportRow, MonthlyBudget, BudgetCategory } from "@/types/domain";

type TransactionRow = {
  id: string;
  user_id: string;
  type: Transaction["type"];
  status: Transaction["status"];
  amount_satang: number | string;
  currency: "THB";
  occurred_at: string;
  merchant: string | null;
  category_label?: string | null;
  category_source?: string | null;
  category_confidence?: number | string | null;
  source_account_id: string | null;
  destination_account_id: string | null;
  debt_id: string | null;
  document_id: string | null;
  reference_number: string | null;
  payment_method: string | null;
  account_last_four: string | null;
  destination_account_last_four: string | null;
  bank: string | null;
  source: Transaction["source"];
  confidence: number | string | null;
  note: string | null;
  import_batch_id: string | null;
  import_row_id: string | null;
  is_historical: boolean;
  updated_at?: string;
};

type DebtRow = {
  id: string;
  user_id: string;
  name: string;
  creditor: string | null;
  debt_type: Debt["debtType"];
  payment_mode: Debt["paymentMode"];
  original_amount_satang: number | string | null;
  outstanding_balance_satang: number | string | null;
  statement_balance_satang: number | string | null;
  amount_due_satang: number | string | null;
  minimum_payment_satang: number | string | null;
  amount_paid_this_cycle_satang: number | string;
  due_date: string | null;
  recurring_due_day: number | null;
  statement_date: string | null;
  cycle_start_date: string | null;
  cycle_end_date: string | null;
  interest_rate_annual: number | string | null;
  remaining_installments: number | null;
  credit_limit_satang: number | string | null;
  status: Debt["status"];
  notes: string | null;
};

function toNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return Number(value);
}

export function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    status: row.status,
    amountSatang: Number(row.amount_satang),
    currency: row.currency,
    occurredAt: row.occurred_at,
    merchant: row.merchant ?? undefined,
    category: row.category_label ?? undefined,
    categorySource: row.category_source ?? undefined,
    categoryConfidence: toNumber(row.category_confidence),
    sourceAccountId: row.source_account_id ?? undefined,
    destinationAccountId: row.destination_account_id ?? undefined,
    debtId: row.debt_id ?? undefined,
    documentId: row.document_id ?? undefined,
    referenceNumber: row.reference_number ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    accountLastFour: row.account_last_four ?? undefined,
    destinationAccountLastFour: row.destination_account_last_four ?? undefined,
    bank: row.bank ?? undefined,
    source: row.source,
    confidence: toNumber(row.confidence),
    note: row.note ?? undefined,
    importBatchId: row.import_batch_id ?? undefined,
    importRowId: row.import_row_id ?? undefined,
    isHistorical: row.is_historical,
    updatedAt: row.updated_at ?? undefined,
  };
}

export function mapDebt(row: DebtRow): Debt {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    creditor: row.creditor ?? undefined,
    debtType: row.debt_type,
    paymentMode: row.payment_mode,
    originalAmountSatang: toNumber(row.original_amount_satang),
    outstandingBalanceSatang: toNumber(row.outstanding_balance_satang),
    statementBalanceSatang: toNumber(row.statement_balance_satang),
    amountDueSatang: toNumber(row.amount_due_satang),
    minimumPaymentSatang: toNumber(row.minimum_payment_satang),
    amountPaidThisCycleSatang: Number(row.amount_paid_this_cycle_satang),
    dueDate: row.due_date ?? undefined,
    recurringDueDay: row.recurring_due_day ?? undefined,
    statementDate: row.statement_date ?? undefined,
    cycleStartDate: row.cycle_start_date ?? undefined,
    cycleEndDate: row.cycle_end_date ?? undefined,
    interestRateAnnual: toNumber(row.interest_rate_annual),
    remainingInstallments: row.remaining_installments ?? undefined,
    creditLimitSatang: toNumber(row.credit_limit_satang),
    status: row.status,
    notes: row.notes ?? undefined,
  };
}

interface DocumentRow {
  id: string;
  user_id: string;
  status: FinanceDocument["status"];
  document_type?: string | null;
  storage_bucket: string;
  storage_path: string;
  original_filename?: string | null;
  mime_type: string;
  file_size_bytes: number | string;
  error_message?: string | null;
  processing_started_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentExtractionRow {
  id: string;
  user_id: string;
  document_id: string;
  model: string;
  raw_output: unknown;
  normalized_preview: unknown;
  confidence?: number | string | null;
  warnings?: string[] | null;
  unclear_fields?: string[] | null;
  requires_review: boolean;
  created_at: string;
  updated_at: string;
}

export function mapDocument(row: DocumentRow): FinanceDocument {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    documentType: row.document_type ?? undefined,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    originalFilename: row.original_filename ?? undefined,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    errorMessage: row.error_message ?? undefined,
    processingStartedAt: row.processing_started_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDocumentExtraction(row: DocumentExtractionRow): DocumentExtraction {
  return {
    id: row.id,
    userId: row.user_id,
    documentId: row.document_id,
    model: row.model,
    rawOutput: row.raw_output,
    normalizedPreview: row.normalized_preview,
    confidence: row.confidence ? Number(row.confidence) : undefined,
    warnings: row.warnings ?? [],
    unclearFields: row.unclear_fields ?? [],
    requiresReview: row.requires_review,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ImportBatchRow {
  id: string;
  user_id: string;
  source_type: string;
  source_name?: string | null;
  account_id?: string | null;
  original_filename?: string | null;
  storage_path: string;
  mime_type: string;
  file_size: number | string;
  period_start?: string | null;
  period_end?: string | null;
  statement_date?: string | null;
  status: ImportBatch["status"];
  total_rows: number;
  parsed_rows: number;
  ready_rows: number;
  duplicate_rows: number;
  review_rows: number;
  skipped_rows: number;
  imported_rows: number;
  failed_rows: number;
  parser_name?: string | null;
  parser_version?: string | null;
  model_name?: string | null;
  statement_metadata?: unknown;
  detected_layout?: unknown;
  page_count?: number | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  rolled_back_at?: string | null;
}

interface ImportRowRow {
  id: string;
  user_id: string;
  import_batch_id: string;
  source_row_index: number;
  raw_text?: string | null;
  raw_data?: unknown;
  occurred_at: string;
  posted_at?: string | null;
  description: string;
  merchant?: string | null;
  amount_satang: number | string;
  direction: ImportRow["direction"];
  running_balance_satang?: number | string | null;
  currency: string;
  reference_number?: string | null;
  source_account_last_four?: string | null;
  destination_account_last_four?: string | null;
  suggested_transaction_type?: Transaction["type"] | null;
  suggested_category?: string | null;
  suggested_debt_id?: string | null;
  suggested_account_id?: string | null;
  confidence?: number | string | null;
  duplicate_score: number;
  duplicate_transaction_id?: string | null;
  review_status: ImportRow["reviewStatus"];
  import_decision: ImportRow["importDecision"];
  validation_warnings: string[];
  created_transaction_id?: string | null;
  page_number?: number | null;
  source_line_start?: number | null;
  source_line_end?: number | null;
  parser_source: ImportRow["parserSource"];
  parser_confidence?: number | string | null;
  row_fingerprint?: string | null;
  created_at: string;
  updated_at: string;
}

export function mapImportBatch(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    sourceName: row.source_name ?? undefined,
    accountId: row.account_id ?? undefined,
    originalFilename: row.original_filename ?? undefined,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    periodStart: row.period_start ?? undefined,
    periodEnd: row.period_end ?? undefined,
    statementDate: row.statement_date ?? undefined,
    status: row.status,
    totalRows: row.total_rows,
    parsedRows: row.parsed_rows,
    readyRows: row.ready_rows,
    duplicateRows: row.duplicate_rows,
    reviewRows: row.review_rows,
    skippedRows: row.skipped_rows,
    importedRows: row.imported_rows,
    failedRows: row.failed_rows,
    parserName: row.parser_name ?? undefined,
    parserVersion: row.parser_version ?? undefined,
    modelName: row.model_name ?? undefined,
    statementMetadata: row.statement_metadata ?? undefined,
    detectedLayout: row.detected_layout ?? undefined,
    pageCount: row.page_count ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    rolledBackAt: row.rolled_back_at ?? undefined,
  };
}

export function mapImportRow(row: ImportRowRow): ImportRow {
  return {
    id: row.id,
    userId: row.user_id,
    importBatchId: row.import_batch_id,
    sourceRowIndex: row.source_row_index,
    rawText: row.raw_text ?? undefined,
    rawData: row.raw_data,
    occurredAt: row.occurred_at,
    postedAt: row.posted_at ?? undefined,
    description: row.description,
    merchant: row.merchant ?? undefined,
    amountSatang: Number(row.amount_satang),
    direction: row.direction,
    runningBalanceSatang: toNumber(row.running_balance_satang),
    currency: row.currency,
    referenceNumber: row.reference_number ?? undefined,
    sourceAccountLastFour: row.source_account_last_four ?? undefined,
    destinationAccountLastFour: row.destination_account_last_four ?? undefined,
    suggestedTransactionType: row.suggested_transaction_type ?? undefined,
    suggestedCategory: row.suggested_category ?? undefined,
    suggestedDebtId: row.suggested_debt_id ?? undefined,
    suggestedAccountId: row.suggested_account_id ?? undefined,
    confidence: toNumber(row.confidence),
    duplicateScore: row.duplicate_score,
    duplicateTransactionId: row.duplicate_transaction_id ?? undefined,
    reviewStatus: row.review_status,
    importDecision: row.import_decision,
    validationWarnings: row.validation_warnings ?? [],
    createdTransactionId: row.created_transaction_id ?? undefined,
    pageNumber: row.page_number ?? undefined,
    sourceLineStart: row.source_line_start ?? undefined,
    sourceLineEnd: row.source_line_end ?? undefined,
    parserSource: row.parser_source,
    parserConfidence: toNumber(row.parser_confidence),
    rowFingerprint: row.row_fingerprint ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type MonthlyBudgetRow = {
  id: string;
  user_id: string;
  month: string;
  income_satang: number | string;
  strategy: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export function mapMonthlyBudget(row: MonthlyBudgetRow): MonthlyBudget {
  return {
    id: row.id,
    userId: row.user_id,
    month: row.month,
    incomeSatang: Number(row.income_satang),
    strategy: row.strategy,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type BudgetCategoryRow = {
  id: string;
  user_id: string;
  monthly_budget_id: string;
  label: string;
  amount_satang: number | string;
  created_at: string;
  updated_at: string;
};

export function mapBudgetCategory(row: BudgetCategoryRow): BudgetCategory {
  return {
    id: row.id,
    userId: row.user_id,
    monthlyBudgetId: row.monthly_budget_id,
    label: row.label,
    amountSatang: Number(row.amount_satang),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
