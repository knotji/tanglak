"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { InlineError } from "@/components/feedback/InlineError";
import { LoadingButton } from "@/components/feedback/LoadingButton";
import { MoneyAmount } from "@/components/MoneyAmount";
import {
  BudgetProgress,
  MonthSelector,
  calculateBudgetPercentage,
} from "@/components/finance";
import {
  copyPreviousMonthAction,
  deleteBudgetCategoryAction,
  saveBudgetCategoryAction,
  saveMonthlyIncomeAction,
} from "@/app/actions/budget";
import { formatTHB } from "@/lib/finance/money";
import type { BudgetSummary } from "@/lib/finance/budget-calculations";
import { listBudgetableExpenseCategories } from "@/lib/finance/categories";

function IncomeForm({
  month,
  hasBudget,
  savedIncomeSatang,
}: {
  month: string;
  hasBudget: boolean;
  savedIncomeSatang: number;
}) {
  const [state, action, pending] = useActionState(saveMonthlyIncomeAction, { ok: false });
  return (
    <form action={action} className="rounded-[16px] border border-border bg-surface p-4">
      {!hasBudget ? (
        <div className="mb-3">
          <p className="text-sm font-bold text-foreground">เริ่มตั้งงบเดือนนี้</p>
          <p className="mt-0.5 text-xs leading-5 text-text-secondary">ตั้งงบเพื่อรู้ว่าเดือนนี้ยังใช้ได้อีกเท่าไร</p>
        </div>
      ) : (
        <p className="mb-2 text-xs text-text-secondary">
          รายรับที่บันทึกไว้ตอนนี้: <span className="font-bold text-foreground">{formatTHB(savedIncomeSatang)}</span>
        </p>
      )}
      <input type="hidden" name="month" value={month} />
      <label className="space-y-1 text-sm">
        <span className="font-medium">รายรับต่อเดือน (คาดการณ์)</span>
        <input
          name="income"
          inputMode="decimal"
          // Pre-fills with the saved value on first mount (and whenever
          // the selected month changes -- see the `key` at the call site)
          // so this field never looks like an unrelated blank draft. It is
          // intentionally uncontrolled after that: what the user types is
          // just a draft until submitted, and the "รายรับที่บันทึกไว้ตอนนี้"
          // line above always reflects the true saved value on every
          // render, independent of this field's in-progress draft text.
          defaultValue={hasBudget ? String(savedIncomeSatang / 100) : undefined}
          className="min-h-11 w-full rounded-[16px] border border-border px-3"
          placeholder="30000"
          aria-label="รายรับต่อเดือน"
        />
      </label>
      {state.message ? (
        state.ok ? (
          <p className="mt-2 text-sm font-bold text-income">{state.message}</p>
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
  availableCategoryLabels,
}: {
  month: string;
  monthlyBudgetId: string;
  availableCategoryLabels: string[];
}) {
  const [state, action, pending] = useActionState(saveBudgetCategoryAction, { ok: false });

  if (availableCategoryLabels.length === 0) {
    return (
      <p className="rounded-[16px] border border-dashed border-border bg-surface p-3 text-center text-xs text-text-secondary">
        ตั้งงบครบทุกหมวดหมู่ที่มีแล้ว
      </p>
    );
  }

  return (
    <form action={action} className="rounded-[16px] border border-dashed border-border bg-surface p-3">
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="monthlyBudgetId" value={monthlyBudgetId} />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs">
          <span className="font-semibold text-text-secondary">หมวดหมู่</span>
          {/* Canonical category catalog (src/lib/finance/categories.ts) --
              no more free-text category creation; every budgetable
              category already exists in the catalog, so the user always
              picks from a real list instead of typing (and possibly
              typo'ing) a label. Categories that already have a budget row
              this month are excluded to avoid a duplicate-label conflict. */}
          <select
            name="label"
            className="min-h-11 w-full rounded-[12px] border border-border px-2 text-sm"
            aria-label="ชื่อหมวดหมู่ใหม่"
          >
            {availableCategoryLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const percentage = calculateBudgetPercentage(category.spentSatang, category.budgetedSatang);
  const percentLabel =
    category.budgetedSatang <= 0
      ? "ยังไม่ได้ตั้งงบสำหรับหมวดนี้"
      : `${percentage}% ของงบหมวดนี้`;

  function handleDelete() {
    if (!category.budgetCategoryId) return;
    setConfirmDeleteOpen(true);
  }

  async function executeDelete() {
    setConfirmDeleteOpen(false);
    if (!category.budgetCategoryId) return;
    setDeleting(true);
    await deleteBudgetCategoryAction(category.budgetCategoryId, month);
    setDeleting(false);
    router.refresh();
  }

  return (
    <div className="rounded-[16px] border border-border bg-surface p-3">
      <BudgetProgress label={category.label} spentSatang={category.spentSatang} budgetSatang={category.budgetedSatang} />
      <p className="mt-2 text-[11px] font-medium text-text-secondary">{percentLabel}</p>
      {category.budgetCategoryId ? (
        <form action={action} className="mt-3 flex items-center gap-2 border-t border-border pt-3">
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
        <p className="mt-3 border-t border-border pt-3 text-xs text-text-secondary">
          รายการนี้ยังไม่มีงบตั้งไว้ (มาจากธุรกรรมจริง)
        </p>
      )}
      {state.message && !state.ok ? (
        <div className="mt-2">
          <InlineError message={state.message} />
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="ลบงบหมวดหมู่หรือไม่"
        body={`คุณต้องการลบงบประมาณสำหรับหมวด "${category.label}" หรือไม่? การลบนี้จะยกเลิกการตั้งงบของหมวดนี้ในเดือนปัจจุบัน`}
        confirmLabel="ลบงบประมาณ"
        cancelLabel="ยกเลิก"
        confirmPending={deleting}
        pendingLabel="กำลังลบ..."
        onConfirm={executeDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}

function CopyPreviousMonthForm({
  fromMonth,
  toMonth,
  preview,
  targetIncomeSatang,
}: {
  fromMonth: string;
  toMonth: string;
  preview: Array<{ label: string; amountSatang: number }>;
  targetIncomeSatang: number;
}) {
  const [state, action, pending] = useActionState(copyPreviousMonthAction, { ok: false });
  return (
    <form action={action} className="rounded-[16px] border border-border bg-surface p-3">
      <input type="hidden" name="fromMonth" value={fromMonth} />
      <input type="hidden" name="toMonth" value={toMonth} />
      {preview.length ? (
        <details className="mb-3 text-xs text-text-secondary">
          <summary className="cursor-pointer font-bold text-primary">จะคัดลอกอะไรบ้าง</summary>
          <p className="mt-2">
            จะคัดลอก {preview.length} หมวดหมู่ รวมงบเดิม {formatTHB(preview.reduce((sum, c) => sum + c.amountSatang, 0))}
          </p>
          <p className="mt-1">คัดลอกเฉพาะงบแต่ละหมวด รายรับของเดือนใหม่จะไม่ถูกคัดลอก</p>
        </details>
      ) : null}
      {state.message ? (
        <div className="mb-2 space-y-1">
          <p className={`text-sm font-bold ${state.ok ? "text-income" : "text-overdue"}`}>{state.message}</p>
          {state.ok && targetIncomeSatang === 0 ? (
            <p className="text-xs text-text-secondary">อย่าลืมตั้งรายรับต่อเดือนสำหรับเดือนนี้ด้วย</p>
          ) : null}
        </div>
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
  previousMonthCategoryPreview,
}: {
  summary: BudgetSummary;
  monthlyBudgetId?: string;
  selectedMonth: string;
  currentMonth: string;
  previousMonth: string;
  monthLabel: string;
  canCopyPreviousMonth: boolean;
  previousMonthCategoryPreview: Array<{ label: string; amountSatang: number }>;
}) {
  const router = useRouter();
  const isHistorical = selectedMonth < currentMonth;
  // Categories that already have a budget row this month are excluded --
  // the DB enforces one row per (monthly_budget_id, label), so offering
  // them again would only ever surface the "already budgeted" error.
  const configuredLabels = new Set(summary.categories.filter((c) => c.budgetCategoryId).map((c) => c.label));
  const availableCategoryLabels = listBudgetableExpenseCategories()
    .map((category) => category.label)
    .filter((label) => !configuredLabels.has(label));

  function goToMonth(month: string) {
    router.push(`/budget?month=${month}`);
  }

  return (
    <AppShell>
      <PageHeader title="งบประมาณรายเดือน" subtitle={monthLabel} />

      <div className="flex items-center gap-2">
        <MonthSelector value={selectedMonth} currentMonth={currentMonth} onMonthChange={goToMonth} label="เลือกเดือนงบประมาณ" />
        {isHistorical ? (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-text-secondary">
            เดือนที่ผ่านมา
          </span>
        ) : null}
      </div>

      {!summary.hasBudget ? (
        <div className="rounded-[16px] border border-dashed border-border bg-surface p-4 text-sm text-text-secondary">
          ยังไม่มีงบประมาณสำหรับเดือนนี้ เริ่มต้นด้วยการตั้งรายรับด้านล่าง
        </div>
      ) : null}

      <IncomeForm
        key={selectedMonth}
        month={selectedMonth}
        hasBudget={summary.hasBudget}
        savedIncomeSatang={summary.expectedIncomeSatang}
      />

      {canCopyPreviousMonth ? (
        <CopyPreviousMonthForm
          fromMonth={previousMonth}
          toMonth={selectedMonth}
          preview={previousMonthCategoryPreview}
          targetIncomeSatang={summary.expectedIncomeSatang}
        />
      ) : null}

      <section className="rounded-[16px] border border-border bg-surface p-4" aria-label="สรุปงบประมาณ">
        <p className="text-sm font-semibold text-text-secondary">
          {summary.hasBudget ? "งบที่เหลือจริง" : "ยังไม่ได้วางงบเดือนนี้"}
        </p>
        {summary.hasBudget ? (
          <MoneyAmount
            satang={summary.remainingTotalSatang}
            tone={summary.remainingTotalSatang < 0 ? "expense" : "income"}
            className="mt-1 block text-[32px] font-bold leading-none"
          />
        ) : (
          <p className="mt-1 text-lg font-bold leading-snug text-text-secondary">
            ตั้งงบเพื่อดูว่าแต่ละหมวดยังใช้ได้อีกเท่าไร
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 text-sm">
          <div>
            <dt className="text-text-secondary">รายรับที่ตั้งไว้</dt>
            <dd className="tabular font-bold">{formatTHB(summary.expectedIncomeSatang)}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">วางงบแล้ว</dt>
            <dd className="tabular font-bold">{formatTHB(summary.plannedTotalSatang)}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">ยังไม่ได้จัดสรร</dt>
            <dd className={`tabular font-bold ${summary.unallocatedIncomeSatang < 0 ? "text-overdue" : ""}`}>
              {formatTHB(summary.unallocatedIncomeSatang)}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">ใช้ไปแล้ว</dt>
            <dd className="tabular font-bold">{formatTHB(summary.spentTotalSatang)}</dd>
          </div>
        </dl>
        {summary.hasBudget && summary.overspentTotalSatang > 0 ? (
          <p className="mt-3 text-xs font-bold text-overdue">ยอดเกินงบรวม {formatTHB(summary.overspentTotalSatang)}</p>
        ) : null}
        {summary.unbudgetedSpentTotalSatang > 0 ? (
          <p className="mt-2 text-xs text-text-secondary">
            ใช้จ่ายไป {formatTHB(summary.unbudgetedSpentTotalSatang)} ในหมวดที่ยังไม่ได้ตั้งงบ
          </p>
        ) : null}
        {summary.uncategorizedSpentSatang > 0 ? (
          <p className="mt-2 text-xs text-text-secondary">
            มีรายจ่ายที่ยังไม่ระบุหมวดหมู่ {formatTHB(summary.uncategorizedSpentSatang)} (ไม่นับรวมในหมวดหมู่ด้านล่าง)
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2" aria-label="งบประมาณตามหมวดหมู่">
        <h2 className="px-1 text-sm font-bold text-foreground">งบตามหมวดหมู่</h2>
        {summary.categories.length === 0 ? (
          <p className="rounded-[16px] border border-dashed border-border bg-surface p-4 text-center text-sm text-text-secondary">
            ยังไม่มีหมวดหมู่งบประมาณ เพิ่มหมวดแรกด้านล่าง
          </p>
        ) : (
          summary.categories.map((category) => (
            <CategoryRow key={category.label} month={selectedMonth} category={category} />
          ))
        )}
      </section>

      {monthlyBudgetId ? (
        <CategoryForm
          month={selectedMonth}
          monthlyBudgetId={monthlyBudgetId}
          availableCategoryLabels={availableCategoryLabels}
        />
      ) : null}
    </AppShell>
  );
}
