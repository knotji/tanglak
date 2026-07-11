# TangLak Finance UI Test Matrix

> Version 1.0 · Covers all UI specification documents in `design/finance-ui-system`

This matrix maps every acceptance criterion to a test method, test file location, and automation tier.

**Automation tiers:**
- `unit` — Vitest unit test (fast, no browser)
- `e2e` — Playwright E2E test (real browser)
- `manual` — Manual check with checklist

---

## Phase A — Design Tokens and Primitives

| ID | Criterion | Method | Test file | Automated |
|---|---|---|---|---|
| A-1a | `--text-secondary` = `#5F6B66` | manual | CSS inspection | No |
| A-1b | `--primary-dark` defined | unit | `config.test.ts` | Yes |
| A-1c | `--warning-surface` defined | unit | `config.test.ts` | Yes |
| A-1d | Other new tokens defined | manual | CSS inspection | No |
| A-2a | `ProgressBar` has `role="progressbar"` | unit | `a11y-release-blockers.test.ts` | Yes |
| A-2b | `aria-valuemin` present | unit | Same | Yes |
| A-2c | `aria-valuemax` present | unit | Same | Yes |
| A-2d | `aria-valuenow` clamped 0–100 | unit | `import-review-selection.test.tsx` | Yes |
| A-2e | `aria-label` required | unit | New: `finance-primitives.test.tsx` | Yes |
| A-2f | `aria-hidden` removed | unit | `finance-primitives.test.tsx` | Yes |
| A-3a | `MoneyAmount` aria-label format | unit | `finance-primitives.test.tsx` | Yes |
| A-3b | `฿` not in aria-label | unit | Same | Yes |
| A-3c | `.tabular` class always present | unit | Same | Yes |
| A-4a | Skip link present in AppShell | e2e | `a11y-release-blockers.test.ts` | Yes |
| A-4b | Skip link focusable | e2e | Same | Yes |
| A-4c | `id="main-content"` target exists | e2e | Same | Yes |
| A-5a | Inline errors have `role="alert"` | unit | `a11y-release-blockers.test.ts` | Yes |
| A-6a | `animate-pulse` removed under reduced-motion | manual | Browser devtools motion toggle | No |
| A-6b | Transitions 0ms under reduced-motion | manual | Same | No |

---

## Phase B — Dashboard Refresh

### B-1 `/today` hero metric

| ID | Criterion | Method | Test file | Automated |
|---|---|---|---|---|
| B-1a | Hero label "วันนี้ใช้ไป" | e2e | `non-pdf-readiness.spec.ts` or new `dashboard.spec.ts` | Yes |
| B-1b | Hero shows spend amount | e2e | `dashboard.spec.ts` | Yes |
| B-1c | Zero spend → motivational text not ฿0.00 | e2e | `dashboard.spec.ts` | Yes |
| B-1d | Stats `grid-cols-2` at 360px | e2e | `auth-ui.spec.ts` (viewport check) | Yes |

### B-2 Date handling

| ID | Criterion | Method | Test file | Automated |
|---|---|---|---|---|
| B-2a | No hardcoded date string in `TransactionGroup` | unit | `ux-fixes.test.tsx` | Yes |
| B-2b | "วันนี้" label uses Bangkok TZ dynamically | unit | `date-thai-format.test.ts` | Yes |
| B-2c | Correct at month boundary midnight | unit | `ux-fixes.test.tsx` | Yes |

### B-3 NextActionCard priority

| ID | Criterion | Method | Test file | Automated |
|---|---|---|---|---|
| B-3a | Overdue card shown when debt overdue | unit | New: `dashboard-priority.test.tsx` | Yes |
| B-3b | Only one card rendered | unit | Same | Yes |
| B-3c | No-budget card when no debts | unit | Same | Yes |

### B-4 Transaction list

| ID | Criterion | Method | Test file | Automated |
|---|---|---|---|---|
| B-4a | Max 5 rows before "ดูทั้งหมด" | unit | `dashboard-priority.test.tsx` | Yes |
| B-4b | "ดูทั้งหมด" links to `/transactions` | e2e | `auth-crud.spec.ts` | Yes |
| B-4c | Empty state title correct | e2e | `dashboard.spec.ts` | Yes |

### B-5 `/overview` hero

| ID | Criterion | Method | Test file | Automated |
|---|---|---|---|---|
| B-5a | Correct formula: income − expense − debt | unit | `finance.test.ts` | Yes |
| B-5b | Context line shows income | e2e | `dashboard.spec.ts` | Yes |

### B-6 Cash-flow summary

| ID | Criterion | Method | Test file | Automated |
|---|---|---|---|---|
| B-6a | Four rows rendered | e2e | `dashboard.spec.ts` | Yes |
| B-6b | "คงเหลือ" negative → overdue color | unit | `finance-primitives.test.tsx` | Yes |

### B-7/B-8 Overview category / empty state

| ID | Criterion | Method | Test file | Automated |
|---|---|---|---|---|
| B-7a | Top 5 categories only | unit | `finance.test.ts` | Yes |
| B-7b | Sort by amount descending | unit | Same | Yes |
| B-8a | Empty state title correct | e2e | `dashboard.spec.ts` | Yes |

---

## Phase C — Monthly Budget UI

