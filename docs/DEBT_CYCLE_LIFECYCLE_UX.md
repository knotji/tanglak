# TangLak: Debt Cycle Lifecycle UX Specification

This document defines the complete lifecycle, billing cycle rollover flows, transition rules, payment semantics, and layout guidelines for debt management in TangLak.

---

## 1. Debt Lifecycle States

A debt account transitions through various states based on date boundaries, payment records, and user actions. The system must never auto-reset values or infer that a debt is "fully paid" simply because the minimum payment was met.

### Lifecycle State Matrix & Primary CTAs

| State (English) | Thai UI Term | Definition & Condition | Single Primary CTA |
| :--- | :--- | :--- | :--- |
| **New Debt Created** | **สร้างหนี้ใหม่** | Debt created but onboarding forms are incomplete. | `กรอกข้อมูลรอบบิล` (Fill Cycle Info) |
| **No Cycle Data** | **ยังไม่มีข้อมูลรอบบิล** | Debt active but no billing statement has been added yet. | `เพิ่มข้อมูลรอบบิล` (Add Billing Info) |
| **Current Cycle** | **รอบปัจจุบัน** | Statement active; current date is between cycle date and due date. | `บันทึกการจ่าย` (Log Payment) |
| **Near Cycle Date** | **ใกล้วันตัดรอบ** | Current date is within 3 days before the statement cycle date. | `บันทึกการจ่าย` (Log Payment) |
| **Pending Update** | **รออัปเดตรอบใหม่** | Statement cycle date has passed; new statement is expected from bank. | `อัปเดตรอบบิลใหม่` (Update New Cycle) |
| **Cycle Updated** | **อัปเดตรอบใหม่แล้ว** | User confirmed new statement details; now awaiting payment. | `บันทึกการจ่าย` (Log Payment) |
| **Partially Paid** | **จ่ายบางส่วน** | Payment logged is > 0 but less than the minimum required. | `จ่ายขั้นต่ำ` (Pay Minimum) |
| **Minimum Met** | **จ่ายขั้นต่ำแล้ว** | Payment logged is >= minimum but less than statement balance. | `บันทึกการจ่าย` (Log Payment) |
| **Statement Paid** | **จ่ายยอดเรียกเก็บครบแล้ว** | Current-cycle payment is >= statement balance. | `ตรวจสอบยอด` (Review Balance) |
| **Overdue** | **เกินกำหนด** | Current date is past due date, and payment is < minimum. | `บันทึกการจ่าย` (Log Payment) |
| **Debt Paid Off** | **ปิดหนี้แล้ว** | Total outstanding balance is `0` (or negative). | `ปิดบัญชีหนี้` (Archive/Close Debt) |

---

## 2. New Billing-Cycle Update Flow

Billing cycles **must never reset automatically**. When a billing cycle rollover arrives, the user is notified and must explicitly confirm the new cycle values.

### Mobile Step-by-Step Rollover Flow

```
[1. Alert: ถึงรอบบิลใหม่] 
   --> User receives notification or banner on /today: "ถึงรอบบิลใหม่ของ บัตรเครดิต KTC แล้ว"
   
[2. Click: อัปเดตรอบบิล]
   --> User taps the primary CTA button "อัปเดตรอบบิลใหม่"
   
[3. Review: ตรวจข้อมูลรอบเดิม]
   --> Displays summary of the previous cycle: statement balance, total paid, and outstanding balance carried over.
   
[4. Input: กรอกข้อมูลรอบใหม่]
   --> Form fields display:
       - ยอดเรียกเก็บรอบใหม่ (New statement balance) [Required]
       - ยอดจ่ายขั้นต่ำ (New minimum due) [Required]
       - วันตัดรอบบัญชีถัดไป (Next cycle date) [Required]
       - วันครบกำหนดชำระถัดไป (Next due date) [Required]
       - ยอดหนี้ทั้งหมดล่าสุด (New total outstanding) [Required]
       - ดอกเบี้ยต่อปี (%) (Annual interest rate - defaults to last cycle value) [Required]
       - หมายเหตุเพิ่มเติม (Optional notes) [Optional]
       
[5. Confirm: ยืนยันข้อมูล]
   --> User clicks "ยืนยันความถูกต้องรอบใหม่"
   
[6. Transition: ปิดรอบเดิม & เริ่มรอบใหม่]
   --> Previous cycle details are archived to history.
   --> New cycle begins. Past payments are preserved in history.
```

---

## 3. Cycle Transition Rules

*   **Early Updates (ก่อนครบกำหนด)**: If a user updates their billing cycle early, the system must warn the user: "รอบบิลเก่ายังไม่หมดอายุ การอัปเดตตอนนี้จะปิดยอดรอบบิลนี้ทันที" and request confirmation.
*   **Late Updates (หลังเลยวันตัดรอบ/วันกำหนดชำระ)**: If a user updates cycle details late, all payments logged in the interim are automatically evaluated against the cycle date to map them correctly.
*   **No New Statement Yet**: If a bank cycle date passes but the user has not received their statement, they can tap "ยังไม่มีใบแจ้งหนี้รอบใหม่" to keep the current cycle active in a temporary grace state.
*   **Amount Due / Minimum is 0**: If the statement balance is `0`, the minimum is automatically set to `0`. The cycle updates instantly to `จ่ายยอดเรียกเก็บครบแล้ว`.
*   **Validation: Minimum > Amount Due**: The form blocks submission and highlights: "ยอดชำระขั้นต่ำไม่สามารถมากกว่ายอดเรียกเก็บในรอบนี้ได้".
*   **Validation: Outstanding Balance < Amount Due**: System flags a warning: "ยอดเรียกเก็บมากกว่ายอดหนี้ทั้งหมด กรุณาตรวจสอบยอดหนี้ล่าสุดของคุณ" but allows saving to cover cases where temporary fees exceed principal.
*   **Credit Cards vs. Installments**:
    *   *Credit Cards*: Total outstanding is floating and depends on user purchases.
    *   *Installments*: Total outstanding decrements strictly by the statement amount each cycle. The system auto-calculates remaining installments: `remaining = remaining - 1`.
