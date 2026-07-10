"use client";

import { useActionState, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { forgotPasswordAction, signInAction, signUpAction } from "@/app/actions/auth";

type Mode = "signin" | "signup" | "forgot";

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [signInState, signInFormAction, signInPending] = useActionState(signInAction, { ok: false });
  const [signUpState, signUpFormAction, signUpPending] = useActionState(signUpAction, { ok: false });
  const [forgotState, forgotFormAction, forgotPending] = useActionState(forgotPasswordAction, {
    ok: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordMismatch =
    mode === "signup" && confirmPassword.length > 0 && password !== confirmPassword;

  function switchMode(next: Mode) {
    setMode(next);
    setPassword("");
    setConfirmPassword("");
  }

  function handleSignUpSubmit(event: FormEvent<HTMLFormElement>) {
    if (password !== confirmPassword) {
      event.preventDefault();
    }
  }

  if (mode === "forgot") {
    return (
      <section className="rounded-[16px] border border-border bg-surface p-5 shadow-[0_12px_30px_rgba(24,32,29,0.05)]">
        <h2 className="text-base font-bold text-foreground">ลืมรหัสผ่าน</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          กรอกอีเมลของคุณ เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้
        </p>
        <form action={forgotFormAction} className="mt-4 space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">อีเมล</span>
            <input
              name="email"
              type="email"
              required
              className="min-h-11 w-full rounded-[16px] border border-border px-3"
            />
          </label>
          {forgotState.message ? (
            <p className={`text-sm ${forgotState.ok ? "text-income" : "text-overdue"}`}>
              {forgotState.message}
            </p>
          ) : null}
          <button
            disabled={forgotPending}
            className="min-h-11 w-full rounded-[16px] bg-primary px-4 font-bold text-white disabled:opacity-60"
          >
            {forgotPending ? "กำลังส่งลิงก์..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => switchMode("signin")}
          className="mt-4 text-sm font-semibold text-primary"
        >
          กลับไปเข้าสู่ระบบ
        </button>
      </section>
    );
  }

  const state = mode === "signin" ? signInState : signUpState;
  const pending = mode === "signin" ? signInPending : signUpPending;

  return (
    <section className="rounded-[16px] border border-border bg-surface p-5 shadow-[0_12px_30px_rgba(24,32,29,0.05)]">
      <div className="grid grid-cols-2 rounded-[16px] bg-muted p-1">
        <button
          type="button"
          onClick={() => switchMode("signin")}
          className={`min-h-11 rounded-[14px] text-sm font-bold ${mode === "signin" ? "bg-primary text-white" : "text-text-secondary"}`}
        >
          เข้าสู่ระบบ
        </button>
        <button
          type="button"
          onClick={() => switchMode("signup")}
          className={`min-h-11 rounded-[14px] text-sm font-bold ${mode === "signup" ? "bg-primary text-white" : "text-text-secondary"}`}
        >
          สมัครใหม่
        </button>
      </div>
      <form
        action={mode === "signin" ? signInFormAction : signUpFormAction}
        onSubmit={mode === "signup" ? handleSignUpSubmit : undefined}
        className="mt-5 space-y-3"
      >
        <label className="block space-y-1 text-sm">
          <span className="font-medium">อีเมล</span>
          <input
            name="email"
            type="email"
            required
            className="min-h-11 w-full rounded-[16px] border border-border px-3"
          />
        </label>
        <div className="space-y-1 text-sm">
          <label htmlFor="auth-password" className="block font-medium">
            รหัสผ่าน
          </label>
          <div className="relative">
            <input
              id="auth-password"
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
        {mode === "signin" ? (
          <div className="text-right">
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="text-sm font-semibold text-primary"
            >
              ลืมรหัสผ่าน?
            </button>
          </div>
        ) : null}
        {mode === "signup" ? (
          <>
            <div className="space-y-1 text-sm">
              <label htmlFor="auth-confirm-password" className="block font-medium">
                ยืนยันรหัสผ่าน
              </label>
              <div className="relative">
                <input
                  id="auth-confirm-password"
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
            <p className="text-xs leading-5 text-text-secondary">
              หลังสมัครสำเร็จ เราจะส่งอีเมลยืนยันตัวตนไปที่กล่องข้อความของคุณ
            </p>
          </>
        ) : null}
        {state.message ? <p className="text-sm text-overdue">{state.message}</p> : null}
        <button
          disabled={pending || (mode === "signup" && passwordMismatch)}
          className="min-h-11 w-full rounded-[16px] bg-primary px-4 font-bold text-white disabled:opacity-60"
        >
          {pending ? "กำลังตรวจสอบ..." : mode === "signin" ? "เข้าสู่ระบบ" : "สร้างบัญชี"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs leading-5 text-text-secondary">
        ข้อมูลการเงินของคุณ เป็นของคุณคนเดียว
      </p>
    </section>
  );
}
