"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartNoAxesCombined,
  Home,
  ReceiptText,
  ScanLine,
  WalletCards,
} from "lucide-react";

const items = [
  { href: "/today", label: "วันนี้", icon: Home },
  { href: "/transactions", label: "รายการ", icon: ReceiptText },
  { href: "/upload", label: "อัปโหลด", icon: ScanLine },
  { href: "/debts", label: "หนี้", icon: WalletCards },
  { href: "/overview", label: "ภาพรวม", icon: ChartNoAxesCombined },
];

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-2 pt-2 backdrop-blur safe-bottom">
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-[16px] text-xs font-medium transition-colors ${
                active
                  ? "bg-primary-soft text-primary"
                  : "text-text-secondary hover:bg-muted"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden size={20} strokeWidth={2.1} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
