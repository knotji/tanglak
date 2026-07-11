# TangLak: Debt Setup & Monthly Debt Summary UX Specification

This document details the user interface (UI) and user experience (UX) design for configuring debt and viewing the monthly debt summary on mobile. The goal is to provide a clean, jargon-free flow that encourages users to take control of their liabilities.

---

## 1. Simplified Debt Setup Mobile Form

The debt setup form is designed as a single-scroll mobile form that avoids bank-like form complexity. 

### Form Layout & Fields

| Field Label (Thai) | Field Name | Type | Requirement | Why & UX Detail |
| :--- | :--- | :--- | :--- | :--- |
| **ชื่อบัญชีหนี้ หรือ ผู้ให้บริการ** | `name` / `creditor` | Text | **Required** | Identify the debt (e.g., "บัตรเครดิต KTC", "กู้ซื้อบ้าน"). Used as the primary label. |
| **ยอดหนี้ทั้งหมด (ที่ต้องจ่ายคืน)** | `outstandingBalance` | Currency (THB) | **Required** | The total remaining balance to pay off. Essential for tracking net worth. |
| **ยอดเรียกเก็บรอบนี้** | `statementBalance` | Currency (THB) | **Required** | The full statement amount for the current billing cycle. Essential to understand statement balance. |
| **ยอดจ่ายขั้นต่ำ** | `minimumPayment` | Currency (THB) | **Required** | The minimum amount required by the bank to avoid penalties. Critical for cashflow priority logic. |
| **อัตราดอกเบี้ยต่อปี (%)** | `interestRateAnnual` | Percentage | **Required** | Needed to calculate interest savings and prioritize which debt to pay off first (e.g., Avalanche method). |
| **วันครบกำหนดชำระ** | `dueDate` | Date Picker | **Required** | The exact day payment is due. Triggers urgent alerts and automated status tags. |
| **วันสรุปรอบบัญชี** | `recurringDueDay` / Cycle | Select (1-31) | **Required** | The statement date. Helps the system automatically forecast the next payment cycle once the current one is paid. |
| **วงเงินเครดิตสูงสุด** | `creditLimit` | Currency (THB) | *Optional* | Optional credit card limit. Used to calculate credit utilization rates (ideal is <30%), but not required for basic schedule logic. |

### Smart Field Assistance (Anti-Jargon)
To avoid bank jargon and complex input fields, the form incorporates the following smart features:
1.  **Helper Explanations**:
    *   Instead of "Statement Balance (ยอดสรุปยอดบัญชี)", the label is **ยอดเรียกเก็บรอบนี้** with subtext: "ดูจากยอดที่แจ้งในบิลเก็บเงินล่าสุด".
    *   Instead of "Outstanding Principal (เงินต้นคงเหลือ)", the label is **ยอดหนี้ทั้งหมด** with subtext: "ยอดทั้งหมดที่ยังติดค้างอยู่ (ไม่ใช่แค่ยอดในบิลเดือนนี้)".
2.  **Smart Calculations**:
    *   *Minimum Payment Suggestion*: When a user inputs the "ยอดหนี้ทั้งหมด", a helper link appears under the Minimum Payment field: "คาดการณ์ขั้นต่ำให้ (เช่น 5% หรือ 8%)". Clicking this automatically populates the field (calculated as `outstandingBalance * 0.05` or `0.08` rounded).
    *   *Interest Helper*: Subtext warns: "หากไม่มีดอกเบี้ย (เช่น ผ่อน 0%) ให้ใส่เลข 0".

---

## 2. Monthly Debt Summary Dashboard

To prevent visual clutter, the summary screen (`/debts`) avoids the anti-pattern of "too many identical metric cards". Instead, it organizes metrics into a **clear visual hierarchy** based on actionability.

```
+------------------------------------------------------+
|                     หนี้สินของฉัน                      |
+------------------------------------------------------+
|  [TOTAL CARD]                                        |
|  หนี้ทั้งหมด: ฿245,000.00                              |
+------------------------------------------------------+
|  [ACTIVE MONTH CARD]                                 |
|  ต้องจ่ายเดือนนี้: ฿15,200.00   จ่ายแล้ว: ฿8,000.00       |
|  [========= PROGRESS BAR: 52% (ขั้นต่ำรวม ฿4,500) ===]  |
|  เหลือยอดขั้นต่ำที่ต้องจ่ายอีก: ฿0.00 (จ่ายขั้นต่ำครบแล้ว)   |
+------------------------------------------------------+
|  [URGENT ALERTS AREA]                                |
|  ! เกินกำหนด: บัตรเครดิต Citi (เกินกำหนด 2 วัน)         |
|  ! ใกล้ครบกำหนด: สินเชื่อบุคคลธนชาต (อีก 3 วัน)        |
+------------------------------------------------------+
```

### Hierarchy Specifications

1.  **Total Outstanding (หนี้ทั้งหมด)**:
    *   *Role*: High-level net worth context.
    *   *Visual*: Semi-muted background (`bg-slate-900/50` or deep gray, never primary brand), smaller font than the active month requirements to avoid stressing the user.
2.  **Active Month Focus (ต้องจ่ายเดือนนี้ & ขั้นต่ำรวม & จ่ายแล้ว)**:
    *   *Role*: Immediate action container. High prominence.
    *   *Visual*: Soft indigo background card with a dynamic progress bar showing the percentage of **ต้องจ่ายเดือนนี้** that has been **จ่ายแล้ว**.
    *   *Minimum Payment Context (ขั้นต่ำรวม)*: Directly displayed below the progress bar to show whether the user has at least met the safety threshold (**เหลือขั้นต่ำ**).
3.  **Actionable Alerts (ใกล้ครบกำหนด & เกินกำหนด)**:
    *   *Role*: Focus direct attention.
    *   *Visual*: Status badge notifications stacked at the bottom of the dashboard. Alert tags use warm yellow/amber for upcoming dates, and soft red/rose for overdue (never green).

---

## 3. Mobile Viewport Reflow Behavior

### 360px Viewport (e.g., Samsung Galaxy S8/S20)
*   **Grid layout**: All 2-column inputs (e.g., Interest Rate & Cycle Date) collapse into a 1-column stack.
*   **Progress Bar**: Progress indicator bar height is reduced to `h-2` to save vertical space. The percentage text wraps onto a secondary line neatly.
*   **Date Selectors**: Native mobile date picker overrides custom overlay select dropdowns to avoid screen edge clipping.

### 390px Viewport (e.g., iPhone 12/13/14)
*   **Inputs**: The form displays fields in a single column, but allows minor fields (like cycle day and annual interest) to sit side-by-side.
*   **Header Margin**: Standardized padding of `px-4` ensures forms align perfectly with bottom navigation bars.

### 430px Viewport (e.g., iPhone 14/15 Pro Max)
*   **Dashboard Cards**: Metrics (Total Outstanding vs. Active Month) can use slightly larger layouts with generous line heights (`leading-relaxed`).
*   **Details**: Secondary subtext fonts are set to `text-sm` for optimized readability.
