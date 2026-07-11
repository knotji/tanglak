# TangLak Dashboard UX Specification

> Version 1.0 · Covers `/today` and `/overview` routes

---

## 1. Design Intent

The dashboard is the emotional and functional starting point of every session. It must answer one question in under two seconds of reading:

> **"เงินของฉันเป็นยังไงบ้างตอนนี้?"**

Secondary questions answered below the fold:
- "เดือนนี้ใช้ไปเท่าไหร่เทียบกับที่วางแผนไว้?"
- "มีหนี้ที่ต้องจ่ายเร็วๆ นี้ไหม?"
- "รายการล่าสุดคืออะไร?"

---

## 2. Route Responsibility Split

| Route | Label (Thai) | Primary question |
|---|---|---|
| `/today` | วันนี้ | ใช้เงินไปเท่าไหร่วันนี้? |
| `/overview` | ภาพรวม | เดือนนี้รายรับ-รายจ่ายเป็นยังไง? |

The bottom navigation currently has 5 items. `/today` (`Home`) is the default landing tab.

---

## 3. `/today` — Daily Dashboard

### 3.1 Hero Metric Selection

**Primary hero metric: "เงินที่ใช้ไปวันนี้" (`spentToday`)**

Rationale: Users open the app most frequently to check what they have spent today. A daily spending figure is actionable, concrete, and emotionally relevant regardless of whether a budget has been set.

**If a daily budget is set**: Show remaining today as the hero instead:
> "เหลือใช้วันนี้" = `dailyBudget − spentToday`

The hero should never show zero as a meaningful state — when no spending has occurred, show a motivational empty state instead of ฿0.00.

### 3.2 Screen Layout (360px → 430px)

```
┌─────────────────────────────┐
│  PageHeader                 │  h: auto
│  "วันนี้"  "ดูเงินวันนี้..."  │
├─────────────────────────────┤
│  FinancialHero              │  h: ~120px
│  label: "วันนี้ใช้ไป"         │
│  ฿12,450.00  ← 40px bold    │
│  CompactStats:              │
│  [รายรับ ฿X] [จ่ายหนี้ ฿X]   │
├─────────────────────────────┤
│  NextActionCard (budget)    │  h: ~80px
│  or DebtDueCard             │
├─────────────────────────────┤
│  Section: "รายการวันนี้"     │  h: variable
│  TransactionGroup           │
│  or EmptyState              │
├─────────────────────────────┤
│  [bottom nav — 56px fixed]  │
└─────────────────────────────┘
```

### 3.3 FinancialHero v2 Specification

```
FinancialHero
  ├── label: string           — "วันนี้ใช้ไป" (small, text-secondary)
  ├── heroAmount: number      — spentToday in satang (40px bold, tabular)
  ├── context: string?        — "จากงบ ฿X,XXX" if budget set
  ├── progressBar: number?    — 0–100, rendered below context (only if budget set)
  ├── progressLabel: string?  — "เหลืออีก ฿X,XXX" / "เกินงบ ฿X,XXX"
  └── stats: Array<{label, amountSatang, tone}>
       — income / debtPaid / other compact facts
```

**Stats grid**: max 3 columns, `grid-cols-3`, each column:
```
CompactStat
  ├── label: "รายรับ" (text-xs text-secondary)
  └── amount: "+฿X,XXX" (text-sm font-bold, tone color)
```

### 3.4 NextActionCard Priority Logic

Render the **first applicable** action card, not all:

1. **Debt overdue** → `"[DebtName] เกินกำหนดชำระ — ชำระเดี๋ยวนี้"` (tone: overdue)
2. **Debt due today** → `"[DebtName] ครบกำหนดวันนี้"` (tone: debt)
3. **Debt due in ≤ 3 days** → `"[DebtName] ต้องชำระอีก {N} วัน"` (tone: debt)
4. **No budget set** → `"ยังไม่ได้ตั้งงบ — ตั้งงบเพื่อเห็นกรอบใช้เงิน"` (tone: neutral)
5. **Budget > 90% used** → `"ใกล้ถึงงบแล้ว เหลืออีก ฿X,XXX"` (tone: warning)
6. **New month, no income entered** → `"เพิ่มรายรับเดือนนี้ก่อนตั้งงบ"` (tone: neutral)

