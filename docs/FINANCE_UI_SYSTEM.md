# TangLak Financial UI System

> Version 1.0 · Branch `design/finance-ui-system` · Base `release/production-readiness`

This document defines TangLak's visual language, design tokens, component hierarchy, and interaction principles. It is the single source of truth for all implementation decisions across Phases A–D.

---

## Product Character

TangLak should feel:

| Attribute | Meaning in practice |
|---|---|
| **Financially trustworthy** | Numbers are precise, legible, and never obscured by decoration |
| **Calm, not intimidating** | Warm off-white backgrounds; dark-forest green as an anchor, not an alarm |
| **Clear about money movement** | Direction (in / out / obligation) communicated through shape, sign, and typography—not color alone |
| **Useful at a glance** | One primary metric per screen; secondary information compressed until needed |
| **Modern Thai-first** | Thai labels, Thai number conventions (thousands separator), Thai date idioms |
| **Mobile-first** | All layouts designed for 360px first; wider breakpoints add breathing room, not new information |

Avoid:
- Neon or vibrant fintech gradients (Revolut / Robinhood aesthetic)
- Fake sparkline charts without real data
- Red/green as the sole signal for positive/negative (fails color-blind users)
- Decorative statistics that do not drive a user decision
- Dense spreadsheet tables on a 360px viewport

---

## 1. Design Tokens

All tokens are CSS custom properties declared in `src/app/globals.css` and consumed via Tailwind v4 `@theme inline`.

### 1.1 Color Palette

#### Foundation (surfaces and text)

| Token | Hex | Usage |
|---|---|---|
| `--background` | `#F5F3EC` | Page background — warm off-white, never pure white |
| `--surface` | `#FFFEFA` | Card / panel background |
| `--muted` | `#EEF1ED` | Subtle chip, skeleton, divider background |
| `--border` | `#D9DED9` | All borders — 1px only |
| `--text-primary` | `#18201D` | Body, headings, amounts — near-black with warm tint |
| `--text-secondary` | `#5F6B66` | Labels, hints, metadata — contrast ≥ 5.1:1 on `--background` |

> **Note on existing value**: The audit (Finding 13) measured `#69736E` at ~4.45:1 against `--background`. The implementation value must be `#5F6B66` (5.1:1) to meet WCAG AA.

#### Brand

| Token | Hex | Usage |
|---|---|---|
| `--primary` | `#244C3D` | Primary buttons, active nav, CTA, key links |
| `--primary-soft` | `#DCE8E1` | Active nav background, income icon container |
| `--primary-dark` | `#1A3A2E` | Button hover / pressed state |

#### Semantic money signals

| Token | Hex | Meaning | Non-color signal |
|---|---|---|---|
| `--income` | `#2F735C` | Money coming in | `+` prefix · upward arrow icon · `aria-label="รายรับ"` |
| `--expense` | `#2E3431` | Money going out | `−` prefix · downward arrow icon (optional) |
| `--debt` | `#B8782E` | Debt obligation, payment due | `●` dot badge · clock icon · warning-amber container |
| `--overdue` | `#A64B3C` | Overdue / hard error | `⚠` icon · `role="alert"` · `aria-live="assertive"` |
| `--warning-surface` | `#FEF3CD` | Warning container background | `⚠` icon prefix |
| `--warning-border` | `#F0D070` | Warning container border | — |

> **Rule**: Never use color as the *only* signal. Every status must have a typographic or iconographic secondary cue.

#### Added tokens (to be added to `globals.css` in Phase A)

```css
:root {
  /* Corrected contrast */
  --text-secondary: #5F6B66;

  /* Missing semantic tokens */
  --primary-dark: #1A3A2E;
  --warning-surface: #FEF3CD;
  --warning-border: #F0D070;
  --income-surface: #EAF4EF;
  --debt-surface: #FDF2E4;
  --overdue-surface: #FBF0EE;
}
```

### 1.2 Typography

TangLak uses **Geist Sans** for all UI text and **Geist Mono** for monospace contexts (reference numbers, account numbers). Both are loaded via `next/font/google` in `layout.tsx`.

#### Type scale

| Role | Size | Weight | Line height | Token class |
|---|---|---|---|---|
| Hero amount | 40px | 700 | 1 (none) | `text-[40px] font-bold leading-none` |
| Section amount | 20–24px | 700 | 1.25 | `text-xl font-bold` |
| Row amount | 14–15px | 700 | 1.4 | `text-sm font-bold` |
| Section heading | 16px | 700 | 1.4 | `text-base font-bold` |
| Body / label | 14px | 500 | 1.6 | `text-sm font-medium` |
| Metadata / caption | 12px | 500 | 1.5 | `text-xs font-medium` |
| Micro / badge | 10–11px | 700 | 1.2 | `text-[11px] font-bold` |

