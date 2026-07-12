import {
  Award,
  Banknote,
  Briefcase,
  Clapperboard,
  CreditCard,
  Dumbbell,
  Gift,
  GraduationCap,
  HeartHandshake,
  Home,
  Laptop,
  PawPrint,
  Plane,
  ReceiptText,
  Receipt,
  Repeat,
  RotateCcw,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Stethoscope,
  TrainFront,
  TrendingUp,
  Users,
  Utensils,
  Wallet,
  ArrowLeftRight,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { TransactionType } from "@/types/domain";
import { resolveCategoryFromLegacyLabel, type CategoryIconId } from "@/lib/finance/categories";

const ICONS: Record<CategoryIconId, LucideIcon> = {
  utensils: Utensils,
  "shopping-cart": ShoppingCart,
  "train-front": TrainFront,
  home: Home,
  zap: Zap,
  "credit-card": CreditCard,
  stethoscope: Stethoscope,
  dumbbell: Dumbbell,
  sparkles: Sparkles,
  "shopping-bag": ShoppingBag,
  clapperboard: Clapperboard,
  repeat: Repeat,
  plane: Plane,
  "graduation-cap": GraduationCap,
  users: Users,
  gift: Gift,
  shield: Shield,
  receipt: Receipt,
  "paw-print": PawPrint,
  briefcase: Briefcase,
  "arrow-left-right": ArrowLeftRight,
  "receipt-text": ReceiptText,
  banknote: Banknote,
  laptop: Laptop,
  award: Award,
  "trending-up": TrendingUp,
  "rotate-ccw": RotateCcw,
  "heart-handshake": HeartHandshake,
  store: Store,
  wallet: Wallet,
};

export function CategoryIcon({
  category,
  type,
}: {
  category?: string;
  type: TransactionType;
}) {
  const iconClass = "h-4 w-4";
  // Canonical category catalog first (src/lib/finance/categories.ts) --
  // resolves both current canonical labels and known legacy/alias labels.
  // type still takes priority for income/debt_payment so a transaction
  // typed "income" always shows the income icon regardless of its category
  // string, matching the prior behavior.
  const resolved = resolveCategoryFromLegacyLabel(category);
  const Icon =
    type === "income"
      ? Banknote
      : type === "debt_payment"
        ? CreditCard
        : resolved
          ? ICONS[resolved.icon]
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