`NextActionCard` anatomy:
```
rounded-[16px] border border-border bg-surface p-4
  ├── title: font-bold text-sm text-foreground
  ├── body: text-xs text-text-secondary mt-1
  └── action: text-xs font-bold text-primary → Link or Button
```

For tone `overdue`, replace `border-border` with `border-overdue/30` and `bg-surface` with `bg-[#FBF0EE]`.
For tone `warning`, use `border-[#F0D070]` and `bg-[#FEF3CD]`.

### 3.5 Transaction List Section

- **Header**: "รายการวันนี้" in `font-bold text-sm` with a "เพิ่มรายการ" link (text-primary, font-bold).
- **Grouped by date** — on the `/today` route, only today's date is shown. The date header shows:
  - Today → `"วันนี้ · {dayOfWeek} {dayNumber} {monthThai}"` (derived dynamically from Bangkok timezone — never hardcoded)
- **Empty state**: `EmptyState` with title `"วันนี้ยังไม่มีรายการ"` and body `"เพิ่มเองหรืออัปโหลดสลิปแรกของวันนี้"`.
- **Show maximum 5 rows** without scrolling; "ดูรายการทั้งหมด" link to `/transactions` if more exist.

---

## 4. `/overview` — Monthly Summary Dashboard

### 4.1 Hero Metric Selection

**Primary hero metric: "เหลือใช้จริงเดือนนี้" (`cashRemainingSatang`)**

Definition: `income − livingExpense − debtPayments`

This is the **truest disposable cash** figure for the month. It directly answers whether the user is ahead or behind their plan.

### 4.2 Screen Layout (360px → 430px)

```
┌─────────────────────────────┐
│  PageHeader                 │
│  "ภาพรวม"  "เดือน[M] ปี[Y]" │
├─────────────────────────────┤
│  MonthNavigator             │  ← / [เดือน] / →  (if historical data)
├─────────────────────────────┤
│  FinancialHero              │
│  "เหลือใช้จริงเดือนนี้"      │
│  ฿8,250.00                  │
│  "จากรายรับ ฿45,000.00"     │
├─────────────────────────────┤
│  Cash-Flow Summary Card     │
│  MoneyFlowRow: รายรับ       │
│  MoneyFlowRow: ค่าใช้ชีวิต  │
│  MoneyFlowRow: จ่ายหนี้     │
│  MoneyFlowRow: คงเหลือ ↑   │
├─────────────────────────────┤
│  Section: "หมวดที่ใช้มาก"   │
│  CategoryRow × N           │
│  [ดูทั้งหมด →]              │
├─────────────────────────────┤
│  Section: Insights          │
│  (only if ≥ 2 months data) │
├─────────────────────────────┤
│  [bottom nav — fixed]       │
└─────────────────────────────┘
```

### 4.3 Cash-Flow Summary Card

```
Section card: rounded-[16px] border border-border bg-surface px-5 py-2
  ├── MoneyFlowRow "รายรับ"      direction=in   amountSatang
  ├── MoneyFlowRow "ค่าใช้ชีวิต" direction=out  amountSatang
  ├── MoneyFlowRow "จ่ายหนี้"    direction=out  amountSatang
  └── MoneyFlowRow "คงเหลือ"    direction=balance amountSatang  ← totals row, bold
```

`MoneyFlowRow` spec:
```tsx
// Existing implementation uses direction="in"/"out"
// Add "balance" direction for the totals row
// "balance" uses primary color if positive, overdue if negative
```

### 4.4 Category Breakdown

