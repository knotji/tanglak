/**
 * Canonical expense/income category catalog -- the single source of truth
 * for every category shown or matched anywhere in the app (transaction
 * create/edit, budget setup, AI categorization, deterministic fallback
 * categorization, overview/today summaries, reports/filters).
 *
 * Storage note: `transactions.category_label` and `budget_categories.label`
 * remain free-text columns, matched by exact string equality (see
 * docs/MONTHLY_BUDGET_ENGINE.md -- this app's `categories` table and
 * `category_id` FK columns are unused/orphaned schema; nothing reads or
 * writes them). This catalog does not change that storage shape -- doing so
 * would require a real migration, a backfill, and rewriting every
 * budget/transaction query, which is out of scope for a consistency fix.
 * Instead, every category has a stable `id` used for all in-app logic
 * (lookups, icon selection, budgetable grouping, AI validation), and a
 * canonical `label` (the exact Thai string persisted to `category_label` /
 * `budget_categories.label`). Always resolve a category by `id` in code;
 * only use `label` at the storage boundary.
 */

export type CategoryKind = "expense" | "income";

/**
 * String keys instead of importing lucide-react components directly, so
 * this module stays a plain data module usable from server-only code (AI
 * schemas, deterministic fallback rules) without pulling in a UI library.
 * `src/components/CategoryIcon.tsx` maps these ids to actual icons.
 */
export type CategoryIconId =
  | "utensils"
  | "shopping-cart"
  | "train-front"
  | "home"
  | "zap"
  | "credit-card"
  | "stethoscope"
  | "dumbbell"
  | "sparkles"
  | "shopping-bag"
  | "clapperboard"
  | "repeat"
  | "plane"
  | "graduation-cap"
  | "users"
  | "gift"
  | "shield"
  | "receipt"
  | "paw-print"
  | "briefcase"
  | "arrow-left-right"
  | "receipt-text"
  | "banknote"
  | "laptop"
  | "award"
  | "trending-up"
  | "rotate-ccw"
  | "heart-handshake"
  | "store"
  | "wallet";

export type CategoryDefinition = {
  /** Stable, machine-readable id. Never rely on `label` as an identifier. */
  id: string;
  /** Canonical Thai display label -- also the exact string persisted to storage. */
  label: string;
  /** Optional English label, for AI prompts and non-Thai contexts. */
  labelEn?: string;
  kind: CategoryKind;
  icon: CategoryIconId;
  /** Display order within its kind. */
  order: number;
  /** Whether this category can have a monthly budget amount set against it. */
  budgetable: boolean;
  active: boolean;
  /**
   * Legacy/alternate labels (Thai or English) that should normalize to this
   * category -- see `resolveCategoryFromLegacyLabel`. Matching is
   * case-insensitive and whitespace-trimmed; exact-token, not substring.
   */
  aliases: string[];
  /**
   * Merchant name / description substrings for the deterministic fallback
   * categorizer (src/lib/finance/category-fallback.ts). Substring match,
   * case-insensitive, on normalized (Thai+English) text.
   */
  merchantHints?: string[];
};

