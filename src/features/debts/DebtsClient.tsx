"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markDebtPaidOffAction, reopenDebtAction } from "@/app/actions/finance";
import { AppShell } from "@/components/AppShell";
import { DebtCard } from "@/components/DebtCard";
import { EmptyState } from "@/components/EmptyState";
import { LocalImportReview } from "@/components/LocalImportReview";
import { MobileBottomSheet } from "@/components/MobileBottomSheet";
import { NextActionCard } from "@/components/NextActionCard";
import { PageHeader } from "@/components/PageHeader";
import { ProgressBar } from "@/components/ProgressBar";
import { DebtPaymentForm } from "@/features/debts/DebtPaymentForm";
import { ManualDebtForm } from "@/features/debts/ManualDebtForm";
import { remainingToMinimum } from "@/lib/finance/calculations";
import { formatTHB } from "@/lib/finance/money";
import type { Debt } from "@/types/domain";

type SheetState = "create" | "edit" | "payment" | null;

export function DebtsClient({ debts }: { debts: Debt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<SheetState>(null);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const totalOutstanding = debts.reduce((sum, debt) => sum + (debt.outstandingBalanceSatang ?? 0), 0);
  const totalMinimum = debts.reduce((sum, debt) => sum + (debt.minimumPaymentSatang ?? 0), 0);
  const totalPaid = debts.reduce((sum, debt) => sum + debt.amountPaidThisCycleSatang, 0);
  const remainingMinimum = debts.reduce((sum, debt) => sum + remainingToMinimum(debt), 0);

  function closeAndRefresh(success?: string) {
    setOpen(null);
    setSelectedDebt(null);
    if (success) setMessage(success);
    router.refresh();
  }

  async function markPaid(debt: Debt) {
    if (!window.confirm(`ปิดหนี้ ${debt.name} ใช่ไหม? ประวัติการชำระจะยังอยู่เหมือนเดิม`)) return;
    const result = await markDebtPaidOffAction(debt.id);
    setMessage(result.message ?? (result.ok ? "ปิดหนี้แล้ว" : "ปิดหนี้ไม่สำเร็จ"));
    router.refresh();
  }

  async function reopen(debt: Debt) {
    const result = await reopenDebtAction(debt.id);
    setMessage(result.message ?? (result.ok ? "เปิดหนี้อีกครั้งแล้ว" : "เปิดหนี้ไม่สำเร็จ"));
    router.refresh();
  }

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="หนี้" subtitle="แยกยอดที่ต้องจ่ายกับยอดที่จ่ายแล้ว" />
        <button
          onClick={() => setOpen("create")}
          className="min-h-11 shrink-0 rounded-[16px] bg-primary px-4 text-sm font-bold text-white"
        >
          + เพิ่มหนี้
        </button>
      </div>
      {message ? (
        <div className="rounded-[16px] bg-primary-soft px-4 py-3 text-sm font-bold text-primary">
          {message}
        </div>
      ) : null}
      <section className="rounded-[16px] border border-border bg-surface p-5 shadow-[0_12px_30px_rgba(24,32,29,0.05)]">
        <p className="text-sm font-semibold text-text-secondary">หนี้ทั้งหมด</p>
        <p className="tabular mt-2 text-[40px] font-bold leading-none">{formatTHB(totalOutstanding)}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-text-secondary">ต้องจ่ายเดือนนี้</p>
            <p className="tabular mt-1 text-xl font-bold">{formatTHB(totalMinimum)}</p>
          </div>
          <div>
            <p className="text-text-secondary">จ่ายแล้ว</p>
            <p className="tabular mt-1 text-xl font-bold text-income">{formatTHB(totalPaid)}</p>
          </div>
        </div>
        <div className="mt-4">
          <ProgressBar value={totalMinimum ? (totalPaid / totalMinimum) * 100 : 0} tone="debt" />
        </div>
      </section>
      <NextActionCard title={`ยังขาดขั้นต่ำ ${formatTHB(remainingMinimum)}`} body="ดูหนี้ที่ใกล้ครบกำหนดก่อน" />
      <LocalImportReview />
      {debts.length ? (
        <div className="space-y-3">
          {debts.map((debt) => (
            <div key={debt.id} className="space-y-2">
              <DebtCard
                debt={debt}
                today={new Date()}
                onAddPayment={() => {
                  setSelectedDebt(debt);
                  setOpen("payment");
                }}
              />
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    setSelectedDebt(debt);
                    setOpen("edit");
                  }}
                  className="min-h-11 rounded-[16px] bg-muted text-sm font-bold text-primary"
                >
                  แก้ไข
                </button>
                {debt.status === "paid_off" || debt.status === "paused" ? (
                  <button
                    onClick={() => reopen(debt)}
                    className="min-h-11 rounded-[16px] bg-muted text-sm font-bold text-primary"
                  >
                    เปิดใหม่
                  </button>
                ) : (
                  <button
                    onClick={() => markPaid(debt)}
                    className="min-h-11 rounded-[16px] bg-muted text-sm font-bold text-primary"
                  >
                    ปิดหนี้
                  </button>
                )}
                <button className="min-h-11 rounded-[16px] bg-muted text-sm font-bold text-text-secondary">
                  ประวัติ
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="ยังไม่มีรายการหนี้" body="เพิ่มยอดและวันครบกำหนด แล้วตั้งหลักจะช่วยเตือนให้" />
      )}
      <MobileBottomSheet title="เพิ่มหนี้" open={open === "create"} onClose={() => setOpen(null)}>
        <ManualDebtForm onSaved={() => closeAndRefresh("บันทึกหนี้แล้ว")} />
      </MobileBottomSheet>
      <MobileBottomSheet title="แก้ไขหนี้" open={open === "edit"} onClose={() => setOpen(null)}>
        {selectedDebt ? <ManualDebtForm debt={selectedDebt} onSaved={() => closeAndRefresh("บันทึกการแก้ไขแล้ว")} /> : null}
      </MobileBottomSheet>
      <MobileBottomSheet title="เพิ่มการชำระ" open={open === "payment"} onClose={() => setOpen(null)}>
        {selectedDebt ? <DebtPaymentForm debtId={selectedDebt.id} onSaved={() => closeAndRefresh("บันทึกการชำระแล้ว")} /> : null}
      </MobileBottomSheet>
    </AppShell>
  );
}
