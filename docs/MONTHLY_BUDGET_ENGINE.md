# Monthly Budget Engine

Production note for the `feat/monthly-budget-engine` branch. Covers the data
model, calculation formulas, transaction inclusion rules, status thresholds,
month/timezone behavior, copy-month behavior, ownership, deployment, and
remaining limitations.

## Background

`monthly_budgets` and `budget_categories` were defined in the initial schema
migration (`202607100001_initial_tanglak_schema.sql`) with RLS, and later
got non-negative `CHECK` constraints (`202607110001_financial_value_guards.sql`)
— but no application code ever used them. This branch is the first
implementation of the feature on top of that existing-but-unused schema.

## Data model

### `monthly_budgets`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | owner |
| `month` | text | canonical `YYYY-MM`, Bangkok month key (see below); unconstrained at the DB level, enforced by `isValidMonthQuery`/`assertValidMonth` in the app layer |
| `income_satang` | bigint | expected monthly income, satang integer, `>= 0` |
| `strategy` | text | free-form, defaults `'minimum_first'`, not used by this feature's logic |
| `status` | text | free-form, defaults `'draft'`, not used by this feature's logic |

Unique on `(user_id, month)` (already existed) — a user has at most one
budget row per month.

### `budget_categories`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | owner (denormalized alongside `monthly_budget_id`) |
| `monthly_budget_id` | uuid | FK to `monthly_budgets`, `on delete cascade` |
| `label` | text | free-text category name, e.g. `อาหาร` |
| `amount_satang` | bigint | category budget, satang integer, `>= 0` |

New in this migration: `uq_budget_categories_user_month_label`, a unique
index on `(user_id, monthly_budget_id, label)` — prevents two budget rows
for the same category label within the same month's budget. This is the
DB-backed guarantee behind both "duplicate category budget rejected" and
"copy previous month never duplicates on retry".

### Domain model semantics

- **Monthly expected income** — `monthly_budgets.income_satang`. What the
  user expects to earn this month; independent of actual confirmed income
  transactions (the two are not reconciled by this feature).
- **Total planned budget** — sum of all `budget_categories.amount_satang`
  for the month (`BudgetSummary.plannedTotalSatang`).
- **Category budget** — one `budget_categories` row's `amount_satang`.
- **Actual spending** — derived from confirmed transactions per the
  inclusion rules below, never stored redundantly; always computed live.
- **Remaining budget** — `plannedTotal - spentTotal`
  (`BudgetSummary.remainingTotalSatang`), can go negative when overspent.
- **Unallocated income** — `expectedIncome - plannedTotal`
  (`BudgetSummary.unallocatedIncomeSatang`), can go negative when
  categories are budgeted beyond expected income.
- **Overspend** — for a category, `max(0, spent - budgeted)`; the summary's
  `overspentTotalSatang` sums this across all categories currently over
  budget (categories under budget contribute 0, never negative).
- **Category without a budget** — a category label with confirmed spend but
  no `budget_categories` row. Surfaced in `BudgetSummary.categories` with
  `budgetedSatang: 0` and no `budgetCategoryId`, so the UI can show it
  ("this category has spending but no budget set") without it silently
  disappearing from totals.
- **Transaction without a category** — `transaction.category` (i.e.
  `category_label`) blank/null. Tracked separately as
  `BudgetSummary.uncategorizedSpentSatang`, included in `spentTotalSatang`
  but never attributed to any single category summary (there is nothing to
  attribute it to).

All monetary values are satang integers throughout — no floating-point baht
storage or arithmetic anywhere in this feature, consistent with the rest of
the app (`src/lib/finance/money.ts`, `money-guards.ts`).

### Category matching: labels, not `category_id`

`transactions` has both `category_id` (uuid FK to `categories`) and
`category_label` (text). An audit before writing this feature confirmed
`category_id` is **never read or written anywhere in the application** —
only `category_label` (exposed as `transaction.category` in the mapped
domain type) is used, including by the existing overview page's
actual-spend-by-category grouping. `budget_categories.label` is likewise
free text, not FK'd to `categories.id`. This feature follows that existing
convention: budget-vs-actual matching is by exact string equality between
`budget_categories.label` and `transaction.category`, not by any foreign
key join. This means a typo'd or differently-capitalized category label on
a transaction will not match its intended budget category — a known,
accepted limitation of the existing free-text convention, not something
this feature introduces.

