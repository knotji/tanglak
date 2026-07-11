# TangLak Monthly Budget UX Specification

> Version 1.0 · Target route: `/budget` (new) and potential integration with `/overview`

---

## 1. Design Intent

The monthly budget screen should feel like a **conversation with a calm financial advisor**, not like filling in a spreadsheet. The user sets income once per month, divides it into categories, and then sees a live picture of how that plan is holding up.

Core principle: **the budget exists to reduce anxiety, not create it**. Visual states communicate status clearly without being alarming.

---

## 2. Conceptual Model

```
Monthly Budget
  ├── Monthly Income (set once)
  ├── Category Budgets (manual allocation)
  │    ├── Allocated total
  │    ├── Unallocated amount (always visible)
  │    └── Per-category: planned ↔ spent ↔ remaining
  └── Month Navigation (view past months, read-only)
```

### Key definitions

| Term | Thai label | Definition |
|---|---|---|
| Monthly income | รายรับเดือนนี้ | Total salary/income entered by user for the month |
| Allocated | จัดสรรแล้ว | Sum of all category budget amounts |
| Unallocated | ยังไม่ได้จัดสรร | `income − allocated` — must be ≥ 0 to submit |
| Category budget | งบหมวด[X] | User-defined spend limit for a named category |
| Spent | ใช้ไปแล้ว | Sum of `expense` transactions in this category this month |
| Remaining | เหลือ | `categoryBudget − spent` |
| Overspent | เกินงบ | `spent > categoryBudget` |

---

## 3. Screen Layout

### 3.1 Full Monthly Budget Screen (360px first)

```
┌─────────────────────────────┐
│  PageHeader                 │
│  "งบเดือนนี้"  "[Month Year]"│
├─────────────────────────────┤
│  MonthNavigator             │  ←  [ก.ค. 2569]  →
│  (right arrow disabled on   │
│   current month)            │
├─────────────────────────────┤
│  IncomeCard                 │
│  "รายรับเดือนนี้: ฿45,000"   │
│  [แก้ไข] button             │
├─────────────────────────────┤
│  AllocationSummary          │
│  "จัดสรรแล้ว ฿38,000 จาก ฿45,000"
│  ProgressBar (allocated / income)
│  "ยังไม่ได้จัดสรร ฿7,000"   │
│  (highlighted if > 0)       │
├─────────────────────────────┤
│  Section: "งบตามหมวด"       │
│  [+ เพิ่มหมวดงบ]            │
│  ┌─ CategoryBudgetRow ─────┐ │
│  │ [Icon] อาหาร            │ │
│  │ ใช้ไป ฿3,200 / ฿8,000  │ │
│  │ ████████░░░░ 40%        │ │
│  │ เหลืออีก ฿4,800        │ │
│  └──────────────────────── ┘ │
│  ┌─ CategoryBudgetRow ─────┐ │
│  │ [Icon] เดินทาง          │ │
│  │ ใช้ไป ฿5,500 / ฿4,000  │ │
│  │ ████████████ เกินงบ ฿1,500 │
│  └────────────────────────-┘ │
│  ...                        │
├─────────────────────────────┤
│  [bottom nav — fixed]       │
└─────────────────────────────┘
```

---

## 4. Income Setup

### 4.1 First-time income input

Shown when `monthlyIncome === null` for the current month:

```
EmptyState (special variant)
  ├── Icon: Banknote (aria-hidden, 32px)
  ├── Title: "ยังไม่ได้ตั้งรายรับเดือนนี้"
  ├── Body: "กรอกรายรับเพื่อเริ่มจัดสรรงบ"
  └── Action: [กรอกรายรับ] button → opens IncomeSheet
```

### 4.2 IncomeSheet (bottom sheet)

Triggered by the action button or "แก้ไข":

```
MobileBottomSheet
  ├── handle: drag indicator
  ├── title: "รายรับเดือนนี้"
  ├── Input: type="number" inputmode="decimal"
  │    placeholder="0.00"
  │    aria-label="กรอกรายรับเดือนนี้ หน่วยบาท"
  │    id="income-input"
  │    min="0.01"
  ├── hint: "กรอกรายได้รวมก่อนหักทุกอย่าง"
  ├── [บันทึก] primary button
  └── [ยกเลิก] text button
```

