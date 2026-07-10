"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  deleteAccount,
  getAccountDeleteSafety,
  saveAccount,
  setAccountActive,
  setDefaultAccount,
} from "@/lib/data/account-repository";

export type AccountActionState = {
  ok: boolean;
  message?: string;
};

const accountSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "กรอกชื่อบัญชี"),
  institutionName: z.string().trim().optional(),
  accountType: z.enum(["bank_account", "cash", "credit_card", "e_wallet", "loan_account", "other"]),
  lastFour: z
    .string()
    .trim()
    .regex(/^\d{0,4}$/, "ใส่เลขท้ายไม่เกิน 4 หลัก")
    .optional(),
  currency: z.literal("THB"),
  isOwnedByUser: z.string().optional(),
  isDefault: z.string().optional(),
  isActive: z.string().optional(),
  notes: z.string().trim().optional(),
});

function revalidateAccounts() {
  revalidatePath("/settings");
  revalidatePath("/settings/accounts");
  revalidatePath("/transactions");
  revalidatePath("/debts");
}

export async function saveAccountAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const user = await requireUser();
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "บันทึกบัญชีไม่สำเร็จ" };

  try {
    await saveAccount(
      user.id,
      {
        name: parsed.data.name,
        institutionName: parsed.data.institutionName || undefined,
        accountType: parsed.data.accountType,
        lastFour: parsed.data.lastFour || undefined,
        currency: "THB",
        isOwnedByUser: parsed.data.isOwnedByUser === "on",
        isDefault: parsed.data.isDefault === "on",
        isActive: parsed.data.isActive !== "off",
        notes: parsed.data.notes || undefined,
      },
      parsed.data.id,
    );
    revalidateAccounts();
    return { ok: true, message: "บันทึกบัญชีแล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "บันทึกบัญชีไม่สำเร็จ" };
  }
}

export async function setDefaultAccountAction(id: string): Promise<AccountActionState> {
  const user = await requireUser();
  try {
    await setDefaultAccount(user.id, id);
    revalidateAccounts();
    return { ok: true, message: "ตั้งเป็นบัญชีหลักแล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ตั้งบัญชีหลักไม่สำเร็จ" };
  }
}

export async function setAccountActiveAction(id: string, isActive: boolean): Promise<AccountActionState> {
  const user = await requireUser();
  try {
    await setAccountActive(user.id, id, isActive);
    revalidateAccounts();
    return { ok: true, message: isActive ? "เปิดใช้งานบัญชีแล้ว" : "ปิดการใช้งานบัญชีแล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "เปลี่ยนสถานะบัญชีไม่สำเร็จ" };
  }
}

export async function deleteAccountAction(id: string): Promise<AccountActionState> {
  const user = await requireUser();
  try {
    const safety = await getAccountDeleteSafety(user.id, id);
    if (!safety.safe) return { ok: false, message: "บัญชีนี้มีข้อมูลที่ผูกอยู่ แนะนำให้ปิดการใช้งานแทน" };
    await deleteAccount(user.id, id);
    revalidateAccounts();
    return { ok: true, message: "ลบบัญชีแล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ลบบัญชีไม่สำเร็จ" };
  }
}
