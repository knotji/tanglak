# TangLak Release Acceptance Criteria

This document defines the strict Quality Gates and acceptance criteria that must be satisfied before shipping any release to production.

---

## 1. Automated Quality Gates

Before any build is promoted to production, the codebase must pass these automated verification checks in the release environment:

*   **Clean Dependency Tree**: Run `npm ci` without errors or peer-dependency conflicts.
*   **Static Analysis**: `npm run lint` must finish with `0 errors` (warnings should be resolved or reviewed).
*   **Compilation**: `npm run typecheck` must pass with zero TypeScript errors.
*   **Unit & Component Tests**: `npm run test` must execute and pass `100%` of test files (minimum 130+ assertions).
*   **Production Build**: `npm run build` must complete successfully, generating optimized routes without static compilation errors.
*   **Optional E2E Tests**: Playwright smoke tests (`npm run test:e2e`) should verify key critical paths (Sign-in, document uploads, statement parses).

---

## 2. Mobile Viewport Standards

All routes must render without structural errors or clipping on the standard target widths:
*   **360px** (e.g., Samsung Galaxy S8/S20)
*   **390px** (e.g., iPhone 12/13/14)
*   **430px** (e.g., iPhone 14/15 Pro Max)

### Visual Checklist
1.  **Horizontal Scrolling**: `document.documentElement.scrollWidth <= window.innerWidth` must be true. No route may allow horizontal page scrolling or structural text overflow.
2.  **Bottom Navigation Spacing**: Layout content must wrap in the main container with bottom padding (e.g., `pb-28`) matching the height of the fixed navigation bar, accounting for the mobile bottom safe area (`env(safe-area-inset-bottom)`).
3.  **Keyboard Occlusion**: All forms displayed within bottom sheets or overlays must adapt when the software keyboard is active, ensuring input fields and primary CTA buttons scroll into view and are not covered.
4.  **Thai Text Wrapping**: Dynamic strings (merchants, transaction notes, account labels) must wrap gracefully using truncation (`truncate`) or word breaks (`break-words`) to prevent rendering layout breaks.

---

## 3. Accessibility Standards (WCAG 2.1 AA Compliance)

Interactive elements and dynamic pages must support keyboards and assistive technologies.

### Form Field Criteria
*   **Explicit Label Associations**: Every text input, checkbox, select dropdown, and textarea must be explicitly associated with its label.
    *   *Correct*: `<label htmlFor="field-id">Label</label><input id="field-id" />`
    *   *Violation*: Floating disconnected labels or sibling inputs without matching IDs and attributes.
*   **Form Errors**: Inline error alerts must be associated with the relevant inputs using `aria-describedby` or wrapped in an `aria-live` element so validation errors are announced to screen readers.

### Modals & Dialog Interactivity
*   **Focus Management**: When an overlay (modal, bottom sheet, or pop-up confirm dialog) opens:
    1.  Focus must automatically move to the first focusable element inside the modal.
    2.  Focus must be trapped inside the modal (users cannot Tab to the page underneath).
    3.  When the modal is dismissed, focus must return to the element that triggered it.
*   **Keyboard Dismissal**: Pressing the `Escape` key must dismiss the modal overlay.

### Screen Reader Semantics
*   **Descriptive Buttons & Links**: Avoid generic links ("ประวัติ") or action buttons ("แก้ไข", "ลบ", "ย้อนกลับ"). Provide descriptive text via `aria-label` or visually hidden span overlays, e.g., `<button aria-label="ลบรายการ GrabFood">ลบ</button>`.
*   **Iframe Identity**: Every `<iframe>` element (such as PDF statement preview containers) must define a descriptive `title` attribute.
*   **Skeleton Hiding**: All layout loading skeletons must declare `aria-hidden="true"` to prevent screen readers from reading empty layout placeholders.

### Contrast & Sizing
*   **Contrast Ratio**: All text styles must meet WCAG 2.1 AA requirements of at least **4.5:1** for normal text. Check secondary grays (`#69736E` text-secondary vs `#F5F3EC` main background).
*   **Touch Targets**: Buttons, icons, and selectable items must have a minimum interactive hit area of **44px by 44px** on mobile screens.

---

## 4. Loading States & Offline Capabilities

To ensure a resilient and high-fidelity user experience, loading and error states must satisfy:

1.  **Distinct UI Boundaries**: Distinct interfaces must be rendered for:
    *   `loading`: skeleton layout or progress indicator.
    *   `empty`: "no data" message with a call to action.
    *   `failed`: warning alert with an explanation.
    *   `offline`: offline banner/notice.
    *   `unauthorized`: redirect to login or login notice.
2.  **No Flicker / Flash**: Empty states must not flash on the screen during loading page transitions.
3.  **Loading Message Stability**: Delayed messages must trigger timers correctly (e.g., transition message after 1.5s, retry control after 5s) and must not flicker during fast page renders.
4.  **Offline Data Protection**: Unsaved transaction items created when offline must persist to localStorage as drafts, and clear notices should instruct the user to sync when connection is restored.

---

## 5. Security & Isolation Verification

*   **Multi-tenant RLS Validation**: Database security policies must prevent users from accessing or modifying records belonging to other users. Attempting to query another tenant's file ID or transaction ID must return a `404` or `403`.
*   **Traceable Rollbacks**: Every batch data import (PDF or CSV) must keep record metadata to allow users to trigger a full rollback at any time, returning their transaction history to its exact pre-import state.
