# TangLak: Debt Cycle Acceptance Criteria

This document defines the Quality Gates and Acceptance Criteria (AC) to validate the safe payment semantics and manual cycle controls in TangLak.

---

## 1. Dashboard Action & Urgency Logic

### AC 1.1: Single Primary Action Card
*   **Condition**: Multiple debts have active or urgent notifications.
*   **Behavior**: The `/today` screen must render exactly **one** next-action card representing the single highest-priority debt.
*   **Priority ranking**:
    1. Overdue Minimum
    2. Due Today
    3. Due Soon
    4. Minimum Not Met
    5. Cycle Update Required
    6. No Due Date Data
*   **Tie-breaking**: Tie-breaks must resolve using: (1) larger remaining minimum, (2) earlier due date, (3) higher interest, (4) debt creation order.

### AC 1.2: Secondary Debt Summary Bar
*   **Condition**: Multiple debts require action, and the primary card is rendered.
*   **Behavior**: A secondary text bar must be displayed below the primary card showing: `"ยังมีอีก [N] รายการที่ต้องจัดการ"`.
*   **Action**: Clicking the bar must navigate the user directly to the `/debts` summary list page. No competing cards can be shown.

---

## 2. Safe Payment Semantics

### AC 2.1: Total Outstanding Balance Preservation
*   **Condition**: User records a payment (full, partial, or overpaid) linked to a debt.
*   **Behavior**: The payment must **never** automatically decrease or change the debt's `outstandingBalance`, `creditLimit`, `interestRate`, or next cycle's statement amount.
*   **Recalculation Scope**: The payment updates only:
    *   `paidThisCycle`
    *   `remainingMinimum`
    *   `remainingStatement`
    *   Cycle payment status badge (e.g. `จ่ายขั้นต่ำแล้ว`)

### AC 2.2: Explanatory Copy Prominence
*   **Behavior**: The transaction review screen and debt details screen must prominently display:
    `"การบันทึกการชำระจะไม่ปรับยอดหนี้ทั้งหมดอัตโนมัติ กรุณาอัปเดตยอดล่าสุดจากแอปหรือใบแจ้งหนี้ของผู้ให้บริการ"`

---

## 3. Late-Linked Payments

### AC 3.1: Historical Recalculation Only
*   **Condition**: User retroactively links a payment matching a closed billing cycle's date range.
*   **Behavior**:
    *   The transaction is mapped to the historical cycle.
    *   The historical cycle's `paid` total, `remainingMinimum`, and `remainingStatement` are recalculated.
    *   The historical cycle's status badge is updated (e.g. from `จ่ายบางส่วน` to `จ่ายขั้นต่ำแล้ว`).
*   **Scope Boundaries**: The current cycle's statement balance, due date, cycle dates, and the overall debt's total outstanding balance must remain completely unaffected.
*   **Metadata tracking**: System logs: `transactionDate`, `dateLinked`, `affectedCycleId`, `previousStatus`, `recalculatedStatus`.
*   **Audit Note display**: An audit alert must display next to the retroactive payment:
    `"รายการนี้ถูกเพิ่มย้อนหลัง สถานะรอบบิลอาจเปลี่ยนตามวันที่ชำระ ค่าปรับหรือดอกเบี้ยที่เกิดขึ้นจริงให้ตรวจสอบจากผู้ให้บริการ"`

---

## 4. Manual Debt Closure & Completed Installments

### AC 4.1: No Auto-Closure
*   **Behavior**: An active debt account must **never** transition to closed automatically, even if `outstandingBalance == 0`, `paidThisCycle >= statementAmount`, or remaining installments reaches `0`.
*   **Transition to Pending Review**: When `outstandingBalance` becomes `0` or `remainingInstallments` becomes `0`, the account state shifts to `pending_close_review` (`รอตรวจสอบปิดหนี้`).

### AC 4.2: Explicit Closure Confirmation Modal
*   **Trigger**: User taps the `ตรวจสอบปิดหนี้` button.
*   **Modal Behavior**: Opens a confirmation dialog.
*   **Modal Copy**:
    *   Title: `"ตรวจสอบยอดล่าสุดจากผู้ให้บริการแล้วหรือยัง"`
    *   Body: `"อาจยังมีดอกเบี้ย ค่าธรรมเนียม หรือรายการรอดำเนินการค้างอยู่ กรุณายืนยันเมื่อยอดหนี้จริงเป็นศูนย์"`
    *   Primary CTA: `"ยืนยันปิดหนี้"`
    *   Secondary CTA: `"กลับไปตรวจสอบ"`
*   **Closure Execution**: Tapping `ยืนยันปิดหนี้` transitions the account state to `closed` (read-only).

### AC 4.3: Negative Outstanding Balance Rejection
*   **Behavior**: If a user attempts to update the outstanding balance to a negative value ($< 0$), the form input must reject the value and throw a validation error: `"ยอดหนี้ไม่สามารถติดลบได้"`.

### AC 4.4: Post-Closure Properties
*   **Visibility**: Closed debt profiles and full cycle history records must remain visible under the history section for audit.
*   **Late Linkage**: Users can link payments retroactively to a closed debt, but the UI must warn: `"บัญชีหนี้ปิดแล้ว"`.
*   **Reopening Block**: Reopening a closed debt is disabled in Phase 1 (displays: `"TangLak ยังไม่รองรับการเปิดบัญชีหนี้ใหม่จากการปิดไปแล้ว ในเวอร์ชันนี้"`).

---

## 5. Billing Cycle Rollovers
*   **AC 5.1: Manual Rollovers**: Rolling over to a new cycle requires manual input. The system must not auto-reset or pre-calculate statement values for subsequent periods.
