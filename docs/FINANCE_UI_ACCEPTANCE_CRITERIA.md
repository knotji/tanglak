# TangLak Finance UI Acceptance Criteria

> Version 1.0 · Covers Phases A–D

All acceptance criteria are stated as testable, binary pass/fail conditions.

---

## Phase A — Design Tokens and Primitives

### A-1 Color tokens
- [ ] `--text-secondary` computed value is `#5F6B66` (contrast ≥ 5.1:1 vs `--background`)
- [ ] `--primary-dark` is defined as `#1A3A2E`
- [ ] `--warning-surface` is defined as `#FEF3CD`
- [ ] `--warning-border` is defined as `#F0D070`
- [ ] `--income-surface` is defined as `#EAF4EF`
- [ ] `--debt-surface` is defined as `#FDF2E4`
- [ ] `--overdue-surface` is defined as `#FBF0EE`

### A-2 ProgressBar component
- [ ] `ProgressBar` renders `role="progressbar"` on its outer element
- [ ] `aria-valuemin={0}` is present
- [ ] `aria-valuemax={100}` is present
- [ ] `aria-valuenow` equals `Math.min(100, Math.max(0, value))`
- [ ] `aria-label` prop is required and renders on the element
- [ ] `aria-hidden` is removed from the outer element
- [ ] Tone `"income"` renders `bg-income` fill
- [ ] Tone `"primary"` renders `bg-primary` fill
- [ ] Tone `"debt"` renders `bg-debt` fill
- [ ] Tone `"overdue"` renders `bg-overdue` fill

### A-3 MoneyAmount component
- [ ] `aria-label` is always rendered
- [ ] `aria-label` format is `"{amount formatted th-TH, 2 decimal places} บาท"`
- [ ] The rendered text content uses `Intl.NumberFormat("th-TH", { minimumFractionDigits: 2 })`
- [ ] The `tabular` class is always present on the wrapper `<span>`
- [ ] The `฿` symbol is included in rendered text but NOT in `aria-label`

### A-4 AppShell
- [ ] A skip link `"ข้ามไปยังเนื้อหา"` exists as the first focusable element in `AppShell`
- [ ] Skip link target is `id="main-content"` wrapping the page content slot
- [ ] Skip link is visually hidden by default and becomes visible on focus (`sr-only focus:not-sr-only`)

### A-5 InlineError
- [ ] All inline error elements have `role="alert"` or `aria-live="assertive"`
- [ ] Error text is non-empty Thai copy (see `FINANCE_UI_SYSTEM.md §6`)

### A-6 Reduced motion
- [ ] `@media (prefers-reduced-motion: reduce)` disables `animate-pulse` on skeletons
- [ ] All CSS `transition-*` durations are `0ms` under reduced motion media query
- [ ] `scrollIntoView` calls use `behavior: "auto"` when `matchMedia("(prefers-reduced-motion: reduce)").matches`

---

## Phase B — Dashboard Refresh

### B-1 `/today` hero metric
- [ ] Hero label reads `"วันนี้ใช้ไป"` when no daily budget is set
- [ ] Hero label reads `"เหลือใช้วันนี้"` when a daily budget is set
- [ ] Hero amount displays `spentToday` as `฿X,XXX.XX` (tabular, 40px bold)
- [ ] When `spentToday === 0`, the hero shows motivational text instead of `฿0.00`
- [ ] Stats grid renders `grid-cols-2` at 360px (does not overflow)
- [ ] Stats grid renders `grid-cols-3` at 390px+

### B-2 `/today` date handling
- [ ] Transaction group header for today derives the date from Bangkok timezone dynamically
- [ ] No hardcoded date strings exist in `TransactionGroup.tsx` or related components
- [ ] The "วันนี้" prefix shows on the current date in the Bangkok timezone, regardless of UTC date

### B-3 `/today` NextActionCard priority
- [ ] Overdue debt shows card with `border-overdue` tone
- [ ] Due-today debt shows card with `border-debt` tone
- [ ] Due-within-3-days debt shows countdown
- [ ] No-budget state shows "ยังไม่ได้ตั้งงบ" card when no overdue items
- [ ] Budget > 90% used shows warning card
- [ ] Only one `NextActionCard` is rendered (highest priority wins)

