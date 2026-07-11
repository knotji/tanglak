# Acceptance Criteria: History Import Review Board

This document defines the official, implementation-ready acceptance criteria for the History Import Review UX redesign.

---

## 1. Selection Model: "Exclude by Default"

### AC 1.1: Default Selection State
- **Given** a user has uploaded a statement and is on the History Import Review screen,
- **When** the page loads,
- **Then** all rows that do not have critical errors or duplicate statuses MUST be pre-selected for import.
- **And** the total selected count (displayed in the sticky bottom panel) MUST equal the number of these valid transactions.

### AC 1.2: Negative Selection Toggle ("Exclude This Transaction")
- **Given** a transaction row in the list,
- **When** the user clicks the checkbox (framed as "ไม่นำเข้ารายการนี้" / Exclude this transaction),
- **Then** the row's state MUST toggle between "นำเข้า" (Import) and "ไม่นำเข้า" (Skip).
- **And** when marked as "ไม่นำเข้า" (Skip):
  - The row's visual opacity MUST reduce to `50%`.
  - A strike-through styling MUST apply to the description, category, and transaction amount.
  - The sticky bottom panel counts and sums MUST update instantly.

### AC 1.3: Bulk Toggles
- **Given** the list of rows,
- **When** the user clicks the "เลือกทั้งหมด" (Select All) button,
- **Then** all currently visible (filtered) rows MUST be set to "นำเข้า" (Import).
- **When** the user clicks "ยกเลิกทั้งหมด" (Exclude All),
- **Then** all currently visible (filtered) rows MUST be set to "ไม่นำเข้า" (Skip).

---

## 2. Viewport-Sticky Review Summary

### AC 2.1: Floating Placement & Safe Areas
- **Given** the user scrolls the page vertically,
- **Then** the Review Summary action bar MUST remain fixed at the bottom edge of the viewport.
- **And** it MUST feature layout padding matching `env(safe-area-inset-bottom)` to prevent overlaps with native OS overlays on mobile devices.

### AC 2.2: Keyboard Resizing
- **Given** the virtual keyboard is open (e.g. user is editing a field or typing in search),
- **Then** the sticky bottom bar MUST hide (`display: none` or transition out of view) to avoid occupying screen height.
- **And** it MUST reappear instantly when the keyboard is closed.

### AC 2.3: Real-Time Accounting
- **Given** the sticky bottom bar is visible,
- **Then** it MUST display the sum of debit and credit amounts strictly calculated from rows set to "นำเข้า" (Import).
- **And** any changes in row selection MUST update the displayed sums within 50ms.

---

## 3. Filter Chips & Search

### AC 3.1: Horizontal Scrolling
- **Given** a viewport width of 360px,
- **Then** the filter chips container MUST scroll horizontally without wrapping items or causing page overflow.

### AC 3.2: Dynamic Row Counter Badges
- **Given** the filter chips layout,
- **Then** each chip MUST display a count badge matching the current number of rows matching that specific filter.
- **And** counts MUST update instantly if a transaction's properties are modified (e.g., category is assigned, or a row is excluded).

### AC 3.3: Text Search Debouncing
- **Given** a text input in the search field,
- **When** the user types search queries,
- **Then** the list MUST filter rows whose description or merchant string matches the query.
- **And** the matching MUST be debounced by 150ms to prevent browser lag.

### AC 3.4: Quick Navigation Jumps
- **Given** the user is viewing a long list of rows,
- **When** the user clicks the "ถัดไป" (Next Warning) button,
- **Then** the viewport MUST scroll smoothly to align the next transaction containing warnings/errors to the top of the visible screen.
- **And** if `prefers-reduced-motion` is active, the scroll transition MUST be instantaneous.

---

## 4. Row Density & Progressive Disclosure

### AC 4.1: Default Compact Render
- **Given** a list of transactions,
- **Then** each row MUST render collapsed by default with a height not exceeding `64px`.
- **And** edit forms/inputs MUST NOT be rendered until the row is explicitly expanded.

