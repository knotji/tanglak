"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteDebtPaymentAction, updateDebtPaymentAction } from "@/app/actions/finance";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { InlineError } from "@/components/feedback/InlineError";
import { LoadingButton } from "@/components/feedback/LoadingButton";
import { useToast } from "@/components/feedback/ToastProvider";
import { MobileBottomSheet } from "@/components/MobileBottomSheet";
import { PageHeader } from "@/components/PageHeader";
import { ProgressBar } from "@/components/ProgressBar";
import { formatTHB } from "@/lib/finance/money";
import { parseRequiredMoney } from "@/lib/finance/money-guards";
import type { Debt, Transaction } from "@/types/domain";

function monthLabel(key: string) {
  const date = new Date(`${key}-01T00:00:00+07:00`);
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(date);
}

function PaymentEditForm({
  debt,
  payment,
  onSaved,
}: {
  debt: Debt;
  payment: Transaction;
  onSaved: () => void;
}) {
  const [state, action, pending] = useActionState(updateDebtPaymentAction, { ok: false });
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onSaved();
  }, [onSaved, state.ok]);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget);
        const amountResult = parseRequiredMoney(formData.get("amount"), "positive");
        if (!amountResult.ok) {
          event.preventDefault();
          setClientError(amountResult.error);
          return;
        }
        setClientError(null);
      }}
      className="rounded-[16px] border border-border bg-surface p-4"
    >
      <input type="hidden" name="id" value={payment.id} />
      <input type="hidden" name="debtId" value={debt.id} />
      <div className="grid gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">วันที่ชำระ</span>
          <input
            name="date"
            type="date"
            defaultValue={payment.occurredAt.slice(0, 10)}
            className="min-h-11 w-full rounded-[16px] border border-border px-3"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">ยอดชำระ</span>
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={String(payment.amountSatang / 100)}
            className="min-h-11 w-full rounded-[16px] border border-border px-3"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">โน้ต</span>
          <textarea
            name="note"
            defaultValue={payment.note ?? ""}
            className="min-h-24 w-full rounded-[16px] border border-border px-3 py-2"
          />
        </label>
      </div>
      <div className="mt-3">
        <InlineError message={clientError ?? (state.ok ? undefined : state.message)} />
      </div>
      <LoadingButton pending={pending} className="mt-4 w-full">
        บันทึกการชำระ
      </LoadingButton>
    </form>
  );
}

export function DebtPaymentHistoryClient({
  debt,
  payments,
}: {
  debt: Debt;
  payments: Transaction[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const grouped = useMemo(() => {
    return payments.reduce<Record<string, Transaction[]>>((acc, payment) => {
      const key = payment.occurredAt.slice(0, 7);
      acc[key] = [...(acc[key] ?? []), payment];
      return acc;
    }, {});
  }, [payments]);
  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const minimum = debt.minimumPaymentSatang ?? 0;
  const progress = minimum ? Math.min(100, (debt.amountPaidThisCycleSatang / minimum) * 100) : 0;

  async function deletePayment() {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    const result = await deleteDebtPaymentAction(target.id, debt.id);
    showToast(result.message ?? (result.ok ? "ลบการชำระแล้ว" : "ลบการชำระไม่สำเร็จ"), result.ok ? "success" : "error");
    if (result.ok) router.refresh();
  }

  return (
    <AppShell>
      <PageHeader title={debt.name} subtitle="ประวัติการชำระหนี้" />
      <section className="rounded-[16px] border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-text-secondary">รอบปัจจุบัน</p>
        <p className="mt-2 text-2xl font-bold">
          {formatTHB(debt.amountPaidThisCycleSatang)} จาก {formatTHB(minimum)}
        </p>
        <div className="mt-3">
          <ProgressBar value={progress} tone="debt" />
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          ยังขาดขั้นต่ำ {formatTHB(Math.max(0, minimum - debt.amountPaidThisCycleSatang))}
        </p>
      </section>
      {months.length ? (
        <div className="space-y-4">
          {months.map((month) => (
            <section key={month} className="space-y-2">
              <h2 className="px-1 text-sm font-bold text-text-secondary">{monthLabel(month)}</h2>
              {grouped[month].map((payment) => (
                <div key={payment.id} className="rounded-[16px] border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{new Date(payment.occurredAt).toLocaleDateString("th-TH")}</p>
                      <p className="text-sm text-text-secondary">
                        {payment.sourceAccountId ? `บัญชี ${payment.sourceAccountId}` : "ไม่ระบุบัญชี"}
                        {payment.documentId ? " · มีเอกสารแนบ" : ""}
                      </p>
                      {payment.note ? <p className="mt-1 text-sm text-text-secondary">{payment.note}</p> : null}
                    </div>
                    <p className="tabular text-lg font-bold">{formatTHB(payment.amountSatang)}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setEditing(payment)}
                      aria-label={`แก้ไขการชำระ ${new Date(payment.occurredAt).toLocaleDateString("th-TH")} ${formatTHB(payment.amountSatang)}`}
                      className="min-h-11 rounded-[16px] bg-muted text-sm font-bold text-primary"
                    >
                      แก้ไข
                    </button>
                    <button
                      onClick={() => setDeleting(payment)}
                      aria-label={`ลบการชำระ ${new Date(payment.occurredAt).toLocaleDateString("th-TH")} ${formatTHB(payment.amountSatang)}`}
                      className="min-h-11 rounded-[16px] bg-muted text-sm font-bold text-overdue"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <section className="rounded-[16px] border border-dashed border-border bg-surface p-5 text-center">
          <p className="font-bold">ยังไม่มีประวัติการชำระ</p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">เพิ่มการชำระจากหน้าหนี้ แล้วประวัติจะอยู่ตรงนี้หลัง refresh</p>
        </section>
      )}
      <MobileBottomSheet title="แก้ไขการชำระ" open={Boolean(editing)} onClose={() => setEditing(null)}>
        {editing ? (
          <PaymentEditForm
            debt={debt}
            payment={editing}
            onSaved={() => {
              setEditing(null);
              showToast("บันทึกการชำระแล้ว", "success");
              router.refresh();
            }}
          />
        ) : null}
      </MobileBottomSheet>
      <ConfirmDialog
        open={Boolean(deleting)}
        title="ลบการชำระนี้?"
        body="ยอดจ่ายแล้วของหนี้รอบนี้จะถูกคำนวณใหม่ทันที และรายการนี้จะไม่ถูกนับเป็นรายจ่ายทั่วไป"
        confirmLabel="ลบ"
        onCancel={() => setDeleting(null)}
        onConfirm={deletePayment}
      />
    </AppShell>
  );
}