### B-4 `/today` transaction list
- [ ] Section header is `<h2>รายการวันนี้</h2>`
- [ ] "เพิ่มรายการ" link is present in the header area
- [ ] Empty state title: `"วันนี้ยังไม่มีรายการ"`
- [ ] Maximum 5 rows shown before a "ดูรายการทั้งหมด" link appears
- [ ] "ดูรายการทั้งหมด" link navigates to `/transactions`

### B-5 `/overview` hero metric
- [ ] Hero label reads `"เหลือใช้จริงเดือนนี้"`
- [ ] Hero amount is `income − livingExpense − debtPayments` (correct formula)
- [ ] Context line reads `"จากรายรับ ฿X,XXX.XX"`

### B-6 `/overview` cash-flow summary
- [ ] Four rows: รายรับ / ค่าใช้ชีวิต / จ่ายหนี้ / คงเหลือ
- [ ] "คงเหลือ" row uses `--income` color if positive, `--overdue` color if negative
- [ ] All amounts are `MoneyAmount` components (tabular, aria-label)

### B-7 `/overview` category breakdown
- [ ] Top 5 categories shown by default
- [ ] "ดูทั้งหมด" link/button appears when > 5 categories
- [ ] Categories sorted by `amountSatang` descending
- [ ] Each category row has accessible label (not just color-coded amounts)

### B-8 `/overview` empty state
- [ ] When no transactions: title `"ยังไม่มีข้อมูลเดือนนี้"`
- [ ] Body `"เพิ่มรายรับหรือรายจ่ายอย่างน้อย 1 รายการเพื่อเห็นภาพรวม"`

---

## Phase C — Monthly Budget UI

### C-1 Income setup
- [ ] When `monthlyIncome === null`, full-page empty state is shown
- [ ] Empty state title: `"ยังไม่ได้ตั้งรายรับเดือนนี้"`
- [ ] "[กรอกรายรับ]" button opens `IncomeSheet`
- [ ] `IncomeSheet` input has `type="number"`, `inputmode="decimal"`, `aria-label`, `id`, linked `<label>`
- [ ] Submitting income ≤ 0 shows error `"รายรับต้องมากกว่าศูนย์"` with `role="alert"`
- [ ] Submitting non-numeric shows error `"กรุณากรอกตัวเลข"` with `role="alert"`
- [ ] On valid submit, income is saved and AllocationSummary updates without full page reload

### C-2 Allocation summary
- [ ] Shows `"จัดสรรแล้ว ฿X,XXX / ฿X,XXX"` (tabular)
- [ ] ProgressBar renders at correct proportion (allocated / income)
- [ ] When `unallocated > 0`: shows `"ยังไม่ได้จัดสรร ฿X,XXX"` in amber (`text-debt`)
- [ ] When `unallocated === 0`: shows `"✓ จัดสรรครบแล้ว"` in green (`text-income`)
- [ ] `aria-live="polite"` on the summary region

### C-3 Category budget rows — normal
- [ ] Shows category icon, name, `"ใช้ไป ฿X / ฿X"`, progress bar, remaining amount
- [ ] Progress bar `aria-label` contains category name, percentage, and budget amount
- [ ] Remaining amount uses `text-income` color

### C-4 Category budget rows — near limit
- [ ] Triggers at ≥ 75% of budget used
- [ ] Progress bar uses `tone="debt"` (amber)
- [ ] Remaining text changes to `"ใกล้ถึงงบ เหลืออีก ฿X,XXX"` in amber

### C-5 Category budget rows — overspent
- [ ] Triggers at ≥ 100% of budget used
- [ ] Progress bar uses `tone="overdue"`, clamped at 100%
- [ ] Row has `border-l-2 border-overdue` left border
- [ ] Overspent text reads `"เกินงบ ฿X,XXX"` in `text-overdue`
- [ ] Overspent amount has `role="status"` or `aria-live="polite"`

### C-6 Category budget — add
- [ ] "[+ เพิ่มหมวดงบ]" button opens `MobileBottomSheet`
- [ ] Sheet has focus trap (Tab cycles within sheet, Escape closes)
- [ ] Sheet auto-focuses first input on open
- [ ] Amount field has `type="number"`, `inputmode="decimal"`, `id`, `<label htmlFor>`
- [ ] Cannot allocate more than unallocated amount