export const EXPENSE_CATEGORIES: readonly CategoryDefinition[] = [
  {
    id: "food",
    label: "อาหารและเครื่องดื่ม",
    labelEn: "Food & Drink",
    kind: "expense",
    icon: "utensils",
    order: 1,
    budgetable: true,
    active: true,
    aliases: ["อาหาร", "กิน", "กาแฟ", "เดลิเวอรี", "food", "meal", "restaurant", "cafe", "coffee"],
    merchantHints: [
      "starbucks",
      "café amazon",
      "cafe amazon",
      "amazon cafe",
      "grabfood",
      "line man",
      "lineman",
      "foodpanda",
      "kfc",
      "mcdonald",
      "mcdonald's",
      "burger king",
      "7-eleven-food",
    ],
  },
  {
    id: "groceries",
    label: "ของใช้และซูเปอร์มาร์เก็ต",
    labelEn: "Groceries & Household",
    kind: "expense",
    icon: "shopping-cart",
    order: 2,
    budgetable: true,
    active: true,
    aliases: ["ของใช้", "ซูเปอร์", "ซูเปอร์มาร์เก็ต", "groceries", "supermarket"],
    merchantHints: ["tops", "lotus", "big c", "bigc", "makro", "gourmet market", "7-eleven", "7-11", "family mart"],
  },
  {
    id: "transport",
    label: "การเดินทาง",
    labelEn: "Transport",
    kind: "expense",
    icon: "train-front",
    order: 3,
    budgetable: true,
    active: true,
    aliases: ["เดินทาง", "รถ", "mrt", "bts", "transport", "travel-transport"],
    merchantHints: ["bts", "mrt", "grab", "bolt", "taxi", "airasia", "shell", "ptt", "esso", "bangchak"],
  },
  {
    id: "housing",
    label: "ที่อยู่อาศัย",
    labelEn: "Housing",
    kind: "expense",
    icon: "home",
    order: 4,
    budgetable: true,
    active: true,
    aliases: ["ที่พัก", "บ้าน", "คอนโด", "housing", "rent"],
  },
  {
    id: "utilities",
    label: "ค่าน้ำ ไฟ และสาธารณูปโภค",
    labelEn: "Utilities",
    kind: "expense",
    icon: "zap",
    order: 5,
    budgetable: true,
    active: true,
    aliases: ["ค่าน้ำ", "ค่าไฟ", "สาธารณูปโภค", "utilities", "internet", "มือถือ"],
    merchantHints: ["ais", "true", "dtac", "การไฟฟ้า", "การประปา", "3bb", "cat telecom", "nt "],
  },
  {
    id: "debt",
    label: "หนี้และสินเชื่อ",
    labelEn: "Debt & Loans",
    kind: "expense",
    icon: "credit-card",
    order: 6,
    budgetable: true,
    active: true,
    aliases: ["หนี้สิน", "หนี้", "สินเชื่อ", "debt", "loan", "installment", "ดอกเบี้ยหนี้"],
  },
  {
    id: "health",
    label: "สุขภาพและการแพทย์",
    labelEn: "Health & Medical",
    kind: "expense",
    icon: "stethoscope",
    order: 7,
    budgetable: true,
    active: true,
    aliases: ["สุขภาพ", "การแพทย์", "หมอ", "health", "medical", "clinic", "hospital"],
    merchantHints: ["hospital", "โรงพยาบาล", "clinic", "คลินิก", "pharmacy", "ร้านยา", "boots", "watsons-pharmacy"],
  },
  {
    id: "fitness",
    label: "ออกกำลังกายและกีฬา",
    labelEn: "Fitness & Sports",
    kind: "expense",
    icon: "dumbbell",
    order: 8,
    budgetable: true,
    active: true,
    aliases: ["ออกกำลังกาย", "กีฬา", "ฟิตเนส", "fitness", "gym", "sports"],
    merchantHints: ["fitness first", "virgin active", "gym"],
  },
  {
    id: "personal_care",
    label: "ดูแลตัวเอง",
    labelEn: "Personal Care",
    kind: "expense",
    icon: "sparkles",
    order: 9,
    budgetable: true,
    active: true,
    aliases: ["ดูแลตัวเอง", "ความงาม", "personal care", "beauty", "haircut"],
    merchantHints: ["watsons", "boots-beauty"],
  },
  {
    id: "shopping",
    label: "ช้อปปิ้ง",
    labelEn: "Shopping",
    kind: "expense",
    icon: "shopping-bag",
    order: 10,
    budgetable: true,
    active: true,
    aliases: ["shopping", "ของ", "เสื้อผ้า"],
    merchantHints: ["shopee", "lazada"],
  },
  {
    id: "entertainment",
    label: "ความบันเทิง",
    labelEn: "Entertainment",
    kind: "expense",
    icon: "clapperboard",
    order: 11,
    budgetable: true,
    active: true,
    aliases: ["บันเทิง", "หนัง", "เกม", "entertainment", "movie", "cinema"],
    merchantHints: ["major cineplex", "sf cinema", "steam"],
  },
  {
    id: "subscriptions",
    label: "สมาชิกและบริการรายเดือน",
    labelEn: "Subscriptions",
    kind: "expense",
    icon: "repeat",
    order: 12,
    budgetable: true,
    active: true,
    aliases: ["สมาชิก", "subscription", "รายเดือน"],
    merchantHints: ["netflix", "spotify", "youtube premium", "youtube", "disney+", "disney plus", "icloud", "google one"],
  },
  {
    id: "travel",
    label: "ท่องเที่ยว",
    labelEn: "Travel",
    kind: "expense",
    icon: "plane",
    order: 13,
    budgetable: true,
    active: true,
    aliases: ["ท่องเที่ยว", "เที่ยว", "travel", "hotel", "flight"],
    merchantHints: ["agoda", "booking.com", "airbnb", "thai airways", "airasia-flight"],
  },
  {
    id: "education",
    label: "การศึกษาและพัฒนาตัวเอง",
    labelEn: "Education",
    kind: "expense",
    icon: "graduation-cap",
    order: 14,
    budgetable: true,
    active: true,
    aliases: ["การศึกษา", "เรียน", "คอร์ส", "education", "course", "tuition"],
  },
  {
    id: "family",
    label: "ครอบครัวและคนสำคัญ",
    labelEn: "Family",
    kind: "expense",
    icon: "users",
    order: 15,
    budgetable: true,
    active: true,
    aliases: ["ครอบครัว", "family"],
  },
  {
    id: "gifts",
    label: "ของขวัญและบริจาค",
    labelEn: "Gifts & Donations",
    kind: "expense",
    icon: "gift",
    order: 16,
    budgetable: true,
    active: true,
    aliases: ["ของขวัญ", "บริจาค", "gift", "donation"],
  },
  {
    id: "insurance",
    label: "ประกันภัย",
    labelEn: "Insurance",
    kind: "expense",
    icon: "shield",
    order: 17,
    budgetable: true,
    active: true,
    aliases: ["ประกัน", "insurance"],
    merchantHints: ["aia", "muang thai", "ktaxa", "krungthai axa", "allianz", "tokio marine"],
  },
  {
    id: "taxes_fees",
    label: "ภาษีและค่าธรรมเนียม",
    labelEn: "Taxes & Fees",
    kind: "expense",
    icon: "receipt",
    order: 18,
    budgetable: true,
    active: true,
    aliases: ["ภาษี", "ค่าธรรมเนียม", "tax", "fee"],
  },
  {
    id: "pets",
    label: "สัตว์เลี้ยง",
    labelEn: "Pets",
    kind: "expense",
    icon: "paw-print",
    order: 19,
    budgetable: true,
    active: true,
    aliases: ["สัตว์เลี้ยง", "pet"],
  },
  {
    id: "work",
    label: "ค่าใช้จ่ายเกี่ยวกับงาน",
    labelEn: "Work Expenses",
    kind: "expense",
    icon: "briefcase",
    order: 20,
    budgetable: true,
    active: true,
    aliases: ["งาน", "ค่าใช้จ่ายงาน", "work"],
  },
  {
    id: "transfers",
    label: "โอนเงินและปรับยอด",
    labelEn: "Transfers",
    kind: "expense",
    icon: "arrow-left-right",
    order: 21,
    // Not budgetable: an own-account transfer is not spending. Transactions
    // of type "transfer" are already excluded from all spend calculations
    // regardless of category (see transactionSpendDelta in
    // budget-calculations.ts) -- this category exists only so a transfer
    // transaction has a sensible label/icon, never so it can be budgeted.
    budgetable: false,
    active: true,
    aliases: ["โอนเงิน", "โอน", "transfer"],
  },
  {
    id: "other",
    label: "อื่น ๆ",
    labelEn: "Other",
    kind: "expense",
    icon: "receipt-text",
    order: 22,
    budgetable: true,
    active: true,
    aliases: ["อื่นๆ", "other", "misc", "miscellaneous"],
  },
] as const;

