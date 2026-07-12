# TangLak: Manual Smoke Test Specification

This document provides the manual smoke test checklist to validate the slip-first entry model and active-cycle debt-planning behavior in the deployed application.

---

## Part H — Live Manual Smoke Test Checklist

Follow these verification steps in a web browser using responsive developer tools (360px, 390px, and 430px viewports).

### 1. Upload Landing & Entry Routes
*   [ ] **Slip-First Upload Landing (`/upload`)**:
    *   Navigate to `/upload` (or tap the floating action button from `/today`).
    *   Verify that the screen leads with quick-select options for: `สลิปโอนเงินออก`, `สลิปรับเงิน`, `ใบเสร็จ/ค่าอาหาร`, and `สลิปชำระหนี้/บัตร`.
    *   Verify the primary button copy is **`อัปโหลดสลิป`**.
    *   Verify the secondary button copy is **`เพิ่มรายการเอง`**.
    *   Confirm that statement imports are **not** promoted on this screen.
*   [ ] **Legacy Import Deprecation Route (`/history-import`)**:
    *   Directly navigate to `/history-import`.
    *   Verify that the deprecation header displays: **`เราเปลี่ยนวิธีการจัดการข้อมูลเพื่อชีวิตที่ง่ายขึ้น`**.
    *   Confirm that the page details the change to slip-first day-to-day entries.
    *   Confirm the presence of three action CTAs: `อัปโหลดสลิป` (Redirects to `/upload`), `เพิ่มรายการเอง` (Opens manual form), and `กลับหน้าวันนี้` (Returns to `/today`).
*   [ ] **Settings Page & Settings Data (`/settings/data`)**:
    *   Navigate to `/settings/data`.
    *   Verify that history items can still be browsed, unconfirmed batches can be reviewed/deleted, and completed batches can still be rolled back (proving legacy rollback backend functions).
    *   Confirm that any new import CTA is labeled clearly as legacy or visually demoted below slip-first options.
    *   Verify that previously imported statement history remains fully visible under the user's transactions list.

---

### 2. Manual Transaction & Invariants
*   [ ] **Manual Transaction Entry**:
    *   Navigate to the manual transaction entry form (`/transactions` -> click `เพิ่มรายการเอง`).
    *   Select type **`ชำระหนี้`** (Debt Payment).
    *   Verify that a required **`เลือกบัญชีหนี้`** dropdown appears.
    *   Attempt to submit the form without selecting a debt account. Verify that validation blocks save and highlights: **`กรุณาเลือกบัญชีหนี้ที่ต้องการชำระ`**.
    *   Submit a valid payment linked to an active debt. Confirm the cashflow updates on `/today`.

---

### 3. Document Review & Intent Recognition
*   [ ] **Upload Slip and Review**:
    *   Upload a bank transfer slip.
    *   Land on `/upload/review/[documentId]`.
    *   Verify the AI-extracted fields: Amount (จำนวนเงิน), Date/Time (วันที่และเวลา), and Merchant/Recipient (ผู้รับเงิน / ร้านค้า).
    *   Verify that if the AI confidence is low, a warning banner appears: **`AI ไม่แน่ใจข้อมูลบางส่วน`** and the relevant fields are highlighted.
*   [ ] **Debt Payment Slip Linkage**:
    *   Upload a transfer slip representing a credit card payment.
    *   Confirm the AI categorizes the document intent as `ชำระหนี้หรือบัตร`.
    *   Verify that the dropdown **`ชำระให้กับบัญชีหนี้`** is pre-selected or prompts for selection.
    *   Attempt to save with type `ชำระหนี้` but no linked debt. Confirm the app blocks saving.
    *   Select a valid user-owned debt and click **`ยืนยันความถูกต้อง`**.

---

### 4. Active Cycle & Debt Progress Updates
*   [ ] **Paid This Cycle Recalculation**:
    *   Confirm that the linked payment updates the debt's **`จ่ายแล้วรอบนี้`** amount.
    *   Confirm that the **`เหลือขั้นต่ำ`** (Remaining Minimum) decreases by the paid amount.
    *   Confirm that the **`ยอดหนี้ทั้งหมด`** (Total Outstanding Balance) **does not change automatically**.
    *   Verify the disclaimer is visible: **`การบันทึกการชำระจะไม่ปรับยอดหนี้ทั้งหมดอัตโนมัติ กรุณาอัปเดตยอดล่าสุดจากแอปหรือใบแจ้งหนี้ของผู้ให้บริการ`**.
*   [ ] **Due Today Copy & Alert Check**:
    *   On `/today`, look at the next-action card for a debt due today.
    *   Verify the title copy is: **`ครบกำหนดชำระวันนี้`** (not "due in 0 days" or alarmist language).
    *   Verify that only **one** prioritized next-action card is shown on Today, with secondary urgent items consolidated into the summary line: **`ยังมีอีก [N] รายการที่ต้องจัดการ`**.

---

### 5. Debt Closure & Completed Installments
*   [ ] **Zero Outstanding Check**:
    *   Edit a debt's total outstanding balance and set it manually to `0`.
    *   Verify that the status badge updates to **`รอตรวจสอบปิดหนี้`** (not automatically closed).
    *   Verify that the primary CTA changes to **`ตรวจสอบปิดหนี้`**.
    *   Tap the button. Verify the confirmation modal displays: **`ตรวจสอบยอดล่าสุดจากผู้ให้บริการแล้วหรือยัง อาจยังมีดอกเบี้ย ค่าธรรมเนียม หรือรายการรอดำเนินการ...`**.
    *   Click **`กลับไปตรวจสอบ`** to verify it cancels.
    *   Open the modal again and click **`ยืนยันปิดหนี้`**. Verify the badge changes to **`ปิดหนี้แล้ว`** and the form becomes read-only.
*   [ ] **Completed Installments**:
    *   For an installment plan, run a cycle rollover where the remaining installment count becomes `0`.
    *   Verify the account transitions to `รอตรวจสอบปิดหนี้` rather than auto-closing, allowing the user to update the balance or confirm closure.

---

### 6. Responsive Viewport Check
*   [ ] **360px (Samsung Galaxy)**: Confirm currency values (e.g. `฿120,500.00`) auto-scale and do not cause horizontal page overflow or text clippings. Action buttons stack vertically.
*   [ ] **390px (iPhone 12/13/14)**: Confirm input boxes align with label headers. The virtual keyboard does not block form action links.
*   [ ] **430px (iPhone Pro Max)**: Card grids maintain relative padding without looking stretched.
