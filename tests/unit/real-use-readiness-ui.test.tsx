import fs from "node:fs";
import path from "node:path";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { LoadingButton } from "@/components/feedback/LoadingButton";

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
});

describe("real-use readiness UI safeguards", () => {
  it("LoadingButton announces pending work and prevents duplicate submission", () => {
    const { container, root } = render(
      <LoadingButton pending pendingLabel="กำลังบันทึกรายการ...">
        บันทึก
      </LoadingButton>,
    );
    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("aria-busy")).toBe("true");
    expect(button?.textContent).toContain("กำลังบันทึกรายการ...");
    cleanup(root, container);
  });

  it("ConfirmDialog supports destructive pending state without changing the action label contract", () => {
    const { container, root } = render(
      <ConfirmDialog
        open
        title="ลบหนี้?"
        body="รายการจ่ายเดิมจะไม่ถูกลบ"
        confirmLabel="ลบหนี้"
        pendingLabel="กำลังลบ..."
        confirmPending
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[1].getAttribute("aria-busy")).toBe("true");
    expect(buttons[1].textContent).toContain("กำลังลบ...");
    cleanup(root, container);
  });

  it("removes new statement-import form exposure from product navigation", () => {
    const historyPage = readProjectFile("src/app/history-import/page.tsx");
    const settingsPage = readProjectFile("src/app/settings/page.tsx");
    const settingsData = readProjectFile("src/app/settings/data/page.tsx");

    expect(historyPage).not.toContain("HistoryImportClient");
    expect(historyPage).toContain("การนำเข้ารายการย้อนหลังถูกนำออกจากหน้าผลิตภัณฑ์แล้ว");
    expect(settingsPage).not.toContain('href="/history-import"');
    expect(settingsData).not.toContain('href="/history-import"');
  });

  it("keeps debt deletion away from the primary save button and explains preservation", () => {
    const debtsClient = readProjectFile("src/features/debts/DebtsClient.tsx");
    expect(debtsClient).toContain("ใช้เฉพาะเมื่อหนี้นี้ถูกเพิ่มผิด");
    expect(debtsClient).toContain("รายการจ่ายหรือธุรกรรมที่เคยบันทึกไว้จะไม่ถูกลบ");
    expect(debtsClient).toContain("pendingLabel={confirming?.kind === \"delete\" ? \"กำลังลบ...\"");
  });

  it("uses deterministic slip-review loading stages", () => {
    const uploadClient = readProjectFile("src/app/upload/UploadClient.tsx");
    expect(uploadClient).toContain("กำลังอัปโหลดสลิป");
    expect(uploadClient).toContain("กำลังอ่านข้อมูลจากสลิป");
    expect(uploadClient).toContain("ตรวจสอบข้อมูลก่อนบันทึก");
    expect(uploadClient).not.toContain("%");
  });
});
