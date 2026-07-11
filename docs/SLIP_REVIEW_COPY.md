# TangLak: Slip Review & Debt Status Thai Copy Registry

This document serves as the single source of truth for the Thai copy, labels, placeholders, dynamic messages, and alerts across the Slip Review Screen and Debt Management dashboard.

---

## 1. Slip Review Screen UI Hierarchy & Copy Registry

When users land on the review screen (`/upload/review/[documentId]`), they are presented with the AI-extracted data. The copy is structured to reduce cognitive load and avoid banking jargon.

| UI Element / Field | Label (Thai) | Subtext / Helper Text (Thai) | Placeholder / Options (Thai) | Action / Detail |
| :--- | :--- | :--- | :--- | :--- |
| **Header** | **ตรวจสอบความถูกต้อง** | "ตรวจสอบข้อมูลที่ AI อ่านจากสลิปของคุณก่อนกดยืนยัน" | - | Screen Title |
| **Amount Field** | **จำนวนเงิน** | "ยอดเงินสุทธิที่ระบุในสลิป" | "฿0.00" | Large visual font |
| **Date/Time Field** | **วันที่และเวลา** | "วันเวลาที่ทำรายการสำเร็จตามสลิป" | "วัน/เดือน/ปี --:--" | Native date/time |
| **Merchant / Recipient**| **ร้านค้า หรือ ผู้รับเงิน** | "ชื่อร้านค้า ผู้รับเงิน หรือบุคคลปลายทาง" | "ระบุชื่อร้านค้าหรือผู้รับ" | Text Input |
| **Transaction Type** | **ประเภทรายการ** | "ระบุลักษณะการเคลื่อนไหวของเงิน" | 1. รายจ่าย<br>2. รายรับ<br>3. โอนเงินระหว่างบัญชี<br>4. ชำระหนี้หรือบัตร | Select Dropdown |
| **Category** | **หมวดหมู่** | "จัดกลุ่มรายจ่ายเพื่อช่วยสรุปงบประมาณ" | "เลือกหมวดหมู่ (เช่น อาหาร, เดินทาง)" | Selector |
| **Linked Debt** | **ชำระให้กับบัญชีหนี้** | "เลือกหากต้องการหักลดยอดหนี้ที่คุณบันทึกไว้" | "เลือกบัญชีหนี้ (เช่น บัตรเครดิต KTC)" | Select Dropdown |

### AI Uncertainty Indicators & Alerts

If the AI confidence is low, or if key fields are missing:

*   **Uncertainty Banner Alert**:
    *   *Title*: `AI ไม่แน่ใจข้อมูลบางส่วน`
    *   *Description*: "กรุณาตรวจสอบข้อมูลในช่องที่มีสัญลักษณ์เตือนสีส้มเป็นพิเศษ"
*   **Field-Level Warning**:
    *   *Wording*: `⚠️ AI คาดการณ์ข้อมูลนี้ โปรดช่วยตรวจสอบความถูกต้อง` (Used next to fields with low confidence).

### Action Buttons

*   **Edit Manually**: `แก้ไขข้อมูลเอง` (Secondary outline button)
*   **Retry**: `วิเคราะห์สลิปใหม่อีกครั้ง` (Icon button or secondary link)
*   **Save / Confirm**: `ยืนยันความถูกต้อง` (Primary action button - uses deep slate/indigo, never green)

---

## 2. Debt Status and Alert Badges

These alerts appear in the Monthly Debt Summary and individual debt detail cards to show schedule state:

```
+-------------------------------------------------------------+
| [Badge]                                                     |
|                                                             |
| 1. Due Later:          [ครบกำหนดชำระ: 28 ก.ค.]               |
| 2. Due within 3 days:  [⚠️ ใกล้ครบกำหนดชำระ (อีก 2 วัน)]      |
| 3. Due Today:          [🚨 ครบกำหนดชำระวันนี้!]               |
| 4. Overdue:            [❌ เกินกำหนดชำระ! (เกินมา 4 วัน)]      |
| 5. Minimum Met:        [✓ ชำระขั้นต่ำแล้ว]                    |
| 6. Fully Paid:         [✓ จ่ายครบถ้วนแล้ว]                    |
+-------------------------------------------------------------+
```

### Exact Thai Wording & Styling Guidelines

1.  **Due Later**
    *   *Thai wording*: `ครบกำหนดชำระ [วันที่-เดือน]`
    *   *Example*: `ครบกำหนดชำระ 25 ส.ค.`
    *   *Styling*: Muted gray background. Calm text color.
2.  **Due within 3 days**
    *   *Thai wording*: `⚠️ ใกล้ครบกำหนดชำระ (อีก [N] วัน)`
    *   *Example*: `⚠️ ใกล้ครบกำหนดชำระ (อีก 2 วัน)`
    *   *Styling*: Warm amber/orange badge background. Soft warning text.
3.  **Due Today**
    *   *Thai wording*: `🚨 ครบกำหนดชำระวันนี้!`
    *   *Styling*: High-contrast amber background with slow pulsing animation to capture attention.
4.  **Overdue**
    *   *Thai wording*: `❌ เกินกำหนดชำระ! (เกินมา [N] วัน)`
    *   *Example*: `❌ เกินกำหนดชำระ! (เกินมา 5 วัน)`
    *   *Styling*: Soft red/rose background. High-contrast red text.
5.  **Minimum Met**
    *   *Thai wording*: `✓ ชำระขั้นต่ำแล้ว`
    *   *Styling*: Muted indigo or soft blue background. Indicates the user is safe from immediate late fees.
6.  **Current-Cycle Amount Fully Paid**
    *   *Thai wording*: `✓ จ่ายยอดเรียกเก็บครบถ้วนแล้ว`
    *   *Styling*: Slate/Indigo solid text with a checkmark. Indicates the statement balance is fully offset.

---

## 3. Legacy Statement Route Deprecation Copy

This copy appears when users try to access the old bank-statement import page (`/history-import`).

*   **Banner Title**: `เราเปลี่ยนวิธีการจัดการข้อมูลเพื่อชีวิตที่ง่ายขึ้น`
*   **Banner Explanation**:
    > "TangLak เปลี่ยนมาใช้ระบบเน้นการบันทึกสลิปปัจจุบันแบบวันต่อวัน เพื่อช่วยให้คุณเห็นภาพรวมการใช้จ่ายที่แท้จริงและสร้างนิสัยการเงินที่ดีได้ง่ายขึ้น โดยคุณไม่ต้องวุ่นวายกับการจัดระเบียบไฟล์ธนาคารย้อนหลัง"
*   **Primary CTA Button**: `อัปโหลดสลิป` (Redirects to `/upload`)
*   **Secondary CTA Button**: `เพิ่มรายการเอง` (Opens manual entry form)
*   **Tertiary Link**: `กลับหน้าวันนี้` (Returns to dashboard `/today`)
