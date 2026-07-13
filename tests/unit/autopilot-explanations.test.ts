import { describe, it, expect } from "vitest";
import { buildDeterministicExplanation } from "@/lib/autopilot/autopilot-explanations";

describe("autopilot deterministic explanations", () => {
  it("produces the exact auto_execute copy", () => {
    const text = buildDeterministicExplanation({
      decision: "auto_execute",
      evidence: [],
      amountSatang: 12_000,
      categoryLabel: "อาหารและเครื่องดื่ม",
    });
    expect(text).toBe("บันทึกรายการ ฿120 เป็นอาหารและเครื่องดื่มแล้ว");
  });

  it("produces the exact execute_with_notice copy", () => {
    const text = buildDeterministicExplanation({
      decision: "execute_with_notice",
      evidence: [],
      categoryLabel: "อาหารและเครื่องดื่ม",
    });
    expect(text).toBe("บันทึกรายการแล้ว และจัดหมวดเป็นอาหารและเครื่องดื่มโดยอัตโนมัติ");
  });

  it("produces the exact possible-internal-transfer confirmation copy", () => {
    const text = buildDeterministicExplanation({
      decision: "require_confirmation",
      evidence: [{ reasonCode: "possible_internal_transfer" }],
    });
    expect(text).toBe("TangLak ยังไม่แน่ใจว่ารายการนี้เป็นค่าใช้จ่ายหรือเงินโอน กรุณาตรวจเฉพาะจุดนี้");
  });

  it("still returns safe, non-empty copy for reject with no evidence (Gemini-independent fallback)", () => {
    const text = buildDeterministicExplanation({ decision: "reject", evidence: [] });
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it("never includes raw confidence numbers or JSON in any generated copy", () => {
    const text = buildDeterministicExplanation({
      decision: "require_confirmation",
      evidence: [{ reasonCode: "possible_duplicate" }],
      amountSatang: 5000,
    });
    expect(text).not.toMatch(/[{}[\]]/);
    expect(text).not.toMatch(/0\.\d+/);
  });
});
