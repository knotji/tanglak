"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { NextActionCard } from "@/components/NextActionCard";
import {
  confirmDocumentAction,
  deleteDocumentAction,
  retryExtractionAction,
  resolveDuplicateAction,
} from "@/app/actions/documents";
import type { FinanceDocument, DocumentExtraction, Debt, Transaction } from "@/types/domain";
import type { ExtractedFinancialDocument } from "@/lib/ai/schemas";
import { DOCUMENT_EXTRACTION_FALLBACK_MESSAGE } from "@/lib/ai/extraction-errors";
import { formatTHB } from "@/lib/finance/money";
import { parseOptionalMoney, parseRequiredMoney } from "@/lib/finance/money-guards";
import {
  getBangkokTodayString,
  getBangkokNowDateTimeLocalString,
  isValidDateKey,
  parseWallClockComponents,
  formatThaiDateTimeLabel,
  isLikelyInferredNoonTimestamp,
  TRANSACTION_OCCURRED_AT_REQUIRED_TH,
  formatStandardDateTime,
  bangkokDateTimeLocalToInstant,
} from "@/lib/finance/date";
import {
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Trash2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ReviewFormProps {
  document: FinanceDocument;
  extraction: DocumentExtraction | null;
  debts: Debt[];
  duplicateTransactions: (Transaction & { score: number; reasons: string[] })[];
  previewUrl: string;
}

/**
 * Client-side pre-check for the monetary fields on the currently visible
 * docType section, mirroring the field classification enforced server-side
 * in confirmDocumentAction (see docs/FINANCIAL_VALUE_GUARDS.md). This never
 * rewrites the user's input — it only returns the first Thai error message
 * to show, or null if the visible fields are all valid.
 */
function validateReviewMoneyFields(
  docType: string,
  fd: FormData,
  items: Array<{ amount?: number }>,
): string | null {
  const requireField = (name: string, severity: "nonnegative" | "positive") => {
    const result = parseRequiredMoney(fd.get(name), severity);
    return result.ok ? null : result.error!;
  };
  const optionalField = (name: string, severity: "nonnegative" | "positive") => {
    const result = parseOptionalMoney(fd.get(name), severity);
    return result.ok ? null : result.error!;
  };

  if (docType === "salary_slip") {
    return (
      requireField("netIncome", "nonnegative") ||
      optionalField("grossIncome", "nonnegative") ||
      optionalField("tax", "nonnegative") ||
      optionalField("socialSecurity", "nonnegative") ||
      null
    );
  }

  if (docType === "receipt" || docType === "delivery_receipt") {
    const invalidItem = items.some((item) => typeof item.amount === "number" && !Number.isFinite(item.amount))
      ? "รูปแบบจำนวนเงินไม่ถูกต้อง"
      : items.some((item) => typeof item.amount === "number" && item.amount < 0)
        ? "จำนวนเงินต้องไม่ติดลบ"
        : null;
    return invalidItem || requireField("totalPaid", "nonnegative");
  }

  if (docType === "transfer_slip") {
    const txType = String(fd.get("type") || "");
    return requireField("amount", txType === "debt_payment" ? "positive" : "nonnegative");
  }

  if (docType === "debt_statement") {
    const debtActionType = String(fd.get("debtActionType") || "");
    if (debtActionType !== "create" && debtActionType !== "update") {
      return "กรุณาเลือกวิธีบันทึกหนี้นี้";
    }
    return (
      optionalField("amountDue", "nonnegative") ||
      optionalField("outstandingBalance", "nonnegative") ||
      optionalField("statementBalance", "nonnegative") ||
      optionalField("minimumPayment", "nonnegative") ||
      null
    );
  }

  const txType = String(fd.get("type") || "");
  return requireField("totalPaid", txType === "debt_payment" ? "positive" : "nonnegative");
}

const OCCURRED_AT_UNCLEAR_FIELD = "transaction.occurredAt";
const OCCURRED_AT_NEEDS_REVIEW_TITLE_TH = "อ่านวันที่และเวลาไม่ชัด";
const OCCURRED_AT_NEEDS_REVIEW_BODY_TH = "กรุณาตรวจสอบหรือกรอกข้อมูลก่อนบันทึก";

type TransferReviewMode = "expense" | "transfer" | "debt_payment";

const TRANSFER_REVIEW_MODE_OPTIONS: Array<{
  value: TransferReviewMode;
  label: string;
  description: string;
}> = [
  {
    value: "expense",
    label: "ใช้จ่าย (Expense)",
    description: "ซื้อสินค้าหรือบริการ และนับเป็นรายจ่าย",
  },
  {
    value: "transfer",
    label: "โอนบัญชีตนเอง",
    description: "เงินย้ายระหว่างบัญชีของคุณ ไม่นับเป็นรายจ่าย",
  },
  {
    value: "debt_payment",
    label: "ชำระหนี้",
    description: "บันทึกเป็นการชำระหนี้และผูกกับบัญชีหนี้",
  },
];

const TRANSFER_REVIEW_CTA_LABELS: Record<TransferReviewMode, string> = {
  expense: "บันทึกเป็นรายจ่าย",
  transfer: "บันทึกเป็นเงินโอน",
  debt_payment: "บันทึกเป็นการชำระหนี้",
};

/**
 * Final-confirmation validation for the transaction date/time field,
 * mirroring the server-side check in confirmDocumentAction. debt_statement
 * has no transaction occurredAt (it uses a debt due date instead); every
 * other document type must have a real, parseable date/time before submit.
 * This never fabricates a value -- it only reports whether the field the
 * user can see is valid.
 */
function validateReviewOccurredAt(docType: string, fd: FormData): string | null {
  if (docType === "debt_statement") return null;
  if (docType === "salary_slip") {
    const paymentDate = String(fd.get("paymentDate") || "");
    return isValidDateKey(paymentDate) ? null : TRANSACTION_OCCURRED_AT_REQUIRED_TH;
  }
  const occurredAt = String(fd.get("occurredAt") || "");
  return parseWallClockComponents(occurredAt) ? null : TRANSACTION_OCCURRED_AT_REQUIRED_TH;
}

type TimestampDisplayState = "extracted" | "inferred" | "missing" | "invalid";

function getTimestampDisplayState(
  value: string,
  isFromDocument: boolean,
  wasInferred: boolean,
): TimestampDisplayState {
  if (!value) return "missing";
  if (!parseWallClockComponents(value)) return "invalid";
  if (isFromDocument && !wasInferred) return "extracted";
  return "inferred";
}

/**
 * Thai-formatted date/time confirmation shown next to each `datetime-local`
 * occurredAt input. The native input's own rendering is locale-dependent
 * (some browsers show MM/DD/YYYY, which reads ambiguously in Thai) — this
 * text is unambiguous regardless of browser locale, and re-derives on every
 * render so it stays in sync as the user edits the input.
 */
function TimestampHelperText({
  id,
  value,
  isFromDocument,
  wasInferred,
}: {
  id: string;
  value: string;
  isFromDocument: boolean;
  wasInferred: boolean;
}) {
  const state = getTimestampDisplayState(value, isFromDocument, wasInferred);

  if (state === "missing") {
    return (
      <p id={id} className="mt-1 text-xs font-semibold text-yellow-700">
        กรุณาระบุวันและเวลาที่ทำรายการ
      </p>
    );
  }

  if (state === "invalid") {
    return (
      <p id={id} className="mt-1 text-xs font-semibold text-red-600">
        กรุณาตรวจสอบวันและเวลาให้ถูกต้อง
      </p>
    );
  }

  const label = formatThaiDateTimeLabel(value);

  if (state === "inferred") {
    return (
      <p id={id} className="mt-1 text-xs font-semibold text-yellow-700">
        {label} · ควรตรวจสอบวันที่และเวลา
      </p>
    );
  }

  return (
    <p id={id} className="mt-1 text-xs text-text-secondary">
      {label} · อ่านจากเอกสาร
    </p>
  );
}

export function ReviewForm({
  document: initialDocument,
  extraction,
  debts,
  duplicateTransactions,
  previewUrl,
}: ReviewFormProps) {
  const router = useRouter();
  const [doc] = useState<FinanceDocument>(initialDocument);
  const normalizedPreview = extraction?.normalizedPreview as ExtractedFinancialDocument | undefined;
  const [docType, setDocType] = useState<string>(
    normalizedPreview?.documentType || doc.documentType || "other"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const isFailed = doc.status === "failed" || doc.status === "failed_retryable" || doc.status === "failed_permanent";
  // A document that is usable but still has a review-required field (e.g.
  // an unclear transaction date) stays retryable, same as a failed one --
  // reprocessing reuses this same document row and storage object.
  const canRetry = doc.status === "failed" || doc.status === "failed_retryable" || doc.status === "needs_review";
  const failedMessage = doc.errorMessage && !/Zod|expected|received|[\[\{]|Gemini|quota|stack|Error/i.test(doc.errorMessage)
    ? doc.errorMessage
    : DOCUMENT_EXTRACTION_FALLBACK_MESSAGE;

  // AI Normalized Preview Shortcuts
  const extData = (normalizedPreview || {}) as Partial<ExtractedFinancialDocument>;
  const initialTx = extData.transaction || {};
  const initialSalary = extData.salary || {};
  const initialReceipt = extData.receipt || {};
  const initialDebt = extData.debt || {};
  const occurredAtIsFromDocument = Boolean(initialTx.occurredAt);
  const occurredAtWasInferred = isLikelyInferredNoonTimestamp(initialTx.occurredAt);
  // Recorded by normalizeParsedTimestamp (src/lib/ai/gemini.ts) whenever the
  // provider's reported date/time couldn't be confidently read. When true,
  // the date/time inputs below must start blank rather than defaulting to
  // "now" -- prefilling a plausible-looking current time would hide the
  // gap and risk silently persisting a fabricated timestamp.
  const occurredAtNeedsReview = Boolean(extraction?.unclearFields?.includes(OCCURRED_AT_UNCLEAR_FIELD));
  // The occurredAt issue gets its own dedicated banner (below) with plain
  // Thai copy, not the raw dotted field-path technical wording -- exclude
  // it from the generic unclear-fields list so it isn't shown twice or as
  // "transaction.occurredAt".
  const otherUnclearFields = (extraction?.unclearFields ?? []).filter((f) => f !== OCCURRED_AT_UNCLEAR_FIELD);
  const dateFieldRef = useRef<HTMLInputElement>(null);
  // Red border for a missing or invalid datetime-local value, so the field
  // is clearly highlighted without relying on the helper text alone.
  const dateFieldBorderClass = (value: string) => {
    const state = getTimestampDisplayState(value, occurredAtIsFromDocument, occurredAtWasInferred);
    return state === "missing" || state === "invalid" ? "border-red-400" : "border-border";
  };

  // Form Fields State
  // 1. Salary slip fields
  const [employer, setEmployer] = useState(initialSalary.employer || initialTx.merchant || "");
  const [payPeriod, setPayPeriod] = useState(initialSalary.payPeriod || "");
  const [grossIncome, setGrossIncome] = useState(initialSalary.grossIncome?.toString() || "");
  const [netIncome, setNetIncome] = useState(
    initialSalary.netIncome?.toString() || initialTx.amount?.toString() || ""
  );
  const [tax, setTax] = useState(initialSalary.tax?.toString() || "0");
  const [socialSecurity, setSocialSecurity] = useState(
    initialSalary.socialSecurity?.toString() || "0"
  );
  const [paymentDate, setPaymentDate] = useState(
    initialTx.occurredAt?.slice(0, 10) || (occurredAtNeedsReview ? "" : getBangkokTodayString())
  );

  // 2. Receipt / Delivery receipt fields
  const [merchant, setMerchant] = useState(initialTx.merchant || "");
  const [occurredAt, setOccurredAt] = useState(
    initialTx.occurredAt?.slice(0, 16) || (occurredAtNeedsReview ? "" : getBangkokNowDateTimeLocalString())
  );
  const [subtotal, setSubtotal] = useState(initialReceipt.subtotal?.toString() || "");
  const [deliveryFee, setDeliveryFee] = useState(initialReceipt.deliveryFee?.toString() || "0");
  const [serviceFee, setServiceFee] = useState(initialReceipt.serviceFee?.toString() || "0");
  const [discount, setDiscount] = useState(initialReceipt.discount?.toString() || "0");
  const [totalPaid, setTotalPaid] = useState(
    initialReceipt.totalPaid?.toString() || initialTx.amount?.toString() || ""
  );
  const [paymentMethod, setPaymentMethod] = useState(initialTx.paymentMethod || "Cash");
  const [items, setItems] = useState<Array<{ name: string; quantity?: number; amount?: number }>>(
    initialReceipt.items || []
  );
  const [note, setNote] = useState(initialTx.note || "");

  // 3. Transfer slip fields
  const [transferAmount, setTransferAmount] = useState(initialTx.amount?.toString() || "");
  const [transferDate, setTransferDate] = useState(
    initialTx.occurredAt?.slice(0, 16) || (occurredAtNeedsReview ? "" : getBangkokNowDateTimeLocalString())
  );
  const [destinationName, setDestinationName] = useState(initialTx.merchant || "");
  const [refNumber, setRefNumber] = useState(initialTx.referenceNumber || "");
  const [bank, setBank] = useState(initialTx.bank || "");
  const [senderLastFour, setSenderLastFour] = useState(initialTx.accountLastFour || "");
  const [destLastFour, setDestLastFour] = useState(initialTx.destinationAccountLastFour || "");
  const [transferType, setTransferType] = useState<TransferReviewMode>(
    initialTx.possibleDebtPayment ? "debt_payment" : initialTx.possibleOwnAccountTransfer ? "transfer" : "expense"
  );
  const [linkedDebtId, setLinkedDebtId] = useState<string>("");

  // 4. Debt statement fields
  const [creditor, setCreditor] = useState(initialDebt.creditor || "");
  const [debtName, setDebtName] = useState(initialDebt.debtName || "");
  const [debtType, setDebtType] = useState(initialDebt.debtType || "credit_card");
  const [outstandingBalance, setOutstandingBalance] = useState(
    initialDebt.outstandingBalance?.toString() || ""
  );
  const [statementBalance, setStatementBalance] = useState(
    initialDebt.statementBalance?.toString() || ""
  );
  const [amountDue, setAmountDue] = useState(initialDebt.amountDue?.toString() || "");
  const [minimumPayment, setMinimumPayment] = useState(initialDebt.minimumPayment?.toString() || "");
  const [dueDate, setDueDate] = useState(initialDebt.dueDate?.slice(0, 10) || "");
  const [interestRate, setInterestRate] = useState(initialDebt.interestRateAnnual?.toString() || "");
  const [remainingInstallments, setRemainingInstallments] = useState(
    initialDebt.remainingInstallments?.toString() || ""
  );
  const [accountLastFour, setAccountLastFour] = useState(initialDebt.accountLastFour || "");
  // No default -- the user must explicitly choose "create" or "update" for a
  // debt-statement document; a silent default risks creating a duplicate
  // debt account when the user meant to update an existing one (see F-009
  // in docs/SLIP_DEBT_IMPLEMENTATION_FINDINGS.md).
  const [debtActionType, setDebtActionType] = useState<"create" | "update" | "">("");
  const [existingDebtId, setExistingDebtId] = useState<string>("");
  const reviewFieldId = (field: string) => `review-${doc.id}-${docType}-${field}`;

  // Confidence Calculation
  const confidence = extraction?.confidence ?? 1.0;
  const unclearCount = extraction?.unclearFields?.length ?? 0;
  let thaiConfidenceText = "อ่านได้ชัด";
  let confidenceColor = "bg-green-soft text-primary border-primary/20";

  if (confidence < 0.6 || unclearCount > 0) {
    thaiConfidenceText = "อ่านไม่ครบ";
    confidenceColor = "bg-red-50 text-red-500 border-red-100";
  } else if (confidence < 0.8) {
    thaiConfidenceText = "ควรตรวจอีกครั้ง";
    confidenceColor = "bg-yellow-50 text-yellow-600 border-yellow-100";
  }

  // Action: Retry
  const handleRetry = async () => {
    setIsRetrying(true);
    const res = await retryExtractionAction(doc.id);
    if (res.ok) {
      alert("เริ่มสแกนเอกสารอีกครั้งแล้ว");
      router.refresh();
    } else {
      alert(res.message || DOCUMENT_EXTRACTION_FALLBACK_MESSAGE);
      setIsRetrying(false);
    }
  };

  // Action: Delete
  const handleDelete = async () => {
    if (!confirm("คุณต้องการลบสลิป/หลักฐานและรายการทั้งหมดจากเอกสารชิ้นนี้ใช่หรือไม่?")) return;
    setIsDeleting(true);
    const res = await deleteDocumentAction(doc.id);
    if (res.ok) {
      router.push("/today");
    } else {
      alert(res.message);
      setIsDeleting(false);
    }
  };

  // Action: Duplicate resolution
  const handleResolveDuplicate = async (
    resolution: "use_existing" | "merge",
    existingTxId: string
  ) => {
    setIsSubmitting(true);
    const res = await resolveDuplicateAction(doc.id, resolution, existingTxId);
    if (res.ok) {
      router.push("/today");
    } else {
      alert(res.message);
      setIsSubmitting(false);
    }
  };

  // Action: Confirm Form Submission
  const handleConfirmSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const fd = new FormData(e.currentTarget);
    fd.append("documentType", docType);

    // Append special complex lists
    if (docType === "receipt" || docType === "delivery_receipt") {
      fd.append("items", JSON.stringify(items));
    }

    // Independently re-check monetary fields client-side before submitting
    // (the server still re-validates independently in confirmDocumentAction
    // — this is only for immediate, correctable feedback).
    const clientMoneyError = validateReviewMoneyFields(docType, fd, items);
    if (clientMoneyError) {
      setFormError(clientMoneyError);
      return;
    }

    // Final confirmation requires a real, parseable transaction date/time --
    // never fabricated. On failure, move focus to the field so the user can
    // see and fix it immediately, matching the required Thai copy. Focusing
    // the element already brings it into view per spec (and does so
    // instantly) -- a separate smooth-scroll animation is intentionally not
    // used here, since an animated scroll is unnecessary and can visibly lag
    // behind the state update under load.
    const clientOccurredAtError = validateReviewOccurredAt(docType, fd);
    if (clientOccurredAtError) {
      setFormError(clientOccurredAtError);
      dateFieldRef.current?.focus();
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const res = await confirmDocumentAction(doc.id, fd);
    if (res.ok) {
      router.push("/today");
    } else {
      alert(res.message);
      setIsSubmitting(false);
    }
  };

  // Helper calculation functions inside UI
  const calculateTotalPaidFromItems = () => {
    const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
    const delFee = Number(deliveryFee) || 0;
    const svcFee = Number(serviceFee) || 0;
    const disc = Number(discount) || 0;
    const finalVal = total + delFee + svcFee - disc;
    setTotalPaid(finalVal > 0 ? finalVal.toString() : "0");
  };

  const handleAddItem = () => {
    setItems([...items, { name: "รายการใหม่", quantity: 1, amount: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: "name" | "quantity" | "amount", value: string | number) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      [field]: field === "name" ? value : Number(value),
    };
    setItems(updated);
  };

  const docTypeLabel: Record<string, string> = {
    salary_slip: "สลิปเงินเดือน",
    receipt: "ใบเสร็จ",
    delivery_receipt: "ค่าอาหาร/เดลิเวอรี",
    transfer_slip: "สลิปโอนเงิน",
    debt_statement: "ใบแจ้งหนี้",
    other: "อื่น ๆ",
  };

  const getSummaryData = () => {
    const safeFormatAmount = (value: string) => {
      const num = Number(value);
      if (!value || isNaN(num)) return "฿0.00";
      return formatTHB(num * 100);
    };

    switch (docType) {
      case "salary_slip":
        return {
          merchant: employer || "ไม่ระบุชื่อบริษัท",
          amount: safeFormatAmount(netIncome),
          date: paymentDate ? formatStandardDateTime(paymentDate) : "ไม่ระบุวันที่",
        };
      case "receipt":
      case "delivery_receipt":
        return {
          merchant: merchant || "ไม่ระบุร้านค้า",
          amount: safeFormatAmount(totalPaid),
          date: occurredAt ? formatStandardDateTime(occurredAt) : "ไม่ระบุวันที่",
        };
      case "transfer_slip":
        return {
          merchant: destinationName || "ไม่ระบุผู้รับ",
          amount: safeFormatAmount(transferAmount),
          date: transferDate ? formatStandardDateTime(transferDate) : "ไม่ระบุวันที่",
        };
      case "debt_statement":
        return {
          merchant: creditor || "ไม่ระบุเจ้าหนี้",
          amount: safeFormatAmount(amountDue),
          date: dueDate ? formatStandardDateTime(dueDate) : "ไม่ระบุวันที่",
        };
      default:
        return {
          merchant: merchant || "ไม่ระบุรายการ",
          amount: safeFormatAmount(totalPaid),
          date: occurredAt ? formatStandardDateTime(occurredAt) : "ไม่ระบุวันที่",
        };
    }
  };

  const summary = getSummaryData();

  return (
    <AppShell nav={false}>
      <div className="flex flex-col gap-4 pb-32">
        {/* Header */}
        <PageHeader
          title={manualMode ? "บันทึกเอกสารด้วยตัวเอง" : "ตรวจสลิปและหลักฐาน"}
          subtitle="สแกนด้วย AI แล้ว โปรดตรวจสอบรายละเอียดความถูกต้องก่อนกดยืนยัน"
        />

        {/* Top Actions & Loader */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-sm font-semibold shadow-sm ${confidenceColor}`}>
              สถานะ: {thaiConfidenceText}
            </span>
          </div>
          <div className="flex gap-2">
            {canRetry && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex items-center gap-2 rounded-[16px] border border-border bg-surface px-4 py-2 text-sm font-bold shadow-sm hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw size={16} className={isRetrying ? "animate-spin" : ""} />
                ประมวลผลใหม่
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 rounded-[16px] border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-500 shadow-sm hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 size={16} />
              ลบหลักฐาน
            </button>
          </div>
        </div>

        {/* Failed State Screen */}
        {isFailed && !manualMode && (
          <div className="rounded-[16px] border border-red-200 bg-red-50/50 p-6 text-center shadow-[0_12px_24px_rgba(239,68,68,0.05)]">
            <AlertTriangle className="mx-auto text-red-500" size={48} />
            <h3 className="mt-4 text-lg font-bold text-red-700">การอ่านสลิปไม่สำเร็จ</h3>
            <p className="mt-2 whitespace-pre-line text-sm text-red-600">{failedMessage}</p>
            <div className="mt-6 flex justify-center gap-3">
              {canRetry ? (
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="flex items-center gap-2 rounded-[16px] bg-primary px-6 py-3 font-bold text-white shadow-sm hover:bg-primary-dark disabled:opacity-50"
                >
                  <RefreshCw size={18} className={isRetrying ? "animate-spin" : ""} />
                  ลองประมวลผลอีกครั้ง
                </button>
              ) : null}
              <button
                onClick={() => {
                  setManualMode(true);
                  setIsDetailsExpanded(true);
                }}
                className="rounded-[16px] border border-border bg-white px-6 py-3 font-bold text-foreground shadow-sm hover:bg-gray-50"
              >
                กรอกข้อมูลด้วยตนเอง
              </button>
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {(isSubmitting || isDeleting || isRetrying) && (
          <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl rounded-[16px] border border-primary/20 bg-white px-4 py-3 text-sm font-bold text-primary shadow-lg">
            <p aria-live="polite" aria-busy="true">กำลังโหลดข้อมูล...</p>
          </div>
        )}

        {/* Main Interface Grid */}
        {(!isFailed || manualMode) && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Summary Banner (Mobile Focus) */}
            <div className="md:hidden rounded-[16px] border border-primary/10 bg-primary-soft/30 p-4 flex flex-col gap-1 shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider bg-white px-2 py-0.5 rounded-full ring-1 ring-primary/10">
                  {docTypeLabel[docType] || "เอกสาร"}
                </span>
                <span className="text-sm font-extrabold text-primary">{summary.amount}</span>
              </div>
              <div className="mt-1">
                <h4 className="font-bold text-foreground leading-tight">{summary.merchant}</h4>
                <p className="text-xs text-text-secondary font-medium">{summary.date}</p>
              </div>
            </div>

            {/* Left: Document Image/PDF Preview */}
            <div className="md:col-span-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="font-bold text-sm text-text-secondary">รูปหลักฐานต้นฉบับ</div>
                <button
                  type="button"
                  onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
                  className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
                >
                  {isPreviewExpanded ? "ย่อรูป" : "ขยายรูป"}
                  {isPreviewExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
              <div
                className={`sticky top-4 overflow-hidden rounded-[16px] border border-border bg-surface shadow-sm transition-all duration-300 ${
                  isPreviewExpanded ? "h-auto" : "h-48 md:h-auto md:max-h-[600px]"
                }`}
              >
                {doc.mimeType === "application/pdf" ? (
                  <iframe
                    src={previewUrl}
                    title="ตัวอย่างเอกสาร PDF สำหรับตรวจสอบ"
                    className={`w-full border-0 transition-all duration-300 ${
                      isPreviewExpanded ? "h-[80vh]" : "h-48 md:h-[500px]"
                    }`}
                  />
                ) : (
                  <div
                    className="relative cursor-pointer"
                    onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
                  >
                    <img
                      src={previewUrl}
                      alt="ภาพถ่ายหรือสแกนเอกสารหลักฐานสำหรับตรวจสอบ"
                      className={`w-full object-contain transition-all duration-300 ${
                        isPreviewExpanded ? "max-h-none" : "max-h-48 md:max-h-[600px]"
                      }`}
                    />
                    {!isPreviewExpanded && (
                      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/20 to-transparent flex items-center justify-center md:hidden">
                        <span className="text-[10px] font-bold text-white bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                          แตะเพื่อขยายรูป
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Validation & Editing Forms */}
            <div className="md:col-span-7 flex flex-col gap-4">
              {/* Warnings and Unclear fields display */}
              {extraction && extraction.warnings.length > 0 && (
                <div className="rounded-[16px] border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 flex gap-2">
                  <AlertTriangle className="text-yellow-600 shrink-0" size={18} />
                  <div>
                    <div className="font-bold">ข้อควรระวังในการแปลงไฟล์:</div>
                    <ul className="list-disc pl-4 mt-1">
                      {extraction.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {occurredAtNeedsReview && (
                <div role="alert" className="rounded-[16px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex gap-2">
                  <AlertTriangle className="text-amber-600 shrink-0" size={18} />
                  <div>
                    <div className="font-bold">{OCCURRED_AT_NEEDS_REVIEW_TITLE_TH}</div>
                    <p className="mt-1">{OCCURRED_AT_NEEDS_REVIEW_BODY_TH}</p>
                  </div>
                </div>
              )}

              {extraction && otherUnclearFields.length > 0 && (
                <div className="rounded-[16px] border border-red-150 bg-red-50/70 p-4 text-sm text-red-800 flex gap-2">
                  <HelpCircle className="text-red-500 shrink-0" size={18} />
                  <div>
                    <div className="font-bold">ข้อมูลอ่านได้ไม่ครบ (กรุณาตรวจสอบ):</div>
                    <p className="mt-1">
                      ฟิลด์ที่ไม่ชัดเจน:{" "}
                      <span className="font-mono bg-red-100 px-1 py-0.5 rounded">
                        {otherUnclearFields.join(", ")}
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {/* Duplicate Candidates Display */}
              {duplicateTransactions.length > 0 && (
                <div className="rounded-[16px] border border-primary/20 bg-primary-soft/40 p-5 shadow-sm">
                  <div className="flex items-center gap-2 font-bold text-primary">
                    <AlertTriangle size={18} />
                    ตรวจพบรายการที่อาจซ้ำซ้อนกัน ({duplicateTransactions.length} รายการ)
                  </div>
                  <div className="mt-3 flex flex-col gap-3">
                    {duplicateTransactions.map((dup) => (
                      <div
                        key={dup.id}
                        data-testid="duplicate-candidate-card"
                        className="rounded-[12px] border border-border bg-white p-4 shadow-sm"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-bold text-foreground">
                              {dup.merchant || "ไม่ระบุชื่อร้าน"}
                            </div>
                            <div className="text-xs text-text-secondary mt-1">
                              วันที่บันทึก: {new Date(dup.occurredAt).toLocaleString("th-TH")}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {dup.reasons?.map((reason: string, rIdx: number) => (
                                <span
                                  key={rIdx}
                                  className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-extrabold text-foreground">
                              {formatTHB(dup.amountSatang)}
                            </div>
                            <div className="text-xs font-bold text-primary mt-1">
                              ความคล้าย: {dup.score}%
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => handleResolveDuplicate("use_existing", dup.id)}
                            className="flex items-center gap-1 rounded-[12px] bg-primary-soft text-primary px-3 py-1.5 text-xs font-bold hover:bg-primary-soft-dark"
                          >
                            เชื่อมโยงหลักฐาน
                            <ArrowRight size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Form Card */}
              <form
                onSubmit={handleConfirmSubmit}
                method="POST"
                action="javascript:void(0);"
                noValidate
                className="rounded-[16px] border border-border bg-surface p-5 shadow-sm flex flex-col gap-4"
              >
                {/* Document Type Selector */}
                <div>
                  <label htmlFor={reviewFieldId("docType")} className="block text-sm font-bold text-foreground mb-1">ประเภทเอกสาร</label>
                  <select
                    id={reviewFieldId("docType")}
                    className="w-full rounded-[12px] border border-border bg-white p-3 text-sm font-medium"
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                  >
                    <option value="salary_slip">เงินเดือน (Salary Slip)</option>
                    <option value="receipt">ใบเสร็จ (Receipt)</option>
                    <option value="delivery_receipt">ค่าอาหาร/เดลิเวอรี (Delivery Slip)</option>
                    <option value="transfer_slip">สลิปโอนเงิน (Bank Transfer Slip)</option>
                    <option value="debt_statement">ใบแจ้งหนี้บัตรเครดิต/หนี้สิน</option>
                    <option value="other">อื่น ๆ (Other)</option>
                  </select>
                </div>

                {/* Form Fields: SALARY SLIP */}
                {docType === "salary_slip" && (
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <h3 className="font-bold text-primary text-sm">ข้อมูลสลิปเงินเดือน</h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("paymentDate")} className="block text-xs text-text-secondary font-semibold mb-1">
                          วันที่จ่ายเงิน
                        </label>
                        <input
                          ref={docType === "salary_slip" ? dateFieldRef : undefined}
                          id={reviewFieldId("paymentDate")}
                          type="date"
                          name="paymentDate"
                          className={`w-full rounded-[12px] border bg-white p-3 text-sm ${
                            occurredAtNeedsReview && !paymentDate ? "border-red-400" : "border-border"
                          }`}
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          aria-describedby={occurredAtNeedsReview ? reviewFieldId("paymentDateHelp") : undefined}
                          required
                        />
                        {occurredAtNeedsReview && !paymentDate ? (
                          <p id={reviewFieldId("paymentDateHelp")} className="mt-1 text-xs font-semibold text-red-600">
                            กรุณาระบุวันที่จ่ายเงิน
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("netIncome")} className="block text-xs text-text-secondary font-semibold mb-1">
                          รายได้สุทธิ (บาท)
                        </label>
                        <input
                          id={reviewFieldId("netIncome")}
                          type="number"
                          step="0.01"
                          name="netIncome"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm font-bold text-primary"
                          value={netIncome}
                          onChange={(e) => setNetIncome(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor={reviewFieldId("note")} className="block text-xs text-text-secondary font-semibold mb-1">
                        บันทึกเพิ่มเติม
                      </label>
                      <textarea
                        id={reviewFieldId("note")}
                        name="note"
                        className="w-full rounded-[12px] border border-border bg-white p-3 text-sm min-h-[80px]"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="รายละเอียดเพิ่มเติม..."
                      />
                    </div>

                    <div className="rounded-[16px] border border-border bg-muted/30 p-1">
                      <button
                        type="button"
                        onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                        className="flex w-full items-center justify-between p-3 text-left"
                      >
                        <span className="text-xs font-bold text-text-secondary">รายละเอียดเพิ่มเติม (นายจ้าง, ภาษี, SSO)</span>
                        {isDetailsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      <div className={`flex flex-col gap-3 p-3 pt-0 ${isDetailsExpanded ? "" : "hidden"}`}>
                          <div>
                            <label htmlFor={reviewFieldId("employer")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                              นายจ้าง / บริษัท
                            </label>
                            <input
                              id={reviewFieldId("employer")}
                              type="text"
                              name="employer"
                              className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                              value={employer}
                              onChange={(e) => setEmployer(e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label htmlFor={reviewFieldId("payPeriod")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                งวดเงินเดือน
                              </label>
                              <input
                                id={reviewFieldId("payPeriod")}
                                type="text"
                                name="payPeriod"
                                className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                                value={payPeriod}
                                onChange={(e) => setPayPeriod(e.target.value)}
                                placeholder="MM/YYYY"
                              />
                            </div>
                            <div>
                              <label htmlFor={reviewFieldId("grossIncome")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                รายได้ก่อนหัก (Gross)
                              </label>
                              <input
                                id={reviewFieldId("grossIncome")}
                                type="number"
                                step="0.01"
                                name="grossIncome"
                                className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                                value={grossIncome}
                                onChange={(e) => setGrossIncome(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label htmlFor={reviewFieldId("tax")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ภาษีหัก ณ ที่จ่าย
                              </label>
                              <input
                                id={reviewFieldId("tax")}
                                type="number"
                                step="0.01"
                                name="tax"
                                className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                                value={tax}
                                onChange={(e) => setTax(e.target.value)}
                              />
                            </div>
                            <div>
                              <label htmlFor={reviewFieldId("socialSecurity")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ประกันสังคม (SSO)
                              </label>
                              <input
                                id={reviewFieldId("socialSecurity")}
                                type="number"
                                step="0.01"
                                name="socialSecurity"
                                className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                                value={socialSecurity}
                                onChange={(e) => setSocialSecurity(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                    </div>
                  </div>
                )}

                {/* Form Fields: RECEIPT or DELIVERY RECEIPT */}
                {(docType === "receipt" || docType === "delivery_receipt") && (
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <h3 className="font-bold text-primary text-sm">ข้อมูลใบเสร็จรับเงิน</h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("occurredAt")} className="block text-xs text-text-secondary font-semibold mb-1">
                          วันและเวลาทำรายการ
                        </label>
                        <input
                          ref={dateFieldRef}
                          id={reviewFieldId("occurredAt")}
                          type="datetime-local"
                          name="occurredAt"
                          className={`w-full rounded-[12px] border bg-white p-3 text-sm ${dateFieldBorderClass(occurredAt)}`}
                          value={occurredAt}
                          onChange={(e) => setOccurredAt(e.target.value)}
                          aria-describedby={reviewFieldId("occurredAtHelp")}
                          required
                        />
                        <TimestampHelperText
                          id={reviewFieldId("occurredAtHelp")}
                          value={occurredAt}
                          isFromDocument={occurredAtIsFromDocument}
                          wasInferred={occurredAtWasInferred}
                        />
                      </div>
                      <div className="flex flex-col">
                        <label htmlFor={reviewFieldId("totalPaid")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ยอดรวมจ่ายจริง (บาท)
                        </label>
                        <input
                          id={reviewFieldId("totalPaid")}
                          type="number"
                          step="0.01"
                          name="totalPaid"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm font-extrabold text-primary"
                          value={totalPaid}
                          onChange={(e) => setTotalPaid(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor={reviewFieldId("note")} className="block text-xs text-text-secondary font-semibold mb-1">
                        บันทึกเพิ่มเติม
                      </label>
                      <textarea
                        id={reviewFieldId("note")}
                        name="note"
                        className="w-full rounded-[12px] border border-border bg-white p-3 text-sm min-h-[80px]"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="รายละเอียดเพิ่มเติม..."
                      />
                    </div>

                    <div className="rounded-[16px] border border-border bg-muted/30 p-1">
                      <button
                        type="button"
                        onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                        className="flex w-full items-center justify-between p-3 text-left"
                      >
                        <span className="text-xs font-bold text-text-secondary">รายละเอียดเพิ่มเติม (ร้านค้า, ส่วนลด, ค่าบริการ)</span>
                        {isDetailsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      <div className={`flex flex-col gap-3 p-3 pt-0 ${isDetailsExpanded ? "" : "hidden"}`}>
                          <div>
                            <label htmlFor={reviewFieldId("merchant")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                              ชื่อร้านค้า / แพลตฟอร์ม
                            </label>
                            <input
                              id={reviewFieldId("merchant")}
                              type="text"
                              name="merchant"
                              className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                              value={merchant}
                              onChange={(e) => setMerchant(e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label htmlFor={reviewFieldId("paymentMethod")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ช่องทางการจ่ายเงิน
                              </label>
                              <input
                                id={reviewFieldId("paymentMethod")}
                                type="text"
                                name="paymentMethod"
                                className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                              />
                            </div>
                            <div>
                              <label htmlFor={reviewFieldId("subtotal")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ยอดรวมย่อย
                              </label>
                              <input
                                id={reviewFieldId("subtotal")}
                                type="number"
                                step="0.01"
                                className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                                value={subtotal}
                                onChange={(e) => setSubtotal(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label htmlFor={reviewFieldId("deliveryFee")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ค่าส่ง
                              </label>
                              <input
                                id={reviewFieldId("deliveryFee")}
                                type="number"
                                step="0.01"
                                className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                                value={deliveryFee}
                                onChange={(e) => setDeliveryFee(e.target.value)}
                              />
                            </div>
                            <div>
                              <label htmlFor={reviewFieldId("discount")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ส่วนลด
                              </label>
                              <input
                                id={reviewFieldId("discount")}
                                type="number"
                                step="0.01"
                                className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                                value={discount}
                                onChange={(e) => setDiscount(e.target.value)}
                              />
                            </div>
                            <div>
                              <label htmlFor={reviewFieldId("serviceFee")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ค่าบริการ
                              </label>
                              <input
                                id={reviewFieldId("serviceFee")}
                                type="number"
                                step="0.01"
                                className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                                value={serviceFee}
                                onChange={(e) => setServiceFee(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center bg-gray-50 p-3 rounded-[12px] border border-dashed border-border mt-1">
                      <button
                        type="button"
                        onClick={calculateTotalPaidFromItems}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        คำนวณยอดเงินจ่ายจริงอัตโนมัติ
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text-secondary">ยอดรวมจ่ายจริง:</span>
                        <output className="min-w-28 rounded-[12px] border border-border bg-white p-2 text-right text-sm font-extrabold text-primary">
                          {totalPaid || "0"}
                        </output>
                      </div>
                    </div>

                    {/* Items table */}
                    <div className="mt-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-text-secondary">รายการสินค้า</span>
                        <button
                          type="button"
                          onClick={handleAddItem}
                          className="text-xs font-bold text-primary hover:underline"
                        >
                          + เพิ่มรายการย่อย
                        </button>
                      </div>
                      <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                        {items.map((item, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <input
                              aria-label={`ชื่อรายการย่อยที่ ${idx + 1}`}
                              type="text"
                              className="flex-1 rounded-[12px] border border-border bg-white p-2 text-xs"
                              placeholder="ชื่อรายการ"
                              value={item.name}
                              onChange={(e) => handleItemChange(idx, "name", e.target.value)}
                              required
                            />
                            <input
                              aria-label={`จำนวนของรายการย่อยที่ ${idx + 1}`}
                              type="number"
                              className="w-12 rounded-[12px] border border-border bg-white p-2 text-xs text-center"
                              placeholder="จำนวน"
                              value={item.quantity || 1}
                              onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                            />
                            <input
                              aria-label={`ราคาของรายการย่อยที่ ${idx + 1}`}
                              type="number"
                              step="0.01"
                              className="w-16 rounded-[12px] border border-border bg-white p-2 text-xs text-right"
                              placeholder="ราคา"
                              value={item.amount || 0}
                              onChange={(e) => handleItemChange(idx, "amount", e.target.value)}
                            />
                            <button
                              type="button"
                              aria-label={`ลบรายการย่อยที่ ${idx + 1}`}
                              onClick={() => handleRemoveItem(idx)}
                              className="flex min-h-11 min-w-11 items-center justify-center text-red-500 hover:text-red-700"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Form Fields: TRANSFER SLIP */}
                {docType === "transfer_slip" && (
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <section className="rounded-[18px] border border-primary/20 bg-primary-soft/40 p-3" aria-labelledby={reviewFieldId("transferTypeGroup")}>
                      <div id={reviewFieldId("transferTypeGroup")} className="text-sm font-bold text-foreground">
                        รายการนี้เป็นแบบไหน?
                      </div>
                      <p className="mt-1 text-xs text-text-secondary">เลือกความหมายทางการเงินของสลิปนี้ก่อนตรวจรายละเอียด</p>
                      <div role="radiogroup" aria-labelledby={reviewFieldId("transferTypeGroup")} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {TRANSFER_REVIEW_MODE_OPTIONS.map((option) => {
                          const selected = transferType === option.value;

                          return (
                            <label
                              key={option.value}
                              className={`relative flex min-h-24 cursor-pointer flex-col rounded-[16px] border p-3 text-left transition ${
                                selected ? "border-primary bg-white shadow-md ring-2 ring-primary/20" : "border-border bg-white/80 hover:border-primary/40"
                              }`}
                            >
                              <input
                                type="radio"
                                name="type"
                                value={option.value}
                                checked={selected}
                                onChange={() => setTransferType(option.value)}
                                className="sr-only"
                              />
                              <span className="text-sm font-bold text-foreground">{option.label}</span>
                              <span className="mt-1 text-xs leading-5 text-text-secondary">{option.description}</span>
                              {selected ? (
                                <span className="mt-2 w-fit rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">เลือกแล้ว</span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    </section>

                    <h3 className="font-bold text-primary text-sm">ข้อมูลสลิปการโอนเงิน</h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("occurredAt")} className="block text-xs text-text-secondary font-semibold mb-1">
                          วันและเวลาโอน
                        </label>
                        <input
                          ref={dateFieldRef}
                          id={reviewFieldId("occurredAt")}
                          type="datetime-local"
                          name="occurredAt"
                          className={`w-full rounded-[12px] border bg-white p-3 text-sm ${dateFieldBorderClass(transferDate)}`}
                          value={transferDate}
                          onChange={(e) => setTransferDate(e.target.value)}
                          aria-describedby={reviewFieldId("occurredAtHelp")}
                          required
                        />
                        <TimestampHelperText
                          id={reviewFieldId("occurredAtHelp")}
                          value={transferDate}
                          isFromDocument={occurredAtIsFromDocument}
                          wasInferred={occurredAtWasInferred}
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("amount")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ยอดโอน (บาท)
                        </label>
                        <input
                          id={reviewFieldId("amount")}
                          type="number"
                          step="0.01"
                          name="amount"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm font-bold text-primary"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor={reviewFieldId("note")} className="block text-xs text-text-secondary font-semibold mb-1">
                        บันทึกเพิ่มเติม
                      </label>
                      <textarea
                        id={reviewFieldId("note")}
                        name="note"
                        className="w-full rounded-[12px] border border-border bg-white p-3 text-sm min-h-[80px]"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="รายละเอียดเพิ่มเติม..."
                      />
                    </div>

                    <div className="rounded-[16px] border border-border bg-muted/30 p-1">
                      <button
                        type="button"
                        onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                        className="flex w-full items-center justify-between p-3 text-left"
                      >
                        <span className="text-xs font-bold text-text-secondary">รายละเอียดเพิ่มเติม (ผู้รับ, ธนาคาร, เลขอ้างอิง)</span>
                        {isDetailsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      <div className={`flex flex-col gap-3 p-3 pt-0 ${isDetailsExpanded ? "" : "hidden"}`}>
                          <div>
                            <label htmlFor={reviewFieldId("destinationName")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                              ผู้รับเงินปลายทาง (Merchant/Payee)
                            </label>
                            <input
                              id={reviewFieldId("destinationName")}
                              type="text"
                              name="destinationName"
                              className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                              value={destinationName}
                              onChange={(e) => setDestinationName(e.target.value)}
                            />
                          </div>
                          <div>
                            <label htmlFor={reviewFieldId("bank")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                              ธนาคาร
                            </label>
                            <input
                              id={reviewFieldId("bank")}
                              type="text"
                              name="bank"
                              className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                              value={bank}
                              onChange={(e) => setBank(e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label htmlFor={reviewFieldId("referenceNumber")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                เลขอ้างอิง
                              </label>
                              <input
                                id={reviewFieldId("referenceNumber")}
                                type="text"
                                name="referenceNumber"
                                className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                                value={refNumber}
                                onChange={(e) => setRefNumber(e.target.value)}
                              />
                            </div>
                            <div>
                              <label htmlFor={reviewFieldId("accountLastFour")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ผู้โอนท้าย
                              </label>
                              <input
                                id={reviewFieldId("accountLastFour")}
                                type="text"
                                name="accountLastFour"
                                className="w-full rounded-[12px] border border-border bg-white p-2 text-xs text-center"
                                value={senderLastFour}
                                onChange={(e) => setSenderLastFour(e.target.value)}
                                maxLength={4}
                              />
                            </div>
                            <div>
                              <label htmlFor={reviewFieldId("destinationAccountLastFour")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ผู้รับท้าย
                              </label>
                              <input
                                id={reviewFieldId("destinationAccountLastFour")}
                                type="text"
                                name="destinationAccountLastFour"
                                className="w-full rounded-[12px] border border-border bg-white p-2 text-xs text-center"
                                value={destLastFour}
                                onChange={(e) => setDestLastFour(e.target.value)}
                                maxLength={4}
                              />
                            </div>
                          </div>
                        </div>
                    </div>

                    {/* Linked debt dropdown when selecting debt_payment */}
                    {transferType === "debt_payment" && (
                      <div className="bg-yellow-50/50 p-3 rounded-[12px] border border-yellow-100 flex flex-col gap-2">
                        <label htmlFor={reviewFieldId("debtId")} className="block text-xs font-bold text-yellow-800">
                          เชื่อมต่อกับหนี้สินคงค้าง
                        </label>
                        <select
                          id={reviewFieldId("debtId")}
                          name="debtId"
                          className="w-full rounded-[12px] border border-yellow-200 bg-white p-2.5 text-xs font-medium"
                          value={linkedDebtId}
                          onChange={(e) => setLinkedDebtId(e.target.value)}
                          required
                        >
                          <option value="">-- กรุณาเลือกบัญชีหนี้สินเพื่อชำระ --</option>
                          {debts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.creditor || "หนี้"} - {d.name} (ค้างจ่ายขั้นต่ำ: {formatTHB(d.minimumPaymentSatang || 0)})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Debt notice fields */}
                {docType === "debt_statement" && (
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <h3 className="font-bold text-primary text-sm">ข้อมูลใบแจ้งหนี้บัตรเครดิต / เงินกู้</h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("dueDate")} className="block text-xs text-text-secondary font-semibold mb-1">
                          วันครบกำหนดชำระ
                        </label>
                        <input
                          id={reviewFieldId("dueDate")}
                          type="date"
                          name="dueDate"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("amountDue")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ยอดต้องชำระ (บาท)
                        </label>
                        <input
                          id={reviewFieldId("amountDue")}
                          type="number"
                          step="0.01"
                          name="amountDue"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm font-bold text-primary"
                          value={amountDue}
                          onChange={(e) => setAmountDue(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor={reviewFieldId("note")} className="block text-xs text-text-secondary font-semibold mb-1">
                        บันทึกเพิ่มเติม
                      </label>
                      <textarea
                        id={reviewFieldId("note")}
                        name="note"
                        className="w-full rounded-[12px] border border-border bg-white p-3 text-sm min-h-[80px]"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="รายละเอียดเพิ่มเติม..."
                      />
                    </div>

                    <div className="rounded-[16px] border border-border bg-muted/30 p-1">
                      <button
                        type="button"
                        onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                        className="flex w-full items-center justify-between p-3 text-left"
                      >
                        <span className="text-xs font-bold text-text-secondary">รายละเอียดเพิ่มเติม (เจ้าหนี้, ดอกเบี้ย, งวดคงเหลือ)</span>
                        {isDetailsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      <div className={`flex flex-col gap-3 p-3 pt-0 ${isDetailsExpanded ? "" : "hidden"}`}>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label htmlFor={reviewFieldId("creditor")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                เจ้าหนี้ / ผู้ให้บริการ
                              </label>
                              <input
                                id={reviewFieldId("creditor")}
                                type="text"
                                name="creditor"
                                className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                                value={creditor}
                                onChange={(e) => setCreditor(e.target.value)}
                              />
                            </div>
                            <div>
                              <label htmlFor={reviewFieldId("debtName")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ชื่อหนี้บัตร / สินเชื่อ
                              </label>
                              <input
                                id={reviewFieldId("debtName")}
                                type="text"
                                name="debtName"
                                className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                                value={debtName}
                                onChange={(e) => setDebtName(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label htmlFor={reviewFieldId("debtType")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ประเภทหนี้สิน
                              </label>
                              <select
                                id={reviewFieldId("debtType")}
                                name="debtType"
                                className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                                value={debtType}
                                onChange={(e) => setDebtType(e.target.value as Debt["debtType"])}
                              >
                                <option value="credit_card">บัตรเครดิต</option>
                                <option value="personal_loan">สินเชื่อบุคคล</option>
                                <option value="installment">ผ่อนสินค้า/จ่ายงวด</option>
                                <option value="mortgage">บ้าน/ที่อยูอร์ย</option>
                                <option value="auto_loan">เช่าซื้อรถยนต์</option>
                                <option value="buy_now_pay_later">BNPL</option>
                                <option value="other">อื่น ๆ</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor={reviewFieldId("outstandingBalance")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ยอดค้างชำระทั้งหมด
                              </label>
                              <input
                                id={reviewFieldId("outstandingBalance")}
                                type="number"
                                step="0.01"
                                name="outstandingBalance"
                                className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                                value={outstandingBalance}
                                onChange={(e) => setOutstandingBalance(e.target.value)}
                              />
                            </div>
                            <div>
                              <label htmlFor={reviewFieldId("minimumPayment")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ยอดขั้นต่ำ
                              </label>
                              <input
                                id={reviewFieldId("minimumPayment")}
                                type="number"
                                step="0.01"
                                name="minimumPayment"
                                className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                                value={minimumPayment}
                                onChange={(e) => setMinimumPayment(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label htmlFor={reviewFieldId("interestRateAnnual")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                ดอกเบี้ยรายปี (%)
                              </label>
                              <input
                                id={reviewFieldId("interestRateAnnual")}
                                type="number"
                                step="0.001"
                                name="interestRateAnnual"
                                className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                                value={interestRate}
                                onChange={(e) => setInterestRate(e.target.value)}
                              />
                            </div>
                            <div>
                              <label htmlFor={reviewFieldId("remainingInstallments")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                                งวดคงเหลือ
                              </label>
                              <input
                                id={reviewFieldId("remainingInstallments")}
                                type="number"
                                name="remainingInstallments"
                                className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                                value={remainingInstallments}
                                onChange={(e) => setRemainingInstallments(e.target.value)}
                              />
                            </div>
                          </div>
                          <div>
                            <label htmlFor={reviewFieldId("accountLastFour")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                              เลขบัตร/บัญชี (ท้าย 4 หลัก)
                            </label>
                            <input
                              id={reviewFieldId("accountLastFour")}
                              type="text"
                              name="accountLastFour"
                              className="w-full rounded-[12px] border border-border bg-white p-2 text-xs text-center"
                              value={accountLastFour}
                              onChange={(e) => setAccountLastFour(e.target.value)}
                              maxLength={4}
                            />
                          </div>
                        </div>
                    </div>


                    <div className="border-t border-dashed border-border pt-3 mt-1">
                      <div id={reviewFieldId("debtActionTypeGroup")} className="block text-xs font-bold text-foreground mb-1">
                        การบันทึกหนี้ในแอป
                      </div>
                      <div role="radiogroup" aria-labelledby={reviewFieldId("debtActionTypeGroup")} className="grid grid-cols-2 gap-3">
                        <label className="flex items-center justify-center p-2.5 rounded-[12px] border border-border bg-white text-xs font-bold cursor-pointer [&:has(input:checked)]:border-primary [&:has(input:checked)]:bg-primary-soft text-foreground">
                          <input
                            type="radio"
                            name="debtActionType"
                            value="create"
                            checked={debtActionType === "create"}
                            onChange={() => setDebtActionType("create")}
                            className="hidden"
                          />
                          สร้างเป็นบัญชีหนี้ใหม่
                        </label>
                        <label className="flex items-center justify-center p-2.5 rounded-[12px] border border-border bg-white text-xs font-bold cursor-pointer [&:has(input:checked)]:border-primary [&:has(input:checked)]:bg-primary-soft text-foreground">
                          <input
                            type="radio"
                            name="debtActionType"
                            value="update"
                            checked={debtActionType === "update"}
                            onChange={() => setDebtActionType("update")}
                            className="hidden"
                          />
                          อัปเดตยอดหนี้เดิมที่มีอยู่
                        </label>
                      </div>
                    </div>

                    {debtActionType === "update" && (
                      <div className="bg-yellow-50/50 p-3 rounded-[12px] border border-yellow-100 flex flex-col gap-2">
                        <label htmlFor={reviewFieldId("existingDebtId")} className="block text-xs font-bold text-yellow-800">
                          เลือกหนี้สินเดิมเพื่ออัปเดตยอด
                        </label>
                        <select
                          id={reviewFieldId("existingDebtId")}
                          name="existingDebtId"
                          className="w-full rounded-[12px] border border-yellow-200 bg-white p-2.5 text-xs font-medium"
                          value={existingDebtId}
                          onChange={(e) => setExistingDebtId(e.target.value)}
                          required
                        >
                          <option value="">-- กรุณาเลือกบัญชีหนี้เดิม --</option>
                          {debts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.creditor || "หนี้"} - {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Form Fields: OTHER */}
                {docType === "other" && (
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <h3 className="font-bold text-primary text-sm">ข้อมูลธุรกรรมการเงิน</h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("occurredAt")} className="block text-xs text-text-secondary font-semibold mb-1">
                          วันและเวลาที่ทำรายการ
                        </label>
                        <input
                          ref={dateFieldRef}
                          id={reviewFieldId("occurredAt")}
                          type="datetime-local"
                          name="occurredAt"
                          className={`w-full rounded-[12px] border bg-white p-3 text-sm ${dateFieldBorderClass(occurredAt)}`}
                          value={occurredAt}
                          onChange={(e) => setOccurredAt(e.target.value)}
                          aria-describedby={reviewFieldId("occurredAtHelp")}
                          required
                        />
                        <TimestampHelperText
                          id={reviewFieldId("occurredAtHelp")}
                          value={occurredAt}
                          isFromDocument={occurredAtIsFromDocument}
                          wasInferred={occurredAtWasInferred}
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("totalPaid")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ยอดเงิน (บาท)
                        </label>
                        <input
                          id={reviewFieldId("totalPaid")}
                          type="number"
                          step="0.01"
                          name="totalPaid"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm font-bold text-primary"
                          value={totalPaid}
                          onChange={(e) => setTotalPaid(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor={reviewFieldId("note")} className="block text-xs text-text-secondary font-semibold mb-1">
                        บันทึกเพิ่มเติม
                      </label>
                      <textarea
                        id={reviewFieldId("note")}
                        name="note"
                        className="w-full rounded-[12px] border border-border bg-white p-3 text-sm min-h-[80px]"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="รายละเอียดเพิ่มเติม..."
                      />
                    </div>

                    <div>
                      <label htmlFor={reviewFieldId("type")} className="block text-xs text-text-secondary font-semibold mb-1">
                        ประเภทธุรกรรม
                      </label>
                      <select
                        id={reviewFieldId("type")}
                        name="type"
                        className="w-full rounded-[12px] border border-border bg-white p-3 text-sm font-semibold text-foreground"
                        defaultValue="expense"
                      >
                        <option value="expense">รายจ่าย (Expense)</option>
                        <option value="income">รายรับ (Income)</option>
                        <option value="transfer">โอนเงินระหว่างบัญชี (Transfer)</option>
                        <option value="refund">เงินคืน (Refund)</option>
                      </select>
                    </div>

                    <div className="rounded-[16px] border border-border bg-muted/30 p-1">
                      <button
                        type="button"
                        onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                        className="flex w-full items-center justify-between p-3 text-left"
                      >
                        <span className="text-xs font-bold text-text-secondary">รายละเอียดเพิ่มเติม (รายการ, ช่องทางชำระเงิน)</span>
                        {isDetailsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      <div className={`flex flex-col gap-3 p-3 pt-0 ${isDetailsExpanded ? "" : "hidden"}`}>
                          <div>
                            <label htmlFor={reviewFieldId("merchant")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                              คำอธิบาย / รายละเอียดธุรกรรม
                            </label>
                            <input
                              id={reviewFieldId("merchant")}
                              type="text"
                              name="merchant"
                              className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                              value={merchant}
                              onChange={(e) => setMerchant(e.target.value)}
                              placeholder="เช่น ค่าเดินทาง, ค่าอุปกรณ์คอมพิวเตอร์"
                            />
                          </div>
                          <div>
                            <label htmlFor={reviewFieldId("paymentMethod")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                              ช่องทางการทำรายการ
                            </label>
                            <input
                              id={reviewFieldId("paymentMethod")}
                              type="text"
                              name="paymentMethod"
                              className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                              value={paymentMethod}
                              onChange={(e) => setPaymentMethod(e.target.value)}
                              placeholder="เช่น เงินสด, บัตรเครดิต"
                            />
                          </div>
                        </div>
                    </div>
                  </div>
                )}

                {formError ? (
                  <p role="alert" className="rounded-[12px] border border-red-150 bg-red-50/70 p-3 text-sm font-semibold text-red-700">
                    {formError}
                  </p>
                ) : null}

                {/* Submit Buttons (Sticky on Mobile) */}
                <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 p-4 backdrop-blur safe-bottom md:static md:z-0 md:bg-transparent md:p-0 md:pt-4 md:mt-2 md:border-t-0">
                  <div className="mx-auto flex max-w-xl gap-3">
                    <button
                      type="button"
                      onClick={() => router.push("/today")}
                      className="flex-1 rounded-[16px] border border-border bg-white py-3.5 text-center text-sm font-bold hover:bg-gray-50"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      aria-busy={isSubmitting}
                      className="flex-[2] rounded-[16px] bg-primary py-3.5 text-center text-sm font-bold text-white shadow-md hover:bg-primary-dark disabled:opacity-50"
                    >
                      {isSubmitting ? "กำลังบันทึก..." : docType === "transfer_slip" ? TRANSFER_REVIEW_CTA_LABELS[transferType] : "ยืนยันความถูกต้อง"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
