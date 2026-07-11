"use client";

import Link from "next/link";
import { ScanLine } from "lucide-react";

export function FloatingActionButton({
  label,
  onClick,
  href,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "fixed bottom-24 right-4 z-10 flex min-h-12 items-center gap-2 rounded-[16px] bg-primary px-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(22,35,61,0.28)]";

  if (href) {
    return (
      <Link href={href} className={className}>
        <ScanLine size={18} aria-hidden />
        {label}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={className}>
      <ScanLine size={18} aria-hidden />
      {label}
    </button>
  );
}
