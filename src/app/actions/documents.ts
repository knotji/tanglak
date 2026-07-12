"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMockAuthEnabled } from "@/lib/auth/session";
import type { Debt, Transaction } from "@/types/domain";
import {
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  createTransaction,
  createDebt,
  updateDebt,
  addDebtPayment,
  listDebts,
  listRecentConfirmedTransactions,
} from "@/lib/data/finance-repository";
import { processAndExtractDocument } from "@/lib/ai/extract-document";
import { safeDocumentExtractionMessage } from "@/lib/ai/extraction-errors";
import { parseOptionalMoney, parseRequiredMoney } from "@/lib/finance/money-guards";
import { DEBT_ERROR_DUE_DATE_INVALID_TH, isValidDueDate, parseInterestRateAnnual } from "@/lib/finance/debt-guards";
import { getMockState } from "@/lib/data/mock-store";
import { logSafeError } from "@/lib/observability/safe-diagnostics";

export type DocumentActionState = {
  ok: boolean;
  message?: string;
  documentId?: string;
};

// Supported file validation helpers
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf"];
const MAX_FILE_SIZE = 15_000_000; // 15MB

export async function sanitizeFilename(originalName: string): Promise<string> {
  const parts = originalName.split(".");
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
  const base = parts.join(".");
  const sanitizedBase = base
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error("นามสกุลไฟล์ไม่รองรับ (รองรับ JPG, PNG, WEBP, PDF)");
  }
  return `${sanitizedBase}_${Date.now()}.${ext}`;
}

/**
 * 1. Secure upload and auto-trigger extraction
 */
export async function uploadAndExtractAction(
  _state: DocumentActionState,
  formData: FormData
): Promise<DocumentActionState> {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    return { ok: false, message: "กรุณาเข้าสู่ระบบ" };
  }

  const file = formData.get("file") as File | null;
  const selectedDocType = (formData.get("documentType") as string) || "other";

  if (!file || file.size === 0) {
    return { ok: false, message: "ไม่พบไฟล์ที่อัปโหลด" };
  }

  // Validations
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, message: "ขนาดไฟล์เกิน 15MB" };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, message: "ประเภทไฟล์ไม่ถูกต้อง (รองรับ JPG, PNG, WEBP, PDF)" };
  }

  let safeName: string;
  try {
    safeName = await sanitizeFilename(file.name);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "ชื่อไฟล์ไม่ถูกต้อง" };
  }

  // Generate Document record ID first
  const documentId = crypto.randomUUID();
  const storagePath = `${user.id}/${documentId}/${safeName}`;

  try {
    // Save document file to private Supabase bucket
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    if (!isMockAuthEnabled()) {
      const supabase = await createSupabaseServerClient();
      const { error: uploadError } = await supabase.storage
        .from("financial-documents")
        .upload(storagePath, fileBuffer, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }
    }

    // Insert database document record
    await createDocument(user.id, {
      id: documentId,
      status: "uploaded",
      documentType: selectedDocType,
      storageBucket: "financial-documents",
      storagePath,
      originalFilename: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
    });

    // Start extraction asynchronously or synchronously for UX
    // We will do it synchronously here to return status and redirect instantly
    try {
      await processAndExtractDocument(user.id, documentId);
    } catch (extractError) {
      const isExpectedMockFailure =
        extractError instanceof Error && extractError.cause instanceof Error && extractError.cause.message.includes("Mocked Gemini Failure");
      if (process.env.NODE_ENV === "development" || !isExpectedMockFailure) {
        logSafeError("Extraction failed but document row created", {
          operation: "document.uploadAndExtract",
          stage: "extract",
          documentId,
          provider: "gemini",
          modelName: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
          error: extractError,
        });
      }
      // We do not rethrow because the document record is created and its status is marked 'failed' by processAndExtractDocument.
      // We still return ok: true so the client redirects to the review page.
    }

    revalidatePath("/transactions");
    return { ok: true, message: "อัปโหลดและประมวลผลสำเร็จ", documentId };
  } catch (error) {
    logSafeError("Upload failed before document creation", {
      operation: "document.uploadAndExtract",
      stage: "upload",
      documentId,
      error,
    });
    return {
      ok: false,
      message: error instanceof Error ? error.message : "การอัปโหลดไฟล์ล้มเหลว",
      documentId,
    };
  }
}

