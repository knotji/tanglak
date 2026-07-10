"use client";

import { X } from "lucide-react";

export function MobileBottomSheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        className="absolute inset-0 h-full w-full bg-foreground/30"
        aria-label="ปิด"
        onClick={onClose}
      />
      <section className="safe-bottom absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-[24px] bg-surface p-4 shadow-[0_-16px_40px_rgba(24,32,29,0.16)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
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
