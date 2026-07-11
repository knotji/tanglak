# TangLak: Today Dashboard & Debt Copy Registry

This document registers the exact Thai copy, labels, CTAs, accessibility tags, and disclaimers for the `/today` screen and debt management flows.

---

## 1. Today Screen Prioritized Next-Action Copy

To maintain a clean and focused layout, the `/today` dashboard displays **exactly one primary next-action card** for the highest-priority debt. 

### Secondary Debts Summary Bar
When multiple debts are active and require attention:
*   *Text Copy*: `"ยังมีอีก [N] รายการที่ต้องจัดการ"`
*   *Primary Action Link*: `"ดูหนี้สินทั้งหมด"` (Navigates to `/debts` summary list)
*   *Aria Label*: `"คุณมีรายการหนี้สินอื่น ๆ ที่ต้องจัดการอีก [N] รายการ กดเพื่อดูหนี้สินทั้งหมด"`

---

## 2. Priority Copy Registry

#### Priority 1: Overdue Minimum (เกินกำหนดชำระขั้นต่ำ)
*   *Title*: `"ค้างชำระเกินกำหนด"`
*   *Supporting Text*: `"กรุณาชำระยอดขั้นต่ำโดยเร็วเพื่อหลีกเลี่ยงเบี้ยปรับล่าช้าและผลกระทบต่อบัญชี"`
*   *Amount Label*: `"ยอดขั้นต่ำคงค้าง: ฿[จำนวนเงิน]"`
*   *Primary CTA*: `"บันทึกการชำระเงิน"`
*   *Secondary CTA*: `"ดูรายละเอียด"`
*   *Accessibility Label*: `"สถานะ เกินกำหนดชำระ ยอดชำระขั้นต่ำคงค้างคือ [จำนวนเงิน] บาท กดปุ่มบันทึกการชำระเงินเพื่อบันทึกสลิป"`
*   *Fallback behavior*: If `minimumPayment` is missing, display outstanding balance instead: `"ยอดหนี้ทั้งหมด: ฿[จำนวนเงิน]"`.

#### Priority 2: Due Today (ครบกำหนดชำระวันนี้)
*   *Title*: `"ครบกำหนดชำระวันนี้"`
*   *Supporting Text*: `"วันสุดท้ายสำหรับรอบบัญชีนี้ โปรดบันทึกการชำระเงินเพื่อรักษาสถานะบัญชีให้เป็นปกติ"`
*   *Amount Label*: `"ยอดเรียกเก็บรอบนี้: ฿[จำนวนเงิน]"`
*   *Primary CTA*: `"บันทึกการชำระเงิน"`
*   *Secondary CTA*: -
*   *Accessibility Label*: `"สถานะ ครบกำหนดชำระวันนี้ ยอดเรียกเก็บรอบนี้คือ [จำนวนเงิน] บาท กดปุ่มบันทึกการชำระเงิน"`
*   *Fallback behavior*: If `statementAmount` is missing, display minimum payment: `"ยอดขั้นต่ำที่ต้องชำระ: ฿[จำนวนเงิน]"`.

#### Priority 3: Due Soon (ใกล้ครบกำหนดชำระ)
*   *Title*: `"ใกล้ครบกำหนดชำระ"`
*   *Supporting Text*: `"เหลือเวลาอีก [N] วันจะถึงวันครบกำหนดชำระเงินตามใบแจ้งยอด"`
*   *Amount Label*: `"ยอดเรียกเก็บรอบนี้: ฿[จำนวนเงิน]"`
*   *Primary CTA*: `"บันทึกการชำระเงิน"`
*   *Secondary CTA*: -
*   *Accessibility Label*: `"สถานะ ใกล้ครบกำหนดชำระ เหลือเวลาอีก [N] วัน ยอดเรียกเก็บรอบนี้คือ [จำนวนเงิน] บาท กดปุ่มบันทึกการชำระเงิน"`
*   *Fallback behavior*: If `statementAmount` is missing, show outstanding balance: `"ยอดหนี้ทั้งหมด: ฿[จำนวนเงิน]"`.

