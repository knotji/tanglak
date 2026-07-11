# TangLak: Debt Cycle Acceptance Criteria

This document defines the Quality Gates and Acceptance Criteria (AC) for the lifecycle states, new cycle transitions, payment linking, and accessibility compliance.

---

## 1. Functional Acceptance Criteria

### AC 1.1: Creating the First Cycle
*   **Trigger**: A new debt is created. The UI must prompt the user to configure their first billing cycle.
*   **Behavior**: Saving the cycle fields (`ยอดเรียกเก็บ`, `ยอดขั้นต่ำ`, `วันตัดรอบ`, `วันครบกำหนด`) creates the first active cycle entry under the debt record, initializing the `amountPaidThisCycle` to `0`.

### AC 1.2: Partial Payment State
*   **Condition**: User logs a transaction of type `debt_payment` with an amount greater than `0` but strictly less than `minimumPayment`.
*   **Behavior**: The system updates the status of the current billing cycle to `จ่ายบางส่วน` (Partially Paid). 
*   **Dashboard Visual**: The progress bar updates to display the partial progress but the warning alert "ยังชำระไม่ถึงยอดขั้นต่ำ" remains visible.

### AC 1.3: Minimum Met State
*   **Condition**: User logs payments where the sum of `amount` is `>= minimumPayment` but `< statementBalance`.
*   **Behavior**: The cycle status updates to `จ่ายขั้นต่ำแล้ว` (Minimum Met).
*   **Notification**: The warning alerts for late fees are dismissed. A positive visual badge "✓ ชำระขั้นต่ำแล้ว" displays on the dashboard.

### AC 1.4: Amount Due Fully Paid State
*   **Condition**: Sum of payments `amount` logged in the active cycle is `>= statementBalance`.
*   **Behavior**: The cycle status updates to `จ่ายยอดเรียกเก็บครบแล้ว` (Fully Paid).
*   **Net Worth update**: The outstanding balance decreases by the total paid amount.

### AC 1.5: Overdue State
*   **Condition**: The system clock surpasses the cycle's `dueDate` and the sum of payments made is `< minimumPayment`.
*   **Behavior**: The cycle status triggers as `เกินกำหนด` (Overdue).
*   **Dashboard Visual**: A high-visibility critical alert banner (rose background, red text) is injected on `/today` and `/debts`.

### AC 1.6: Cycle Rollover Confirmation
*   **Trigger**: Current date passes the active cycle's statement/cycle date.
*   **Behavior**: The UI must display an "อัปเดตรอบบิลใหม่" action card. It must **not** auto-rollover.
*   **Rollover Submission**: When the user enters the new cycle metrics and submits:
    *   The previous cycle status, payments, and statement details must be locked and appended to the **History table**.
    *   A new active cycle is instantiated with a clean `paidThisCycle = 0` counter.
    *   Past payments are **not** deleted or modified.

### AC 1.7: No Statement Yet State
*   **Trigger**: User taps "ยังไม่มีใบแจ้งหนี้รอบใหม่" during rollover.
*   **Behavior**: The rollover action card collapses. The UI extends the current cycle parameters temporarily for up to 7 days, maintaining existing payment access.

### AC 1.8: Editing an Active/Historical Cycle
*   **Behavior**: Editing values of an active cycle updates all current calculations. Editing a historical cycle:
    *   Must not modify current cycle dates.
    *   Recalculates the historical row data.
    *   Adjusts the current total outstanding balance relative to the difference in the edited historical amounts.

### AC 1.9: Linking a Late Payment
*   **Condition**: A user logs a payment check slip that occurred in a previous cycle's date range, but links it after that cycle is closed.
*   **Behavior**: The system matches the transaction timestamp, assigns it to the historical cycle, and updates the historical cycle's `paid` total. The outstanding balance is adjusted down, and a note "ชำระย้อนหลัง" is appended.

### AC 1.10: Closing a Debt Account
*   **Condition**: User pays off the debt completely (`outstandingBalance <= 0`).
*   **Behavior**: The status changes to `ปิดหนี้แล้ว`. The account is archived from the active dashboard and no longer triggers cycle alerts.

---

## 2. Accessibility (WCAG 2.1 AA Compliance)

*   **Semantic Headings**: Summary headers must use a hierarchical structure starting with `<h1>` for page titles and sequential `<h2>`/`<h3>` for nested cards.
*   **Non-Color Status Cues**: Status alerts must not rely solely on color to communicate urgency:
    *   *Correct*: `❌ เกินกำหนดชำระ! (เกินมา 3 วัน)` (Combines icon, warning prefix, and clear duration).
    *   *Violation*: Just showing a red dot next to the due date.
*   **Touch Targets**: All buttons, form fields, and clickable cells in the history grid must be at least `44px by 44px`.
*   **Aria-live Announcements**: Form errors and validation status blocks must dynamically alert screen readers using `aria-live="assertive"`.
*   **Screen Reader Copy for Progress**: Progress indicators must define an explicit `aria-label` stating: `ชำระแล้ว [X] บาท จากยอดเรียกเก็บ [Y] บาท`.
