# TangLak: Today Dashboard & Debt Copy Registry

This document registers the exact Thai copy, labels, CTAs, and accessibility tags for the `/today` dashboard and interest display rules.

---

## 1. Today Screen Next-Action Cards

The `/today` dashboard displays a single, prioritized next-action card for each active debt to guide users on their immediate next step.

### Copy Registry by State

#### 1. Overdue Minimum (เกินกำหนดชำระขั้นต่ำ)
*   **Card Title**: `❌ ค้างชำระเกินกำหนด!`
*   **Supporting Text**: "กรุณาชำระยอดขั้นต่ำโดยด่วนเพื่อหลีกเลี่ยงเบี้ยปรับและประวัติค้างชำระ"
*   **Amount Label**: `ยอดขั้นต่ำที่ต้องจ่าย: ฿[จำนวนเงิน]`
*   **Primary CTA**: `บันทึกการชำระเงิน` (Log Payment)
*   **Secondary CTA**: `ดูประวัติบัญชี` (View History)
*   **Accessibility Label**: "สถานะ เกินกำหนดชำระ ยอดขั้นต่ำที่ค้างอยู่คือ [จำนวนเงิน] บาท กดปุ่มบันทึกการชำระเงินเพื่อดำเนินการต่อ"

#### 2. Due Today (ครบกำหนดชำระวันนี้)
*   **Card Title**: `🚨 ครบกำหนดชำระวันนี้!`
*   **Supporting Text**: "วันนี้เป็นวันสุดท้ายในการชำระเพื่อรักษาประวัติการเงินที่ดีของคุณ"
*   **Amount Label**: `ยอดเรียกเก็บรอบนี้: ฿[จำนวนเงิน]`
*   **Primary CTA**: `บันทึกการชำระเงิน` (Log Payment)
*   **Secondary CTA**: -
*   **Accessibility Label**: "สถานะ ครบกำหนดชำระวันนี้ ยอดเรียกเก็บรอบนี้คือ [จำนวนเงิน] บาท กดปุ่มบันทึกการชำระเงินเพื่อบันทึกรายการ"

#### 3. Due Within 3 Days (ใกล้ครบกำหนดชำระ)
*   **Card Title**: `⚠️ ใกล้ครบกำหนดชำระ`
*   **Supporting Text**: "เหลือเวลาอีก [N] วันจะถึงวันครบกำหนดชำระตามบิล"
*   **Amount Label**: `ยอดเรียกเก็บรอบนี้: ฿[จำนวนเงิน]`
*   **Primary CTA**: `บันทึกการชำระเงิน` (Log Payment)
*   **Secondary CTA**: -
*   **Accessibility Label**: "สถานะ ใกล้ครบกำหนดชำระ เหลือเวลาอีก [N] วัน ยอดเรียกเก็บรอบนี้คือ [จำนวนเงิน] บาท กดปุ่มบันทึกการชำระเงินเพื่อใส่รายการ"

#### 4. Minimum Not Met (ยังชำระไม่ถึงขั้นต่ำ)
*   **Card Title**: `⏳ รอการชำระเงิน`
*   **Supporting Text**: "คุณยังไม่ได้ชำระยอดขั้นต่ำในรอบบิลนี้ แนะนำให้ชำระเพื่อป้องกันค่าปรับล่าช้า"
*   **Amount Label**: `ยอดขั้นต่ำคงเหลือ: ฿[จำนวนเงิน]`
*   **Primary CTA**: `บันทึกการชำระเงิน` (Log Payment)
*   **Secondary CTA**: -
*   **Accessibility Label**: "สถานะ รอการชำระเงิน ยอดชำระขั้นต่ำคงเหลือคือ [จำนวนเงิน] บาท กดปุ่มบันทึกการชำระเงินเพื่อป้อนข้อมูล"

#### 5. Minimum Met but Amount Due Remains (ชำระขั้นต่ำแล้ว แต่ยังไม่ครบยอดเรียกเก็บ)
*   **Card Title**: `✓ ปลอดภัยจากค่าปรับ`
*   **Supporting Text**: "ชำระยอดขั้นต่ำครบแล้ว คุณสามารถเลือกชำระยอดเรียกเก็บที่เหลือเพื่อหลีกเลี่ยงดอกเบี้ยสะสม"
*   **Amount Label**: `ยอดเรียกเก็บคงเหลือ: ฿[จำนวนเงิน]`
*   **Primary CTA**: `บันทึกการชำระเงิน` (Log Payment)
*   **Secondary CTA**: -
*   **Accessibility Label**: "สถานะ ปลอดภัยจากค่าปรับ ยอดเรียกเก็บคงเหลือในรอบนี้คือ [จำนวนเงิน] บาท กดปุ่มบันทึกการชำระเงินเพื่อจ่ายส่วนที่เหลือ"

