# TangLak: Debt Cycle Lifecycle Test Matrix

This document defines the manual QA test matrix to validate the debt cycle lifecycle states, edge cases, date boundaries, and viewport reflow.

---

## 1. QA Test Scenarios

| Case ID | Feature / Area | Precondition | Input / Actions | Expected Behavior | Viewport Width |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | **Onboarding / Cycle Setup** | New debt card exists, no cycle. | 1. Open setup form. <br>2. Fill all fields with valid amounts. <br>3. Save. | Cycle is successfully initialized. Status displays `รอการชำระเงิน`. | 360px, 390px, 430px |
| **TC-02** | **Zero-interest card** | New credit card setup. | 1. Enter `0%` interest. <br>2. Submit form. | Account is created. Displays `ดอกเบี้ย 0% ต่อปี` on summary. Sorted at the bottom of Avalanche priority. | 360px |
| **TC-03** | **Malformed values check** | Setup form open. | 1. Input alphabetic text into currency fields. <br>2. Input `-15%` into interest. <br>3. Click Submit. | Validation errors display next to the target fields. Form submission is blocked. | 360px, 390px |
| **TC-04** | **Minimum > Amount Due validation** | Setup form open. | 1. Enter `฿5,000` statement balance. <br>2. Enter `฿6,000` minimum due. <br>3. Submit. | Form blocks submission. Validation alerts: "ยอดชำระขั้นต่ำไม่สามารถมากกว่ายอดเรียกเก็บในรอบนี้ได้". | 390px |
| **TC-05** | **Bangkok Timezone Boundary** | Active cycle due date set to `2026-07-12`. | 1. Current clock is `2026-07-12T00:05:00+07:00` (Bangkok). | The status updates immediately to `🚨 ครบกำหนดชำระวันนี้!`. Checks must be validated at local UTC+7 time, not UTC. | 390px |
| **TC-06** | **Two debts, same due date** | Two active card accounts: KTC and Citi. | 1. Set due dates of both to the same day. <br>2. Observe `/today` next actions. | Both cards display their respective next action cards on the dashboard, prioritized by interest rate descending. | 360px, 390px, 430px |
| **TC-07** | **Concurrent payments** | Active cycle. | 1. Log payment 1 (฿1,000) from slip. <br>2. Concurrently log payment 2 (฿1,000) manually in another tab. | Values sum up correctly: total paid becomes ฿2,000. No race conditions or database overrides occur. | 430px |
| **TC-08** | **Reopened/Edited cycle** | Past cycle is closed and visible in history. | 1. Click "แก้ไขประวัติ" for a closed cycle. <br>2. Change paid amount from ฿2,000 to ฿3,000. <br>3. Click Save. | The history table updates the row. The total outstanding balance of the debt decreases by ฿1,000. Current cycle remains unaffected. | 390px, 430px |
| **TC-09** | **Late payment linkage** | Previous cycle was closed with a status of `จ่ายบางส่วน`. | 1. Upload a late slip with a date belonging to the previous cycle. <br>2. Match the transaction to the previous cycle. | Previous cycle's status recalculates (e.g. to `จ่ายขั้นต่ำแล้ว` if the threshold is met). The history table updates to reflect the change. | 390px, 430px |
| **TC-10** | **Outstanding Balance < Amount Due** | Debt outstanding balance is ฿2,000. | 1. Try to set statement amount due to ฿3,000. <br>2. Submit form. | Alert displays: "ยอดเรียกเก็บมากกว่ายอดหนี้ทั้งหมด กรุณาตรวจสอบยอดหนี้ล่าสุดของคุณ" but allows saving (warning state). | 390px |

---

## 2. Responsive Viewport Layout Validation Checklist

### Viewport: 360px (Samsung Galaxy S20 / S8)
*   [ ] **Text Overflow**: High-value amounts (e.g. `฿250,000.00`) auto-scale and do not trigger horizontal scrolling or line wrap breaks.
*   [ ] **Reflow Cards**: Historical cycle rows collapse dynamically into small stacked cards instead of displaying as a wide table.
*   [ ] **Button Stacking**: All action items stack vertically. No two buttons occupy the same row if text is truncated.

### Viewport: 390px (iPhone 12 / 13 / 14)
*   [ ] **Interactive Area spacing**: Verify touch target hit size is at least 44x44px for the history details disclosure arrow.
*   [ ] **Form Elements**: Confirm input text inputs line up with form labels under soft vertical stacking rules.

### Viewport: 430px (iPhone 15 Pro Max)
*   [ ] **Dashboard Margin**: Cards use balanced padding (`p-6`) to prevent empty gaps on wide mobile containers.
