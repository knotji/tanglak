import { isMockAuthEnabled } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractFinancialDocument } from "./gemini";
import {
  claimDocumentForProcessing,
  completeDocumentProcessing,
  createDocumentExtraction,
  failDocumentProcessing,
  getDocument,
} from "@/lib/data/finance-repository";
import type { ExtractedFinancialDocument } from "./schemas";
import { extractedFinancialDocumentSchema } from "./schemas";
import { DocumentExtractionError, safeDocumentExtractionMessage, toDocumentExtractionError } from "./extraction-errors";
import { DOCUMENT_PROCESSING_TIMEOUT_MS, withTimeout } from "./resilience";
import { logSafeError } from "@/lib/observability/safe-diagnostics";

/**
 * Orchestrates the full server-side document extraction process.
 */
export async function processAndExtractDocument(
  userId: string,
  documentId: string,
  options?: {
    timeoutMs?: number;
    providerTimeoutMs?: number;
    providerMaxAttempts?: number;
    providerBackoffMs?: (attempt: number, retryAfterMs?: number) => number;
    processingLeaseMs?: number;
    now?: Date;
  },
): Promise<ExtractedFinancialDocument> {
  const currentDoc = await getDocument(userId, documentId);
  if (!currentDoc) {
    throw new Error("Document record not found");
  }

  const doc = await claimDocumentForProcessing(userId, documentId, {
    leaseMs: options?.processingLeaseMs,
    now: options?.now,
  });
  if (!doc) {
    throw new DocumentExtractionError("processing_claim_failed", { retryable: true });
  }
  if (!doc.processingStartedAt) {
    throw new DocumentExtractionError("processing_claim_failed", { retryable: true });
  }
  const claimStartedAt = doc.processingStartedAt;

  try {
    const result = await withTimeout(
      async (signal) => {
        if (isMockAuthEnabled()) {
          // Intercept and return mock data for testing
          return getMockExtraction(doc.originalFilename || "", doc.documentType || "other", currentDoc.status);
        }

        const supabase = await createSupabaseServerClient();

        // Download private file from Supabase storage
        const { data, error } = await Promise.race([
          supabase.storage
            .from("financial-documents")
            .download(doc.storagePath),
          new Promise<never>((_, reject) => {
            signal.addEventListener("abort", () => reject(new DocumentExtractionError("timeout")), { once: true });
          }),
        ]);

        if (error || !data) {
          throw new DocumentExtractionError("provider_error");
        }

        // Convert file blob to base64
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString("base64");

        // Call Gemini REST endpoint
        return extractFinancialDocument({
          mimeType: doc.mimeType,
          base64,
          signal,
          timeoutMs: options?.providerTimeoutMs,
          maxAttempts: options?.providerMaxAttempts,
          backoffMs: options?.providerBackoffMs,
        });
      },
      options?.timeoutMs ?? DOCUMENT_PROCESSING_TIMEOUT_MS,
    );

    const completedDoc = await completeDocumentProcessing(userId, documentId, claimStartedAt, {
      documentType: result.documentType,
      leaseMs: options?.processingLeaseMs,
    });
    if (!completedDoc) {
      throw new DocumentExtractionError("processing_claim_failed", { retryable: true });
    }

    // 2. Persist extraction layers in document_extractions table after the
    // claim has been finalized. A late processor cannot reach this point once
    // its lease has expired or been replaced.
    await createDocumentExtraction(userId, {
      documentId,
      model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      rawOutput: result, // raw AI response
      normalizedPreview: result, // normalized preview layer
      confidence: result.confidence,
      warnings: result.warnings,
      unclearFields: result.unclearFields,
      requiresReview: true,
    });

    return result;
  } catch (err) {
    const extractionError = toDocumentExtractionError(err);
    logSafeError("Document extraction failed", {
      operation: "document.processAndExtract",
      stage: "extract",
      documentId,
      provider: "gemini",
      modelName: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      errorCode: extractionError.code,
      missingFields: extractionError.missingFields,
      error: extractionError,
    });
    await failDocumentProcessing(userId, documentId, claimStartedAt, {
      status: extractionError.retryable ? "failed_retryable" : "failed_permanent",
      errorMessage: safeDocumentExtractionMessage(extractionError),
    });
    throw extractionError;
  }
}

/**
 * Returns mock extraction payloads for tests when mock auth is enabled.
 */
