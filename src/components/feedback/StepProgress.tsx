"use client";

import { useEffect, useState } from "react";

type Step = {
  id: string;
  label: string;
};

type StepProgressProps = {
  steps: Step[];
  currentStep: string;
  longMessage?: string;
  retryLabel?: string;
  canRetry?: boolean;
  onRetry?: () => void;
};

export function StepProgress({
  steps,
  currentStep,
  longMessage = "ใช้เวลานานกว่าปกติ",
  retryLabel = "ลองใหม่",
  canRetry = false,
  onRetry,
}: StepProgressProps) {
  const [statusStep, setStatusStep] = useState<string | null>(null);
  const [retryStep, setRetryStep] = useState<string | null>(null);
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === currentStep));
  const showStatus = statusStep === currentStep;
  const showRetry = retryStep === currentStep;

  useEffect(() => {
    const step = currentStep;
    const statusTimer = window.setTimeout(() => setStatusStep(step), 1500);
    const retryTimer = window.setTimeout(() => setRetryStep(step), 5000);
    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(retryTimer);
    };
  }, [currentStep]);

  return (
    <div className="rounded-[16px] border border-border bg-white p-4 shadow-sm">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="สถานะการทำงาน">
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={step.id}
              className={`rounded-[12px] border px-3 py-2 text-xs font-bold ${
                active
                  ? "border-primary/30 bg-primary-soft text-primary"
                  : done
                    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                    : "border-border bg-muted text-text-secondary"
              }`}
              aria-current={active ? "step" : undefined}
            >
              {step.label}
            </li>
          );
        })}
      </ol>

      {showStatus ? (
        <div aria-live="polite" className="mt-3 text-xs font-semibold text-text-secondary">
          {showRetry ? longMessage : "กำลังโหลดข้อมูล..."}
          {showRetry ? (
            <button
              type="button"
              disabled={!canRetry}
              aria-disabled={!canRetry}
              onClick={onRetry}
              className="ml-3 rounded-full border border-border bg-white px-3 py-1 font-bold text-primary shadow-sm disabled:opacity-50"
            >
              {retryLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