#### Number rendering rules

1. **Always use `font-variant-numeric: tabular-nums`** (`.tabular` class) on all monetary amounts so digits align in lists.
2. **Thai locale format**: `new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })` — output example: `12,450.00`
3. **Never omit decimal places** on currency. `฿12,450` is wrong; `฿12,450.00` is correct.
4. **Sign convention**:
   - Income / refund: `+ ฿12,450.00` — styled in `--income`
   - Expense: `− ฿3,200.00` — styled in `--expense` (near-black, not red)
   - Debt payment: `− ฿2,000.00` — styled in `--debt` (amber)
   - Transfer: `฿5,000.00` (no sign, neutral)
5. **Screen reader `aria-label`**: `฿12,450.00 บาท` rendered as `"12,450.00 บาท"` to avoid the ฿ symbol being read as "baht sign".

#### `MoneyAmount` component spec

```tsx
// Required aria-label format:
aria-label={`${amount.toLocaleString("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})} บาท`}
```

The `tabular` class must always be present. The `sign` prefix (`+`, `−`) lives *outside* `MoneyAmount` in a sibling `<span aria-hidden>` so the screen reader reads the full amount from `aria-label`.

### 1.3 Spacing Scale

TangLak uses a **4px base grid**. All spacing values must be multiples of 4px.

| Name | px | Tailwind |
|---|---|---|
| xs | 4 | `gap-1` / `p-1` |
| sm | 8 | `gap-2` / `p-2` |
| md | 12 | `gap-3` / `p-3` |
| base | 16 | `gap-4` / `p-4` |
| lg | 20 | `p-5` |
| xl | 24 | `p-6` |
| 2xl | 32 | `p-8` |

Page horizontal padding: **16px** (`px-4`) at 360px. The content area is capped at `max-w-xl` (576px) centered.

### 1.4 Elevation / Shadow

| Level | Shadow value | Usage |
|---|---|---|
| **Flat** | `none` | Muted chip, divider row |
| **Card** | `0 10px 24px rgba(24,32,29,0.04)` | Standard card/panel |
| **Elevated** | `0 12px 30px rgba(24,32,29,0.07)` | Hero section, focused card |
| **Sheet** | `0 -4px 24px rgba(24,32,29,0.08)` | Bottom sheet overlay |

Do **not** use multiple stacking shadows or colored shadows.

### 1.5 Border Radius

| Component | Radius | Value |
|---|---|---|
| Card / panel | 16px | `rounded-[16px]` |
| Inner section | 12px | `rounded-[12px]` |
| Button (primary) | 16px | `rounded-[16px]` |
| Button (secondary) | 12px | `rounded-[12px]` |
| Badge / chip | 100px | `rounded-full` |
| Progress bar | 100px | `rounded-full` |
| Icon container | 14px | `rounded-[14px]` |
| Input field | 12px | `rounded-[12px]` |
| Bottom nav item | 16px | `rounded-[16px]` |

Never mix `rounded-md` (8px) and `rounded-[16px]` in the same card hierarchy.

---

## 2. Component Hierarchy

### Card hierarchy

```
AppShell (page wrapper)
  └── PageHeader (title + subtitle)
  └── FinancialHero (primary metric — one per page)
  └── Section Card (rounded-[16px] border border-border bg-surface shadow-card)
       └── SectionHeader (font-bold text-base)
       └── MoneyFlowRow / DebtCard / TransactionRow ...
  └── ActionCard / NextActionCard
  └── EmptyState / ErrorState / SkeletonState
```

Rules:
- **One** `FinancialHero` per page.
- Cards never nest more than one level deep.
- Section cards always use `border border-border` — never `outline` or `ring`.
- Cards use `bg-surface` (`#FFFEFA`), not `bg-background`.

### Touch targets

| Element | Minimum height | Minimum width |
|---|---|---|
| Bottom nav item | 48px (`min-h-12`) | 48px |
| Primary button | 48px (`min-h-12`) | 100% or auto |
| Secondary button | 44px (`min-h-11`) | auto |
| Row action button | 44px (`min-h-11`) | 44px |
| Icon button | 44px × 44px | — |
| List row (tappable) | 48px (`min-h-12`) | — |
| Filter chip / tab | 44px (`min-h-11`) | auto |

All interactive elements set `touch-action: manipulation` (applied globally).

---

## 3. Financial Visual Language

### 3.1 Progress Bars

`ProgressBar` component takes `value` (0–100) and `tone`.

| State | Value | Visual | Tone token |
|---|---|---|---|
| Healthy | 0–74% | Solid `--primary` fill | `primary` |
| Near limit | 75–99% | Solid `--debt` fill | `debt` |
| Overspent | ≥100% | Solid `--overdue` fill + `aria-valuenow` clamped to 100 | `overdue` |
| Paid in full | 100% (debt) | Solid `--income` fill | `income` |

Accessibility spec:
```tsx
<div
  role="progressbar"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={Math.min(100, value)}
  aria-label={label}   // e.g. "ใช้ไปแล้ว 68% ของงบอาหาร"
  aria-describedby={descriptionId}
>
  {/* visual fill */}
</div>
```

The `aria-hidden` current on `ProgressBar` is wrong — it must be changed to a proper `role="progressbar"` with full ARIA attributes.

### 3.2 Money Flow Direction Indicators

In lists and summary cards, direction is communicated with:

1. **Sign prefix** (`+` / `−`) in a `<span aria-hidden>` sibling
2. **Icon** (optional): `TrendingUp` for income, `TrendingDown` for expense
3. **Color** (non-exclusive): `--income` / `--expense` / `--debt`
4. **Label** in the `aria-label` of the amount span: "รายรับ 12,450 บาท" vs "รายจ่าย 3,200 บาท"

### 3.3 Charts

TangLak does not yet have a chart library. Until one is added:

- **Use bar-like progress rows** (horizontal segments, labeled with percentage and absolute amount) instead of pie charts.
- **No sparklines** unless real historical data exists for ≥ 3 months.
- **All chart alternatives**: every visual chart must have a sibling `<table>` or text summary accessible to screen readers via `aria-hidden` on the visual and `aria-label` or `<caption>` on the table.

### 3.4 Icon Usage

Icons from **lucide-react** only.

| Context | Icon | Rule |
|---|---|---|
| Income transaction | `Banknote` | Always `aria-hidden` — amount label carries semantic |
| Expense transaction | `ReceiptText` | Same |
| Debt payment | `CreditCard` | Same |
| Food / delivery | `Utensils` / `Coffee` | Same |
| Travel | `TrainFront` | Same |
| Warning / overdue | `AlertTriangle` | Decorative only; warning text in DOM |
| Delete / remove | `Trash2` | Button must have `aria-label` |
| Add / create | `Plus` | Button must have `aria-label` |
| Upload | `ScanLine` | Nav label already visible |

All icon components receive `aria-hidden` unless they are the only content in a button (in which case the button needs `aria-label`).

---

## 4. Empty / Loading / Error States

### Empty states

```
EmptyState
  ├── Icon (optional, aria-hidden, ≥24px)
  ├── Title (font-bold, Thai)
  └── Body (text-sm text-text-secondary, Thai, actionable guidance)
```

Thai copy examples — see `FINANCE_UI_SYSTEM.md §6` (Thai copy section).

### Loading states

- **Fast path (< 300ms)**: Render nothing — avoid flicker.
- **Slow path (300ms–2s)**: Skeleton screens matching the layout of the real content.
- **Very slow (> 2s)**: `DelayedLoadingMessage` with `slowMessage`.
- **Error / retry**: Display `role="alert"` message with retry button.

Skeleton spec:
- Use `bg-muted animate-pulse rounded` blocks.
- Match skeleton height to real content height.
- Do **not** use placeholder text in skeletons.
- Each skeleton section gets `aria-hidden="true"` and a sibling `<span class="sr-only">กำลังโหลดข้อมูล...</span>`.

### Error states

```tsx
<div role="alert" aria-live="assertive" className="...">
  <p className="font-bold">เกิดข้อผิดพลาด</p>
  <p className="text-sm text-text-secondary mt-1">{message}</p>
  <button aria-label="ลองอีกครั้ง" onClick={retry}>ลองอีกครั้ง</button>
</div>
```

---

## 5. Mobile Safe Areas

```css
/* Applied via .safe-bottom class */
.safe-bottom {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
```

- Bottom navigation: `safe-bottom` + `pt-2`
- Page content: `pb-24` (96px) to clear the fixed bottom nav
- FAB (if used): `bottom-[calc(72px+env(safe-area-inset-bottom))]`

---

## 6. Thai Copy Specification

The following are canonical Thai strings. Implementations must use these exact strings.

| Situation | Thai copy |
|---|---|
| Budget healthy (< 75% used) | `"งบยังเหลือเยอะ ใช้จ่ายได้อีก ฿X,XXX"` |
| Budget near limit (75–99%) | `"ใกล้ถึงงบที่ตั้งไว้ เหลืออีก ฿X,XXX"` |
| Budget overspent | `"เกินงบไปแล้ว ฿X,XXX — ต้องปรับแผน"` |
| No budget set for category | `"ยังไม่ได้ตั้งงบหมวดนี้"` |
| No budget set for month | `"ยังไม่ได้ตั้งงบเดือนนี้"` |
| No transactions today | `"วันนี้ยังไม่มีรายการ — เพิ่มเองหรืออัปโหลดสลิป"` |
| No transactions in month | `"เดือนนี้ยังไม่มีรายการ"` |
| Unallocated income exists | `"รายรับที่ยังไม่ได้จัดสรร ฿X,XXX"` |
| Debt due in N days | `"ต้องชำระอีก {N} วัน"` |
| Debt due today | `"ครบกำหนดวันนี้"` |
| Debt overdue | `"เกินกำหนดชำระ {N} วัน — ควรติดต่อเจ้าหนี้"` |
| Negative value validation | `"จำนวนเงินต้องมากกว่าศูนย์"` |
| Imported transaction | `"นำเข้าจากสเตทเมนต์ · {date}"` |
| AI-derived, needs review | `"ข้อมูลจาก AI — กรุณาตรวจสอบก่อนบันทึก"` |
| AI confidence low | `"ความมั่นใจต่ำ — โปรดตรวจสอบค่าที่ถูกไฮไลต์"` |
| First-time empty dashboard | `"เริ่มต้นด้วยการเพิ่มรายรับ หรืออัปโหลดสลิปแรกของคุณ"` |
| Generic loading | `"กำลังโหลด..."` |
| Slow loading | `"ใช้เวลานานกว่าปกติ..."` |
| Network error | `"ไม่สามารถโหลดข้อมูลได้ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต"` |

---

## 7. Accessibility Baseline

All implementations must pass these without exception.

| Requirement | Standard | Enforcement |
|---|---|---|
| Text contrast (normal) | ≥ 4.5:1 | `--text-secondary` fixed to `#5F6B66` |
| Text contrast (large / bold ≥ 18px) | ≥ 3:1 | Verified per-component |
| Touch targets | ≥ 44×44px | `min-h-11` minimum on all interactive elements |
| Screen reader money announcements | `aria-label="X,XXX.XX บาท"` | Always on `MoneyAmount` |
| Progress bar semantics | `role="progressbar"` + aria values | `ProgressBar` must be updated |
| Form label association | `htmlFor` + `id` | All inputs |
| Dialog focus trapping | Focus stays inside open dialog | `MobileBottomSheet` and `ConfirmDialog` |
| Escape to close | Closes modal on Escape key | Same components |
| Alert announcement | `role="alert"` on errors | All inline error components |
| Reduced motion | No animation when `prefers-reduced-motion: reduce` | CSS `@media` query on all transitions |
| Skip links | `"ข้ามไปยังเนื้อหา"` at page top | `AppShell` |
| Non-color status signals | Icon + text accompanies every color signal | All status badges |

---

## 8. Implementation Phases

### Phase A — Design tokens and primitives
- Update `globals.css` with corrected and new tokens
- Update `ProgressBar` with `role="progressbar"` and full ARIA
- Update `MoneyAmount` aria-label format
- Add `sr-only` utility usage guidelines
- Add `skip-link` to `AppShell`
- Fix `--text-secondary` contrast value

### Phase B — Dashboard refresh
- Redesign `/today` (Dashboard) per `FINANCE_DASHBOARD_UX.md`
- Redesign `/overview` with monthly cash-flow summary
- Implement `FinancialHero` v2 with budget progress bar

### Phase C — Monthly budget UI
- New `/budget` route and design per `MONTHLY_BUDGET_UX.md`
- Monthly income setup
- Category budget rows with spend progress
- Copy-previous-month flow
- Overspent behavior

### Phase D — Transactions and debt polish
- Transaction list hierarchy refinements
- Import/AI indicators on `TransactionRow`
- `DebtCard` overdue state redesign
- Bottom navigation badge for attention items

---

## 9. What Not to Build

| Item | Reason |
|---|---|
| Dark mode | Not in scope; warm off-white palette is the brand identity |
| Gamification (streaks, badges) | Contradicts trustworthy/calm character |
| Animated number counters | Distracting; violates reduced-motion principle |
| Gradient fills on cards | Neon fintech aesthetic |
| Dashboard "score" or "health index" | Misleading aggregate metric without actuarial backing |
| Expandable sparklines | No real historical data yet |
| Push notifications (UX layer) | Server-side concern, not UI system |
