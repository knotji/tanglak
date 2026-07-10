"use client";

import { useState } from "react";

const keys = ["tanglak.transactions", "tanglak.debts"];

export function LocalImportReview() {
  const [hasLocalData, setHasLocalData] = useState(() =>
    typeof window === "undefined"
      ? false
      : keys.some((key) => Boolean(window.localStorage.getItem(key))),
  );

  if (!hasLocalData) return null;

  return (
    <section className="rounded-[16px] border border-debt/20 bg-surface p-4 text-sm shadow-[0_10px_24px_rgba(24,32,29,0.04)]">
      <p className="font-bold text-foreground">พบข้อมูลเก่าในเครื่องนี้</p>
      <p className="mt-1 leading-6 text-text-secondary">
        ตั้งหลักจะไม่คัดลอกเข้าบัญชีจริงอัตโนมัติ ตรวจสอบก่อนนำเข้าเสมอ
      </p>
      <button
        onClick={() => {
          keys.forEach((key) => window.localStorage.removeItem(key));
          setHasLocalData(false);
        }}
        className="mt-3 min-h-11 rounded-[16px] bg-muted px-4 font-bold text-primary"
      >
        ไม่ต้องนำเข้า
      </button>
    </section>
  );
}
