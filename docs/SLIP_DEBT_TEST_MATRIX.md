# TangLak: Slip-First & Debt Setup QA Test Matrix

This document outlines the manual test matrix and viewport checks designed to validate the Slip-First transaction entry and Debt Management features, focusing on edge cases, user inputs, and mobile layouts.

---

## 1. Edge Case Test Matrix

| ID | Edge Case | Precondition | Test Steps / Input | Expected Result | Checked Viewports |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | **No debt created yet** | A new user logs in for the first time; has no active debts. | 1. Navigate to `/debts` summary dashboard. | Dashboard displays a calm empty state: "เริ่มต้นบันทึกหนี้ของคุณ เพื่อจัดลำดับความสำคัญในการจ่ายและวางแผนปลดหนี้ให้เร็วขึ้น". Primary CTA: `+ เพิ่มหนี้แรกของคุณ`. No empty tables/broken elements. | 360px, 390px, 430px |
| **TC-02** | **No monthly budget set** | User has not configured their monthly budget limit. | 1. Navigate to `/debts`. | Dashboard computes and renders debt metrics (Total Outstanding, Due This Month, Minimum) normally. A soft banner prompts the user to set a budget to view their debt-to-budget ratio, but does not block interaction. | 360px, 390px, 430px |
| **TC-03** | **AI cannot read slip** | User uploads a blurry, dark, or corrupted image. | 1. Upload unreadable file. <br>2. Wait for AI parsing. | AI fails gracefully. The page displays a warning: "ไม่สามารถอ่านข้อมูลสลิปได้ โปรดระบุข้อมูลเอง". Form is pre-filled with empty/editable fields. Save button is active. | 360px, 390px, 430px |
| **TC-04** | **Duplicate-looking slip** | A transaction with the exact same amount, date, and merchant already exists. | 1. Upload a duplicate slip. <br>2. Land on review screen. | System displays alert: "พบสลิปที่คล้ายกัน อาจเป็นรายการซ้ำ". Two choices are offered: <br>1. `บันทึกเป็นรายการใหม่` (Save anyway)<br>2. `เชื่อมโยงหลักฐาน` (Link image to existing transaction and avoid duplicate). | 360px, 390px, 430px |
| **TC-05** | **Debt payment without selected debt** | User sets transaction type to "ชำระหนี้" (Debt Payment). | 1. Leave the "ชำระให้กับบัญชีหนี้" dropdown unselected. <br>2. Tap `ยืนยันความถูกต้อง`. | Validation blocks save. The field displays red text: "กรุณาเลือกบัญชีหนี้ที่ต้องการชำระ". Focus moves to the dropdown. | 360px, 390px, 430px |
| **TC-06** | **Minimum greater than outstanding** | User is setting up a new debt. | 1. Enter outstanding balance as `฿5,000`. <br>2. Enter minimum payment as `฿6,000`. <br>3. Submit form. | Validation error highlights the Minimum Payment field: "ยอดชำระขั้นต่ำไม่สามารถมากกว่ายอดหนี้ทั้งหมดได้". | 360px, 390px, 430px |
| **TC-07** | **Zero-interest debt** | User is setting up an interest-free installment debt. | 1. Enter interest rate as `0%`. <br>2. Save debt. | Debt is saved successfully. It is automatically ordered at the bottom of the pay-off priority list (Avalanche algorithm). No interest-warning badges are shown. | 360px, 390px, 430px |
| **TC-08** | **Missing due date** | User has an informal debt (e.g. borrowed from family) with no deadline. | 1. Select debt type "อื่น ๆ / หนี้ไม่เป็นทางการ". <br>2. Leave due date empty. <br>3. Save debt. | Form saves successfully without requiring due date. The dashboard displays `ไม่มีกำหนดวันชำระ` in place of the date. Safe from overdue logic triggers. | 360px, 390px, 430px |
| **TC-09** | **Partial payment logic** | A credit card debt is active with ฿5,000 statement balance and ฿1,000 minimum due. | 1. Log a payment of `฿2,000` to this debt. <br>2. Observe `/debts` dashboard. | - `Paid So Far` shows `฿2,000`. <br>- `Remaining Minimum Due` drops to `฿0.00`. <br>- Status badge updates to `ชำระขั้นต่ำแล้ว`. <br>- A note reminds the user that ฿3,000 remains to pay off the full statement balance. | 360px, 390px, 430px |

---

## 2. Mobile Viewport Layout Verification Checklist

### Viewport: 360px (Samsung Galaxy S20 / S8)
*   [ ] **Text Overflow**: No headings or labels wrap into a broken layout. Check names like "บัตรเครดิตกรุงไทยแพลทินัม".
*   [ ] **Horizontal Scroll**: Horizontal scrollbar is hidden on both `/upload` and `/debts` pages (`scrollWidth <= innerWidth`).
*   [ ] **Form Inputs**: The 2-column fields stack to 1-column layout without clipping the container edges.
*   [ ] **Touch Targets**: All interactive elements (CTA buttons, date selectors, checkboxes) are at least 44px high.

### Viewport: 390px (iPhone 12 / 13 / 14)
*   [ ] **Keyboard Occlusion**: When the virtual keyboard is active during debt setup, the active input field scrolls into view automatically and does not block the secondary action buttons.
*   [ ] **Bottom Navigation Bar**: Content includes bottom padding matching navigation height (`pb-28`) plus safe-area insets.

### Viewport: 430px (iPhone 14 / 15 Pro Max)
*   [ ] **Card Proportions**: Metric cards scale dynamically without looking overly stretched.
*   [ ] **Typography Hierarchy**: Font sizes are consistent and respect CSS guidelines.