export const INCOME_CATEGORIES: readonly CategoryDefinition[] = [
  {
    id: "salary",
    label: "เงินเดือน",
    labelEn: "Salary",
    kind: "income",
    icon: "banknote",
    order: 1,
    budgetable: false,
    active: true,
    aliases: ["เงินเดือน", "salary"],
  },
  {
    id: "freelance",
    label: "งานเสริม/ฟรีแลนซ์",
    labelEn: "Freelance",
    kind: "income",
    icon: "laptop",
    order: 2,
    budgetable: false,
    active: true,
    aliases: ["งานเสริม", "ฟรีแลนซ์", "freelance"],
  },
  {
    id: "bonus",
    label: "โบนัส",
    labelEn: "Bonus",
    kind: "income",
    icon: "award",
    order: 3,
    budgetable: false,
    active: true,
    aliases: ["โบนัส", "bonus"],
  },
  {
    id: "interest",
    label: "ดอกเบี้ย/ผลตอบแทน",
    labelEn: "Interest",
    kind: "income",
    icon: "trending-up",
    order: 4,
    budgetable: false,
    active: true,
    aliases: ["ผลตอบแทน", "interest-income"],
  },
  {
    id: "refund",
    label: "เงินคืน",
    labelEn: "Refund",
    kind: "income",
    icon: "rotate-ccw",
    order: 5,
    budgetable: false,
    active: true,
    aliases: ["เงินคืน", "refund"],
  },
  {
    id: "gift_income",
    label: "เงินให้/เงินสนับสนุน",
    labelEn: "Gift Income",
    kind: "income",
    icon: "heart-handshake",
    order: 6,
    budgetable: false,
    active: true,
    aliases: ["เงินให้", "เงินสนับสนุน", "gift-income"],
  },
  {
    id: "sale",
    label: "รายได้จากการขาย",
    labelEn: "Sale Income",
    kind: "income",
    icon: "store",
    order: 7,
    budgetable: false,
    active: true,
    aliases: ["ขายของ", "sale"],
  },
  {
    id: "other_income",
    label: "รายรับอื่น ๆ",
    labelEn: "Other Income",
    kind: "income",
    icon: "wallet",
    order: 8,
    budgetable: false,
    active: true,
    aliases: ["รายได้", "รายรับอื่นๆ", "other-income"],
  },
] as const;

