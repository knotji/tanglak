"use client";

import { Plus } from "lucide-react";

export function FloatingActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-24 right-4 z-10 flex min-h-12 items-center gap-2 rounded-[16px] bg-primary px-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(36,76,61,0.22)]"
    >
      <Plus size={18} aria-hidden />
      {label}
    </button>
  );
}
