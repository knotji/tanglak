import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMockAuthEnabled } from "@/lib/auth/session";

export type Profile = {
  userId: string;
  displayName?: string;
  preferredCurrency: "THB";
  timezone: string;
  salaryDay?: number;
  preferredReminderDays: number[];
  wantsBudgetGuidance: boolean;
  onboardingCompleted: boolean;
};

export type ProfileInput = {
  displayName?: string;
  preferredCurrency: "THB";
  timezone: string;
  salaryDay?: number;
  preferredReminderDays: number[];
  wantsBudgetGuidance: boolean;
  onboardingCompleted: boolean;
};

const mockProfiles = new Map<string, Profile>();

export async function getProfile(userId: string): Promise<Profile | null> {
  if (isMockAuthEnabled()) return mockProfiles.get(userId) ?? null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    userId: data.user_id,
    displayName: data.display_name ?? undefined,
    preferredCurrency: data.preferred_currency,
    timezone: data.timezone,
    salaryDay: data.salary_day ?? undefined,
    preferredReminderDays: data.preferred_reminder_days ?? [7, 3, 1],
    wantsBudgetGuidance: data.wants_budget_guidance ?? false,
    onboardingCompleted: data.onboarding_completed ?? false,
  };
}

export async function upsertProfile(userId: string, input: ProfileInput): Promise<Profile> {
  if (isMockAuthEnabled()) {
    const profile = { userId, ...input };
    mockProfiles.set(userId, profile);
    return profile;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        display_name: input.displayName,
        preferred_currency: input.preferredCurrency,
        timezone: input.timezone,
        salary_day: input.salaryDay,
        preferred_reminder_days: input.preferredReminderDays,
        wants_budget_guidance: input.wantsBudgetGuidance,
        onboarding_completed: input.onboardingCompleted,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    userId: data.user_id,
    displayName: data.display_name ?? undefined,
    preferredCurrency: data.preferred_currency,
    timezone: data.timezone,
    salaryDay: data.salary_day ?? undefined,
    preferredReminderDays: data.preferred_reminder_days ?? [7, 3, 1],
    wantsBudgetGuidance: data.wants_budget_guidance ?? false,
    onboardingCompleted: data.onboarding_completed ?? false,
  };
}
