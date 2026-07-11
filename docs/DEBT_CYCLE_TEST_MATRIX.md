# TangLak: Debt Cycle Lifecycle Test Matrix

This document defines the manual QA test matrix to validate the debt cycle lifecycle states, priority ordering, safe payment semantics, and manual closure verification flows.

---

## 1. QA Test Scenarios

### Section A: Urgency Priority & Tie-Breaking

| ID | Scenario | Preconditions | Input / Actions | Expected Result | Viewport |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | **Three Overdue Debts** | Three active debts: Debt A (Overdue minimum ฿1,000), Debt B (Overdue minimum ฿500), Debt C (Overdue minimum ฿1,200). | 1. Navigate to `/today` screen. | - **Only one** next-action card is displayed.<br>- The displayed card is for **Debt C** (Priority 1, tie-breaker: largest remaining minimum).<br>- Text summary: `ยังมีอีก 2 รายการที่ต้องจัดการ` is rendered below the card. | 390px |
| **TC-02** | **Overdue + Due Today** | Debt A (Overdue minimum ฿2,000, interest 10%), Debt B (Due today ฿5,000, interest 18%). | 1. Navigate to `/today` screen. | - The card for **Debt A** (Priority 1: Overdue) is displayed.<br>- The card for **Debt B** (Priority 2: Due Today) is collapsed into the secondary summary list. Interest rates do not override state urgency. | 360px |
| **TC-03** | **Tie-Breaker: Due Dates** | Debt A (Due today ฿3,000, min ฿1,000, 15%), Debt B (Due today ฿3,000, min ฿1,000, 18%). | 1. Set Debt A due date to 10:00 AM.<br>2. Set Debt B due date to 12:00 PM.<br>3. Open `/today`. | **Debt A** displays first (tie-breaker: earlier due date). | 390px |
| **TC-04** | **Tie-Breaker: Interest** | Debt A (Due today, min ฿1,000, 12% interest), Debt B (Due today, min ฿1,000, 18% interest). Same due dates. | 1. Open `/today`. | **Debt B** displays first (tie-breaker: higher interest rate). | 390px |
| **TC-05** | **Tie-Breaker: Fallback** | Debt A and Debt B have same status, same remaining minimum (฿1,000), same due dates, and same interest rate (15%). | 1. Open `/today`. | **Debt A** (the oldest created account in DB) displays first (deterministic stable fallback). | 390px |

---

### Section B: Safe Payment Semantics & Rollover

| ID | Scenario | Preconditions | Input / Actions | Expected Result | Viewport |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-06** | **Payment exceeds statement amount** | Active cycle statement due is ฿5,000. Outstanding balance is ฿20,000. | 1. Log a payment of `฿6,000`. <br>2. Save payment. | - `paidThisCycle` updates to `฿6,000`.<br>- Status badge becomes `จ่ายครบถ้วนแล้ว`. <br>- **Outstanding balance remains ฿20,000** (does not auto-decrease).<br>- Subtext displays: "การบันทึกการชำระจะไม่ปรับยอดหนี้ทั้งหมดอัตโนมัติ...". | 360px, 390px |
| **TC-07** | **Late-linked payment** | Previous cycle closed as `จ่ายบางส่วน`. Current cycle is active. | 1. Retroactively link a forgotten slip (฿2,000) to the previous cycle's date range. <br>2. Save. | - Previous cycle recalculates `paid` total.<br>- Previous cycle's status changes to `จ่ายขั้นต่ำแล้ว`. <br>- **Current cycle amounts and dates are preserved unchanged**.<br>- Outstanding balance remains unchanged.<br>- Calm audit note is shown next to the payment. | 390px, 430px |
| **TC-08** | **Negative balance input rejection** | Setup form open. | 1. Enter outstanding balance as `-฿500`. <br>2. Submit form. | Form blocks submission. Validation error: `"ยอดหนี้ไม่สามารถติดลบได้"`. | 360px |
| **TC-09** | **Manual rollover check** | Cycle date has passed. | 1. Navigate to details page. | - No auto-rollover occurs. The status badge displays `รออัปเดตรอบใหม่`. <br>- History table is not updated until user manually saves next cycle values. | 390px |

---

### Section C: Account Closure & Installment Completion

| ID | Scenario | Preconditions | Input / Actions | Expected Result | Viewport |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-10** | **Outstanding reaches 0** | Debt is active. | 1. Edit debt detail.<br>2. Set outstanding balance to `0`. <br>3. Submit. | - Account state updates to `รอตรวจสอบปิดหนี้`. <br>- Account **does not close automatically**.<br>- `ตรวจสอบปิดหนี้` button becomes visible. | 390px |
| **TC-11** | **Installment count reaches 0** | Installment plan has 1 remaining cycle. | 1. Perform cycle rollover. <br>2. Remaining installment count hits `0`. | - Account status updates to `รอตรวจสอบปิดหนี้`. <br>- User is prompted to verify if real outstanding balance is 0. | 430px |
| **TC-12** | **Explicit closure confirmation** | Account is in `รอตรวจสอบปิดหนี้`. | 1. Click `ตรวจสอบปิดหนี้`. <br>2. Verify modal copy.<br>3. Tap `ยืนยันปิดหนี้`. | - Modal renders correct disclaimer warning about bank fees.<br>- State transitions to `closed`. <br>- View is read-only. | 390px |
| **TC-13** | **Cancelled closure** | Account is in `รอตรวจสอบปิดหนี้`. | 1. Click `ตรวจสอบปิดหนี้`. <br>2. Tap `กลับไปตรวจสอบ`. | Modal closes. Account remains in `รอตรวจสอบปิดหนี้`. | 390px |
| **TC-14** | **Reopening attempt block** | Account is `closed`. | 1. Open closed debt view.<br>2. Click `เปิดบัญชีหนี้ใหม่`. | Action is blocked. Alert displays: `"TangLak ยังไม่รองรับการเปิดบัญชีหนี้ใหม่จากการปิดไปแล้ว ในเวอร์ชันนี้"`. | 360px |
| **TC-15** | **Closed debt late linkage** | Account is `closed`. | 1. Retroactively link a forgotten slip to a closed debt. | Link is recorded in history. Warning alert displays: `"บัญชีหนี้ปิดแล้ว"`. | 430px |

---

### Section D: Timezone & Viewport Layouts

| ID | Scenario | Preconditions | Input / Actions | Expected Result | Viewport |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-16** | **Bangkok Date Boundary** | System clock reads `2026-07-12T00:05:00+07:00` (Local Bangkok). Server is on UTC. Due date is `2026-07-12`. | 1. Refresh today page. | Next-action card displays `🚨 ครบกำหนดชำระวันนี้!` because local timezone has ticked into the due date. | 390px |
| **TC-17** | **Layout Reflow 360px** | Samsung Galaxy S20. | 1. Navigate to `/today`. <br>2. Observe action card. | Headings fit within borders. No horizontal scrollbars appear. Currency labels fit on one line. | 360px |
| **TC-18** | **Layout Reflow 430px** | iPhone 15 Pro Max. | 1. View closed debt history table. | Status badges and labels show side-by-side with padding without wrapping breaks. | 430px |