Validation:
- Value must be > 0. Error: `"รายรับต้องมากกว่าศูนย์"` with `role="alert"`.
- Value must be numeric. Error: `"กรุณากรอกตัวเลข"` with `role="alert"`.
- On save: update database; update AllocationSummary in place.

---

## 5. Allocation Summary

Shown below the income card when income is set:

```
AllocationSummary card: rounded-[16px] border bg-surface p-4
  ├── Row 1:
  │    left: "จัดสรรแล้ว"  (text-xs text-secondary)
  │    right: "฿38,000 / ฿45,000"  (text-sm font-bold tabular)
  ├── ProgressBar: allocated/income ratio
  │    tone: primary (< 100%), overdue (> 100% — impossible by design)
  └── Row 2 (conditional):
       "ยังไม่ได้จัดสรร ฿7,000"
       ← shown only when unallocated > 0
       ← text-xs font-medium text-debt (amber) to draw attention without alarm
```

The unallocated amount is shown in `--debt` amber (not red) because it is not an error — it is money still available to assign. Red would be misleading.

When all income is allocated (unallocated === 0): replace the amber row with a green tick:
```
✓ "จัดสรรครบแล้ว"  text-income text-xs font-bold
```

---

## 6. Category Budget Rows

### 6.1 Normal state (< 75% spent)

```
CategoryBudgetRow
  ├── [CategoryIcon]  40×40px  aria-hidden
  ├── div.content
  │    ├── name: "อาหาร"  text-sm font-bold
  │    ├── meta: "ใช้ไป ฿3,200 / ฿8,000"  text-xs text-secondary
  │    └── ProgressBar value=40 tone="primary"
  │         aria-label="อาหาร ใช้ไปแล้ว 40% จากงบ 8,000 บาท"
  └── remaining: "เหลืออีก ฿4,800"  text-xs text-income font-medium
```

### 6.2 Near-limit state (75–99% spent)

```
Same layout, changes:
  ├── ProgressBar tone="debt"  (amber)
  ├── remaining text: "ใกล้ถึงงบ เหลืออีก ฿800"  text-debt
  └── (optional) ⚠ icon prefix on remaining text  aria-hidden
```

### 6.3 Overspent state (≥ 100% spent)

```
CategoryBudgetRow — overspent
  ├── [CategoryIcon]  tone overridden to bg-overdue/10 text-overdue
  ├── div.content
  │    ├── name: "เดินทาง"  text-sm font-bold text-foreground
  │    ├── meta: "ใช้ไป ฿5,500 / ฿4,000"  text-xs text-secondary
  │    └── ProgressBar value=100 tone="overdue"
  │         aria-label="เดินทาง เกินงบ 1,500 บาท จากงบ 4,000 บาท"
  └── overspent: "เกินงบ ฿1,500"  text-xs text-overdue font-bold
       + role="status" aria-live="polite"
```

The entire row gets `border-l-2 border-overdue` on the left edge to provide a non-color indicator:
```
className="... border-l-2 border-overdue pl-3"
```

### 6.4 No transactions (budget set, no spend yet)

```
meta: "ยังไม่มีรายการหมวดนี้"  text-xs text-secondary italic
ProgressBar value=0 tone="primary"
remaining: "งบทั้งหมด ฿8,000 ยังว่างอยู่"  text-xs text-text-secondary
```

---

## 7. Adding and Editing Category Budgets

### 7.1 Add category budget

Triggered by "[+ เพิ่มหมวดงบ]" button:

```
MobileBottomSheet
  ├── title: "เพิ่มงบหมวดใหม่"
  ├── Select / text input: category name
  │    (use existing categories from this month's transactions as suggestions)
  ├── Input: amount  type="number" inputmode="decimal"
  │    aria-label="งบสูงสุดสำหรับหมวดนี้ หน่วยบาท"
  ├── hint: "งบที่ตั้งต้องไม่เกินรายรับที่ยังไม่ได้จัดสรร ฿7,000"
  ├── [บันทึก] primary
  └── [ยกเลิก]
```

Validation:
- Amount must be > 0: `"จำนวนต้องมากกว่าศูนย์"`
- Category name required: `"กรุณาเลือกหมวด"`
- Cannot allocate more than remaining unallocated: `"ยังไม่ได้จัดสรรเหลือแค่ ฿X,XXX"`

### 7.2 Edit category budget

Tapping on any `CategoryBudgetRow` expands inline edit, OR opens `MobileBottomSheet` with pre-filled values.