## Month identity and timezone behavior

Canonical month keys are always `YYYY-MM`, validated by the existing
`isValidMonthQuery` (`src/lib/finance/date.ts`) and enforced via
`assertValidMonth` at the top of every repository function that takes a
month parameter. "Current month" and month navigation reuse the existing
Bangkok-timezone helpers unchanged:

- `getBangkokMonthString()` — current month in Asia/Bangkok, derived from
  `Intl.DateTimeFormat(..., { timeZone: "Asia/Bangkok" })` on the server, so
  it never depends on the browser's local timezone.
- `resolveBangkokMonthQuery(searchParams.month)` — used by the `/budget`
  page exactly like `/transactions` already does, falling back to the
  current Bangkok month when no `?month=` query param is present.
- `shiftMonth(month, ±1)` — prev/next navigation, calendar-correct across
  year boundaries.
- `formatBangkokMonthLabel(month)` — Thai month/year label for display.

No new date/timezone logic was added; this feature is a consumer of the
existing helpers only.

## Transaction inclusion rules (actual spend calculation)

Implemented in `src/lib/finance/budget-calculations.ts`
(`calculateCategorySpend`). A transaction contributes to a category's
"actual spend" for month `M` only if **all** of the following hold:

1. `status === "confirmed"` — draft/needs_review/rejected transactions are
   excluded. This also transparently excludes rolled-back history-import
   transactions, since rollback deletes the transaction row entirely
   (`import_rollback_batch`, see `docs/HISTORY_IMPORT_IDEMPOTENCY.md`) —
   there is nothing left to include or exclude by the time this runs.
2. `occurredAt` starts with the month key `M` (same string-prefix
   convention already used by `calculateMonthlyTotals` in
   `src/lib/finance/calculations.ts`, for consistency).
3. `type` is one of `expense`, `debt_payment`, or `refund`.
   - `expense` — full amount counts as spend.
   - `debt_payment` — full amount counts as spend. This is a deliberate
     departure from the existing overview page's totals (which track
     `debtPaymentSatang` separately from `livingExpenseSatang`) because the
     task requirements explicitly call for debt payments to count toward
     budget categories (e.g. a `หนี้สิน` category budget) — the overview
     page's own totals are unaffected, this is a new, independently
     documented aggregation.
   - `refund` — **offsets** (subtracts from) spend in the same category
     label, modeling a partial/full refund of a prior expense. This was a
     documented choice among two reasonable options (exclude entirely vs.
     offset); offsetting was chosen to mirror how `calculateMonthlyTotals`
     already treats refunds as a credit against cash remaining
     (`cashRemaining = income + refund - expense - debtPayment`), so a
     ฿1,000 expense partially refunded ฿400 shows as ฿600 actual spend
     against that category's budget, not ฿1,000.
   - `income` and `transfer` are always excluded, regardless of category
     label — matching the existing app-wide convention that transfers
     between owned accounts are never "spend".
4. A category's total spend is floored at 0 — refunds can reduce a
   category's apparent spend but can never make it negative, even if
   refunds this month exceed expenses this month for that category.

Uncategorized spend (rule 1–3 passed, but `category` is blank/whitespace)
is accumulated separately into `uncategorizedSatang` and never attributed
to any category summary.

## Status thresholds

Defined and exported as named constants in `budget-calculations.ts`:

```ts
export const BUDGET_NEAR_LIMIT_THRESHOLD = 0.8; // 80%
export const BUDGET_OVERSPENT_THRESHOLD = 1;    // 100%
```

`statusForCategory(budgetedSatang, spentSatang)`:
- **`healthy`** — usage ratio (`spent / budgeted`) below 80%. A
  positive-budget category with zero spend is `healthy` at 0% — this is how
  an "unused" (budgeted but untouched) category is represented; there is no
  separate `unused` enum value.