#### 6. Full Amount Due Paid (ชำระยอดเรียกเก็บครบถ้วนแล้ว)
*   **Card Title**: `🎉 ชำระยอดเรียกเก็บครบถ้วน`
*   **Supporting Text**: "คุณชำระยอดเรียกเก็บรอบนี้เต็มจำนวนแล้ว ยอดเงินส่วนนี้ปลอดดอกเบี้ยสำหรับรอบนี้"
*   **Amount Label**: `ยอดหนี้ทั้งหมดคงเหลือ: ฿[จำนวนเงิน]`
*   **Primary CTA**: `ตรวจสอบยอด` (Review Balance)
*   **Secondary CTA**: -
*   **Accessibility Label**: "สถานะ ชำระยอดเรียกเก็บครบถ้วน ยอดหนี้คงเหลือรวมคือ [จำนวนเงิน] บาท กดปุ่มตรวจสอบยอดเพื่อดูรายละเอียดบัญชี"

#### 7. New Cycle Needs Updating (รอบบิลใหม่รอการอัปเดต)
*   **Card Title**: `📅 ถึงวันเริ่มต้นรอบบิลใหม่`
*   **Supporting Text**: "ระบบตรวจพบการข้ามรอบบัญชีใหม่ โปรดระบุยอดเรียกเก็บและวันครบกำหนดล่าสุดจากบิลใบใหม่"
*   **Amount Label**: `ยอดหนี้ทั้งหมดล่าสุด: ฿[จำนวนเงิน]`
*   **Primary CTA**: `อัปเดตข้อมูลรอบบิล` (Update Cycle)
*   **Secondary CTA**: `ข้ามไปก่อน` (Skip for Now)
*   **Accessibility Label**: "สถานะ ถึงรอบบัญชีใหม่ โปรดกดปุ่มอัปเดตข้อมูลรอบบิลเพื่อกรอกข้อมูลยอดเรียกเก็บล่าสุด"

#### 8. No Due-Date Data (ไม่มีข้อมูลวันครบกำหนด)
*   **Card Title**: `ℹ️ รออัปเดตข้อมูลการชำระ`
*   **Supporting Text**: "บัญชีหนี้นี้ยังไม่ได้ระบุวันครบกำหนดชำระ คุณสามารถกรอกข้อมูลเพื่อเปิดใช้ระบบแจ้งเตือน"
*   **Amount Label**: `ยอดหนี้ทั้งหมด: ฿[จำนวนเงิน]`
*   **Primary CTA**: `ระบุวันชำระเงิน` (Set Due Date)
*   **Secondary CTA**: -
*   **Accessibility Label**: "สถานะ ยังไม่มีข้อมูลวันครบกำหนดชำระ กดปุ่มระบุวันชำระเงินเพื่อบันทึกข้อมูล"

#### 9. Debt Closed (ปิดหนี้เรียบร้อยแล้ว)
*   **Card Title**: `🏆 ปลุกพลังการเงิน: ปิดหนี้แล้ว!`
*   **Supporting Text**: "ยินดีด้วย! บัญชีหนี้นี้ได้รับการชำระครบถ้วนและปิดบัญชีเรียบร้อยแล้ว"
*   **Amount Label**: `ยอดหนี้คงเหลือ: ฿0.00`
*   **Primary CTA**: `ปิดหนี้สำเร็จ` (Debt Cleared)
*   **Secondary CTA**: -
*   **Accessibility Label**: "สถานะ ปิดหนี้เรียบร้อยแล้ว ยอดหนี้คงเหลือเป็นศูนย์บาท บัญชีปิดถาวร"

---

## 2. Interest Rate Display & Disclaimer Wording

TangLak does **not** compute exact daily interest. The interest displayed is strictly for planning and comparison.

### Copy Formats

```
+-----------------------------------------------------------+
|  อัตราดอกเบี้ย: 15% ต่อปี                                    |
|  (ประมาณ 1.25% ต่อเดือน)                                   |
|                                                           |
|  * เป็นการคำนวณประมาณการเพื่อช่วยวางแผน                    |
|    ยอดจริงอาจแตกต่างจากที่สถาบันการเงินเรียกเก็บจริง           |
+-----------------------------------------------------------+
```

*   **Display Text**:
    `ดอกเบี้ย [X]% ต่อปี (ประมาณ [Y]% ต่อเดือน)`
*   **Static Disclaimer Copy**:
    > "เป็นการประมาณเพื่อช่วยวางแผน ยอดจริงอาจต่างจากที่สถาบันการเงินเรียกเก็บ"

---

## 3. Accessibility Labels for Payment Progress Indicators

For visual progress bars and circles, screen readers must receive explicit numeric and contextual descriptions:

*   *Visual element*: Progress bar showing ฿2,000 paid out of ฿5,000 statement balance.
*   *Screen reader copy (`aria-label`)*: `ความคืบหน้าการจ่าย ชำระแล้ว 2,000 บาท จากยอดเรียกเก็บทั้งหมด 5,000 บาท คิดเป็น 40 เปอร์เซ็นต์`
