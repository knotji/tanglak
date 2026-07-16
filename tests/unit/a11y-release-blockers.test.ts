import fs from "node:fs";
import path from "node:path";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileBottomSheet } from "@/components/MobileBottomSheet";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { InlineError } from "@/components/feedback/InlineError";
import { UploadClient } from "@/app/upload/UploadClient";

function readProjectFile(filePath: string) {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function cleanup(root: Root, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("accessibility release blockers", () => {
  it("activates the upload card with Enter and Space without repeat-triggering the file dialog", () => {
    const { container, root } = render(React.createElement(UploadClient));
    const uploadCard = container.querySelector<HTMLElement>('[role="button"][aria-controls="document-upload-file"]');
    const input = container.querySelector<HTMLInputElement>("#document-upload-file");
    expect(uploadCard).toBeTruthy();
    expect(input).toBeTruthy();
    const clickSpy = vi.spyOn(input!, "click").mockImplementation(() => undefined);

    uploadCard!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    uploadCard!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    uploadCard!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", repeat: true, bubbles: true, cancelable: true }));

    expect(clickSpy).toHaveBeenCalledTimes(2);
    cleanup(root, container);
  });

  it("keeps visible review labels associated with controls and removes the old import form", () => {
    const reviewForm = readProjectFile("src/app/upload/review/[documentId]/ReviewForm.tsx");
    const historyImportPage = readProjectFile("src/app/history-import/page.tsx");

    expect(reviewForm).toContain('htmlFor={reviewFieldId("employer")}');
    expect(reviewForm).toContain('id={reviewFieldId("employer")}');
    expect(reviewForm).toContain('htmlFor={reviewFieldId("subtotal")}');
    expect(reviewForm).toContain('id={reviewFieldId("subtotal")}');
    expect(reviewForm).not.toContain('<label className="block');
    expect(historyImportPage).not.toContain("HistoryImportClient");
    expect(historyImportPage).not.toContain("input[type='file']");
  });

  it("adds contextual action names and practical mobile touch target classes", () => {
    const transactionRow = readProjectFile("src/components/TransactionRow.tsx");
    const transactionsClient = readProjectFile("src/features/transactions/TransactionsClient.tsx");
    const debtsClient = readProjectFile("src/features/debts/DebtsClient.tsx");
    const settingsData = readProjectFile("src/app/settings/data/HistoryImportBatchList.tsx");

    // TransactionRow is now a single action button leading to an action sheet
    expect(transactionRow).toContain("aria-label={`เปิดรายละเอียดรายการ ${actionContext}`}");
    expect(transactionRow).toContain('className="flex w-full items-center gap-3 py-3');

    // Actions moved to TransactionsClient sheet
    expect(transactionsClient).toContain("แก้ไขรายการ");
    expect(transactionsClient).toContain("ลบรายการนี้");
    expect(transactionsClient).toContain('className="flex w-full items-center gap-3 rounded-[16px] bg-surface p-4');

    expect(debtsClient).toContain("aria-label={`ดูประวัติหนี้ ${debt.name}`}");
    expect(settingsData).toContain("aria-label={`ย้อนกลับ (Rollback) ชุดนำเข้า ${batchContext}`}");
    expect(settingsData).toContain("min-h-11");
  });

  it("traps focus in confirm dialogs, closes with Escape, and restores focus", () => {
    const opener = document.createElement("button");
    opener.textContent = "open";
    document.body.append(opener);
    opener.focus();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container, root } = render(
      React.createElement(ConfirmDialog, {
        open: true,
        title: "Delete item?",
        body: "This cannot be undone.",
        onCancel,
        onConfirm,
      }),
    );

    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    expect(dialog).toBeTruthy();
    expect(document.activeElement).toBe(buttons[0]);

    buttons[1].focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(buttons[0]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        React.createElement(ConfirmDialog, {
          open: false,
          title: "Delete item?",
          body: "This cannot be undone.",
          onCancel,
          onConfirm,
        }),
      );
    });
    expect(document.activeElement).toBe(opener);
    cleanup(root, container);
  });

  it("applies dialog focus behavior to bottom sheets", () => {
    const opener = document.createElement("button");
    opener.textContent = "open";
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const { container, root } = render(
      React.createElement(
        MobileBottomSheet,
        { title: "Edit item", open: true, onClose },
        React.createElement("button", { type: "button" }, "Save"),
      ),
    );

    expect(container.querySelector('[role="dialog"][aria-modal="true"]')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        React.createElement(
          MobileBottomSheet,
          { title: "Edit item", open: false, onClose },
          React.createElement("button", { type: "button" }, "Save"),
        ),
      );
    });
    expect(document.activeElement).toBe(opener);
    cleanup(root, container);
  });

  it("titles the PDF preview iframe and announces inline errors", () => {
    const reviewForm = readProjectFile("src/app/upload/review/[documentId]/ReviewForm.tsx");
    expect(reviewForm).toContain('title="ตัวอย่างเอกสาร PDF สำหรับตรวจสอบ"');

    const { container, root } = render(React.createElement(InlineError, { message: "Required" }));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Required");
    cleanup(root, container);
  });
});
