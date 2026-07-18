import { daysUntilDue, isOverdue, remainingToMinimum } from "@/lib/finance/calculations";
import { formatTHB } from "@/lib/finance/money";
import { portfolioStrategyLabel, type PortfolioRecommendation } from "@/lib/finance/portfolio-recommendation";
import type { SpendForecast } from "@/lib/finance/spend-forecast";
import type { Debt } from "@/types/domain";

export type NextAction = {
  title: string;
  body: string;
  action?: string;
  actionHref?: string;
  tone?: "primary" | "overdue" | "debt";
};

export type NextActionInput = {
  debts: Debt[];
  hasBudget: boolean;
  nearLimitCategoryLabel?: string;
  overspentCategoryLabel?: string;
  /** Label of a category with spending but no positive budget configured -- distinct from overspentCategoryLabel (see docs/MONTHLY_BUDGET_ENGINE.md). */
  unbudgetedCategoryLabel?: string;
  hasAnyTransaction: boolean;
  unreviewedCount?: number;
  portfolioRecommendation?: PortfolioRecommendation | null;
  spendForecast?: SpendForecast | null;
};

/**
 * Picks a single highest-priority action for the Today dashboard, per the
 * priority order: overdue minimum > due today > due within 3 days > minimum
 * not met (any other due date, including none) > no monthly budget >
 * overspent category > unbudgeted-spending category > unreviewed items >
 * near-limit category > portfolio strategy recommendation > no transactions yet >
 * spend forecast > "on track" fallback. Only ever one action is
 * returned -- callers must not render more than one of these at a time.
 */
