"use client";

import { useId, useRef } from "react";
import { X } from "lucide-react";
import { useDialogFocusTrap } from "@/lib/a11y/focus-trap";

export function MobileBottomSheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useDialogFocusTrap(open, sheetRef, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        className="absolute inset-0 h-full w-full bg-foreground/30"
        aria-label="ปิด"
        onClick={onClose}
      />
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="safe-bottom absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-[24px] bg-surface p-4 shadow-[0_-16px_40px_rgba(24,32,29,0.16)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-muted text-foreground"
            aria-label="ปิด"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
