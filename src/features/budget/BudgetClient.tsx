"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { InlineError } from "@/components/feedback/InlineError";
import { LoadingButton } from "@/components/feedback/LoadingButton";
import {
  copyPreviousMonthAction,
  deleteBudgetCategoryAction,
  saveBudgetCategoryAction,
  saveMonthlyIncomeAction,
} from "@/app/actions/budget";
import { formatTHB } from "@/lib/finance/money";
import { shiftMonth } from "@/lib/finance/date";
import type { BudgetSummary } from "@/lib/finance/budget-calculations";

const STATUS_LABEL: Record<string, string> = {
  healthy: "ปกติ",
  near_limit: "ใกล้เต็มงบ",
  overspent: "เกินงบ",
  no_budget: "ยังไม่ตั้งงบ",
};

const STATUS_CLASS: Record<string, string> = {
  healthy: "bg-emerald-50 text-emerald-700",
  near_limit: "bg-amber-50 text-amber-700",
  overspent: "bg-red-50 text-red-700",
  no_budget: "bg-gray-100 text-gray-600",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_CLASS[status] ?? STATUS_CLASS.no_budget}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function IncomeForm({ month }: { month: string }) {
  const [state, action, pending] = useActionState(saveMonthlyIncomeAction, { ok: false });
  return (
    <form action={action} className="rounded-[16px] border border-border bg-surface p-4">
      <input type="hidden" name="month" value={month} />
      <label className="space-y-1 text-sm">
        <span className="font-medium">รายรับต่อเดือน (คาดการณ์)</span>
        <input
          name="income"
          inputMode="decimal"
          className="min-h-11 w-full rounded-[16px] border border-border px-3"
          placeholder="30000"
          aria-label="รายรับต่อเดือน"
        />
      </label>
      {state.message ? (
        state.ok ? (
          <p className="mt-2 text-sm text-emerald-700">{state.message}</p>
        ) : (
          <div className="mt-2">
            <InlineError message={state.message} />
          </div>
        )
      ) : null}
      <LoadingButton pending={pending} className="mt-3 w-full">
        บันทึกรายรับ
      </LoadingButton>
    </form>
  );
}

function CategoryForm({
  month,
  monthlyBudgetId,
}: {
  month: string;
  monthlyBudgetId: string;
}) {
  const [state, action, pending] = useActionState(saveBudgetCategoryAction, { ok: false });
  return (
    <form action={action} className="rounded-[16px] border border-dashed border-border bg-white p-3">
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="monthlyBudgetId" value={monthlyBudgetId} />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs">
          <span className="font-semibold text-text-secondary">ชื่อหมวดหมู่</span>
          <input
            name="label"
            className="min-h-11 w-full rounded-[12px] border border-border px-2 text-sm"
            placeholder="อาหาร"
            aria-label="ชื่อหมวดหมู่ใหม่"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-semibold text-text-secondary">งบต่อเดือน</span>
          <input
            name="amount"
            inputMode="decimal"
            className="min-h-11 w-full rounded-[12px] border border-border px-2 text-sm"
            placeholder="3000"
            aria-label="งบประมาณหมวดหมู่ใหม่"
          />
        </label>
      </div>
      {state.message ? (
        <div className="mt-2">
          <InlineError message={state.ok ? undefined : state.message} />
        </div>
      ) : null}
      <LoadingButton pending={pending} className="mt-2 w-full">
        + เพิ่มหมวดหมู่งบประมาณ
      </LoadingButton>
    </form>
  );
}

function CategoryRow({ month, category }: { month: string; category: BudgetSummary["categories"][number] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveBudgetCategoryAction, { ok: false });
  const [deleting, setDeleting] = useState(false);
  const percentLabel =
    category.usagePercent === null ? "-" : `${Math.round(category.usagePercent * 100)}%`;

  async function handleDelete() {
    if (!category.budgetCategoryId) return;
    if (!window.confirm(`ลบงบหมวด "${category.label}" ใช่ไหม?`)) return;
    setDeleting(true);
    await deleteBudgetCategoryAction(category.budgetCategoryId, month);
    setDeleting(false);
    router.refresh();
  }

  return (
    <div className="rounded-[16px] border border-border bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{category.label}</p>
          <p className="text-xs text-text-secondary">
            ใช้ไป {formatTHB(category.spentSatang)} จาก {formatTHB(category.budgetedSatang)} ({percentLabel})
          </p>
        </div>
        <StatusBadge status={category.status} />
      </div>
      {category.budgetCategoryId ? (
        <form action={action} className="mt-2 flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="categoryId" value={category.budgetCategoryId} />
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={String(category.budgetedSatang / 100)}
            aria-label={`แก้ไขงบหมวด ${category.label}`}
            className="min-h-11 flex-1 rounded-[12px] border border-border px-2 text-sm"
          />
          <LoadingButton pending={pending} className="shrink-0 px-3 text-xs">
            แก้ไข
          </LoadingButton>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label={`ลบงบหมวด ${category.label}`}
            className="min-h-11 shrink-0 rounded-[16px] bg-muted px-3 text-xs font-bold text-overdue disabled:opacity-60"
          >
            ลบ
          </button>
        </form>
      ) : (
        <p className="mt-2 text-xs text-text-secondary">รายการนี้ยังไม่มีงบตั้งไว้ (มาจากธุรกรรมจริง)</p>
      )}
      {state.message && !state.ok ? (
        <div className="mt-2">
          <InlineError message={state.message} />
        </div>
      ) : null}
    </div>
  );
}