- **`near_limit`** — usage from 80% up to and including 100%.
- **`overspent`** — usage strictly above 100%.
- **`no_budget`** — `budgeted <= 0` **and** `spent === 0`. Nothing
  allocated, nothing spent.

**Zero-budget category with spending is never `healthy`**: if
`budgeted <= 0` and `spent > 0`, the status is `overspent` (spending
anything against a zero allocation is, by definition, 100%+ over it) — this
was an explicit requirement and is asserted directly in
`tests/unit/budget-calculations.test.ts`.

The overall `BudgetSummary.status` is computed the same way from
`plannedTotalSatang` vs. `spentTotalSatang` (an aggregate health signal),
in addition to each category's own `status`.

`usagePercent` is `null` (never `NaN`/`Infinity`) whenever `budgeted <= 0`
— division by zero is never attempted.

## Copy previous month

`copyPreviousMonthBudget(userId, fromMonth, toMonth)` in
`finance-repository.ts`:

1. Looks up the source month's budget; throws the safe
   `ไม่พบงบประมาณของเดือนนี้` message if it does not exist.
2. Creates the target month's budget if it does not exist yet, copying the
   source month's income as the initial value. **If the target budget
   already exists, its income is left untouched** — a retry (or a second,
   later copy) never overwrites income the user has since edited. This was
   verified directly: `tests/unit/budget-repository.test.ts` creates a
   target budget via copy, manually edits its income, then re-runs the copy
   and asserts the edited income survives.
3. For each source category, inserts it into the target month only if a
   category with the same label does not already exist there. Categories
   already present are counted as `skippedCount`, not re-created.
4. **Idempotent under retry and concurrency**: the up-front existence check
   handles the common case; the `uq_budget_categories_user_month_label`
   unique index is the real guarantee underneath it — if a concurrent
   request or a retry races past the up-front check, the resulting insert's
   unique-violation is caught and treated as "already copied" (counted as
   skipped), never surfaced as an error.
5. All reads/writes are scoped by `userId` throughout (`getMonthlyBudget`,
   `listBudgetCategories`, `createBudgetCategory` all take and enforce
   `userId`) — copying is ownership-scoped end to end, including the
   implicit ownership check inside `createBudgetCategory` (it 404s via the
   safe not-found message if the target `monthly_budget_id` doesn't belong
   to the caller).

## Budget summary service

`buildBudgetSummary(month, budget, categories, transactions)` in
`budget-calculations.ts` returns a single reusable `BudgetSummary`:

```ts
type BudgetSummary = {
  month: string;
  hasBudget: boolean;
  expectedIncomeSatang: number;
  plannedTotalSatang: number;
  spentTotalSatang: number;
  remainingTotalSatang: number;
  unallocatedIncomeSatang: number;
  overspentTotalSatang: number;
  uncategorizedSpentSatang: number;
  categories: CategorySummary[]; // includes budget-less categories with spend
  usagePercent: number | null;
  status: "healthy" | "near_limit" | "overspent" | "no_budget";
};
```

This is a pure function (no I/O) so it is directly unit-testable and reused
identically by the `/budget` page (server component calls it once with data
already fetched) — there is no duplicate calculation logic anywhere else.

## Safe errors

Budget-specific Thai copy (`src/lib/finance/budget-guards.ts`), layered on
top of (not replacing) the existing generic `money-guards.ts` messages:

- `งบประมาณต้องไม่ติดลบ` — a category budget amount is negative.
- `รายรับต่อเดือนต้องไม่ติดลบ` — income is negative.
- `มีงบหมวดนี้ในเดือนนี้แล้ว` — duplicate category label for the month
  (both the up-front check and the unique-index-violation fallback path).
- `ไม่พบงบประมาณของเดือนนี้` — operating on a month that has no budget yet
  (e.g. copying from a source month with nothing to copy, or adding a
  category to a `monthly_budget_id` that does not belong to the caller).

Malformed/non-finite input (blank, `NaN`, `Infinity`, garbage text) keeps
`money-guards.ts`'s generic `รูปแบบจำนวนเงินไม่ถูกต้อง` message — only the
sign-specific failure is remapped to the budget/income-specific copy, so
the distinction between "wrong format" and "must not be negative" is
preserved. No SQL, Zod, or stack detail is ever included in any message
returned by `src/app/actions/budget.ts`.

