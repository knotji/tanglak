"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { upsertProfile } from "@/lib/data/profile-repository";

export type OnboardingActionState = {
  ok: boolean;
  message?: string;
};

const schema = z.object({
  displayName: z.string().trim().optional(),
  preferredCurrency: z.literal("THB"),
  timezone: z.string().trim().min(1, "กรอกเขตเวลา"),
  salaryDay: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 31), {
      message: "กรอกวันที่ระหว่าง 1–31",
    }),
  reminder7: z.string().optional(),
  reminder3: z.string().optional(),
  reminder1: z.string().optional(),
  wantsBudgetGuidance: z.string().optional(),
});

export async function saveOnboardingAction(
  _state: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "บันทึกโปรไฟล์ไม่สำเร็จ" };

  const preferredReminderDays = [
    parsed.data.reminder7 ? 7 : null,
    parsed.data.reminder3 ? 3 : null,
    parsed.data.reminder1 ? 1 : null,
  ].filter((value): value is number => value !== null);

  try {
    await upsertProfile(user.id, {
      displayName: parsed.data.displayName || undefined,
      preferredCurrency: "THB",
      timezone: parsed.data.timezone,
      salaryDay: parsed.data.salaryDay ? Number(parsed.data.salaryDay) : undefined,
      preferredReminderDays,
      wantsBudgetGuidance: parsed.data.wantsBudgetGuidance === "on",
      onboardingCompleted: true,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "บันทึกโปรไฟล์ไม่สำเร็จ" };
  }

  redirect("/today");
}