*   **Debt Without a Cycle Date** (e.g. Informal peer-to-peer loans): The lifecycle skips rollover states. It remains in an active `รอบปัจจุบัน` state until the outstanding balance reaches `0`.

---

## 4. Payment Semantics

To ensure clarity, the UI distinguishes payments using explicit Thai labeling:

```
+-------------------------------------------------------+
|  ยอดหนี้ทั้งหมด: ฿85,000.00                              |
|  ยอดเรียกเก็บรอบนี้: ฿12,000.00 | จ่ายแล้วรอบนี้: ฿5,000.00 |
+-------------------------------------------------------+
|  [ PROGRESS BAR: จ่ายแล้ว ฿5,000 / ขั้นต่ำ ฿2,000 ]      |
|  เหลือยอดขั้นต่ำที่ต้องชำระ: ฿0.00 (จ่ายขั้นต่ำครบแล้ว)   |
|  เหลือยอดเรียกเก็บที่ต้องชำระ: ฿7,000.00                 |
+-------------------------------------------------------+
```

### Visual Labels & Semantics
1.  **จ่ายแล้วรอบนี้ (Paid This Cycle)**: Total amount of payments logged within the start and end dates of the active cycle.
2.  **เหลือขั้นต่ำ (Remaining Minimum)**: Calculated as `max(0, minimumPayment - paidThisCycle)`. If `0`, displays as "ครบเกณฑ์ขั้นต่ำแล้ว".
3.  **เหลือยอดเรียกเก็บ (Remaining Statement Balance)**: Calculated as `max(0, statementBalance - paidThisCycle)`.
4.  **ยอดหนี้ทั้งหมด (Total Outstanding)**: Total balance remaining on the account.
5.  **จ่ายเกินยอดขั้นต่ำ (Paid Over Minimum)**: Displays when `paidThisCycle > minimumPayment` but `< statementBalance`. Shows positive feedback: "จ่ายเกินขั้นต่ำมาแล้ว ฿X.XX" (encouraging debt payoff).
6.  **จ่ายเกินยอดเรียกเก็บ (Paid Over Statement)**: Displays when `paidThisCycle > statementBalance`. Shows: "จ่ายเกินยอดเรียกเก็บมาแล้ว ฿X.XX" and automatically reduces the `outstandingBalance` by the overpaid amount.

### Linking Payments After Cycle is Closed
*   **Late Linkage**: If a payment is linked retroactively to a closed cycle:
    *   The transaction is marked with the historical cycle ID.
    *   The historical record recalculates its `paid` amount.
    *   The current cycle outstanding balance is adjusted to reflect the change.
    *   The UI displays a label on that historical transaction: "ชำระย้อนหลังเข้าสู่งวด [เดือน]".

---

## 5. Debt History Presentation

The debt details page contains a compact, tabular history view. It must not use decorative charts unless actual historical data exists.

```
+--------------------------------------------------------------------------------+
|                               ประวัติการชำระเงิน                                |
+--------------------------------------------------------------------------------+
| รอบบิล (เดือน) | ยอดเรียกเก็บ | ยอดขั้นต่ำ | ชำระแล้ว | สถานะรอบบิล | วันครบกำหนดชำระ |
+---------------+-------------+----------+----------+-------------+------------------+
| มิ.ย. 2569    | ฿12,000.00  | ฿2,000   | ฿12,000  | จ่ายครบแล้ว  | 25 มิ.ย. 2569    |
| พ.ค. 2569    | ฿15,000.00  | ฿2,500   | ฿2,500   | จ่ายขั้นต่ำ  | 25 พ.ค. 2569    |
| เม.ย. 2569   | ฿10,000.00  | ฿2,000   | ฿0.00    | เกินกำหนด   | 25 เม.ย. 2569   |
+--------------------------------------------------------------------------------+
```

---

## 6. Mobile Layout Behavior

### 360px Viewport (e.g., Samsung Galaxy S20)
*   **History Table**: Horizontal tables reflow into vertical cards (Cycle Cards) to prevent text clipping:
    ```
    +------------------------------------------+
    | รอบบิล: มิ.ย. 2569 (จ่ายครบแล้ว)          |
    | ยอดเรียกเก็บ: ฿12,000  |  ชำระแล้ว: ฿12,000 |
    +------------------------------------------+
    ```
*   **Typography**: Currency values auto-scale down (e.g., `text-base` instead of `text-lg`) to fit on one line.
*   **Spacing**: Form padding reduces from `p-4` to `p-2` with inputs stacking vertically in a single column.

### 390px Viewport (e.g., iPhone 12/13/14)
*   **Standard Forms**: Inputs use a full-width block layout.
*   **Actions**: The primary CTA occupies the full screen width at the bottom, locked to a sticky panel with `pb-safe` to prevent keyboard collision.

### 430px Viewport (e.g., iPhone 15 Pro Max)
*   **Dashboard Grid**: History lists can show status badges with text descriptions simultaneously without causing horizontal overflow.
