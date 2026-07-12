import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timeAsync } from "@/lib/observability/timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateSupabaseConfig } from "@/lib/supabase/config";
import {
  isConsumedMockRecoveryToken,
  isValidMockRecoveryToken,
  MOCK_RECOVERY_CONSUMED_COOKIE,
  MOCK_RECOVERY_COOKIE,
} from "@/lib/auth/mock-recovery";

export type AppUser = {
  id: string;
  email?: string;
};

export function hasSupabaseConfig() {
  return validateSupabaseConfig().ok;
}

export function isMockAuthEnabled() {
  return process.env["E2E_MOCK_AUTH"] === "1";
}

async function getCurrentUserUncached(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  const mockId = cookieStore.get("tl_mock_user")?.value;
  if (mockId && (isMockAuthEnabled() || !hasSupabaseConfig())) {
    return { id: mockId, email: `${mockId}@example.test` };
  }

  if (isMockAuthEnabled()) {
    const id = mockId;
    return id ? { id, email: `${id}@example.test` } : null;
  }

  if (!hasSupabaseConfig()) return null;

  const user = await timeAsync("auth.user", async () => {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    return currentUser;
  });

  return user ? { id: user.id, email: user.email ?? undefined } : null;
}

export const getCurrentUser = cache(getCurrentUserUncached);

export async function requireUser(): Promise<AppUser> {
  // Uses the request-memoized getCurrentUser, not getCurrentUserUncached
  // directly -- the real (non-mock) path calls supabase.auth.getUser(),
  // which re-validates the JWT against Supabase Auth over the network
  // (unlike getSession()). requireUser() is called at the top of every
  // page; without this, any additional call to it (or to getCurrentUser)
  // elsewhere in the same request would repeat that network round-trip
  // instead of reusing the one already in flight/resolved for this
  // request (see Issue 6: "redundant auth/session checks").
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  return user;
}

export async function hasRecoverySession(): Promise<boolean> {
  if (isMockAuthEnabled()) {
    const cookieStore = await cookies();
    const token = cookieStore.get(MOCK_RECOVERY_COOKIE)?.value;
    const consumedTokens = cookieStore.get(MOCK_RECOVERY_CONSUMED_COOKIE)?.value;
    return isValidMockRecoveryToken(token) && !isConsumedMockRecoveryToken(token, consumedTokens);
  }

  if (!hasSupabaseConfig()) return false;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return Boolean(user);
}

export async function ensureProfile(user: AppUser) {
  if (isMockAuthEnabled() || !hasSupabaseConfig()) return;
  const supabase = await createSupabaseServerClient();
  await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      display_name: user.email?.split("@")[0] ?? "ผู้ใช้ตั้งหลัก",
      preferred_currency: "THB",
      timezone: "Asia/Bangkok",
    },
    { onConflict: "user_id" },
  );
}
