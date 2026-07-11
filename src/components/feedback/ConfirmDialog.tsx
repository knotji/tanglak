"use client";

import { useId, useRef } from "react";
import { useDialogFocusTrap } from "@/lib/a11y/focus-trap";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useDialogFocusTrap(open, dialogRef, onCancel);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-foreground/30 p-4 sm:items-center sm:justify-center">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="w-full rounded-[16px] bg-surface p-4 shadow-[0_18px_50px_rgba(24,32,29,0.18)] sm:max-w-sm"
      >
        <h2 id={titleId} className="text-lg font-bold">{title}</h2>
        <p id={bodyId} className="mt-2 text-sm leading-6 text-text-secondary">{body}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-[16px] bg-muted px-4 font-bold text-primary">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="min-h-11 rounded-[16px] bg-overdue px-4 font-bold text-white">
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
