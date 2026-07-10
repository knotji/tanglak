"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ensureProfile, hasSupabaseConfig, isMockAuthEnabled } from "@/lib/auth/session";
import { getMockState, mockUserId } from "@/lib/data/mock-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const authSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z.string().min(6, "รหัสผ่านอย่างน้อย 6 ตัวอักษร"),
});

const signUpSchema = authSchema
  .extend({
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "รหัสผ่านไม่ตรงกัน",
    path: ["confirmPassword"],
  });

const forgotPasswordSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
});

const updatePasswordSchema = z
  .object({
    password: z.string().min(6, "รหัสผ่านอย่างน้อย 6 ตัวอักษร"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "รหัสผ่านไม่ตรงกัน",
    path: ["confirmPassword"],
  });

export type AuthActionState = {
  ok: boolean;
  message?: string;
};

export type ForgotPasswordState = {
  ok: boolean;
  message?: string;
};

export type UpdatePasswordState = {
  ok: boolean;
  message?: string;
};

export async function signUpAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  if (isMockAuthEnabled()) {
    const state = getMockState();
    const id = mockUserId(parsed.data.email);
    state.users.set(parsed.data.email, { ...parsed.data, id });
    const cookieStore = await cookies();
    cookieStore.set("tl_mock_user", id, { path: "/", sameSite: "lax" });
    redirect("/today");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { ok: false, message: error.message };
  if (data.user) await ensureProfile({ id: data.user.id, email: data.user.email ?? undefined });
  redirect("/today");
}

export async function signInAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = authSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  if (isMockAuthEnabled()) {
    const state = getMockState();
    const user = state.users.get(parsed.data.email) ?? {
      email: parsed.data.email,
      password: parsed.data.password,
      id: mockUserId(parsed.data.email),
    };
    if (user.password !== parsed.data.password) {
      return { ok: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
    }
    state.users.set(parsed.data.email, user);
    const cookieStore = await cookies();
    cookieStore.set("tl_mock_user", user.id, { path: "/", sameSite: "lax" });
    redirect("/today");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, message: error.message };
  if (data.user) await ensureProfile({ id: data.user.id, email: data.user.email ?? undefined });
  redirect("/today");
}

export async function forgotPasswordAction(
  _state: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  if (isMockAuthEnabled()) {
    return { ok: true, message: "ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว ตรวจสอบอีเมลของคุณ" };
  }

  if (!hasSupabaseConfig()) {
    return { ok: false, message: "ยังไม่ได้ตั้งค่า Supabase สำหรับแอปนี้" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset`
      : undefined,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว ตรวจสอบอีเมลของคุณ" };
}

export async function updatePasswordAction(
  _state: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const parsed = updatePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  if (isMockAuthEnabled()) {
    const cookieStore = await cookies();
    if (cookieStore.get("tl_mock_recovery")?.value !== "1") {
      return { ok: false, message: "ลิงก์หมดอายุ กรุณาขอลิงก์ใหม่อีกครั้ง" };
    }
    cookieStore.delete("tl_mock_recovery");
    return { ok: true, message: "ตั้งรหัสผ่านใหม่สำเร็จ" };
  }

  if (!hasSupabaseConfig()) {
    return { ok: false, message: "ยังไม่ได้ตั้งค่า Supabase สำหรับแอปนี้" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "ลิงก์หมดอายุ กรุณาขอลิงก์ใหม่อีกครั้ง" };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: error.message };

  await supabase.auth.signOut();
  return { ok: true, message: "ตั้งรหัสผ่านใหม่สำเร็จ" };
}

export async function signOutAction() {
  if (isMockAuthEnabled()) {
    const cookieStore = await cookies();
    cookieStore.delete("tl_mock_user");
    redirect("/auth");
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/auth");
}