export const ALL_CATEGORIES: readonly CategoryDefinition[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

const BY_ID = new Map(ALL_CATEGORIES.map((category) => [category.id, category]));
const BY_LABEL = new Map(ALL_CATEGORIES.map((category) => [category.label, category]));

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

/** category.id -> category, alias -> category, all normalized for lookup. */
const BY_NORMALIZED_TOKEN = new Map<string, CategoryDefinition>();
for (const category of ALL_CATEGORIES) {
  BY_NORMALIZED_TOKEN.set(normalizeToken(category.label), category);
  if (category.labelEn) BY_NORMALIZED_TOKEN.set(normalizeToken(category.labelEn), category);
  for (const alias of category.aliases) {
    BY_NORMALIZED_TOKEN.set(normalizeToken(alias), category);
  }
}

export function getCategoryById(id: string): CategoryDefinition | undefined {
  return BY_ID.get(id);
}

/** Exact match against the canonical stored label (case-sensitive, no trimming beyond what's stored). */
export function getCategoryByLabel(label: string): CategoryDefinition | undefined {
  return BY_LABEL.get(label);
}

export function listBudgetableExpenseCategories(): CategoryDefinition[] {
  return EXPENSE_CATEGORIES.filter((category) => category.active && category.budgetable).slice();
}

/**
 * Resolves a legacy/free-text category value (a historical
 * `category_label`, a user-typed budget category label, an AI-suggested
 * string) to its canonical category definition, by exact token match
 * (case-insensitive, trimmed) against every category's label, English
 * label, and aliases. Returns undefined for anything unrecognized -- the
 * caller decides the safe fallback (typically the "other"/"other_income"
 * category), never guesses a specific category with no signal.
 */
export function resolveCategoryFromLegacyLabel(rawLabel: string | undefined | null): CategoryDefinition | undefined {
  if (!rawLabel) return undefined;
  const token = normalizeToken(rawLabel);
  if (!token) return undefined;
  return BY_NORMALIZED_TOKEN.get(token);
}

export const DEFAULT_EXPENSE_CATEGORY_ID = "other";
export const DEFAULT_INCOME_CATEGORY_ID = "other_income";
