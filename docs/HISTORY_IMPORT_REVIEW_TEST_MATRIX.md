# QA Test Matrix: History Import Review Board

This document defines the test coverage scenarios, boundary conditions, viewports, and expected results for verifying the History Import Review redesign.

---

## 1. Scale & Row Count Permutations

| Test Case ID | Scenario | Input Size | Initial State | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **TC-SC-01** | Single-row import | 1 Row | Valid | Row is selected by default. Bottom bar displays: "เลือก 1 จาก 1 รายการ". Debit/credit totals match single row amount. |
| **TC-SC-02** | Medium batch size | 20 Rows | Mix of types | All 20 rows pre-selected. Filter counts display correctly. Scrolling is smooth with no layout shifts. |
| **TC-SC-03** | Large batch size | 220 Rows | Mix of statuses | Browser DOM remains responsive. Sticky headers group transactions by date. Bottom CTA floats correctly. |

---

## 2. Selection & Exclusion Combos

| Test Case ID | Scenario | Actions | Expected Result |
| :--- | :--- | :--- | :--- |
| **TC-SL-01** | All Selected | Load page, perform no changes, click "นำเข้า" | All 220 rows are imported. User is redirected to `/summary` displaying: "นำเข้าสำเร็จ: 220 รายการ". |
| **TC-SL-02** | Partial Selection | Toggle 5 checkboxes to "ไม่นำเข้า" | Opacity of the 5 skipped rows dims to 50% with text strike-through. Bottom bar displays: "เลือก 215 จาก 220 รายการ". Sum of debit/credit excludes these 5 items. |
| **TC-SL-03** | Bulk Deselect | Tap "ยกเลิกทั้งหมด" | All visible rows checked (marked skip). Sticky bottom CTA shows: "เลือก 0 จาก 220 รายการ". Primary button changes to neutral status or is disabled. |
| **TC-SL-04** | Filtered Bulk Select | Select "เงินเข้า" filter (e.g. 10 rows), click "เลือกทั้งหมด" | All 10 credit rows are selected. Switch back to "ทั้งหมด" filter; other rows retain their previous status. |

---

## 3. Exceptions & Warnings Handling

| Test Case ID | Scenario | Input States | Expected UI Behavior |
| :--- | :--- | :--- | :--- |
| **TC-EX-01** | Duplicate detected | 1 row marked `possible_duplicate` | Row is unselected by default. Displays warning badge `[!] ซ้ำ`. Clicking checkbox changes decision from "Skip" to "Import Separately". |
| **TC-EX-02** | Bulk Skip Duplicates | Tap "ข้ามรายการซ้ำทั้งหมด" | Instantly sets all rows marked as `possible_duplicate` to "ไม่นำเข้า" (Skip) and updates total sums. |
| **TC-EX-03** | Invalid row (missing category) | 1 row marked `invalid` | Row renders automatically expanded. Highlighted in orange border. Primary import CTA is disabled until category is selected. |
| **TC-EX-04** | Metadata Row Filtering | PDF upload contains page headers and forward balances | Layout parser identifies metadata rows and hides them from the active user review list to reduce visual noise. |

---

## 4. Connectivity & Process Timing

| Test Case ID | Scenario | Timing / Network Event | Expected UI Behavior |
| :--- | :--- | :--- | :--- |
| **TC-CN-01** | Fast Import Progress | Completes in 1.2s | Progress modal opens, showing phases: `เตรียมรายการ` -> `บันทึกธุรกรรม` -> `ตรวจรายการซ้ำ` -> `สรุปผล`. Transitions instantly. No flickering. |
| **TC-CN-02** | Slow Import Progress | Takes 8.0s | After 5.0 seconds, loading text appends: *"กำลังนำเข้าข้อมูลจำนวนมาก โปรดอย่าปิดหน้าจอนี้"*. |
| **TC-CN-03** | Server Overload | Takes 18.0s | After 15.0 seconds, loading text appends: *"เซิร์ฟเวอร์ใช้เวลานานกว่าปกติ ระบบยังคงประมวลผลอยู่"*. |
| **TC-CN-04** | Disconnection & Resume | Network drops mid-import | Modal displays error fallback layout: *"เกิดปัญหาชั่วคราวขณะบันทึกรายการ"*. "ลองอีกครั้ง" button appears. Clicking it resumes import from the last uncommitted transaction index. |
| **TC-CN-05** | Rollback Batch | Click "ย้อนกลับชุดนำเข้า" on Summary page | Confirmation dialog appears. Clicking "OK" calls `deleteBatchAction` to remove created records. User is redirected to Upload screen with success alert. |

---

## 5. Viewports & Responsiveness

| Test Case ID | Target Viewport | Screen Width | Expected Layout Adaptations |
| :--- | :--- | :--- | :--- |
| **TC-VP-01** | iPhone SE (Compact) | 360px | Summary card padding drops to `px-2`. Text size is `text-xs`. Merchant names truncate to 15 chars. Bottom CTA displays stats in one line. |
| **TC-VP-02** | iPhone 14 (Standard) | 390px | Default spacing `px-3` applied. Merchant names truncate at 20 chars. Sticky CTA padding uses safe area inset helper. |
| **TC-VP-03** | iPhone Max (Large) | 430px | Standard padding expanded to `px-4`. Spacing relaxed. Merchant names displayed without truncation. |
| **TC-VP-04** | Keyboard Resizing | Interactive input active | Sticky bottom CTA panel hides from view when virtual keyboard is active, restoring max view height. Panel reappears on blur. |
| **TC-VP-05** | Touch Targets | Mobile touch targets | All interactive buttons, chips, and checkboxes have a minimum physical size of `44px x 44px`. |