### C-7 Copy-previous-month
- [ ] Banner shown when current month has no budgets AND previous month had budgets
- [ ] Copying shows confirmation sheet listing categories and amounts
- [ ] Income is NOT copied (must be set separately)
- [ ] Individual categories can be deselected before confirming copy

### C-8 Past month view
- [ ] All edit inputs disabled
- [ ] "แก้ไข" / "เพิ่ม" buttons hidden
- [ ] Read-only chip: `"ดูย้อนหลัง (แก้ไขไม่ได้)"`
- [ ] Progress bars and overspent states still rendered

### C-9 Month navigation
- [ ] Previous button `aria-label="เดือนก่อนหน้า"`
- [ ] Next button `aria-label="เดือนถัดไป"`
- [ ] Next button `aria-disabled="true"` when on current month
- [ ] Month display uses Buddhist calendar year

---

## Phase D — Transactions and Debt Polish

### D-1 TransactionRow — import indicator
- [ ] Transactions with `source === "history_import"` show `"นำเข้าจากสเตทเมนต์"` badge
- [ ] Transactions with `source === "ai_extraction"` show `"ข้อมูลจาก AI"` badge
- [ ] Badges use `text-[10px] font-bold` in `bg-muted` chip

### D-2 TransactionRow — direction
- [ ] Income / refund: sign prefix `+`, color `text-income`
- [ ] Expense / debt_payment: sign prefix `−`, color `text-expense` or `text-debt`
- [ ] Transfer: no sign prefix, `text-foreground`
- [ ] Sign prefix is `aria-hidden`; `MoneyAmount` `aria-label` includes transaction type context

### D-3 TransactionRow — touch targets
- [ ] "แก้" button: `min-h-11` (44px) ✓ (already correct per existing code)
- [ ] "ลบ" button: `min-h-11` (44px) ✓
- [ ] Row itself: `min-h-12` (48px) when tappable

### D-4 DebtCard — overdue state
- [ ] When `debt.status === "overdue"`: card has `border-overdue/50 bg-overdue-surface`
- [ ] Overdue badge shows `"เกินกำหนด {N} วัน"` with `role="alert"`
- [ ] "เพิ่มการชำระ" button prominent with `bg-overdue text-white` (not green)

### D-5 DebtCard — paid-off state
- [ ] When `debt.status === "paid_off"`: card shows `"ชำระครบแล้ว"` badge in `text-income`
- [ ] Progress bar full with `tone="income"`
- [ ] Payment buttons hidden

### D-6 Debt — upcoming payment
- [ ] On `/today` dashboard: if debt due within 7 days, shows NextActionCard
- [ ] On `/debts`: DueTag shows `"อีก {N} วัน"` in `bg-debt/10 text-debt`

### D-7 Bottom navigation — attention badges
- [ ] "หนี้" nav item shows a numeric badge (dot or count) when any debt has `status === "overdue"`
- [ ] Badge meets 3:1 contrast vs nav item background
- [ ] Badge has `aria-label="หนี้ที่เกินกำหนด {N} รายการ"` on the link

---

## Global Acceptance Criteria (all phases)

### Mobile layout
- [ ] No horizontal overflow at 360px (verified by `document.body.scrollWidth === 360` in E2E)
- [ ] No horizontal overflow at 390px
- [ ] No horizontal overflow at 430px
- [ ] Bottom navigation does not obscure content (content has `pb-24`)
- [ ] Safe area inset respected on notched devices

### Accessibility
- [ ] All interactive elements have accessible names (label, aria-label, or aria-labelledby)
- [ ] All images have alt text or `aria-hidden`
- [ ] Focus order matches visual reading order
- [ ] No focus traps outside of modal/sheet contexts
- [ ] Dialogs and sheets trap focus, close on Escape, restore focus on close
- [ ] Screen reader money announcements include full amount + "บาท"
- [ ] Non-color signals accompany all color-coded statuses
- [ ] `prefers-reduced-motion` disables all CSS animations and transitions

### Performance
- [ ] `npm run build` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0 errors (warnings acceptable if pre-existing)
- [ ] `npm run test` all tests pass