function getMockExtraction(
  filename: string,
  selectedType: string,
  previousStatus?: string,
): ExtractedFinancialDocument {
  const nameLower = filename.toLowerCase();

  if (nameLower.includes("retry_success") && previousStatus !== "failed" && previousStatus !== "failed_retryable") {
    throw new DocumentExtractionError("transient_provider_error");
  }

  if (nameLower.includes("failed")) {
    throw new DocumentExtractionError("transient_provider_error");
  }

  // 1. Salary Slip Mock
  if (nameLower.includes("salary") || selectedType === "salary_slip") {
    return extractedFinancialDocumentSchema.parse({
      documentType: "salary_slip",
      confidence: 0.95,
      transaction: {
        type: "income",
        amount: 38920,
        currency: "THB",
        occurredAt: "2026-07-25T10:00:00+07:00",
        merchant: "Acme Corp"
      },
      salary: {
        employer: "Acme Corp",
        payPeriod: "07/2026",
        grossIncome: 45000,
        netIncome: 38920,
        tax: 3000,
        socialSecurity: 750,
        deductions: [
          { label: "Provident Fund", amount: 2330 }
        ]
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true
    });
  }

  // 2. Delivery Receipt Mock
  if (
    nameLower.includes("delivery") ||
    nameLower.includes("grab") ||
    nameLower.includes("lineman") ||
    selectedType === "delivery_receipt"
  ) {
    return extractedFinancialDocumentSchema.parse({
      documentType: "delivery_receipt",
      confidence: 0.88,
      transaction: {
        type: "expense",
        amount: 185,
        currency: "THB",
        occurredAt: "2026-07-10T12:30:00+07:00",
        merchant: "GrabFood"
      },
      receipt: {
        subtotal: 220,
        deliveryFee: 25,
        serviceFee: 0,
        discount: 60,
        totalPaid: 185,
        items: [
          { name: "Katsu Don", quantity: 1, amount: 220 }
        ]
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true
    });
  }

  // 3. Debt Statement Mock
  if (nameLower.includes("debt") || nameLower.includes("statement") || selectedType === "debt_statement") {
    return extractedFinancialDocumentSchema.parse({
      documentType: "debt_statement",
      confidence: 0.92,
      debt: {
        creditor: "KTC",
        debtName: "KTC Visa Platinum",
        debtType: "credit_card",
        outstandingBalance: 32450,
        statementBalance: 3200,
        amountDue: 3200,
        minimumPayment: 3200,
        dueDate: "2026-08-02",
        accountLastFour: "1234"
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true
    });
  }

  // 4. Transfer Slip Mock
  if (nameLower.includes("transfer") || nameLower.includes("slip") || selectedType === "transfer_slip") {
    return extractedFinancialDocumentSchema.parse({
      documentType: "transfer_slip",
      confidence: 0.90,
      transaction: {
        type: "transfer",
        amount: 1500,
        currency: "THB",
        occurredAt: "2026-07-10T13:00:00+07:00",
        merchant: "KTC Test",
        referenceNumber: "20260710123456",
        accountLastFour: "5678",
        destinationAccountLastFour: "1234",
        bank: "KBank",
        possibleDebtPayment: true,
        possibleOwnAccountTransfer: false
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true
    });
  }

  // 5. Unclear fields mock (filename contains "unclear")
  if (nameLower.includes("unclear")) {
    return extractedFinancialDocumentSchema.parse({
      documentType: "receipt",
      confidence: 0.52,
      transaction: {
        type: "expense",
        currency: "THB",
        occurredAt: "2026-07-10T12:00:00+07:00"
      },
      warnings: ["ภาพมัวหรืออ่านข้อความได้ไม่ครบถ้วน"],
      unclearFields: ["merchant", "amount"],
      requiresReview: true
    });
  }

  // 6. Generic Receipt Mock
  return extractedFinancialDocumentSchema.parse({
    documentType: "receipt",
    confidence: 0.85,
    transaction: {
      type: "expense",
      amount: 120,
      currency: "THB",
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "Seven-Eleven",
      paymentMethod: "Cash"
    },
    receipt: {
      subtotal: 120,
      totalPaid: 120,
      items: [
        { name: "Snack", quantity: 2, amount: 60 }
      ]
    },
    warnings: [],
    unclearFields: [],
    requiresReview: true
  });
}
