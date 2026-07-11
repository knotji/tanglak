"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartNoAxesCombined,
  Home,
  ReceiptText,
  WalletCards,
  Wallet,
} from "lucide-react";

const items = [
  { href: "/today", label: "วันนี้", icon: Home },
  { href: "/transactions", label: "รายการ", icon: ReceiptText },
  { href: "/budget", label: "งบ", icon: Wallet },
  { href: "/debts", label: "หนี้", icon: WalletCards },
  { href: "/overview", label: "ภาพรวม", icon: ChartNoAxesCombined },
];

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-2 pt-2 backdrop-blur safe-bottom"
    >
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-[16px] px-1 py-1.5 text-xs transition-colors ${
                active
                  ? "bg-primary-soft font-bold text-primary"
                  : "font-medium text-text-secondary hover:bg-muted"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden size={20} strokeWidth={active ? 2.5 : 2} />
              <span>{item.label}</span>
              <span
                aria-hidden
                className={`h-1 w-1 rounded-full ${active ? "bg-primary" : "bg-transparent"}`}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
