# TangLak: Slip & Debt Acceptance Criteria

This document defines the Quality Gates and Acceptance Criteria (AC) that must be satisfied before the new Slip-First and Debt Setup features can be promoted to production.

---

## 1. Upload Landing & Intent Detection Criteria

### AC 1.1: Landing UI & CTAs
*   **Primary Action**: The `อัปโหลดสลิป` (Upload Slip) button must be the most visually prominent element. Touch targets must be at least 44px by 44px (recommended 56px+ on mobile viewports).
*   **Secondary Action**: The `เพิ่มรายการเอง` (Add Manually) button must be rendered as an outlined secondary button.
*   **Current Month Focus**: The page header must show an explanatory card informing the user that they can begin tracking from this month without historical imports.
*   **No Statement Promotion**: No legacy bank statement upload or CSV historical imports may be promoted, linked, or suggested in the `/upload` path.

### AC 1.2: Intent Recognition Routing
*   **โอนเงินออก (Transfer Out)**: If a slip is classified as a transfer out, the system must populate the transaction amount, date/time, and recipient, defaulting the transaction type to "รายจ่าย" (Expense).
*   **รับเงิน (Transfer In)**: If a slip is classified as a transfer in, the system must set the type to "รายรับ" (Income) and populate the amount and sender's name.
*   **ใบเสร็จ/รายจ่าย (Receipt)**: If an image is a store receipt, the type must default to "รายจ่าย" (Expense) and attempt to extract line items if possible.
*   **ชำระหนี้หรือบัตร (Debt/Card Payment)**: The system must automatically prompt the user to link the payment to an active debt account, defaulting the type to "ชำระหนี้" (Debt Payment).
*   **ไม่แน่ใจ (Unsure)**: The review form must display an alert banner `AI ไม่แน่ใจข้อมูลบางส่วน` and highlight fields with confidence scores lower than 0.7.

---

## 2. Debt Setup Form Criteria

### AC 2.1: Field Validations & Rules
*   **Required Fields**: `ชื่อหนี้/ผู้ให้บริการ`, `ยอดหนี้ทั้งหมด`, `ยอดเรียกเก็บรอบนี้`, `ยอดชำระขั้นต่ำ`, `อัตราดอกเบี้ยต่อปี`, `วันครบกำหนดชำระ`, and `วันสรุปรอบบัญชี` must throw inline validation errors if left empty upon form submission.
*   **Optional Fields**: `วงเงินเครดิตสูงสุด` must accept blank or zero values without throwing errors.
*   **Jargon Limitation**: Help text and tooltips must avoid banking terminology like "Principal", "Amortization", or "APR" in favor of descriptive Thai phrases (e.g. "ยอดหนี้คงเหลือ", "ตารางชำระเงิน", "ดอกเบี้ยต่อปี").
*   **Field Constraints**:
    *   `interestRateAnnual` must accept values down to `0` (for interest-free installment cards).
    *   `minimumPayment` must be validated to be less than or equal to `outstandingBalance`. If it is higher, the form must show a warning: "ยอดขั้นต่ำต้องไม่เกินยอดหนี้ทั้งหมด".

---

## 3. Monthly Debt Summary Logic & Calculations

The summary dashboard must compute the following metrics using real-time transactions:

*   **หนี้ทั้งหมด (Total Outstanding)**: Sum of `outstandingBalance` of all active debts.
*   **ต้องจ่ายเดือนนี้ (Due This Month)**: Sum of `statementBalance` (amount due this cycle) for all active debts.
*   **ขั้นต่ำรวม (Total Minimum Due)**: Sum of `minimumPayment` for all active debts.
*   **จ่ายแล้ว (Paid So Far)**: Sum of transactions of type `debt_payment` made to the active debts within the current billing cycle.
*   **เหลือขั้นต่ำ (Remaining Minimum Due)**: Computed as `max(0, Total Minimum Due - Paid So Far)`. Once it reaches `0`, the status must update to `ชำระขั้นต่ำแล้ว`.
*   **ใกล้ครบกำหนด (Due Soon)**: Debts where the due date is within 3 days and `amountPaidThisCycle < statementBalance`.
*   **เกินกำหนด (Overdue)**: Debts where the current date is past the due date and `amountPaidThisCycle < minimumPayment`.

---

## 4. Accessibility (WCAG 2.1 AA Compliance)

*   **Semantic Form Inputs**: Every field in the Debt Setup and Review forms must have a matching `<label>` element with a corresponding `htmlFor` attribute.
*   **Focus Trapping**: Any bottom sheets or modal dialogs used on mobile for category selection or date pickers must trap focus when active.
*   **Live Error Announcements**: Any validation errors or low confidence AI warnings must use `role="alert"` or be wrapped in `aria-live="polite"` elements.
*   **Contrast & Touch Targets**: Text elements must satisfy the 4.5:1 contrast ratio against the background. Touch targets must have a minimum interactive hit area of 44px by 44px.

---

## 5. Visual Styling Standards

*   **No Primary Green**: The application must not use green as a primary brand or dashboard highlight color. Use slate, indigo, deep navy, or warm charcoal.
*   **Alert Color Scale**:
    *   *Muted/Safe*: Slate / Gray (due later).
    *   *Warning*: Amber / Orange (due soon / due today).
    *   *Critical*: Soft Red / Rose (overdue).
    *   *Success*: Indigo / Blue (fully paid).
