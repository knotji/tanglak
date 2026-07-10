# TangLak Mobile UX and Accessibility Audit

This document presents a comprehensive audit of TangLak's mobile user experience, WCAG 2.1 accessibility compliance, and loading state stability, performed on the `audit/mobile-accessibility-qa` branch.

## Executive Summary

An audit of the 16 target routes across three mobile viewport widths (360px, 390px, 430px) was conducted using manual inspection, keyboard simulation, and static code analysis.

### Finding Counts by Severity
*   **Critical**: 2
*   **High**: 4
*   **Medium**: 5
*   **Low**: 2
*   **Informational**: 1
*   **Total Findings**: 14
*   **Release Blockers**: 6

---

## 1. Detailed Audit Findings

### [Critical] Finding 1: Upload Card is Completely Inaccessible via Keyboard / Screen Reader
*   **Route**: `/upload`
*   **Component**: [UploadClient.tsx](file:///C:/Project/tanglak-qa/src/app/upload/UploadClient.tsx#L124-L135)
*   **Reproduction Steps**:
    1. Navigate to `/upload` using a keyboard or screen reader.
    2. Attempt to tab onto the main upload card ("ถ่ายรูป หรือเลือกไฟล์").
    3. Notice that focus completely skips this card because it is implemented as a `<section>` with an `onClick` handler but lacks interactive semantics.
*   **Impact**: Keyboard-only and screen reader users cannot activate the document upload dialog. They are locked out of the core PDF/image statement extraction feature.
*   **Recommended Fix**: Add `role="button"`, `tabIndex={0}`, and an `onKeyDown` listener listening for Space and Enter to trigger file selector click.
*   **Release Blocker**: Yes

### [Critical] Finding 2: Form Inputs Disconnected from Labels in AI Review Form
*   **Route**: `/upload/review/[documentId]`
*   **Component**: [ReviewForm.tsx](file:///C:/Project/tanglak-qa/src/app/upload/review/%5BdocumentId%5D/ReviewForm.tsx#L443-L1190)
*   **Reproduction Steps**:
    1. Navigate to `/upload/review/[documentId]`.
    2. Focus on the "นายจ้าง / บริษัท" input field or "ยอดรวมย่อย (Sub)" input.
    3. Inspect the DOM; notice that `<label>` is sibling to `<input>` with no `htmlFor` and `id` linking.
*   **Impact**: Screen readers cannot read the labels of the focused fields, announcing them only as "Edit text, blank." This makes correcting the AI extraction details impossible for visually impaired users.
*   **Recommended Fix**: Add a unique `id` to each `<input>`/`<select>` and link them by adding a matching `htmlFor` attribute on the corresponding `<label>`.
*   **Release Blocker**: Yes

### [High] Finding 3: Hardcoded "วันนี้" Date Causes Incorrect UX Display
*   **Route**: `/today`, `/transactions`
*   **Component**: [TransactionGroup.tsx](file:///C:/Project/tanglak-qa/src/components/TransactionGroup.tsx#L11)
*   **Reproduction Steps**:
    1. View the "วันนี้" dashboard on any day other than July 10, 2026.
    2. Check transaction group headers.
    3. Notice that transactions occurring on the actual current date are not marked as "วันนี้" because the code hardcodes:
       `return date.startsWith("2026-07-10") ? "วันนี้ · " + formatted : formatted;`
*   **Impact**: The main user cockpit ("ดูเงินวันนี้แบบไม่ต้องคิดเยอะ") fails to indicate today's date dynamically, causing confusing UX.
*   **Recommended Fix**: Replace the hardcoded string with a dynamic comparison against `new Date().toISOString().slice(0, 10)`.
*   **Release Blocker**: Yes

### [High] Finding 4: Form Inputs Disconnected from Labels in History Import
*   **Route**: `/history-import`
*   **Component**: [HistoryImportClient.tsx](file:///C:/Project/tanglak-qa/src/app/history-import/HistoryImportClient.tsx#L101-L155)
*   **Reproduction Steps**:
    1. Navigate to `/history-import`.
    2. Use a screen reader or keyboard to select a source account or upload format.
    3. Notice the select/file dropzone elements do not link with the descriptive label text.
*   **Impact**: Blind or low-vision users cannot understand what inputs they are editing.
*   **Recommended Fix**: Add unique `id` and corresponding `htmlFor` attributes to associate labels and controls.
*   **Release Blocker**: Yes

### [High] Finding 5: Non-Descriptive Buttons & Links in Lists
*   **Route**: `/debts`, `/settings/data`, `/transactions`
*   **Component**: [DebtsClient.tsx](file:///C:/Project/tanglak-qa/src/features/debts/DebtsClient.tsx#L110-L131), [page.tsx](file:///C:/Project/tanglak-qa/src/app/settings/data/page.tsx#L125-L189), [TransactionRow.tsx](file:///C:/Project/tanglak-qa/src/components/TransactionRow.tsx#L52-L63)
*   **Reproduction Steps**:
    1. Open screen reader link/button list overlay.
    2. Read the elements on `/debts` or `/settings/data`.
    3. Notice multiple links named "ประวัติ" or buttons named "แก้ไข", "ลบ", and "ย้อนกลับ (Rollback)" without context.
*   **Impact**: Screen readers cannot determine *which* item is being deleted, modified, or rolled back, which is a major WCAG 2.4.4 violation.
*   **Recommended Fix**: Add descriptive `aria-label` attributes to the buttons and links, e.g., `aria-label={"ประวัติการชำระของ " + debt.name}`.
*   **Release Blocker**: Yes

### [High] Finding 6: Dialogs & Bottom Sheets Lack Focus Trapping & Keyboard Closing
*   **Route**: All routes using Modals / Sheets
*   **Component**: [ConfirmDialog.tsx](file:///C:/Project/tanglak-qa/src/components/feedback/ConfirmDialog.tsx#L22-L35), [MobileBottomSheet.tsx](file:///C:/Project/tanglak-qa/src/components/MobileBottomSheet.tsx#L19-L38)
*   **Reproduction Steps**:
    1. Trigger a confirm dialog (e.g., delete a transaction or payment).
    2. Press the `Tab` key repeatedly.
    3. Observe that focus exits the dialog overlay and focuses on elements behind the modal.
    4. Press `Esc` and observe that the dialog does not close.
*   **Impact**: Keyboard users cannot navigate overlays safely, and screen readers will continue reading elements underneath the dialog, causing confusion and action errors.
*   **Release Blocker**: Yes
*   **Recommended Fix**: Implement focus trapping using a library or a ref effect, move focus automatically inside the dialog upon mount, and bind a key listener for `Escape`.

### [Medium] Finding 7: Touch-Target Size Violation on List Actions
*   **Route**: `/transactions`, `/debts/[debtId]`
*   **Component**: [TransactionRow.tsx](file:///C:/Project/tanglak-qa/src/components/TransactionRow.tsx#L52-L63)
*   **Reproduction Steps**:
    1. Inspect the "แก้" and "ลบ" buttons inside any transaction list row.
    2. Observe the classes `min-h-9 px-2` (which evaluates to a height of 36px).
*   **Impact**: The height is less than the standard 44px (Apple HIG) or 48px (WCAG 2.1) touch target recommendation. Users with motor impairments or large thumbs will experience frequent misclicks.
*   **Recommended Fix**: Increase the height to `min-h-11` (44px) or add transparent padding to increase the active hit area to 44px.
*   **Release Blocker**: No

### [Medium] Finding 8: Delayed Loading Message Condition Bug
*   **Route**: `/today/loading`, `/overview/loading`, etc.
*   **Component**: [DelayedLoadingMessage.tsx](file:///C:/Project/tanglak-qa/src/components/feedback/DelayedLoadingMessage.tsx#L44)
*   **Reproduction Steps**:
    1. Inspect the template expression:
       `<span>{retryVisible ? slowMessage : slow ? message : message}</span>`
    2. Observe that if `slow` is true and `retryVisible` is false, it returns `message` instead of `slowMessage`.
*   **Impact**: The middle "slow" state (designed to reduce anxiety by updating status to "ใช้เวลานานกว่าปกติ") never triggers. The message stays as the basic "กำลังโหลด..." until the retry button appears at 5 seconds.
*   **Recommended Fix**: Fix the ternary operation:
       `<span>{retryVisible ? slowMessage : slow ? slowMessage : message}</span>`
*   **Release Blocker**: No

### [Medium] Finding 9: PDF Preview `<iframe>` Lacks Title Tag
*   **Route**: `/upload/review/[documentId]`
*   **Component**: [ReviewForm.tsx](file:///C:/Project/tanglak-qa/src/app/upload/review/%5BdocumentId%5D/ReviewForm.tsx#L313)
*   **Reproduction Steps**:
    1. Open `/upload/review/[documentId]` for a PDF document.
    2. Inspect the preview container.
    3. Observe `<iframe src={previewUrl} className="h-[500px] w-full border-0" />`
*   **Impact**: Screen readers cannot identify the iframe content, violating WCAG 4.1.2.
*   **Recommended Fix**: Add a descriptive title, e.g., `title="ตัวอย่างเอกสาร PDF สัญญา/สลิป"`
*   **Release Blocker**: No

### [Medium] Finding 10: Dynamic loading / filter transitions flash empty states
*   **Route**: `/transactions`
*   **Component**: [TransactionsClient.tsx](file:///C:/Project/tanglak-qa/src/features/transactions/TransactionsClient.tsx#L84-L102)
*   **Reproduction Steps**:
    1. Click on filter tabs ("รายจ่าย", "รายรับ").
    2. Observe that if filtering takes a few hundred milliseconds, it immediately switches between lists without a skeleton or transition, occasionally flashing the "ยังไม่มีรายการ" (Empty) state.
*   **Impact**: Unstable layout and layout shifts (CLS) on low-end mobile devices during search/filter operations.
*   **Recommended Fix**: Introduce a pending transition state using `useTransition` and render a skeleton list while the list is updating.
*   **Release Blocker**: No

### [Medium] Finding 11: Form-Level Error Messages Unannounced to Screen Readers
*   **Route**: `/onboarding`, `/upload/review/[documentId]`, `/debts/[debtId]`
*   **Component**: [InlineError.tsx](file:///C:/Project/tanglak-qa/src/components/feedback/InlineError.tsx#L3)
*   **Reproduction Steps**:
    1. Submit a form with missing info to trigger an inline validation error.
    2. Observe the error container rendering in the DOM.
    3. Notice the paragraph lacks `role="alert"` or `aria-live="assertive"`.
*   **Impact**: Screen reader users do not receive notification that the form submission failed and that an error is present.
*   **Recommended Fix**: Add `role="alert"` to the `<p>` container so it is announced immediately when it is added to the DOM.
*   **Release Blocker**: No

### [Low] Finding 12: Non-Descriptive Alt Text on Review Preview Image
*   **Route**: `/upload/review/[documentId]`
*   **Component**: [ReviewForm.tsx](file:///C:/Project/tanglak-qa/src/app/upload/review/%5BdocumentId%5D/ReviewForm.tsx#L315)
*   **Reproduction Steps**:
    1. Upload an image slip and land on the review page.
    2. Inspect the alt text of the preview image: `alt={doc.originalFilename}`.
*   **Impact**: Screen readers read out unhelpful file names like "alt='IMG_9214.png'" which do not describe the document content.
*   **Recommended Fix**: Change alt text to a readable string, e.g., `"ภาพถ่ายหรือสแกนเอกสารหลักฐานสำหรับตรวจสอบ"`
*   **Release Blocker**: No

### [Low] Finding 13: Color Contrast Risks on Secondary Text
*   **Route**: All main routes (Shell content)
*   **Component**: [globals.css](file:///C:/Project/tanglak-qa/src/app/globals.css#L9) (`--text-secondary` color)
*   **Reproduction Steps**:
    1. Inspect body elements using `--text-secondary` (`#69736E`) against the main background `--background` (`#F5F3EC`).
    2. Calculate contrast ratio: it yields ~4.45:1.
*   **Impact**: WCAG 2.1 AA requires a minimum contrast of 4.5:1 for normal text (under 18pt). The secondary gray text falls slightly short, which may impair readability for users with low contrast sensitivity.
*   **Recommended Fix**: Darken `--text-secondary` from `#69736E` to `#5F6B66` (which gives a contrast of 5.1:1).
*   **Release Blocker**: No

### [Informational] Finding 14: Mobile UX depends on native blocking modal dialogs
*   **Route**: `/transactions`, `/debts`
*   **Component**: [TransactionsClient.tsx](file:///C:/Project/tanglak-qa/src/features/transactions/TransactionsClient.tsx#L49), [DebtsClient.tsx](file:///C:/Project/tanglak-qa/src/features/debts/DebtsClient.tsx#L41)
*   **Reproduction Steps**:
    1. Tap on delete item buttons.
    2. Observe the native browser confirm dialog popup (`window.confirm`).
*   **Impact**: While functional, native prompts halt thread execution and disrupt the custom premium design of the app.
*   **Recommended Fix**: Replace `window.confirm` with a React-based modal popup, similar to the existing `ConfirmDialog` component.
*   **Release Blocker**: No

---

## 2. Recommended Fix Order

To prepare TangLak for a production-ready release, fixes should be applied in the following order:

1.  **Blocker Phase 1 (Critical A11y & Form Accessibility)**
    *   *Finding 1*: Make upload card keyboard focusable and triggerable.
    *   *Finding 2*: Fix label associations in `ReviewForm.tsx`.
    *   *Finding 4*: Fix label associations in `HistoryImportClient.tsx`.
2.  **Blocker Phase 2 (Functional UX & Modals)**
    *   *Finding 3*: Fix the hardcoded date logic in `TransactionGroup.tsx`.
    *   *Finding 5*: Add `aria-label` tags to lists and list-actions.
    *   *Finding 6*: Implement focus traps and escape key events on dialogs and bottom sheets.
3.  **Optimization Phase (Medium/Low Severity)**
    *   *Finding 7*: Increase touch-target size of row buttons to 44px.
    *   *Finding 8*: Fix ternary logic for delayed loading messages.
    *   *Finding 9*: Add titles to iframe previews.
    *   *Finding 11*: Add `role="alert"` or `aria-live` to form errors.
    *   *Finding 13*: Adjust secondary text color in variables to meet contrast guidelines.