#### Priority 4: Minimum Not Met (ยังชำระไม่ถึงยอดขั้นต่ำ)
*   *Title*: `"ยังชำระไม่ถึงยอดขั้นต่ำ"`
*   *Supporting Text*: `"รอบบัญชีปัจจุบันยังไม่มียอดชำระถึงเกณฑ์ขั้นต่ำที่กำหนด"`
*   *Amount Label*: `"ยอดขั้นต่ำคงเหลือ: ฿[จำนวนเงิน]"`
*   *Primary CTA*: `"บันทึกการชำระเงิน"`
*   *Secondary CTA*: -
*   *Accessibility Label*: `"สถานะ ยังชำระไม่ถึงยอดขั้นต่ำ ยอดขั้นต่ำคงเหลือคือ [จำนวนเงิน] บาท กดปุ่มบันทึกการชำระเงิน"`
*   *Fallback behavior*: If `minimumPayment` is missing, default to statement balance: `"ยอดเรียกเก็บรอบนี้: ฿[จำนวนเงิน]"`.

#### Priority 5: Cycle Update (ถึงเวลาอัปเดตรอบบิล)
*   *Title*: `"ถึงเวลาอัปเดตรอบบิล"`
*   *Supporting Text*: `"รอบบัญชีเดิมสิ้นสุดแล้ว โปรดกรอกข้อมูลยอดเรียกเก็บและวันครบกำหนดล่าสุดจากใบแจ้งหนี้ใหม่"`
*   *Amount Label*: `"ยอดหนี้ทั้งหมดล่าสุด: ฿[จำนวนเงิน]"`
*   *Primary CTA*: `"อัปเดตรอบบิลใหม่"`
*   *Secondary CTA*: `"ข้ามไปก่อน"`
*   *Accessibility Label*: `"สถานะ ถึงรอบบัญชีใหม่ โปรดกดปุ่มอัปเดตรอบบิลใหม่เพื่อกรอกข้อมูลใบแจ้งหนี้ล่าสุด"`
*   *Fallback behavior*: If outstanding balance is missing, show label: `"โปรดเพิ่มข้อมูลยอดหนี้ล่าสุด"`.

#### Priority 6: No Due Date (ยังไม่ได้ตั้งวันครบกำหนด)
*   *Title*: `"ยังไม่ได้ตั้งวันครบกำหนด"`
*   *Supporting Text*: `"บัญชีนี้ยังไม่มีข้อมูลวันครบกำหนดชำระเงิน กรุณากรอกข้อมูลเพื่อใช้ระบบแจ้งเตือน"`
*   *Amount Label*: `"ยอดหนี้ทั้งหมด: ฿[จำนวนเงิน]"`
*   *Primary CTA*: `"ตั้งวันครบกำหนด"`
*   *Secondary CTA*: -
*   *Accessibility Label*: `"สถานะ ยังไม่มีข้อมูลวันครบกำหนดชำระ กดปุ่มตั้งวันครบกำหนดเพื่อระบุข้อมูลการชำระเงิน"`
*   *Fallback behavior*: -

---

## 3. Explanatory Disclaimer & Audit Copy

### Manual Outstanding Warning (Mandatory Copy)
To be displayed on the payment review screen and debt details screen:
> `"การบันทึกการชำระจะไม่ปรับยอดหนี้ทั้งหมดอัตโนมัติ กรุณาอัปเดตยอดล่าสุดจากแอปหรือใบแจ้งหนี้ของผู้ให้บริการ"`

### Late-Linked Payment Audit Note
To be displayed next to any retroactive linked payment in the history:
> `"รายการนี้ถูกเพิ่มย้อนหลัง สถานะรอบบิลอาจเปลี่ยนตามวันที่ชำระ ค่าปรับหรือดอกเบี้ยที่เกิดขึ้นจริงให้ตรวจสอบจากผู้ให้บริการ"`

---

## 4. Debt Closure Confirmation Prompt

This modal displays when a user triggers `ตรวจสอบปิดหนี้` on an account with a `0` outstanding balance or completed installments.

*   *Modal Title*: `"ตรวจสอบยอดล่าสุดจากผู้ให้บริการแล้วหรือยัง"`
*   *Modal Body*: `"อาจยังมีดอกเบี้ย ค่าธรรมเนียม หรือรายการรอดำเนินการค้างอยู่ กรุณายืนยันเมื่อยอดหนี้จริงเป็นศูนย์"`
*   *Primary Action Button (CTA)*: `"ยืนยันปิดหนี้"`
*   *Secondary Action Button (CTA)*: `"กลับไปตรวจสอบ"`

---

## 5. Interest Rate Display Formats

Interest rate copy must explicitly show that calculations are planning approximations.

*   *Standard Rate Format*: `"ดอกเบี้ย [X]% ต่อปี (ประมาณ [Y]% ต่อเดือน)"`
*   *Subtext Disclaimer*: `"เป็นการประมาณเพื่อช่วยวางแผน ยอดจริงอาจต่างจากที่สถาบันการเงินเรียกเก็บ"`