### AC 4.2: Inline Expansion
- **Given** a transaction row,
- **When** the user clicks on the row body (excluding the checkbox target),
- **Then** the row MUST expand inline to reveal full edit forms (Merchant Name, Category Dropdown, Type, Account Select).
- **And** all other rows MUST remain compact unless already expanded.

### AC 4.3: Auto-Expansion on Errors
- **Given** the review page loads,
- **Then** any row with `invalid` status (e.g., missing mandatory category or amount) MUST render expanded by default so the user is immediately aware of required corrections.

---

## 5. Multi-Phase Import Progress

### AC 5.1: Concrete Progress Stages
- **Given** the user clicks the "นำเข้า [X] รายการ" button,
- **Then** a progress modal MUST open over the viewport.
- **And** it MUST display the active stage label:
  - `เตรียมรายการ` -> `บันทึกธุรกรรม` -> `ตรวจรายการซ้ำ` -> `สรุปผล`
- **And** fake percentages (e.g. mock progress bars advancing at random speeds) MUST NOT be used.

### AC 5.2: Slow Server Alerts
- **Given** the import is processing,
- **When** the active stage takes longer than 5 seconds,
- **Then** the text *"กำลังนำเข้าข้อมูลจำนวนมาก โปรดอย่าปิดหน้าจอนี้"* MUST be appended under the spinner.
- **When** the active stage exceeds 15 seconds,
- **Then** the text *"เซิร์ฟเวอร์ใช้เวลานานกว่าปกติ ระบบยังคงประมวลผลอยู่"* MUST be appended.

### AC 5.3: Fault Tolerant Resume
- **Given** a network failure or server timeout during import,
- **Then** the progress overlay MUST display an error state explaining the failure.
- **And** a "ลองอีกครั้ง" (Retry) button MUST be available.
- **When** clicked, the import action MUST resume from the index of the last uncommitted transaction.

---

## 6. Post-Import Summary & Rollbacks

### AC 6.1: Summary Card Display
- **Given** an import has completed,
- **When** the user is redirected to the Summary screen,
- **Then** the page MUST display exact counts for:
  - Successful imports.
  - Skipped duplicates.
  - Manual exclusions.
  - Failures.
- **And** the total credit/debit sum of the imported batch MUST be displayed.

### AC 6.2: Action Navigation
- **Given** the Summary screen,
- **When** the user clicks "ดูรายการที่เพิ่งนำเข้า" (View Imported Transactions),
- **Then** the app MUST redirect to `/transactions` with the date filter set to the imported batch's month.
- **When** the user clicks "กลับไปตรวจรายการที่เหลือ",
- **Then** the app MUST redirect back to the review board displaying only skipped/unresolved rows.

### AC 6.3: One-Click Rollback
- **Given** the Summary screen,
- **When** the user clicks "ย้อนกลับชุดนำเข้า" (Rollback Batch) and confirms the modal warning,
- **Then** the app MUST call `deleteBatchAction`, deleting all transactions created by this batch.
- **And** redirect the user back to the upload page with a success notification: *"ย้อนกลับการนำเข้าชุดข้อมูลสำเร็จแล้ว"*.

---

## 7. Accessibility Standards (A11y)

### AC 7.1: Live Announcements
- **Given** the user selects or deselects rows,
- **Then** the screen reader MUST announce the updated count, e.g. *"เลือกนำเข้า 219 รายการ"*.
- **And** this text element MUST have `aria-live="polite"`.

### AC 7.2: Touch Targets
- **Given** the mobile viewports,
- **Then** all interactive elements (checkboxes, filters, navigation arrows, buttons) MUST have a minimum touch target size of `44px x 44px`.

### AC 7.3: Keyboard Focus Traps
- **Given** the filter tab selection changes,
- **Then** keyboard focus MUST be programmatically shifted to the first transaction row in the updated list.