export function determineNextAction(input: NextActionInput, today: Date = new Date()): NextAction {
  const overdueDebt = input.debts.find((debt) => isOverdue(debt, today));
  if (overdueDebt) {
    return {
      title: `${overdueDebt.name} เลยกำหนดชำระแล้ว`,
      body: `ยังขาดขั้นต่ำ ${formatTHB(remainingToMinimum(overdueDebt))} รีบจัดการก่อนดอกเบี้ยเพิ่ม`,
      action: "ดูแผนหนี้",
      actionHref: "/debts",
      tone: "overdue",
    };
  }

  const dueTodayDebt = input.debts.find((debt) => {
    if (!debt.dueDate || remainingToMinimum(debt) <= 0) return false;
    return daysUntilDue(debt.dueDate, today) === 0;
  });
  if (dueTodayDebt) {
    const otherUrgentCount = input.debts.filter((debt) => {
      if (debt.id === dueTodayDebt.id || !debt.dueDate || remainingToMinimum(debt) <= 0) return false;
      const days = daysUntilDue(debt.dueDate, today);
      return days >= 0 && days <= 3;
    }).length;
    return {
      title: "ครบกำหนดชำระวันนี้",
      body:
        `${dueTodayDebt.name} ยังขาดขั้นต่ำ ${formatTHB(remainingToMinimum(dueTodayDebt))}` +
        (otherUrgentCount > 0 ? ` และมีหนี้ใกล้ครบกำหนดอีก ${otherUrgentCount} รายการ` : ""),
      action: "ดูแผนหนี้",
      actionHref: "/debts",
      tone: "debt",
    };
  }

  const dueSoonDebt = input.debts.find((debt) => {
    if (!debt.dueDate || remainingToMinimum(debt) <= 0) return false;
    const days = daysUntilDue(debt.dueDate, today);
    return days >= 1 && days <= 3;
  });
  if (dueSoonDebt) {
    const days = daysUntilDue(dueSoonDebt.dueDate!, today);
    const otherUrgentCount = input.debts.filter((debt) => {
      if (debt.id === dueSoonDebt.id || !debt.dueDate || remainingToMinimum(debt) <= 0) return false;
      const otherDays = daysUntilDue(debt.dueDate, today);
      return otherDays >= 1 && otherDays <= 3;
    }).length;
    return {
      title: "ใกล้ครบกำหนดชำระ",
      body:
        `${dueSoonDebt.name} ครบกำหนดใน ${days} วัน ยังขาดขั้นต่ำ ${formatTHB(remainingToMinimum(dueSoonDebt))}` +
        (otherUrgentCount > 0 ? ` และมีหนี้ใกล้ครบกำหนดอีก ${otherUrgentCount} รายการ` : ""),
      action: "ดูแผนหนี้",
      actionHref: "/debts",
      tone: "debt",
    };
  }

  const unmetMinimumDebt = input.debts.find((debt) => remainingToMinimum(debt) > 0);
  if (unmetMinimumDebt) {
    return {
      title: `${unmetMinimumDebt.name} ยังชำระไม่ถึงยอดขั้นต่ำ`,
      body: `เหลือขั้นต่ำที่ต้องชำระ ${formatTHB(remainingToMinimum(unmetMinimumDebt))}`,
      action: "บันทึกการชำระเงิน",
      actionHref: "/debts",
      tone: "debt",
    };
  }

  if (!input.hasBudget) {
    return {
      title: "ยังไม่ได้ตั้งงบเดือนนี้",
      body: "ตั้งงบเพื่อรู้ว่าเดือนนี้ยังใช้ได้อีกเท่าไร",
      action: "เริ่มตั้งงบเดือนนี้",
      actionHref: "/budget",
      tone: "primary",
    };
  }

  if (input.overspentCategoryLabel) {
    return {
      title: `หมวด "${input.overspentCategoryLabel}" เกินงบแล้ว`,
      body: "ดูรายละเอียดและปรับงบให้เหมาะกับการใช้จริง",
      action: "ดูงบประมาณ",
      actionHref: "/budget",
      tone: "overdue",
    };
  }

  if (input.unbudgetedCategoryLabel) {
    return {
      title: `หมวด "${input.unbudgetedCategoryLabel}" ยังไม่ได้ตั้งงบ`,
      body: "ตั้งงบหมวดนี้เพื่อติดตามการใช้จ่ายให้ชัดเจนขึ้น",
      action: "ตั้งงบหมวดนี้",
      actionHref: "/budget",
      tone: "primary",
    };
  }

  if (input.unreviewedCount && input.unreviewedCount > 0) {
    return {
      title: "มีรายการรอตรวจสอบ",
      body: `พบ ${input.unreviewedCount} รายการที่ต้องยืนยัน เพื่อความแม่นยำของงบประมาณ`,
      action: "ไปตรวจสอบ",
      actionHref: "/transactions",
      tone: "primary",
    };
  }

  if (input.nearLimitCategoryLabel) {
    return {
      title: `หมวด "${input.nearLimitCategoryLabel}" ใกล้เต็มงบ`,
      body: "ใช้จ่ายอย่างระวังในช่วงที่เหลือของเดือน",
      action: "ดูงบประมาณ",
      actionHref: "/budget",
      tone: "debt",
    };
  }

  if (input.portfolioRecommendation?.focusDebtId) {
    const focusDebt = input.debts.find((debt) => debt.id === input.portfolioRecommendation?.focusDebtId);
    if (focusDebt) {
      return {
        title: `ลองโฟกัส ${focusDebt.name}`,
        body: `${portfolioStrategyLabel(input.portfolioRecommendation.recommendedStrategy)}: ${input.portfolioRecommendation.reason}`,
        action: "ดูแผนปิดหนี้",
        actionHref: "/debts/strategy",
        tone: "debt",
      };
    }
  }

  if (!input.hasAnyTransaction) {
    return {
      title: "เริ่มจากบันทึกรายการแรก",
      body: "เพิ่มรายรับ รายจ่าย หรือหนี้ที่อยากให้ช่วยเตือน",
      action: "เพิ่มรายการ",
      actionHref: "/transactions",
      tone: "primary",
    };
  }

  if (
    input.spendForecast &&
    input.spendForecast.isAvailable &&
    input.spendForecast.onTrackToExceedBudget &&
    input.spendForecast.daysBeforeMonthEnd !== null
  ) {
    const days = input.spendForecast.daysBeforeMonthEnd;
    return {
      title: "งบมีแนวโน้มหมดก่อนสิ้นเดือน",
      body: `จากการใช้จ่ายช่วงล่าสุด คาดว่างบอาจหมดก่อนสิ้นเดือนประมาณ ${days} วัน`,
      action: "ดูและปรับงบ",
      actionHref: "/budget",
      tone: "debt",
    };
  }

  return {
    title: "เดือนนี้ยังอยู่ในแผน",
    body: "ไม่มีอะไรด่วน ใช้จ่ายตามงบที่วางไว้ต่อได้เลย",
    tone: "primary",
  };
}
