export type Currency = "THB";

export type TransactionType =
  | "income"
  | "expense"
  | "debt_payment"
  | "transfer"
  | "refund";

export type TransactionStatus =
  | "draft"
  | "needs_review"
  | "confirmed"
  | "rejected";

export type TransactionSource =
  | "manual"
  | "salary_slip"
  | "transfer_slip"
  | "receipt"
  | "delivery_screenshot"
  | "statement"
  | "ai_extraction"
  | "history_import";

export type DebtType =
  | "credit_card"
  | "personal_loan"
  | "installment"
  | "mortgage"
  | "auto_loan"
  | "buy_now_pay_later"
  | "informal_loan"
  | "other";

export type DebtStatus = "active" | "paid_off" | "overdue" | "paused";

export type DebtPaymentMode =
  | "fixed_monthly"
  | "variable_monthly"
  | "installment"
  | "one_time";

export type AccountType =
  | "bank_account"
  | "cash"
  | "credit_card"
  | "e_wallet"
  | "loan_account"
  | "other";

export type DebtScheduleStatus = "upcoming" | "partial" | "paid" | "overdue";

export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "review_ready"
  | "needs_review"
  | "confirmed"
  | "failed_retryable"
  | "failed_permanent"
  | "failed";

export type ReminderStatus =
  | "scheduled"
  | "shown"
  | "dismissed"
  | "completed";

export type Account = {
  id: string;
  userId?: string;
  name: string;
  institutionName?: string;
  accountType?: AccountType;
  isOwnedByUser: boolean;
  lastFour?: string;
  accountLastFour?: string;
  currency?: Currency;
  isDefault?: boolean;
  isActive?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Transaction = {
  id: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  amountSatang: number;
  currency: Currency;
  occurredAt: string;
  merchant?: string;
  category?: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  debtId?: string;
  documentId?: string;
  referenceNumber?: string;
  paymentMethod?: string;
  accountLastFour?: string;
  destinationAccountLastFour?: string;
  bank?: string;
  source: TransactionSource;
  confidence?: number;
  note?: string;
  importBatchId?: string;
  importRowId?: string;
  isHistorical?: boolean;
};

export type Debt = {
  id: string;
  userId: string;
  name: string;
  creditor?: string;
  debtType: DebtType;
  paymentMode: DebtPaymentMode;
  originalAmountSatang?: number;
  outstandingBalanceSatang?: number;
  statementBalanceSatang?: number;
  amountDueSatang?: number;
  minimumPaymentSatang?: number;
  amountPaidThisCycleSatang: number;
  dueDate?: string;
  recurringDueDay?: number;
  statementDate?: string;
  cycleStartDate?: string;
  cycleEndDate?: string;
  interestRateAnnual?: number;
  remainingInstallments?: number;
  creditLimitSatang?: number;
  status: DebtStatus;
  notes?: string;
};

export type DuplicateCandidate = {
  transactionId: string;
  score: number;
  reasons: string[];
};

export type FinanceDocument = {
  id: string;
  userId: string;
  status: DocumentStatus;
  documentType?: string;
  storageBucket: string;
  storagePath: string;
  originalFilename?: string;
  mimeType: string;
  fileSizeBytes: number;
  errorMessage?: string;
  processingStartedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentExtraction = {
  id: string;
  userId: string;
  documentId: string;
  model: string;
  rawOutput: unknown;
  normalizedPreview: unknown;
  confidence?: number;
  warnings: string[];
  unclearFields: string[];
  requiresReview: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ImportBatchStatus =
  | "uploaded"
  | "processing"
  | "needs_review"
  | "partially_imported"
  | "completed"
  | "failed"
  | "rolled_back";

export type ImportRowDirection = "credit" | "debit" | "unknown";

export type ImportRowStatus =
  | "ready"
  | "needs_review"
  | "possible_duplicate"
  | "possible_transfer"
  | "possible_debt_payment"
  | "invalid"
  | "skipped"
  | "imported";

export type ImportRowDecision = "import" | "merge_existing" | "skip" | "unresolved";

export type ImportBatch = {
  id: string;
  userId: string;
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
  status: ImportBatchStatus;
  totalRows: number;
  parsedRows: number;
  readyRows: number;
  duplicateRows: number;
  reviewRows: number;
  skippedRows: number;
  importedRows: number;
  failedRows: number;
  parserName?: string;
  parserVersion?: string;
  modelName?: string;
  statementMetadata?: unknown;
  detectedLayout?: unknown;
  pageCount?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  rolledBackAt?: string;
};

export type ImportRowParserSource = "deterministic" | "gemini_assisted";

export type ImportRow = {
  id: string;
  userId: string;
  importBatchId: string;
  sourceRowIndex: number;
  rawText?: string;
  rawData?: unknown;
  occurredAt: string;
  postedAt?: string;
  description: string;
  merchant?: string;
  amountSatang: number;
  direction: ImportRowDirection;
  runningBalanceSatang?: number;
  currency: string;
  referenceNumber?: string;
  sourceAccountLastFour?: string;
  destinationAccountLastFour?: string;
  suggestedTransactionType?: TransactionType;
  suggestedCategory?: string;
  suggestedDebtId?: string;
  suggestedAccountId?: string;
  confidence?: number;
  duplicateScore: number;
  duplicateTransactionId?: string;
  reviewStatus: ImportRowStatus;
  importDecision: ImportRowDecision;
  validationWarnings: string[];
  createdTransactionId?: string;
  pageNumber?: number;
  sourceLineStart?: number;
  sourceLineEnd?: number;
  parserSource: ImportRowParserSource;
  parserConfidence?: number;
  rowFingerprint?: string;
  createdAt: string;
  updatedAt: string;
};

export type MonthlyBudget = {
  id: string;
  userId: string;
  /** Canonical Bangkok month key, always `YYYY-MM`. */
  month: string;
  incomeSatang: number;
  strategy: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type BudgetCategory = {
  id: string;
  userId: string;
  monthlyBudgetId: string;
  label: string;
  amountSatang: number;
  createdAt: string;
  updatedAt: string;
};
