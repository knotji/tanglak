"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { upsertProfile } from "@/lib/data/profile-repository";

const schema = z.object({
  displayName: z.string().optional(),
  preferredCurrency: z.literal("THB"),
  timezone: z.string().default("Asia/Bangkok"),
  salaryDay: z.string().optional(),
  reminder7: z.string().optional(),
  reminder3: z.string().optional(),
  reminder1: z.string().optional(),
  wantsBudgetGuidance: z.string().optional(),
});

export async function saveOnboardingAction(formData: FormData) {
  const user = await requireUser();
  const parsed = schema.parse(Object.fromEntries(formData));
  const preferredReminderDays = [
    parsed.reminder7 ? 7 : null,
    parsed.reminder3 ? 3 : null,
    parsed.reminder1 ? 1 : null,
  ].filter((value): value is number => value !== null);

  await upsertProfile(user.id, {
    displayName: parsed.displayName,
    preferredCurrency: "THB",
    timezone: parsed.timezone || "Asia/Bangkok",
    salaryDay: parsed.salaryDay ? Number(parsed.salaryDay) : undefined,
    preferredReminderDays: preferredReminderDays.length ? preferredReminderDays : [7, 3, 1],
    wantsBudgetGuidance: parsed.wantsBudgetGuidance === "on",
    onboardingCompleted: true,
  });
  redirect("/today");
}
