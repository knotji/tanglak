"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { updatePasswordAction } from "@/app/actions/auth";

export function ResetPasswordForm({ status }: { status: "ready" | "expired" }) {
  const router = useRouter();
  // Freeze the server-rendered status on mount: a successful submit mutates the
  // recovery cookie server-side, which would otherwise flip this prop to "expired"
  // on the action's automatic re-render and hide the success state below.
  const [initialStatus] = useState(status);
  const [state, formAction, pending] = useActionState(updatePasswordAction, { ok: false });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  useEffect(() => {
    if (!state.ok) return;
    const timer = setTimeout(() => router.push("/auth"), 1200);
    return () => clearTimeout(timer);
  }, [state.ok, router]);

  if (initialStatus === "expired") {
    return (
      <section className="rounded-[16px] border border-border bg-surface p-5 shadow-[0_12px_30px_rgba(24,32,29,0.05)]">
        <h2 className="text-base font-bold text-foreground">ลิงก์หมดอายุ</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          ลิงก์รีเซ็ตรหัสผ่านนี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่อีกครั้ง
        </p>
        <a
          href="/auth"
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-[16px] bg-primary px-4 font-bold text-white"
        >
          กลับไปเข้าสู่ระบบ
        </a>
      </section>
    );
  }

  return (
    <section className="rounded-[16px] border border-border bg-surface p-5 shadow-[0_12px_30px_rgba(24,32,29,0.05)]">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (password !== confirmPassword) event.preventDefault();
        }}
        className="space-y-3"
      >
        <div className="space-y-1 text-sm">
          <label htmlFor="reset-password" className="block font-medium">
            รหัสผ่านใหม่
          </label>
          <div className="relative">
            <input
              id="reset-password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-11 w-full rounded-[16px] border border-border px-3 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-secondary"
            >
              {showPassword ? <EyeOff aria-hidden size={18} /> : <Eye aria-hidden size={18} />}
            </button>
          </div>
        </div>
        <div className="space-y-1 text-sm">
          <label htmlFor="reset-confirm-password" className="block font-medium">
            ยืนยันรหัสผ่านใหม่
          </label>
          <div className="relative">
            <input
              id="reset-confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="min-h-11 w-full rounded-[16px] border border-border px-3 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((value) => !value)}
              aria-label={showConfirmPassword ? "ซ่อนยืนยันรหัสผ่าน" : "แสดงยืนยันรหัสผ่าน"}
              aria-pressed={showConfirmPassword}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-secondary"
            >
              {showConfirmPassword ? (
                <EyeOff aria-hidden size={18} />
              ) : (
                <Eye aria-hidden size={18} />
              )}
            </button>
          </div>
        </div>
        {passwordMismatch ? <p className="text-sm text-overdue">รหัสผ่านไม่ตรงกัน</p> : null}
        {state.message ? (
          <p className={`text-sm ${state.ok ? "text-income" : "text-overdue"}`}>{state.message}</p>
        ) : null}
        <button
          disabled={pending || passwordMismatch || state.ok}
          className="min-h-11 w-full rounded-[16px] bg-primary px-4 font-bold text-white disabled:opacity-60"
        >
          {pending ? "กำลังบันทึก..." : state.ok ? "กำลังพาไปหน้าเข้าสู่ระบบ..." : "ตั้งรหัสผ่านใหม่"}
        </button>
      </form>
    </section>
  );
}