Decision: **bottom sheet** (not inline) — consistent pattern, avoids layout shift.

---

## 8. Copy-Previous-Month Flow

A "คัดลอกงบจากเดือนที่แล้ว" action is shown in the header overflow menu or as a secondary button in the empty state:

```
Banner (when no budgets yet AND previous month had budgets):
  "เดือนที่แล้วคุณตั้งงบไว้ — คัดลอกมาใช้ได้เลย"
  [คัดลอกงบเดือนที่แล้ว] button
```

On tap:
1. Show a confirmation sheet listing the categories and amounts to be copied.
2. User can deselect individual categories.
3. On confirm: insert category budgets for the current month.
4. Income is NOT copied — income must be set explicitly each month.

---

## 9. Empty State Flows

### No income, no budgets (first time ever)

```
Full-page guided empty state:
  Illustration: wallet (SVG, aria-hidden)
  Title: "เริ่มวางแผนเดือนนี้"
  Body: "กรอกรายรับก่อน แล้วค่อยแบ่งงบตามหมวด"
  [กรอกรายรับ] → IncomeSheet
```

### Income set, no category budgets

```
EmptyState in the category section:
  Title: "ยังไม่มีงบหมวดไหนเลย"
  Body: "แบ่งงบ ฿45,000 ตามหมวดที่ใช้จ่ายบ่อย"
  [+ เพิ่มหมวดงบ] CTA
  [คัดลอกงบเดือนที่แล้ว] secondary (if applicable)
```

### Past month (read-only)

When `viewingMonth < currentMonth`:
- All inputs disabled.
- "แก้ไข" and "เพิ่ม" buttons hidden.
- Read-only badge: `"ดูย้อนหลัง (แก้ไขไม่ได้)"` in a muted chip.
- Progress bars still rendered.
- Overspent rows still flagged.

---

## 10. Month Navigation

```
MonthNavigator
  ├── PrevButton: aria-label="เดือนก่อนหน้า"  ← ChevronLeft
  ├── CurrentMonth: "ก.ค. 2569"  font-bold text-sm
  └── NextButton: aria-label="เดือนถัดไป"   → ChevronRight
       disabled={viewingMonth >= currentMonth}
       aria-disabled={true} when disabled
```

Month format: `new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "short", year: "numeric" })` — uses Buddhist calendar year.

---

## 11. Accessibility Requirements

| Element | Requirement |
|---|---|
| Income input | `id="income-input"`, `<label htmlFor="income-input">` |
| Category amount input | `id="category-amount-{category}"`, matching `htmlFor` |
| Progress bars | `role="progressbar"` + all aria attributes per `FINANCE_UI_SYSTEM.md §3.1` |
| Overspent rows | `role="status"` on the overspent amount so it is announced |
| Bottom sheet | Focus trap + Escape to close + auto-focus first input |
| Empty state CTA | Descriptive `aria-label`, not just "เพิ่ม" |
| Month nav buttons | `aria-label` + `aria-disabled` |
| Allocation summary | `aria-live="polite"` so updates announce when income or allocation changes |

---

## 12. Mobile Viewport Behavior

### 360px
- `CategoryBudgetRow`: icon + content stack vertically if needed — but prefer horizontal at 360px (icon 36×36, content flex-1).
- `AllocationSummary`: single column layout.
- Month navigator: full width, chevrons on edges.

### 390px
- `CategoryBudgetRow`: horizontal comfortably.
- "ยังไม่ได้จัดสรร" shows amount on same line as label.

### 430px
- No layout changes. Margins increase automatically via `max-w-xl mx-auto`.

---

## 13. Implementation Notes

### Data model (no new API needed)
- Monthly income: stored as a `Transaction` of `type="income"` with `merchant="รายรับเดือน"` and `occurredAt` = first of the month. (Or a future `monthly_budgets` table — to be decided in Phase C implementation planning.)
- Category budgets: a new `category_budgets` table `{userId, month, category, budgetSatang}` with RLS. **Do not implement the table in this document** — this is a UX spec, not a schema spec.
- Spent amounts: derived from existing transactions via `calculations.ts`.

### What does not exist yet in the codebase
- `/budget` route — new route
- `CategoryBudgetRow` component — new
- `AllocationSummary` component — new
- `IncomeSheet` bottom sheet — new, built on existing `MobileBottomSheet`
- `MonthNavigator` standalone component — exists for `/transactions`, adapt for budget