| ID | Criterion | Method | Test file | Automated |
|---|---|---|---|---|
| C-1a | Empty state when no income | e2e | New: `budget.spec.ts` | Yes |
| C-1b | IncomeSheet opens on button tap | e2e | `budget.spec.ts` | Yes |
| C-1c | Income input has `id` + `label` | unit | `a11y-release-blockers.test.ts` | Yes |
| C-1d | Income ≤ 0 rejected with alert | unit | `finance-actions.test.ts` | Yes |
| C-2a | Unallocated amount displayed | e2e | `budget.spec.ts` | Yes |
| C-2b | `aria-live` on allocation summary | unit | `finance-primitives.test.tsx` | Yes |
| C-3a | Progress bar ARIA attributes | unit | Same | Yes |
| C-4a | Near-limit: ≥ 75% triggers amber | unit | New: `budget.test.ts` | Yes |
| C-5a | Overspent: border-l-2 class | unit | `budget.test.ts` | Yes |
| C-5b | Overspent: role="status" | unit | Same | Yes |
| C-6a | Add sheet focus trap | e2e | `budget.spec.ts` | Yes |
| C-6b | Escape closes sheet | e2e | Same | Yes |
| C-7a | Copy-previous banner shown | e2e | `budget.spec.ts` | Yes |
| C-7b | Income NOT copied | unit | `budget.test.ts` | Yes |
| C-8a | Past month: inputs disabled | e2e | `budget.spec.ts` | Yes |
| C-9a | Month nav aria-labels | unit | `finance-primitives.test.tsx` | Yes |
| C-9b | Next button disabled on current month | e2e | `budget.spec.ts` | Yes |

---

## Phase D — Transactions and Debt Polish

| ID | Criterion | Method | Test file | Automated |
|---|---|---|---|---|
| D-1a | Import badge on `history_import` rows | unit | `import-review-selection.test.tsx` | Yes |
| D-1b | AI badge on `ai_extraction` rows | unit | `document.test.ts` | Yes |
| D-2a | Income prefix `+` aria-hidden | unit | `finance-primitives.test.tsx` | Yes |
| D-2b | Expense prefix `−` aria-hidden | unit | Same | Yes |
| D-3a | Touch targets ≥ 44px | e2e | `non-pdf-readiness.spec.ts` | Yes |
| D-4a | Overdue card: `border-overdue` | unit | `finance-primitives.test.tsx` | Yes |
| D-4b | Overdue badge `role="alert"` | unit | Same | Yes |
| D-5a | Paid-off: progress bar full + income tone | unit | Same | Yes |
| D-5b | Paid-off: payment buttons hidden | e2e | `non-pdf-readiness.spec.ts` | Yes |
| D-6a | NextActionCard for debt due in 7 days | unit | `dashboard-priority.test.tsx` | Yes |
| D-7a | Overdue badge on nav | e2e | `non-pdf-readiness.spec.ts` | Yes |

---

## Global — Mobile Overflow

| ID | Criterion | Method | Test file | Automated |
|---|---|---|---|---|
| G-1 | No overflow at 360px on `/today` | e2e | `auth-ui.spec.ts` + `dashboard.spec.ts` | Yes |
| G-2 | No overflow at 360px on `/overview` | e2e | Same | Yes |
| G-3 | No overflow at 360px on `/budget` | e2e | `budget.spec.ts` | Yes |
| G-4 | No overflow at 360px on `/transactions` | e2e | `transaction-month-navigation.spec.ts` | Yes |
| G-5 | No overflow at 360px on `/debts` | e2e | `non-pdf-readiness.spec.ts` | Yes |
| G-6 | No overflow at 390px on all routes | e2e | `auth-ui.spec.ts` (viewport variants) | Yes |
| G-7 | No overflow at 430px on all routes | e2e | Same | Yes |

---

## Global — Accessibility

| ID | Criterion | Method | Test file | Automated |
|---|---|---|---|---|
| GA-1 | All interactive elements have accessible names | e2e + manual | `a11y-release-blockers.test.ts` | Partial |
| GA-2 | No images without alt/aria-hidden | unit | `a11y-release-blockers.test.ts` | Yes |
| GA-3 | Focus order matches visual order | manual | Manual tab key navigation | No |
| GA-4 | Dialogs trap focus | e2e | `a11y-release-blockers.test.ts` | Yes |
| GA-5 | Escape closes dialog | e2e | Same | Yes |
| GA-6 | Money amounts include "บาท" in aria-label | unit | `finance-primitives.test.tsx` | Yes |
| GA-7 | Non-color signals on all status indicators | manual | Visual inspection checklist | No |
| GA-8 | Reduced motion respected | manual | Browser toggle + visual inspection | No |

---

## Suggested New Test Files

The following test files do not yet exist and should be created in Phase A/B/C:

| File | Phase | Responsibility |
|---|---|---|
| `tests/unit/finance-primitives.test.tsx` | A | `MoneyAmount` aria, `ProgressBar` ARIA, skip link, sign prefix behavior |
| `tests/unit/budget.test.ts` | C | Category budget threshold logic (75%, 100%), unallocated calc, copy-prev income exclusion |
| `tests/unit/dashboard-priority.test.tsx` | B | NextActionCard priority ordering, max row truncation |
| `tests/e2e/dashboard.spec.ts` | B | `/today` and `/overview` layout, zero-state, hero metric, category sort |
| `tests/e2e/budget.spec.ts` | C | `/budget` full flow: income setup, category add, overspent state, past month read-only |

---

## Manual QA Checklist (per release)

Run this before every merge to `release/production-readiness`:

- [ ] Open app at 360px — no horizontal scroll on any tab
- [ ] Open app at 390px — same
- [ ] Tab through `/today` with keyboard — focus order correct, skip link works
- [ ] Enable VoiceOver / TalkBack — hero amount reads "X,XXX.XX บาท"
- [ ] Progress bar reads category name + percentage in screen reader
- [ ] Enable reduced-motion in OS — no animations visible
- [ ] Open and close IncomeSheet with Escape key
- [ ] Trigger overspent row — border indicator visible without color
- [ ] Trigger debt overdue — card changes without color as only signal
- [ ] All action buttons have descriptive labels in screen reader button list
