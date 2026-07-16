import Link from "next/link";
import { formatThaiDateLabel } from "@/lib/finance/date";
import { formatTHB } from "@/lib/finance/money";
import type { SpendForecast } from "@/lib/finance/spend-forecast";

export function shouldShowSpendForecast(forecast: SpendForecast, month: string, todayKey: string) {
  return (
    forecast.isAvailable &&
    todayKey.startsWith(`${month}-`) &&
    forecast.onTrackToExceedBudget
  );
}

function formatExhaustionTiming(daysBeforeMonthEnd: number) {
  if (daysBeforeMonthEnd === 0) return "พอดีกับสิ้นเดือน";
  return `เร็วกว่าสิ้นเดือนประมาณ ${daysBeforeMonthEnd} วัน`;
}

export function SpendForecastCard({
  forecast,
  month,
  todayKey,
}: {
  forecast: SpendForecast;
  month: string;
  todayKey: string;
}) {
  if (!shouldShowSpendForecast(forecast, month, todayKey)) return null;

  return (
    <section
      aria-labelledby="spend-forecast-heading"
      role="status"
      className="rounded-[16px] border border-amber-200 bg-amber-50/80 p-5 text-amber-950"
    >
      <p className="text-sm font-bold text-amber-700">ประมาณจากพฤติกรรมล่าสุด</p>
      <h2 id="spend-forecast-heading" className="mt-1 text-xl font-bold text-foreground">
        ระวังงบหมดก่อนสิ้นเดือน
      </h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        จากการใช้จ่ายช่วง {forecast.trailingWindowDaysUsed} วันที่ผ่านมา คาดว่าจะใช้เพิ่มอีกประมาณ{" "}
        {formatTHB(forecast.projectedAdditionalSpendSatang)} ภายในสิ้นเดือน
      </p>
      {forecast.projectedBudgetExhaustionDate && forecast.daysBeforeMonthEnd !== null ? (
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          คาดว่างบจะหมดประมาณวันที่ {formatThaiDateLabel(forecast.projectedBudgetExhaustionDate)}{" "}
          {formatExhaustionTiming(forecast.daysBeforeMonthEnd)}
        </p>
      ) : null}
      <p className="mt-2 text-sm font-bold text-amber-800">
        อาจเกินงบประมาณ {formatTHB(forecast.projectedBudgetVarianceSatang)}
      </p>
      <p className="mt-2 text-xs leading-5 text-text-secondary">
        เป็นการประมาณจากพฤติกรรมล่าสุด ยอดจริงอาจเปลี่ยนได้
      </p>
      <Link href="/budget" className="mt-4 flex min-h-11 items-center justify-center rounded-[16px] bg-primary px-4 text-sm font-bold text-white">
        ดูและปรับงบ
      </Link>
    </section>
  );
}
