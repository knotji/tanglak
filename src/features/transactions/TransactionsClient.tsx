"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteTransactionAction } from "@/app/actions/finance";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips } from "@/components/FilterChips";
import { LocalImportReview } from "@/components/LocalImportReview";
import { MobileBottomSheet } from "@/components/MobileBottomSheet";
import { PageHeader } from "@/components/PageHeader";
import { TransactionGroup } from "@/components/TransactionGroup";
import { ManualTransactionForm } from "@/features/transactions/ManualTransactionForm";
import type { Transaction, TransactionType } from "@/types/domain";

export function TransactionsClient({
  transactions,
  accounts,
  monthLabel,
}: {
  transactions: Transaction[];
  accounts: import("@/types/domain").Account[];
  monthLabel: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  async function confirmDelete(transaction: Transaction) {
    const warning =
      transaction.type === "debt_payment"
        ? "รายการนี้เป็นการชำระหนี้ ถ้าลบ ยอดจ่ายแล้วของหนี้จะถูกคำนวณใหม่"
        : "ลบรายการนี้ใช่ไหม?";
    if (!window.confirm(warning)) return;
    setDeletingId(transaction.id);
    const result = await deleteTransactionAction(transaction.id);
    setDeletingId(null);
    setMessage(result.message ?? (result.ok ? "ลบรายการแล้ว" : "ลบรายการไม่สำเร็จ"));
    router.refresh();
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
      {message ? (
        <div className="rounded-[16px] bg-primary-soft px-4 py-3 text-sm font-bold text-primary">
          {message}
        </div>
      ) : null}
      <FilterChips
        value={filter}
        onChange={(value) => setFilter(value as TransactionType | "all")}
        options={[
          { label: "ทั้งหมด", value: "all" },
          { label: "รายจ่าย", value: "expense" },
          { label: "รายรับ", value: "income" },
          { label: "จ่ายหนี้", value: "debt_payment" },
        ]}
      />
      <LocalImportReview />
      {sortedDays.length ? (
        <div className="space-y-3">
          {sortedDays.map((day) => (
            <TransactionGroup
              key={day}
              date={day}
              transactions={groups[day]}
              onEdit={(transaction) => {
                setEditing(transaction);
                setOpen(true);
              }}
              onDelete={confirmDelete}
              busyId={deletingId}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="ยังไม่มีรายการ" body="เพิ่มรายรับหรือรายจ่ายแรกของเดือนนี้" />
      )}
      <MobileBottomSheet
        title={editing ? "แก้ไขรายการ" : "เพิ่มรายการ"}
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(undefined);
        }}
      >
        <ManualTransactionForm
          transaction={editing}
          accounts={accounts}
          onSaved={() => {
            setOpen(false);
            setEditing(undefined);
            setMessage(editing ? "บันทึกการแก้ไขแล้ว" : "บันทึกรายการแล้ว");
            router.refresh();
          }}
        />
      </MobileBottomSheet>
    </AppShell>
  );
}
