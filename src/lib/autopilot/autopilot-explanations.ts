/**
 * Deterministic explanation templates. What the user sees is generated
 * from structured reason codes and the policy/validation result only --
 * never raw AI prose, chain-of-thought, or an unexplained confidence
 * number. This module has no dependency on any AI provider, so the UI
 * always has something safe to show even if Gemini/explanation copy
 * generation fails entirely.
 */

import { formatTHB } from "@/lib/finance/money";
import type { AutopilotDecision, AutopilotEvidence, AutopilotReasonCode } from "./autopilot-types";

const REASON_CODE_TEXT_TH: Record<AutopilotReasonCode, string> = {
  exact_reference_match: "เลขอ้างอิงตรงกับรายการที่มีอยู่แล้ว",
  known_merchant_category: "จดจำร้านค้านี้และจัดหมวดให้โดยอัตโนมัติ",
  canonical_category_valid: "หมวดหมู่ที่ระบุถูกต้องตามรายการมาตรฐาน",
  amount_and_time_confident: "อ่านจำนวนเงินและเวลาได้ชัดเจน",
  possible_internal_transfer: "อาจเป็นการโอนเงินระหว่างบัญชีของคุณเอง",
  possible_duplicate: "อาจซ้ำกับรายการที่มีอยู่แล้ว",
  duplicate_of_existing_transaction: "ตรงกับรายการที่บันทึกไว้แล้ว จึงไม่สร้างรายการซ้ำ",
  protected_manual_category: "หมวดหมู่นี้ถูกแก้ไขโดยคุณเอง TangLak จะไม่เปลี่ยนให้อัตโนมัติ",
  invalid_transaction_amount: "จำนวนเงินไม่ถูกต้อง",
  unsupported_category: "หมวดหมู่หรือประเภทรายการไม่รองรับ",
  missing_critical_timestamp: "ไม่พบวันที่และเวลาที่ชัดเจน",
  low_extraction_confidence: "อ่านข้อมูลจากเอกสารได้ไม่ชัดเจนพอ",
  schema_invalid: "ข้อมูลที่อ่านได้ไม่ครบตามรูปแบบที่ต้องการ",
  action_not_allowlisted: "การกระทำนี้ไม่อยู่ในรายการที่อนุญาต",
  transaction_modified_since_execution: "รายการนี้ถูกแก้ไขหลังจากที่ระบบสร้างขึ้น",
  already_undone: "รายการนี้ถูกยกเลิกไปแล้ว",
  not_owner: "ไม่พบสิทธิ์เข้าถึงรายการนี้",
};

export function reasonCodeText(reasonCode: AutopilotReasonCode): string {
  return REASON_CODE_TEXT_TH[reasonCode];
}

export type ExplanationContext = {
  decision: AutopilotDecision;
  evidence: AutopilotEvidence[];
  amountSatang?: number;
  categoryLabel?: string;
};

/**
 * The deterministic fallback copy the UI must always be able to fall back
 * to, independent of any AI-generated natural-language variant. Matches
 * the exact Thai copy specified for each confidence tier.
 */
export function buildDeterministicExplanation(context: ExplanationContext): string {
  const amountText = context.amountSatang !== undefined ? formatTHB(context.amountSatang) : "";
  const categoryText = context.categoryLabel ?? "";

  switch (context.decision) {
    case "auto_execute":
      return `บันทึกรายการ ${amountText} เป็น${categoryText}แล้ว`;
    case "execute_with_notice":
      return `บันทึกรายการแล้ว และจัดหมวดเป็น${categoryText}โดยอัตโนมัติ`;
    case "require_confirmation": {
      if (context.evidence.some((item) => item.reasonCode === "possible_internal_transfer")) {
        return "TangLak ยังไม่แน่ใจว่ารายการนี้เป็นค่าใช้จ่ายหรือเงินโอน กรุณาตรวจเฉพาะจุดนี้";
      }
      if (context.evidence.some((item) => item.reasonCode === "possible_duplicate")) {
        return "TangLak พบรายการที่คล้ายกันอยู่แล้ว กรุณาตรวจสอบก่อนบันทึก";
      }
      return "TangLak ยังไม่มั่นใจในข้อมูลบางส่วน กรุณาตรวจสอบก่อนบันทึก";
    }
    case "reject": {
      const primary = context.evidence[0]?.reasonCode;
      if (primary) return reasonCodeText(primary);
      return "ไม่สามารถบันทึกรายการนี้ได้โดยอัตโนมัติ";
    }
    default:
      return "TangLak ประมวลผลรายการนี้แล้ว";
  }
}

/**
 * A short, plain-language summary of why -- built only from reason codes
 * already present in the validation/policy result, never inventing a
 * reason that wasn't actually established. Used in the autopilot activity
 * list.
 */
export function buildEvidenceSummary(evidence: AutopilotEvidence[]): string {
  if (evidence.length === 0) return "";
  return evidence.map((item) => reasonCodeText(item.reasonCode)).join(" · ");
}
