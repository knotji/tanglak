"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  addDebtPayment,
  createDebt,
  createTransaction,
  deleteTransaction,
  markDebtPaidOff,
  listDebtPaymentHistory,
  updateDebt,
  updateTransaction,
} from "@/lib/data/finance-repository";
import { parseRequiredMoney } from "@/lib/finance/money-guards";
import { setTransactionCategoryProvenance } from "@/lib/autopilot/autopilot-provenance";
import {
  isValidDueDate,
  parseDebtAmountDue,
  parseDebtMinimumPayment,
  parseDebtOutstandingBalance,
  parseInterestRateAnnual,
  DEBT_ERROR_DUE_DATE_INVALID_TH,
  DEBT_ERROR_MINIMUM_ABOVE_OUTSTANDING_TH,
  DEBT_ERROR_UNLINKED_PAYMENT_TH,
} from "@/lib/finance/debt-guards";

export type FinanceActionState = {
  ok: boolean;
  message?: string;
};

const transactionSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["income", "expense", "debt_payment", "transfer", "refund"]),
  amount: z.string().min(1),
  label: z.string().min(1),
  category: z.string().optional(),
  date: z.string().min(1),
  sourceAccountId: z.string().optional(),
  debtId: z.string().optional(),
});

const debtSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  creditor: z.string().optional(),
  outstanding: z.string().optional(),
  amount: z.string().min(1),
  minimum: z.string().optional(),
  dueDate: z.string().min(1),
  recurringDueDay: z.string().optional(),
  paymentMode: z.enum(["fixed_monthly", "variable_monthly", "installment", "one_time"]).optional(),
  interestRateAnnual: z.string().optional(),
  notes: z.string().optional(),
});

const paymentSchema = z.object({
  debtId: z.string().min(1),
  amount: z.string().min(1),
});

const debtPaymentUpdateSchema = z.object({
  id: z.string().min(1),
  debtId: z.string().min(1),
  amount: z.string().min(1),
  date: z.string().min(1),
  note: z.string().optional(),
});

function revalidateFinance() {
  revalidatePath("/transactions");
  revalidatePath("/debts");
  revalidatePath("/today");
  revalidatePath("/overview");
}

export async function saveTransactionAction(
  _state: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const user = await requireUser();
  const parsed = transactionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "กรอกข้อมูลรายการให้ครบ" };

  const amountResult = parseRequiredMoney(parsed.data.amount, parsed.data.type === "debt_payment" ? "positive" : "nonnegative");
  if (!amountResult.ok) return { ok: false, message: amountResult.error };

  const debtId = parsed.data.debtId || undefined;
  if (parsed.data.type === "debt_payment" && !debtId) {
    return { ok: false, message: DEBT_ERROR_UNLINKED_PAYMENT_TH };
  }

  const input = {
    type: parsed.data.type,
    amountSatang: amountResult.satang!,
    occurredAt: `${parsed.data.date}T12:00:00+07:00`,
    merchant: parsed.data.label,
    category: parsed.data.category,
    sourceAccountId: parsed.data.sourceAccountId || undefined,
    debtId,
  };

  try {
    let transactionId = parsed.data.id;
    if (transactionId) await updateTransaction(user.id, transactionId, input);
    else transactionId = (await createTransaction(user.id, input)).id;

    // A user who explicitly picked/typed a category in this form is making
    // a manual decision -- record it as "manual" provenance so autopilot
    // (see autopilot-provenance.ts) never overwrites it on reprocessing.
    if (parsed.data.category) {
      await setTransactionCategoryProvenance(user.id, transactionId, "manual", undefined);
    }

    revalidateFinance();
    return { ok: true, message: "บันทึกแล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "บันทึกรายการไม่สำเร็จ" };
  }
}

export async function deleteTransactionAction(id: string): Promise<FinanceActionState> {
  const user = await requireUser();
  try {
    await deleteTransaction(user.id, id);
    revalidateFinance();
    return { ok: true, message: "ลบรายการแล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ลบรายการไม่สำเร็จ" };
  }
}