/**
 * 2. Retry document extraction
 */
export async function retryExtractionAction(documentId: string): Promise<DocumentActionState> {
  const user = await requireUser();
  try {
    await processAndExtractDocument(user.id, documentId);
    revalidatePath("/transactions");
    return { ok: true, message: "เริ่มประมวลผลใหม่อีกครั้งแล้ว" };
  } catch (error) {
    logSafeError("Document retry extraction failed", {
      operation: "document.retryExtraction",
      stage: "extract",
      documentId,
      provider: "gemini",
      modelName: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      error,
    });
    return { ok: false, message: safeDocumentExtractionMessage(error) };
  }
}

/**
 * 3. Delete document record and storage file safely
 */
export async function deleteDocumentAction(documentId: string): Promise<DocumentActionState> {
  const user = await requireUser();
  try {
    const doc = await getDocument(user.id, documentId);
    if (!doc) {
      return { ok: false, message: "ไม่พบข้อมูลเอกสาร" };
    }

    // Delete from Supabase private storage
    if (!isMockAuthEnabled()) {
      const supabase = await createSupabaseServerClient();
      const { error: removeError } = await supabase.storage
        .from("financial-documents")
        .remove([doc.storagePath]);
      if (removeError) {
        logSafeError("Failed to delete storage file", {
          operation: "document.delete",
          stage: "storage-remove",
          documentId,
          error: removeError,
        });
      }
    }

    // Delete from database
    await deleteDocument(user.id, documentId);

    revalidatePath("/transactions");
    return { ok: true, message: "ลบเอกสารและไฟล์สำเร็จ" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ลบเอกสารไม่สำเร็จ" };
  }
}

/**
 * 4. User confirmation: commits changes to confirmed transactions/debts
 */
export async function confirmDocumentAction(
  documentId: string,
  formData: FormData
): Promise<DocumentActionState> {
  const user = await requireUser();
  const doc = await getDocument(user.id, documentId);
  if (!doc) {
    return { ok: false, message: "ไม่พบเอกสารนี้" };
  }

  const documentType = formData.get("documentType") as string;
  if (!documentType) {
    return { ok: false, message: "กรุณาระบุประเภทเอกสาร" };
  }

  try {
    if (documentType === "salary_slip") {
      const employer = formData.get("employer") as string;
      const payPeriod = formData.get("payPeriod") as string;
      const grossIncome = formData.get("grossIncome") as string;
      const netIncome = formData.get("netIncome") as string;
      const tax = formData.get("tax") as string;
      const socialSecurity = formData.get("socialSecurity") as string;
      const paymentDate = formData.get("paymentDate") as string;

      if (!netIncome || !paymentDate) {
        return { ok: false, message: "ต้องระบุยอดเงินสุทธิและวันที่จ่ายเงิน" };
      }

      // Re-validate and parse server-side in integer satang, independently
      // of whatever the client-side ReviewForm already checked.
      const netIncomeResult = parseRequiredMoney(netIncome, "nonnegative");
      if (!netIncomeResult.ok) return { ok: false, message: netIncomeResult.error };
      const grossIncomeResult = parseOptionalMoney(grossIncome, "nonnegative");
      if (!grossIncomeResult.ok) return { ok: false, message: grossIncomeResult.error };
      const taxResult = parseOptionalMoney(tax, "nonnegative");
      if (!taxResult.ok) return { ok: false, message: taxResult.error };
      const ssoResult = parseOptionalMoney(socialSecurity, "nonnegative");
      if (!ssoResult.ok) return { ok: false, message: ssoResult.error };

      const netIncomeSatang = netIncomeResult.satang!;
      const grossIncomeSatang = grossIncomeResult.satang ?? 0;
      const taxSatang = taxResult.satang ?? 0;
      const ssoSatang = ssoResult.satang ?? 0;

      // Deductions as formatted note metadata
      const note = `สลิปเงินเดือนงวด: ${payPeriod || "-"}\nรายรับรวมก่อนหัก: ${grossIncome || "0"} บาท\nภาษี: ${tax || "0"} บาท\nประกันสังคม: ${socialSecurity || "0"} บาท`;

      // Create transaction
      await createTransaction(user.id, {
        type: "income",
        amountSatang: netIncomeSatang,
        occurredAt: `${paymentDate}T12:00:00+07:00`,
        merchant: employer || "รายได้เงินเดือน",
        category: "รายได้",
        note,
      });

    } else if (documentType === "receipt" || documentType === "delivery_receipt") {
      const merchant = formData.get("merchant") as string;
      const occurredAt = formData.get("occurredAt") as string;
      const totalPaid = formData.get("totalPaid") as string;
      const paymentMethod = formData.get("paymentMethod") as string;
      const itemsJson = formData.get("items") as string;

      if (!totalPaid || !occurredAt) {
        return { ok: false, message: "ต้องระบุยอดเงินจ่ายจริงและวันที่ทำรายการ" };
      }

      const totalPaidResult = parseRequiredMoney(totalPaid, "nonnegative");
      if (!totalPaidResult.ok) return { ok: false, message: totalPaidResult.error };
      const totalPaidSatang = totalPaidResult.satang!;

      // Create transaction
      const transaction = await createTransaction(user.id, {
        type: "expense",
        amountSatang: totalPaidSatang,
        occurredAt: occurredAt.includes("T") ? occurredAt : `${occurredAt}T12:00:00+07:00`,
        merchant: merchant || "ร้านค้าไม่ระบุชื่อ",
        category: documentType === "delivery_receipt" ? "เดลิเวอรี" : "อื่น ๆ",
        paymentMethod,
        note: documentType === "delivery_receipt" ? "ชำระเงินค่าอาหาร/บริการส่ง" : undefined,
      });

      // Insert transaction items if present
      if (itemsJson) {
        try {
          const items = JSON.parse(itemsJson) as Array<{ name: string; quantity?: number; amount?: number }>;
          if (Array.isArray(items) && !isMockAuthEnabled()) {
            const rows = items.map((item) => {
              const itemAmountResult = parseOptionalMoney(item.amount, "nonnegative");
              if (!itemAmountResult.ok) {
                throw new Error(itemAmountResult.error);
              }
              return {
                user_id: user.id,
                transaction_id: transaction.id,
                name: item.name,
                quantity: item.quantity || 1,
                amount_satang: itemAmountResult.satang ?? 0,
              };
            });
            const supabase = await createSupabaseServerClient();
            await supabase.from("transaction_items").insert(rows);
          }
        } catch (e) {
          logSafeError("Failed to save transaction items", {
            operation: "document.confirm",
            stage: "transaction-items",
            documentId,
            error: e,
          });
        }
      }

    } else if (documentType === "transfer_slip") {
      const amount = formData.get("amount") as string;
      const occurredAt = formData.get("occurredAt") as string;
      const destinationName = formData.get("destinationName") as string;
      const referenceNumber = formData.get("referenceNumber") as string;
      const bank = formData.get("bank") as string;
      const accountLastFour = formData.get("accountLastFour") as string;
      const destinationAccountLastFour = formData.get("destinationAccountLastFour") as string;
      const txType = (formData.get("type") as "transfer" | "expense" | "debt_payment") || "transfer";
      const debtId = formData.get("debtId") as string;

      if (!amount || !occurredAt) {
        return { ok: false, message: "ต้องระบุจำนวนเงินและวันที่ทำรายการ" };
      }

      // A debt payment must be strictly positive; other transfer/expense
      // transactions may be zero but never negative.
      const amountResult = parseRequiredMoney(amount, txType === "debt_payment" ? "positive" : "nonnegative");
      if (!amountResult.ok) return { ok: false, message: amountResult.error };
      const amountSatang = amountResult.satang!;

      if (txType === "debt_payment") {
        if (!debtId) {
          return { ok: false, message: "กรุณาระบุบัญชีหนี้สินที่เกี่ยวข้องกับการชำระ" };
        }
        // Use addDebtPayment which automatically handles transactions & debt_payments tables and recalculates cycles
        await addDebtPayment(user.id, debtId, amountSatang);
      } else {
        // Create normal transfer or expense transaction
        await createTransaction(user.id, {
          type: txType,
          amountSatang,
          occurredAt: occurredAt.includes("T") ? occurredAt : `${occurredAt}T12:00:00+07:00`,
          merchant: destinationName || "ผู้รับโอนไม่ทราบชื่อ",
          category: txType === "transfer" ? "โอนเงิน" : "อื่น ๆ",
          note: `เลขอ้างอิง: ${referenceNumber || "-"}\nธนาคาร: ${bank || "-"}\nโอนจาก: xxxx-${accountLastFour || "-"}\nไปยัง: xxxx-${destinationAccountLastFour || "-"}`,
        });
      }

    } else if (documentType === "debt_statement") {
      const creditor = formData.get("creditor") as string;
      const debtName = formData.get("debtName") as string;
      const debtType = (formData.get("debtType") as Debt["debtType"]) || "other";
      const outstandingBalance = formData.get("outstandingBalance") as string;
      const statementBalance = formData.get("statementBalance") as string;
      const amountDue = formData.get("amountDue") as string;
      const minimumPayment = formData.get("minimumPayment") as string;
      const dueDate = formData.get("dueDate") as string;
      const remainingInstallments = formData.get("remainingInstallments") as string;
      const interestRateAnnual = formData.get("interestRateAnnual") as string;
      const accountLastFour = formData.get("accountLastFour") as string;

      const debtActionType = formData.get("debtActionType") as "create" | "update";
      const existingDebtId = formData.get("existingDebtId") as string;

      // The user must explicitly choose "create" or "update" -- never
      // silently default to creating a new debt account (F-009 in
      // docs/SLIP_DEBT_IMPLEMENTATION_FINDINGS.md).
      if (debtActionType !== "create" && debtActionType !== "update") {
        return { ok: false, message: "กรุณาเลือกวิธีบันทึกหนี้นี้" };
      }

      if (!dueDate) {
        return { ok: false, message: "ต้องระบุวันครบกำหนดชำระ" };
      }

      if (!isValidDueDate(dueDate)) {
        return { ok: false, message: DEBT_ERROR_DUE_DATE_INVALID_TH };
      }

      const amountDueResult = parseOptionalMoney(amountDue, "nonnegative");
      if (!amountDueResult.ok) return { ok: false, message: amountDueResult.error };
      const outstandingResult = parseOptionalMoney(outstandingBalance, "nonnegative");
      if (!outstandingResult.ok) return { ok: false, message: outstandingResult.error };
      const minimumResult = parseOptionalMoney(minimumPayment, "nonnegative");
      if (!minimumResult.ok) return { ok: false, message: minimumResult.error };
      const statementResult = parseOptionalMoney(statementBalance, "nonnegative");
      if (!statementResult.ok) return { ok: false, message: statementResult.error };

      const interestRateResult = parseInterestRateAnnual(interestRateAnnual);
      if (!interestRateResult.ok) return { ok: false, message: interestRateResult.error };
      const parsedRemainingInstallments = remainingInstallments.trim()
        ? Number(remainingInstallments.trim())
        : undefined;
      if (
        parsedRemainingInstallments !== undefined &&
        (!Number.isInteger(parsedRemainingInstallments) || parsedRemainingInstallments < 0)
      ) {
        return { ok: false, message: "\u0e07\u0e27\u0e14\u0e04\u0e07\u0e40\u0e2b\u0e25\u0e37\u0e2d\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e15\u0e34\u0e14\u0e25\u0e1a" };
      }

      const amountDueSatang = amountDueResult.satang ?? 0;
      const outstandingSatang = outstandingResult.satang ?? amountDueSatang;
      const minimumSatang = minimumResult.satang ?? amountDueSatang;
      const statementSatang = statementResult.satang ?? amountDueSatang;

      const inputPayload = {
        name: debtName || `${creditor || "เจ้าหนี้"} xxxx-${accountLastFour || ""}`,
        creditor,
        debtType,
        outstandingBalanceSatang: outstandingSatang,
        statementBalanceSatang: statementSatang,
        amountDueSatang,
        minimumPaymentSatang: minimumSatang,
        dueDate,
        interestRateAnnual: interestRateResult.rate,
        remainingInstallments: parsedRemainingInstallments,
        notes: `บัญชีเลขที่: xxxx-${accountLastFour || "-"}\nอัตราดอกเบี้ย: ${interestRateAnnual || "-"}%\nงวดคงเหลือ: ${remainingInstallments || "-"}`,
      };

      if (debtActionType === "update") {
        if (!existingDebtId) {
          return { ok: false, message: "กรุณาระบุบัญชีหนี้สินที่จะอัปเดต" };
        }
        await updateDebt(user.id, existingDebtId, inputPayload);
      } else {
        await createDebt(user.id, {
          ...inputPayload,
          paymentMode: "variable_monthly",
        });
      }
    } else {
      const merchant = formData.get("merchant") as string;
      const totalPaid = formData.get("totalPaid") as string;
      const occurredAt = formData.get("occurredAt") as string;
      const txType = (formData.get("type") as Transaction["type"]) || "expense";
      const paymentMethod = formData.get("paymentMethod") as string;

      if (!totalPaid || !occurredAt) {
        return { ok: false, message: "ต้องระบุยอดเงินและวันที่ทำรายการ" };
      }

      const totalPaidResult = parseRequiredMoney(totalPaid, txType === "debt_payment" ? "positive" : "nonnegative");
      if (!totalPaidResult.ok) return { ok: false, message: totalPaidResult.error };

      await createTransaction(user.id, {
        type: txType,
        amountSatang: totalPaidResult.satang!,
        occurredAt: occurredAt.includes("T") ? occurredAt : `${occurredAt}T12:00:00+07:00`,
        merchant: merchant || "ไม่ระบุชื่อรายการ",
        category: "อื่น ๆ",
        paymentMethod,
        source: "manual",
        documentId: doc.id,
      });
    }

    // 5. Update document status to confirmed
    await updateDocument(user.id, doc.id, { status: "confirmed" });

    if (!isMockAuthEnabled()) {
      revalidatePath("/transactions");
      revalidatePath("/debts");
      revalidatePath("/overview");
      revalidatePath("/today");
    }

    return { ok: true, message: "บันทึกข้อมูลเรียบร้อยแล้ว" };
  } catch (error) {
    logSafeError("Document confirmation failed", {
      operation: "document.confirm",
      stage: "commit",
      documentId,
      error,
    });
    return { ok: false, message: error instanceof Error ? error.message : "การบันทึกข้อมูลล้มเหลว" };
  }
}

/**
 * 5. Handle direct duplicate candidacy action resolution
 */
export async function resolveDuplicateAction(
  documentId: string,
  resolution: "use_existing" | "merge" | "save_separately",
  existingTransactionId?: string
): Promise<DocumentActionState> {
  const user = await requireUser();
  try {
    if (resolution === "use_existing" || resolution === "merge") {
      if (!existingTransactionId) {
        return { ok: false, message: "ไม่พบรหัสรายการเดิมที่ระบุ" };
      }

      // Link document to the existing transaction
      if (!isMockAuthEnabled()) {
        const supabase = await createSupabaseServerClient();
        await supabase
          .from("transactions")
          .update({ document_id: documentId })
          .eq("id", existingTransactionId)
          .eq("user_id", user.id);
      } else {
        const tx = getMockState().transactions.find((t) => t.id === existingTransactionId && t.userId === user.id);
        if (tx) {
          tx.documentId = documentId;
        }
      }
    }

    // Update document status to confirmed
    await updateDocument(user.id, documentId, { status: "confirmed" });

    if (!isMockAuthEnabled()) {
      revalidatePath("/transactions");
      revalidatePath("/today");
      revalidatePath("/overview");
    }

    return { ok: true, message: "แก้ไขความซ้ำซ้อนสำเร็จ" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ" };
  }
}