- Sorted by amount descending.
- Show top 5 categories only; a "ดูทั้งหมด" link expands to full list (or links to `/transactions?filter=expense`).
- Each row: `CategoryName · amount · mini progress bar (% of total expense)`.
- The mini progress bar uses `--primary` fill; no overspent tone on category breakdown (that belongs in the budget screen).

### 4.5 Insights Section

Only rendered when there are confirmed transactions across ≥ 2 calendar months.

- Maximum 2 insight cards shown.
- Insight card: `rounded-xl border p-3 text-xs leading-5`
  - `success` type → `border-income/20 bg-[#EAF4EF] text-income`
  - `info` type → `border-primary/20 bg-[#EDF4F0] text-primary`
- Insight text must be a specific, actionable Thai sentence — not a generic "You spent less this month."

### 4.6 Zero-Data State

When there are no transactions for the month:

```
EmptyState
  title: "ยังไม่มีข้อมูลเดือนนี้"
  body: "เพิ่มรายรับหรือรายจ่ายอย่างน้อย 1 รายการเพื่อเห็นภาพรวม"
```

---

## 5. Dashboard Interaction Behaviors

### Pull-to-Refresh
- Not yet implemented (Next.js SSR pages refresh on navigation).
- Future: Add a `<Suspense>` boundary and `router.refresh()` triggered by pull gesture.

### Month Navigation
- The `/overview` page shows the current month by default.
- A `MonthNavigator` component allows stepping backward (no forward past current month).
- Previous months show historical data from the existing `listAllTransactions` + month-filter.

### Empty Hero Amount
- When `spentToday === 0`, do NOT display `฿0.00` as the hero.
- Instead, hide the amount and show:
  ```
  "เริ่มวันนี้ด้วยการเพิ่มรายการแรก"  (text-text-secondary, text-base font-medium)
  ```
- This prevents the psychological framing of "I've spent nothing" turning into a pointless zero.

---

## 6. Accessibility Requirements for Dashboard

| Element | Requirement |
|---|---|
| Hero amount | `<output>` element or `aria-live="polite"` region for dynamic updates |
| Stats grid | `<dl>` / `<dt>` / `<dd>` structure or `aria-label` on each `CompactStat` |
| Progress bar | `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label` |
| Month navigator | `<nav aria-label="เลือกเดือน">` with `aria-label` on prev/next buttons |
| Next action card | `aria-label` on action button describing the full context, not just "ดูแผนหนี้" |
| Transaction list heading | `<h2>รายการวันนี้</h2>` |
| Empty state | `aria-live="polite"` on the container so screen readers announce it when it appears |

---

## 7. Mobile Viewport Behavior

### 360px
- All cards span full width (`w-full`).
- Hero amount: 40px → may reduce to 36px if overflow occurs at 360px.
- Stats: `grid-cols-2` if 3 stats at 360px causes overflow; `grid-cols-3` at ≥ 390px.
- `NextActionCard` action link: stacks below body text.

### 390px
- `grid-cols-3` for stats (safe at this width).
- Action links inline with body text.

### 430px
- Extra horizontal breathing room adds `mx-auto max-w-xl`.
- No layout changes — additional whitespace only.

---

## 8. Existing Component Gaps

The following gap items exist between current implementation and this spec. They are addressed in Phase B.

| Gap | Current behavior | Required behavior |
|---|---|---|
| Hero zero-state | Shows `฿0.00` | Shows motivational text instead |
| Budget progress | Not wired | `FinancialHero` needs `progress` prop wired to budget data |
| NextActionCard priority | Single hardcoded card | Priority logic from §3.4 |
| Stats grid cols | Always 3 | `grid-cols-2` at 360px fallback |
| Date derivation | Hardcoded string (audit Finding 3) | Dynamic Bangkok-timezone date |
| Cash-flow "คงเหลือ" row | Missing from summary | Add balance totals row |
| Empty overview | `"ข้อมูลยังไม่พอ"` | `"ยังไม่มีข้อมูลเดือนนี้"` |
