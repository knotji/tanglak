import {
  Banknote,
  Coffee,
  CreditCard,
  ReceiptText,
  TrainFront,
  Utensils,
} from "lucide-react";
import type { TransactionType } from "@/types/domain";

export function CategoryIcon({
  category,
  type,
}: {
  category?: string;
  type: TransactionType;
}) {
  const iconClass = "h-4 w-4";
  const Icon =
    type === "income"
      ? Banknote
      : type === "debt_payment"
        ? CreditCard
        : category === "เดินทาง"
          ? TrainFront
          : category === "เดลิเวอรี"
            ? Utensils
            : category === "อาหาร"
              ? Coffee
              : ReceiptText;
  const tone =
    type === "income"
      ? "bg-primary-soft text-income"
      : type === "debt_payment"
        ? "bg-debt/10 text-debt"
        : "bg-muted text-expense";

  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] ${tone}`}>
      <Icon className={iconClass} aria-hidden />
    </span>
  );
}