function CopyPreviousMonthForm({ fromMonth, toMonth }: { fromMonth: string; toMonth: string }) {
  const [state, action, pending] = useActionState(copyPreviousMonthAction, { ok: false });
  return (
    <form action={action} className="rounded-[16px] border border-border bg-white p-3">
      <input type="hidden" name="fromMonth" value={fromMonth} />
      <input type="hidden" name="toMonth" value={toMonth} />
      {state.message ? (
        <p className={`mb-2 text-sm ${state.ok ? "text-emerald-700" : "text-overdue"}`}>{state.message}</p>
      ) : null}
      <LoadingButton pending={pending} className="w-full" pendingLabel="กำลังคัดลอก...">
        คัดลอกงบจากเดือนก่อนหน้า
      </LoadingButton>
    </form>
  );
}

export function BudgetClient({
  summary,
  monthlyBudgetId,
  selectedMonth,
  currentMonth,
  previousMonth,
  monthLabel,
  canCopyPreviousMonth,
}: {
  summary: BudgetSummary;
  monthlyBudgetId?: string;
  selectedMonth: string;
  currentMonth: string;
  previousMonth: string;
  monthLabel: string;
  canCopyPreviousMonth: boolean;
}) {
  const router = useRouter();
  const nextMonth = shiftMonth(selectedMonth, 1);
  const isCurrentMonth = selectedMonth === currentMonth;

  function goToMonth(month: string) {
    router.push(`/budget?month=${month}`);
  }

  return (
    <AppShell>
      <PageHeader title="งบประมาณรายเดือน" subtitle={monthLabel} />

      <div className="flex flex-wrap items-center gap-2 rounded-[16px] border border-border bg-white p-2 shadow-sm">
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

      {!summary.hasBudget ? (
        <div className="rounded-[16px] border border-dashed border-border bg-surface p-4 text-sm text-text-secondary">
          ยังไม่มีงบประมาณสำหรับเดือนนี้ เริ่มต้นด้วยการตั้งรายรับด้านล่าง
        </div>
      ) : null}

      <IncomeForm month={selectedMonth} />

      {canCopyPreviousMonth ? <CopyPreviousMonthForm fromMonth={previousMonth} toMonth={selectedMonth} /> : null}

      <section className="rounded-[16px] border border-border bg-surface p-4" aria-label="สรุปงบประมาณ">
        <h2 className="text-sm font-bold text-foreground">สรุปภาพรวม</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-text-secondary">รายรับคาดการณ์</dt>
            <dd className="font-bold">{formatTHB(summary.expectedIncomeSatang)}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">งบที่วางแผนรวม</dt>
            <dd className="font-bold">{formatTHB(summary.plannedTotalSatang)}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">ใช้ไปแล้ว</dt>
            <dd className="font-bold">{formatTHB(summary.spentTotalSatang)}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">คงเหลือจากงบ</dt>
            <dd className={`font-bold ${summary.remainingTotalSatang < 0 ? "text-overdue" : ""}`}>
              {formatTHB(summary.remainingTotalSatang)}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">รายรับที่ยังไม่จัดสรร</dt>
            <dd className={`font-bold ${summary.unallocatedIncomeSatang < 0 ? "text-overdue" : ""}`}>
              {formatTHB(summary.unallocatedIncomeSatang)}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">ยอดเกินงบรวม</dt>
            <dd className="font-bold text-overdue">{formatTHB(summary.overspentTotalSatang)}</dd>
          </div>
        </dl>
        {summary.uncategorizedSpentSatang > 0 ? (
          <p className="mt-3 text-xs text-text-secondary">
            มีรายจ่ายที่ยังไม่ระบุหมวดหมู่ {formatTHB(summary.uncategorizedSpentSatang)} (ไม่นับรวมในหมวดหมู่ด้านล่าง)
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2" aria-label="งบประมาณตามหมวดหมู่">
        <h2 className="px-1 text-sm font-bold text-foreground">งบตามหมวดหมู่</h2>
        {summary.categories.length === 0 ? (
          <p className="rounded-[16px] border border-dashed border-border bg-white p-4 text-center text-sm text-text-secondary">
            ยังไม่มีหมวดหมู่งบประมาณ เพิ่มหมวดแรกด้านล่าง
          </p>
        ) : (
          summary.categories.map((category) => (
            <CategoryRow key={category.label} month={selectedMonth} category={category} />
          ))
        )}
      </section>

      {monthlyBudgetId ? <CategoryForm month={selectedMonth} monthlyBudgetId={monthlyBudgetId} /> : null}
    </AppShell>
  );
}
