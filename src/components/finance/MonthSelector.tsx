"use client";

import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import {
  formatBangkokMonthLabel,
  getBangkokMonthString,
  resolveBangkokMonthQuery,
  shiftMonth,
} from "@/lib/finance/date";

export function MonthSelector({
  value,
  currentMonth = getBangkokMonthString(),
  onMonthChange,
  label = "เลือกเดือน",
}: {
  value?: string;
  currentMonth?: string;
  onMonthChange: (month: string) => void;
  label?: string;
}) {
  const selectedMonth = resolveBangkokMonthQuery(value, new Date(`${currentMonth}-01T00:00:00+07:00`));
  const isCurrent = selectedMonth === currentMonth;
  const monthLabel = formatBangkokMonthLabel(selectedMonth);

  function move(offset: number) {
    onMonthChange(shiftMonth(selectedMonth, offset));
  }

  return (
    <div
      className="flex max-w-full items-center gap-2 overflow-hidden rounded-lg border border-border bg-surface p-1"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
        if (event.key === "Home") {
          event.preventDefault();
          onMonthChange(currentMonth);
        }
      }}
    >
      <button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-primary" aria-label="เดือนก่อนหน้า" onClick={() => move(-1)}>
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <div className="min-w-0 flex-1 text-center">
        <p className="flex items-center justify-center gap-1 text-xs font-medium text-text-secondary">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          <span>{selectedMonth}</span>
        </p>
        <p className="truncate text-sm font-bold text-foreground">{monthLabel}</p>
      </div>
      {!isCurrent ? (
        <button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-primary" aria-label="กลับไปเดือนนี้" onClick={() => onMonthChange(currentMonth)}>
          <RotateCcw className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
      <button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-primary" aria-label="เดือนถัดไป" onClick={() => move(1)}>
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
