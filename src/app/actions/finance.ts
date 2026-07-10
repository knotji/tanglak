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
  reopenDebt,
  updateDebt,
  updateTransaction,
} from "@/lib/data/finance-repository";
import { bahtToSatang } from "@/lib/finance/money";

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
  notes: z.string().optional(),
});

const paymentSchema = z.object({
  debtId: z.string().min(1),
  amount: z.string().min(1),
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

  const input = {
    type: parsed.data.type,
    amountSatang: bahtToSatang(parsed.data.amount),
    occurredAt: `${parsed.data.date}T12:00:00+07:00`,
    merchant: parsed.data.label,
    category: parsed.data.category,
  };

  try {
    if (parsed.data.id) await updateTransaction(user.id, parsed.data.id, input);
    else await createTransaction(user.id, input);
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

  const amountDueSatang = bahtToSatang(parsed.data.amount);
  const input = {
    name: parsed.data.name,
    creditor: parsed.data.creditor,
    outstandingBalanceSatang: parsed.data.outstanding ? bahtToSatang(parsed.data.outstanding) : amountDueSatang,
    amountDueSatang,
    minimumPaymentSatang: parsed.data.minimum ? bahtToSatang(parsed.data.minimum) : amountDueSatang,
    dueDate: parsed.data.dueDate,
    recurringDueDay: parsed.data.recurringDueDay ? Number(parsed.data.recurringDueDay) : undefined,
    paymentMode: parsed.data.paymentMode,
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

  try {
    await addDebtPayment(user.id, parsed.data.debtId, bahtToSatang(parsed.data.amount));
    revalidateFinance();
    return { ok: true, message: "บันทึกการชำระแล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "เพิ่มการชำระไม่สำเร็จ" };
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

export async function reopenDebtAction(id: string): Promise<FinanceActionState> {
  const user = await requireUser();
  try {
    await reopenDebt(user.id, id);
    revalidateFinance();
    return { ok: true, message: "เปิดหนี้อีกครั้งแล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "เปิดหนี้ไม่สำเร็จ" };
  }
}
