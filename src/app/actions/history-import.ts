"use server";

import { revalidatePath } from "next/cache";
import { requireUser, isMockAuthEnabled } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getImportBatch,
  deleteImportBatch,
  importReviewedRows,
  rollbackImportBatch,
} from "@/lib/data/finance-repository";
import { logSafeError } from "@/lib/observability/safe-diagnostics";
import type { TransactionType } from "@/types/domain";

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

    const batch = await getImportBatch(user.id, batchId);
    if (!batch) {
      return { ok: false, message: "ไม่พบชุดนำเข้าข้อมูล" };
    }

    // Commit the selections. This is safe to call again for the same batch
    // (double submit, retry after a timeout, a second concurrent request,
    // or a refresh-and-resubmit) -- rows already resolved by an earlier
    // call are left untouched, never recreated.
    const result = await importReviewedRows(user.id, batchId, accountId, decisions);

    revalidatePath("/history-import");
    revalidatePath("/transactions");
    revalidatePath("/overview");

    if (result.failedCount > 0) {
      // Surface the actual per-row rejection reason (a safe Thai message
      // already produced by the repository/RPC guard, e.g. the unlinked
      // debt_payment invariant) when every failure shares the same cause,
      // instead of only a generic count -- the UI-level check normally
      // prevents this from being reached, but the server/RPC layer is the
      // real invariant boundary and must not degrade to an opaque message.
      const distinctReasons = new Set(result.failures.map((f) => f.message));
      const reasonSuffix = distinctReasons.size === 1 ? `: ${[...distinctReasons][0]}` : "";
      return {
        ok: true,
        message: `นำเข้าข้อมูลสำเร็จบางส่วน: สำเร็จ ${result.importedCount + result.mergedCount} รายการ, ไม่สำเร็จ ${result.failedCount} รายการ, เหลือค้าง ${result.remainingCount} รายการ กรุณาลองใหม่อีกครั้ง${reasonSuffix}`,
      };
    }
    return { ok: true, message: "นำเข้าข้อมูลสำเร็จ" };
  } catch (error) {
    logSafeError("Batch confirmation failed", {
      operation: "history-import",
      stage: "confirm",
      batchId,
      error,
    });
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
    logSafeError("Rollback failed", {
      operation: "history-import",
      stage: "rollback",
      batchId,
      error,
    });
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
    logSafeError("Delete batch failed", {
      operation: "history-import",
      stage: "delete",
      batchId,
      error,
    });
    return { ok: false, message: error instanceof Error ? error.message : "ลบชุดข้อมูลนำเข้าล้มเหลว" };
  }
}
