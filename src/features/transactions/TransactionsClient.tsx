"use client";

import { ChevronLeft, ChevronRight, Edit3, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTransactionAction } from "@/app/actions/finance";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/components/feedback/ToastProvider";
import { FilterChips } from "@/components/FilterChips";
import { LocalImportReview } from "@/components/LocalImportReview";
import { MobileBottomSheet } from "@/components/MobileBottomSheet";
import { PageHeader } from "@/components/PageHeader";
import { TransactionGroup } from "@/components/TransactionGroup";
import { ManualTransactionForm } from "@/features/transactions/ManualTransactionForm";
import { shiftMonth } from "@/lib/finance/date";
import type { Account, Debt, Transaction, TransactionType } from "@/types/domain";

export function TransactionsClient({
  transactions,
  accounts,
  debts = [],
  selectedMonth,
  currentMonth,
  monthLabel,
  importContext = false,
}: {
  transactions: Transaction[];
  accounts: Account[];
  debts?: Debt[];
  selectedMonth: string;
  currentMonth: string;
  monthLabel: string;
  importContext?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [filter, setFilter] = useState("all");
  const [isFilterPending, startFilterTransition] = useTransition();
  const [isMonthPending, startMonthTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | undefined>();
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const filtered = transactions.filter((transaction) => {
    if (filter === "all") return true;
    return transaction.type === filter;
  });
  const groups = useMemo(() => {
    return filtered.reduce<Record<string, Transaction[]>>((acc, transaction) => {
      const key = transaction.occurredAt.slice(0, 10);
      acc[key] = [...(acc[key] ?? []), transaction];
      return acc;
    }, {});
  }, [filtered]);
  const sortedDays = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const previousMonth = shiftMonth(selectedMonth, -1);
  const nextMonth = shiftMonth(selectedMonth, 1);
  const isCurrentMonth = selectedMonth === currentMonth;
  const isPending = isFilterPending || isMonthPending;

  function goToMonth(month: string) {
    startMonthTransition(() => {
      router.push(`/transactions?month=${month}`);
    });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const transaction = deleteTarget;
    setDeletingId(transaction.id);
    const result = await deleteTransactionAction(transaction.id);
    setDeletingId(null);
    if (result.ok) setDeleteTarget(null);
    setMessage(result.message ?? (result.ok ? "ลบรายการแล้ว" : "ลบรายการไม่สำเร็จ"));
    showToast(result.message ?? (result.ok ? "ลบรายการแล้ว" : "ลบรายการไม่สำเร็จ"), result.ok ? "success" : "error");
    if (result.ok) router.refresh();
  }

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="รายการ" subtitle={monthLabel} />
        <button
          onClick={() => setOpen(true)}
          className="min-h-11 shrink-0 rounded-[16px] bg-primary px-4 text-sm font-bold text-white"
        >
          + เพิ่มรายการ
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-[16px] border border-border bg-surface p-2">
        <button
          type="button"
          onClick={() => goToMonth(previousMonth)}
          aria-label={`เดือนก่อนหน้า ${previousMonth}`}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-surface text-foreground"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-bold text-foreground">{monthLabel}</div>
        </div>
        <button
          type="button"
          onClick={() => goToMonth(nextMonth)}
          aria-label={`เดือนถัดไป ${nextMonth}`}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-surface text-foreground"
        >
          <ChevronRight size={20} aria-hidden />
        </button>
        {!isCurrentMonth ? (
          <button
            type="button"
            onClick={() => goToMonth(currentMonth)}
            className="min-h-11 rounded-xl bg-primary-soft px-3 text-xs font-bold text-primary"
          >
            เดือนนี้
          </button>
        ) : null}
      </div>

      {importContext ? (
        <div className="rounded-[16px] border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary">
          <p className="font-bold">กำลังแสดงรายการเดือน{monthLabel}</p>
          <p className="text-xs font-semibold">มาจากชุดข้อมูลเดิมล่าสุด</p>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-[16px] bg-primary-soft px-4 py-3 text-sm font-bold text-primary">
          {message}
        </div>
      ) : null}
      <FilterChips
        value={filter}
        onChange={(value) => startFilterTransition(() => setFilter(value as TransactionType | "all"))}
        options={[
          { label: "ทั้งหมด", value: "all" },
          { label: "รายจ่าย", value: "expense" },
          { label: "รายรับ", value: "income" },
          { label: "จ่ายหนี้", value: "debt_payment" },
        ]}
      />
      <LocalImportReview />
      {sortedDays.length ? (
        <div
          className={`min-h-[50vh] space-y-3 transition-opacity duration-200 ${
            isPending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {sortedDays.map((day) => (
            <TransactionGroup
              key={day}
              date={day}
              transactions={groups[day]}
              onTransactionClick={(transaction) => {
                setSelectedTransaction(transaction);
                setShowActionSheet(true);
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={`ยังไม่มีรายการในเดือน${monthLabel}`}
          body={`เดือน${monthLabel}ยังไม่มีรายรับหรือรายจ่ายที่บันทึกไว้`}
        />
      )}
      {/* Transaction Action Sheet */}
      <MobileBottomSheet
        title="จัดการรายการ"
        open={showActionSheet}
        onClose={() => {
          setShowActionSheet(false);
          setSelectedTransaction(null);
        }}
      >
        {selectedTransaction && (
          <div className="flex flex-col gap-2 pb-4">
            <div className="mb-2 rounded-[16px] bg-muted/50 p-4">
              <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                {selectedTransaction.merchant ?? "รายละเอียดรายการ"}
              </p>
              <p className="mt-1 text-sm font-medium">
                {new Date(selectedTransaction.occurredAt).toLocaleString("th-TH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(selectedTransaction);
                setShowActionSheet(false);
                setOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-[16px] bg-surface p-4 text-left font-bold text-foreground shadow-sm ring-1 ring-border hover:bg-muted/30"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Edit3 size={20} />
              </div>
              <div>
                <div className="text-sm">แก้ไขรายการ</div>
                <div className="text-[11px] font-medium text-text-secondary">
                  เปลี่ยนชื่อ หมวดหมู่ หรือวันที่
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteTarget(selectedTransaction);
                setShowActionSheet(false);
              }}
              className="flex w-full items-center gap-3 rounded-[16px] bg-surface p-4 text-left font-bold text-overdue shadow-sm ring-1 ring-border hover:bg-red-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-overdue">
                <Trash2 size={20} />
              </div>
              <div>
                <div className="text-sm">ลบรายการนี้</div>
                <div className="text-[11px] font-medium text-text-secondary">
                  ข้อมูลจะถูกลบออกถาวร
                </div>
              </div>
            </button>
          </div>
        )}
      </MobileBottomSheet>

      <MobileBottomSheet
        title={editing ? "แก้ไขรายการ" : "เพิ่มรายการ"}
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(undefined);
          setSelectedTransaction(null);
        }}
      >
        <ManualTransactionForm
          transaction={editing}
          accounts={accounts}
          debts={debts}
          onSaved={() => {
            setOpen(false);
            setEditing(undefined);
            setMessage(editing ? "บันทึกการแก้ไขแล้ว" : "บันทึกรายการแล้ว");
            // No router.refresh() here -- saveTransactionAction already
            // calls revalidatePath("/transactions") etc., and Next.js
            // automatically refetches this route's data once a
            // useActionState-bound form action resolves. An explicit
            // refresh here would just repeat that fetch.
          }}
        />
      </MobileBottomSheet>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="ลบรายการนี้?"
        body={
          deleteTarget?.type === "debt_payment"
            ? "รายการนี้เป็นการชำระหนี้ ถ้าลบ ยอดจ่ายแล้วของหนี้รอบนี้จะถูกคำนวณใหม่ แต่ข้อมูลหนี้เดิมจะไม่ถูกลบ"
            : "รายการนี้จะถูกลบออกจากเดือนนี้ ข้อมูลหนี้ บัญชี และรายการอื่นจะไม่ถูกเปลี่ยน"
        }
        confirmLabel="ลบรายการนี้"
        pendingLabel="กำลังลบ..."
        confirmPending={Boolean(deletingId)}
        onCancel={() => {
          if (!deletingId) setDeleteTarget(null);
        }}
        onConfirm={confirmDelete}
      />
    </AppShell>
  );
}
