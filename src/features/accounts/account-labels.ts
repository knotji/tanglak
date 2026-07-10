import type { AccountType } from "@/types/domain";

export const accountTypeLabels: Record<AccountType, string> = {
  bank_account: "บัญชีธนาคาร",
  cash: "เงินสด",
  credit_card: "บัตรเครดิต",
  e_wallet: "วอลเล็ต",
  loan_account: "บัญชีสินเชื่อ",
  other: "อื่นๆ",
};

export function maskLastFour(lastFour?: string) {
  return lastFour ? `•••• ${lastFour}` : "ยังไม่ระบุเลขท้าย";
}
