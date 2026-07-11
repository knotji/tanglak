import { daysUntilDue, isOverdue, remainingToMinimum } from "@/lib/finance/calculations";
import { formatTHB } from "@/lib/finance/money";
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
  hasAnyTransaction: boolean;
};

/**
 * Picks a single highest-priority action for the Today dashboard, per the
 * priority order: overdue debt > debt due soon > no monthly budget >
 * overspent category > near-limit category > no transactions yet > "on
 * track" fallback. Only ever one action is returned -- callers must not
 * render more than one of these at a time.
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

  const dueSoonDebt = input.debts.find((debt) => {
    if (!debt.dueDate || remainingToMinimum(debt) <= 0) return false;
    const days = daysUntilDue(debt.dueDate, today);
    return days >= 0 && days <= 3;
  });
  if (dueSoonDebt) {
    const days = daysUntilDue(dueSoonDebt.dueDate!, today);
    return {
      title: `${dueSoonDebt.name} ครบกำหนดใน ${days} วัน`,
      body: `ยังขาดขั้นต่ำ ${formatTHB(remainingToMinimum(dueSoonDebt))}`,
      action: "ดูแผนหนี้",
      actionHref: "/debts",
      tone: "debt",
    };
  }

  // A debt with no due date in the near term but whose minimum this cycle
  // still hasn't been met -- surfaced below overdue/due-soon debts but
  // above monthly-budget prompts, since an unmet debt obligation still
  // outranks budgeting nudges.
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

  if (input.nearLimitCategoryLabel) {
    return {
      title: `หมวด "${input.nearLimitCategoryLabel}" ใกล้เต็มงบ`,
      body: "ใช้จ่ายอย่างระวังในช่วงที่เหลือของเดือน",
      action: "ดูงบประมาณ",
      actionHref: "/budget",
      tone: "debt",
    };
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

  return {
    title: "เดือนนี้ยังอยู่ในแผน",
    body: "ไม่มีอะไรด่วน ใช้จ่ายตามงบที่วางไว้ต่อได้เลย",
    tone: "primary",
  };
}
