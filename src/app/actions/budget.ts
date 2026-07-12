"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  copyPreviousMonthBudget,
  createBudgetCategory,
  deleteBudgetCategory,
  updateBudgetCategory,
  upsertMonthlyBudget,
} from "@/lib/data/finance-repository";
import { parseBudgetCategoryAmount, parseMonthlyIncome } from "@/lib/finance/budget-guards";
import { isValidMonthQuery } from "@/lib/finance/date";

export type BudgetActionState = {
  ok: boolean;
  message?: string;
};

function revalidateBudget(month: string) {
  revalidatePath("/budget");
  revalidatePath(`/budget?month=${month}`);
  // Overview and Today both read the saved monthly income and budget
  // categories via the same canonical source (buildBudgetSummary) -- they
  // must be revalidated too so they stay consistent with Budget after a
  // save, not just the Budget page itself.
  revalidatePath("/overview");
  revalidatePath("/today");
}

export async function saveMonthlyIncomeAction(
  _state: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const user = await requireUser();
  const month = String(formData.get("month") ?? "");
  if (!isValidMonthQuery(month)) {
    return { ok: false, message: "ระบุเดือนไม่ถูกต้อง" };
  }

  const incomeResult = parseMonthlyIncome(formData.get("income"));
  if (!incomeResult.ok) return { ok: false, message: incomeResult.error };

  try {
    await upsertMonthlyBudget(user.id, month, incomeResult.satang!);
    revalidateBudget(month);
    return { ok: true, message: "บันทึกรายรับแล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "บันทึกรายรับไม่สำเร็จ" };
  }
}

export async function saveBudgetCategoryAction(
  _state: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const user = await requireUser();
  const month = String(formData.get("month") ?? "");
  const monthlyBudgetId = String(formData.get("monthlyBudgetId") ?? "");
  const categoryId = formData.get("categoryId");
  const label = String(formData.get("label") ?? "").trim();
  const isUpdate = typeof categoryId === "string" && categoryId.length > 0;

  if (!isValidMonthQuery(month) || (!isUpdate && !monthlyBudgetId)) {
    return { ok: false, message: "ระบุเดือนไม่ถูกต้อง" };
  }

  const amountResult = parseBudgetCategoryAmount(formData.get("amount"));
  if (!amountResult.ok) return { ok: false, message: amountResult.error };

  try {
    if (isUpdate) {
      await updateBudgetCategory(user.id, categoryId as string, amountResult.satang!);
    } else {
      if (!label) return { ok: false, message: "กรุณาระบุชื่อหมวดหมู่" };
      await createBudgetCategory(user.id, monthlyBudgetId, label, amountResult.satang!);
    }
    revalidateBudget(month);
    return { ok: true, message: "บันทึกงบหมวดหมู่แล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "บันทึกงบหมวดหมู่ไม่สำเร็จ" };
  }
}

export async function deleteBudgetCategoryAction(id: string, month: string): Promise<BudgetActionState> {
  const user = await requireUser();
  try {
    await deleteBudgetCategory(user.id, id);
    revalidateBudget(month);
    return { ok: true, message: "ลบงบหมวดหมู่แล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ลบงบหมวดหมู่ไม่สำเร็จ" };
  }
}

export async function copyPreviousMonthAction(
  _state: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const user = await requireUser();
  const fromMonth = String(formData.get("fromMonth") ?? "");
  const toMonth = String(formData.get("toMonth") ?? "");

  if (!isValidMonthQuery(fromMonth) || !isValidMonthQuery(toMonth)) {
    return { ok: false, message: "ระบุเดือนไม่ถูกต้อง" };
  }

  try {
    const result = await copyPreviousMonthBudget(user.id, fromMonth, toMonth);
    revalidateBudget(toMonth);
    if (result.copiedCount === 0 && result.skippedCount > 0) {
      return { ok: true, message: `มีงบหมวดหมู่ครบแล้ว (ข้าม ${result.skippedCount} รายการที่ซ้ำ)` };
    }
    return { ok: true, message: `คัดลอกงบประมาณแล้ว ${result.copiedCount} หมวดหมู่` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "คัดลอกงบประมาณไม่สำเร็จ" };
  }
}