export async function saveDebtAction(
  _state: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const user = await requireUser();
  const parsed = debtSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "กรอกข้อมูลหนี้ให้ครบ" };

  if (!isValidDueDate(parsed.data.dueDate)) {
    return { ok: false, message: DEBT_ERROR_DUE_DATE_INVALID_TH };
  }

  const amountDueResult = parseDebtAmountDue(parsed.data.amount);
  if (!amountDueResult.ok) return { ok: false, message: amountDueResult.error };
  const outstandingResult = parseDebtOutstandingBalance(parsed.data.outstanding);
  if (!outstandingResult.ok) return { ok: false, message: outstandingResult.error };
  const minimumResult = parseDebtMinimumPayment(parsed.data.minimum);
  if (!minimumResult.ok) return { ok: false, message: minimumResult.error };
  const interestRateResult = parseInterestRateAnnual(parsed.data.interestRateAnnual);
  if (!interestRateResult.ok) return { ok: false, message: interestRateResult.error };

  const amountDueSatang = amountDueResult.satang!;
  const effectiveOutstandingSatang = outstandingResult.satang ?? amountDueSatang;
  const effectiveMinimumSatang = minimumResult.satang ?? amountDueSatang;
  if (effectiveMinimumSatang > effectiveOutstandingSatang) {
    return { ok: false, message: DEBT_ERROR_MINIMUM_ABOVE_OUTSTANDING_TH };
  }

  const input = {
    name: parsed.data.name,
    creditor: parsed.data.creditor,
    outstandingBalanceSatang: effectiveOutstandingSatang,
    amountDueSatang,
    minimumPaymentSatang: effectiveMinimumSatang,
    dueDate: parsed.data.dueDate,
    recurringDueDay: parsed.data.recurringDueDay ? Number(parsed.data.recurringDueDay) : undefined,
    paymentMode: parsed.data.paymentMode,
    interestRateAnnual: interestRateResult.rate,
    notes: parsed.data.notes,
  };

  try {
    if (parsed.data.id) await updateDebt(user.id, parsed.data.id, input);
    else await createDebt(user.id, input);
    revalidateFinance();
    return { ok: true, message: "บันทึกหนี้แล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "บันทึกหนี้ไม่สำเร็จ" };
  }
}

export async function addDebtPaymentAction(
  _state: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const user = await requireUser();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "ใส่ยอดชำระหนี้" };

  const amountResult = parseRequiredMoney(parsed.data.amount, "positive");
  if (!amountResult.ok) return { ok: false, message: amountResult.error };

  try {
    await addDebtPayment(user.id, parsed.data.debtId, amountResult.satang!);
    revalidateFinance();
    return { ok: true, message: "บันทึกการชำระแล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "เพิ่มการชำระไม่สำเร็จ" };
  }
}

export async function updateDebtPaymentAction(
  _state: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const user = await requireUser();
  const parsed = debtPaymentUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "กรอกข้อมูลการชำระให้ครบ" };

  const amountResult = parseRequiredMoney(parsed.data.amount, "positive");
  if (!amountResult.ok) return { ok: false, message: amountResult.error };

  try {
    await updateTransaction(user.id, parsed.data.id, {
      type: "debt_payment",
      debtId: parsed.data.debtId,
      amountSatang: amountResult.satang!,
      occurredAt: `${parsed.data.date}T12:00:00+07:00`,
      note: parsed.data.note,
    });
    revalidateFinance();
    revalidatePath(`/debts/${parsed.data.debtId}`);
    return { ok: true, message: "บันทึกการชำระแล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "บันทึกการชำระไม่สำเร็จ" };
  }
}

export async function deleteDebtPaymentAction(id: string, debtId: string): Promise<FinanceActionState> {
  const user = await requireUser();
  try {
    const payments = await listDebtPaymentHistory(user.id, debtId);
    if (!payments.some((payment) => payment.id === id)) {
      return { ok: false, message: "ไม่พบรายการชำระหนี้นี้" };
    }
    await deleteTransaction(user.id, id);
    revalidateFinance();
    revalidatePath(`/debts/${debtId}`);
    return { ok: true, message: "ลบการชำระแล้ว ยอดจ่ายเดือนนี้คำนวณใหม่แล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ลบการชำระไม่สำเร็จ" };
  }
}

export async function markDebtPaidOffAction(id: string): Promise<FinanceActionState> {
  const user = await requireUser();
  try {
    await markDebtPaidOff(user.id, id);
    revalidateFinance();
    return { ok: true, message: "ปิดหนี้แล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ปิดหนี้ไม่สำเร็จ" };
  }
}

/**
 * Reopening a closed debt is deferred to Phase 2 (locked product decision).
 * The underlying `reopenDebt` repository primitive is intentionally left
 * in place -- it may be needed once Phase 2 ships a reviewed reopen flow --
 * but this server action, the only path any Phase 1 UI can reach it
 * through, always rejects with a safe message instead of calling it. This
 * guards the action even if a stale client or a future UI regression tries
 * to invoke it.
 */
export async function reopenDebtAction(_id: string): Promise<FinanceActionState> {
  await requireUser();
  return { ok: false, message: "การเปิดหนี้ที่ปิดแล้วยังไม่รองรับในเวอร์ชันนี้" };
}