## Ownership / RLS

- `monthly_budgets` and `budget_categories` already had full RLS
  (`auth.uid() = user_id` for select/insert/update/delete) from the initial
  schema's generic ownership loop — confirmed present, unchanged, no new
  RLS needed.
- Every repository function additionally scopes by `user_id` at the query
  level (never relies on RLS alone), following the same pattern as
  `updateDebt`/`deleteDebtPaymentAction` elsewhere in the codebase:
  `.eq("id", id).eq("user_id", userId)` on every update/delete, and
  `assertOwner()` in the mock-auth code path.
- `requireUser()` (trusted server session) is the only source of `userId`
  in every server action in `src/app/actions/budget.ts` — never a
  client-supplied value.
- Verified directly: `tests/unit/budget-repository.test.ts` and
  `tests/unit/budget-actions.test.ts` both include "another user cannot
  read/write/delete another user's budget/category" cases at the
  repository and action layers.

## Deployment steps

1. Deploy application code (this branch). The mock-auth path works
   immediately; the real Supabase path needs the migration below applied
   (the unique index) to get the DB-backed duplicate-category guarantee —
   the application-level duplicate check (`createBudgetCategory`'s
   up-front `select` before insert) still works without it, just without
   the race-proof backstop.
2. Run `supabase/migrations/202607110004_monthly_budget_engine.sql`. This
   adds exactly one `create unique index if not exists` on
   `budget_categories(user_id, monthly_budget_id, label)`.
   **No preflight query is required** for this migration, unlike prior
   value-integrity migrations in this codebase: `budget_categories` has
   never been written to by any application code before this branch (confirmed
   by a pre-implementation audit — zero references anywhere in `src/`), so
   in every known environment the table is empty and a unique index can be
   built immediately with no risk of a pre-existing duplicate blocking it.
   If this assumption does not hold in some environment (e.g. rows were
   inserted directly via the Supabase SQL editor at some point), run this
   preflight query first and resolve any groups it returns before applying
   the migration:
   ```sql
   select user_id, monthly_budget_id, label, count(*)
   from public.budget_categories
   group by user_id, monthly_budget_id, label
   having count(*) > 1;
   ```
3. No `VALIDATE CONSTRAINT` step applies here — a unique index has no
   `NOT VALID` state; it is either fully built (this migration) or not
   present yet.

## Remaining limitations

- Category matching is free-text label equality, not a foreign-key join to
  `categories.id` — inherited from the existing app-wide convention (see
  "Category matching" above), not something this feature can unilaterally
  change without touching unrelated transaction/category code, which was
  out of scope.
- `monthly_budgets.strategy` and `.status` columns exist and are written
  with their schema defaults but are not used by any budgeting logic in
  this feature (no debt-payoff strategy engine, no draft/active/closed
  workflow) — reserved for a possible future feature, not implemented here.
- No UI entry point was added to the shared bottom navigation
  (`src/components/BottomNavigation.tsx`) — that component is a fixed
  5-column grid shared by every page, and changing it would be exactly the
  kind of broad UI change this branch was scoped to avoid. The `/budget`
  page is fully functional at that URL (used directly by all e2e tests) but
  is not yet discoverable from the app's primary navigation; wiring that up
  is a follow-up, deliberately left out of this branch.
- Debt-payment transactions count toward a matching-labeled budget category
  (e.g. `หนี้สิน`) as a deliberate, documented departure from the overview
  page's separate debt-payment bucket — a user unfamiliar with this
  difference may be surprised the two pages present debt-payment totals
  differently; this is called out here rather than hidden.
- This migration was not executed against a live Postgres/Supabase
  instance in the environment that produced it (no `supabase` CLI,
  `docker`, or `psql` available) — verified by manual schema cross-check
  against the initial schema migration and the mock-auth-path test suite
  only, consistent with the same limitation noted for prior migrations in
  this codebase (`docs/FINANCIAL_VALUE_GUARDS.md`,
  `docs/HISTORY_IMPORT_IDEMPOTENCY.md`).
