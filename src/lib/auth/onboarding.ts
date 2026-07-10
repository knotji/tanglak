import { redirect } from "next/navigation";
import type { AppUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profile-repository";

export async function requireCompletedOnboarding(user: AppUser) {
  const profile = await getProfile(user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  return profile;
}
