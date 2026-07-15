import fs from "node:fs";
import path from "node:path";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";

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

describe("ConfirmDialog tone styling extension", () => {
  it("uses bg-overdue class for destructive tone (default)", () => {
    const { container, root } = render(
      <ConfirmDialog
        open
        title="ลบข้อมูล?"
        body="ข้อมูลจะหายไปถาวร"
        confirmLabel="ลบ"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    );
    const buttons = Array.from(container.querySelectorAll("button"));
    const confirmButton = buttons[1];
    expect(confirmButton).toBeTruthy();
    expect(confirmButton.className).toContain("bg-overdue");
    expect(confirmButton.className).not.toContain("bg-primary");
    cleanup(root, container);
  });

  it("uses bg-primary class when tone is set to primary", () => {
    const { container, root } = render(
      <ConfirmDialog
        open
        title="นำเข้า?"
        body="กดยืนยันเพื่อนำเข้า"
        confirmLabel="นำเข้า"
        tone="primary"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    );
    const buttons = Array.from(container.querySelectorAll("button"));
    const confirmButton = buttons[1];
    expect(confirmButton).toBeTruthy();
    expect(confirmButton.className).toContain("bg-primary");
    expect(confirmButton.className).not.toContain("bg-overdue");
    cleanup(root, container);
  });
});

describe("Static regression checks for native dialogs", () => {
  it("ensures no native alert or confirm are used in ReviewForm.tsx", () => {
    const code = readProjectFile("src/app/upload/review/[documentId]/ReviewForm.tsx");
    // Verify that the code doesn't contain alert() or confirm()
    expect(code).not.toContain("alert(");
    expect(code).not.toContain("confirm(");
    expect(code).not.toContain("window.alert");
    expect(code).not.toContain("window.confirm");
  });

  it("ensures no native alert or confirm are used in ReviewBoardClient.tsx", () => {
    const code = readProjectFile("src/app/history-import/[batchId]/review/ReviewBoardClient.tsx");
    expect(code).not.toContain("alert(");
    expect(code).not.toContain("confirm(");
    expect(code).not.toContain("window.alert");
    expect(code).not.toContain("window.confirm");
  });

  it("ensures no native alert or confirm are used in BudgetClient.tsx", () => {
    const code = readProjectFile("src/features/budget/BudgetClient.tsx");
    expect(code).not.toContain("alert(");
    expect(code).not.toContain("confirm(");
    expect(code).not.toContain("window.alert");
    expect(code).not.toContain("window.confirm");
  });
});
