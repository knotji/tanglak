"use server";

import { revalidatePath } from "next/cache";
import { requireUser, isMockAuthEnabled } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createImportBatch,
  getImportBatch,
  updateImportBatch,
  deleteImportBatch,
  createImportRows,
  importReviewedRows,
  rollbackImportBatch,
  createAccount,
} from "@/lib/data/finance-repository";
import { parseStatement, processStagingRows } from "@/lib/import/parser-registry";
import type { TransactionType } from "@/types/domain";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
  "text/comma-separated-values",
  "application/csv",
];
const ALLOWED_EXTENSIONS = ["pdf", "csv"];
const MAX_FILE_SIZE = 10_000_000; // 10MB limit

async function sanitizeFilename(originalName: string): Promise<string> {
  const parts = originalName.split(".");
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
  const base = parts.join(".");
  const sanitizedBase = base
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error("นามสกุลไฟล์ไม่รองรับ (รองรับ PDF, CSV)");
  }
  return `${sanitizedBase}_${Date.now()}.${ext}`;
}

export type HistoryImportActionState = {
  ok: boolean;
  message?: string;
  batchId?: string;
};

/**
 * 1. Upload statement file, run parser pipeline, and insert staging rows
 */
export async function uploadStatementAction(
  _state: HistoryImportActionState,
  formData: FormData,
): Promise<HistoryImportActionState> {
  let user;
  try {
    user = await requireUser();
  } catch (_err) {
    return { ok: false, message: "กรุณาเข้าสู่ระบบเพื่อนำเข้าข้อมูล" };
  }

  const file = formData.get("file") as File | null;
  const sourceType = (formData.get("sourceType") as string) || "other_history";
  const accountId = (formData.get("accountId") as string) || undefined;

  let finalAccountId = accountId;
  const createAccountFlag = formData.get("createAccount") as string;
  if (createAccountFlag === "true") {
    const newName = formData.get("newAccountName") as string;
    const newLastFour = formData.get("newAccountLastFour") as string;
    if (newName) {
      const acc = await createAccount(user.id, {
        name: newName,
        accountLastFour: newLastFour || undefined,
      });
      finalAccountId = acc.id;
    }
  }

  if (!file || file.size === 0) {
    return { ok: false, message: "ไม่พบไฟล์ statement ที่อัปโหลด" };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, message: "ขนาดไฟล์เกิน 10MB ขีดจำกัดความปลอดภัย" };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_MIME_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(extension)) {
    return { ok: false, message: "ประเภทไฟล์ไม่รองรับ (กรุณาใช้ไฟล์ PDF หรือ CSV)" };
  }

  let safeName: string;
  try {
    safeName = await sanitizeFilename(file.name);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "ชื่อไฟล์ไม่ปลอดภัย" };
  }

  const batchId = crypto.randomUUID();
  const storagePath = `${user.id}/history-imports/${batchId}/${safeName}`;

  try {
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Upload to private Supabase storage bucket
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

    // Insert database staging batch header in 'processing' status
    const batch = await createImportBatch(user.id, {
      sourceType,
      accountId: finalAccountId,
      originalFilename: file.name,
      storagePath,
      mimeType: file.type,
      fileSize: file.size,
    });

    // Replace default batch ID in repository
    if (batch.id !== batchId) {
      // In mock repository, the batch ID is auto generated, keep it or align
    }

    // Parse statement deterministic rows
    let parseResult;
    try {
      parseResult = await parseStatement(file.name, file.type, fileBuffer);
    } catch (parseError) {
      console.error("Statement parsing pipeline failed:", parseError);
      await updateImportBatch(user.id, batch.id, {
        status: "failed",
      });
      return {
        ok: false,
        message: parseError instanceof Error ? parseError.message : "การอ่านไฟล์ประวัติการเงินล้มเหลว",
      };
    }

    // Perform duplicate check scoring, transfer detection and validation staging analysis
    const stagingPayloads = await processStagingRows(user.id, batch.id, parseResult);

    // Write staged rows to staging database
    await createImportRows(user.id, stagingPayloads);

    // Update batch stats & transition to 'needs_review'
    const totalRows = stagingPayloads.length;
    const duplicateRows = stagingPayloads.filter(r => r.reviewStatus === "possible_duplicate").length;
    const readyRows = totalRows - duplicateRows;

    await updateImportBatch(user.id, batch.id, {
      status: "needs_review",
      totalRows,
      parsedRows: totalRows,
      readyRows,
      duplicateRows,
      periodStart: parseResult.period?.periodStart,
      periodEnd: parseResult.period?.periodEnd,
      accountId: parseResult.accountLastFour ? accountId : batch.accountId,
    });

    revalidatePath("/history-import");
    return { ok: true, batchId: batch.id };
  } catch (error) {
    console.error("Statement import failed:", error);
    return { ok: false, message: error instanceof Error ? error.message : "การนำเข้าข้อมูลชุดประวัติล้มเหลว" };
  }
}

/**
 * 2. Commit batch decisions and create transactions
 */
export async function confirmBatchAction(
  batchId: string,
  accountId: string | undefined,
  decisions: {
    rowId: string;
    decision: "import" | "merge_existing" | "skip";
    transactionType?: TransactionType;
    category?: string;
    debtId?: string;
    occurredAt?: string;
    merchant?: string;
    amountSatang?: number;
    duplicateTransactionId?: string;
  }[],
): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    
    // Commit the selections
    await importReviewedRows(user.id, batchId, accountId, decisions);

    revalidatePath("/history-import");
    revalidatePath("/transactions");
    revalidatePath("/overview");
    return { ok: true, message: "นำเข้าข้อมูลสำเร็จ" };
  } catch (error) {
    console.error("Batch confirmation failed:", error);
    return { ok: false, message: error instanceof Error ? error.message : "การบันทึกรายการล้มเหลว" };
  }
}

/**
 * 3. Rollback imported batch transactions
 */
export async function rollbackBatchAction(batchId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();

    await rollbackImportBatch(user.id, batchId);

    revalidatePath("/history-import");
    revalidatePath("/transactions");
    revalidatePath("/overview");
    return { ok: true, message: "ย้อนกลับการนำเข้าสำเร็จ (ลบรายการที่เกี่ยวข้องทั้งหมดแล้ว)" };
  } catch (error) {
    console.error("Rollback failed:", error);
    return { ok: false, message: error instanceof Error ? error.message : "การย้อนกลับรายการล้มเหลว" };
  }
}

/**
 * 4. Delete unconfirmed or failed batch
 */
export async function deleteBatchAction(batchId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    const batch = await getImportBatch(user.id, batchId);
    
    if (!batch) {
      return { ok: false, message: "ไม่พบชุดนำเข้าข้อมูล" };
    }

    if (batch.status === "completed" || batch.status === "partially_imported") {
      return { ok: false, message: "ไม่สามารถลบรายการนำเข้าที่เสร็จสิ้นแล้วโดยไม่ผ่านการ Rollback" };
    }

    // Delete in database (cascades staging rows)
    await deleteImportBatch(user.id, batchId);

    // Delete physical file from storage bucket
    if (!isMockAuthEnabled()) {
      const supabase = await createSupabaseServerClient();
      await supabase.storage.from("financial-documents").remove([batch.storagePath]);
    }

    revalidatePath("/history-import");
    return { ok: true, message: "ลบชุดนำเข้าข้อมูลแล้ว" };
  } catch (error) {
    console.error("Delete batch failed:", error);
    return { ok: false, message: error instanceof Error ? error.message : "ลบชุดข้อมูลนำเข้าล้มเหลว" };
  }
}
