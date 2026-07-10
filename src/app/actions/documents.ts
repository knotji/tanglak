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
import { bahtToSatang } from "@/lib/finance/money";
import { getMockState } from "@/lib/data/mock-store";

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
      console.error("Extraction failed but document row created:", extractError);
      // We do not rethrow because the document record is created and its status is marked 'failed' by processAndExtractDocument.
      // We still return ok: true so the client redirects to the review page.
    }

    revalidatePath("/transactions");
    return { ok: true, message: "อัปโหลดและประมวลผลสำเร็จ", documentId };
  } catch (error) {
    console.error("Upload failed before document creation:", error);
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
    return { ok: false, message: error instanceof Error ? error.message : "ประมวลผลใหม่ไม่สำเร็จ" };
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
        console.error("Failed to delete storage file:", removeError.message);
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

      // Re-validate and parse server-side in integer satang
      const netIncomeSatang = bahtToSatang(netIncome);
      const grossIncomeSatang = grossIncome ? bahtToSatang(grossIncome) : 0;
      const taxSatang = tax ? bahtToSatang(tax) : 0;
      const ssoSatang = socialSecurity ? bahtToSatang(socialSecurity) : 0;

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

      const totalPaidSatang = bahtToSatang(totalPaid);

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
            const supabase = await createSupabaseServerClient();
            const rows = items.map((item) => ({
              user_id: user.id,
              transaction_id: transaction.id,
              name: item.name,
              quantity: item.quantity || 1,
              amount_satang: item.amount ? bahtToSatang(item.amount) : 0,
            }));
            await supabase.from("transaction_items").insert(rows);
          }
        } catch (e) {
          console.error("Failed to save transaction items:", e);
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

      const amountSatang = bahtToSatang(amount);

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

      if (!dueDate) {
        return { ok: false, message: "ต้องระบุวันครบกำหนดชำระ" };
      }

      const amountDueSatang = amountDue ? bahtToSatang(amountDue) : 0;
      const outstandingSatang = outstandingBalance ? bahtToSatang(outstandingBalance) : amountDueSatang;
      const minimumSatang = minimumPayment ? bahtToSatang(minimumPayment) : amountDueSatang;
      const statementSatang = statementBalance ? bahtToSatang(statementBalance) : amountDueSatang;

      const inputPayload = {
        name: debtName || `${creditor || "เจ้าหนี้"} xxxx-${accountLastFour || ""}`,
        creditor,
        outstandingBalanceSatang: outstandingSatang,
        amountDueSatang,
        minimumPaymentSatang: minimumSatang,
        dueDate,
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

      await createTransaction(user.id, {
        type: txType,
        amountSatang: bahtToSatang(totalPaid),
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

    revalidatePath("/transactions");
    revalidatePath("/debts");
    revalidatePath("/overview");
    revalidatePath("/today");

    return { ok: true, message: "บันทึกข้อมูลเรียบร้อยแล้ว" };
  } catch (error) {
    console.error("Confirmation error:", error);
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

    revalidatePath("/transactions");
    revalidatePath("/today");
    revalidatePath("/overview");

    return { ok: true, message: "แก้ไขความซ้ำซ้อนสำเร็จ" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ" };
  }
}
