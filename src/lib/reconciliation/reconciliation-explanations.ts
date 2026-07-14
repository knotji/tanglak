/**
 * Deterministic Thai explanation templates for reconciliation
 * candidates -- mirrors src/lib/autopilot/autopilot-explanations.ts.
 * What the user would eventually see (PR B's Review Inbox) is generated
 * only from structured reason codes / the policy outcome, never from
 * raw AI prose, chain-of-thought, or an unexplained confidence number.
 * No dependency on any AI provider.
 */

import type {
  ReconciliationCandidateType,
  ReconciliationEvidence,
  ReconciliationPolicyOutcome,
  ReconciliationReasonCode,
} from "./reconciliation-types";

const REASON_CODE_TEXT_TH: Record<ReconciliationReasonCode, string> = {
  amount_exact_match: "จำนวนเงินตรงกันพอดี",
  reference_match: "เลขอ้างอิงตรงกัน",
  merchant_similar: "ชื่อร้านค้าคล้ายกัน",
  merchant_exact_match: "ชื่อร้านค้าตรงกัน",
  same_document_id: "มาจากเอกสารเดียวกัน",
  distinct_source_records: "เป็นรายการที่บันทึกแยกกันสองรายการ",
  timestamp_within_window: "เวลาที่เกิดรายการใกล้เคียงกัน",
  insufficient_evidence: "ยังมีหลักฐานไม่เพียงพอที่จะสรุปได้เอง",
  multiple_possible_matches: "พบรายการที่อาจจับคู่ได้มากกว่าหนึ่งรายการ",
  opposite_direction: "ทิศทางเงินตรงข้ามกัน (เข้า-ออก)",
  self_match_rejected: "ไม่สามารถจับคู่รายการเดียวกันกับตัวเองได้",
  cross_user_rejected: "ไม่สามารถจับคู่ข้ามบัญชีผู้ใช้ได้",
  account_hint_match: "เลขบัญชีต้นทาง-ปลายทางสอดคล้องกัน",
  transfer_like_source: "หลักฐานมีลักษณะเป็นสลิปโอนเงิน",
  same_import_source: "มาจากช่องทางบันทึกข้อมูลเดียวกัน",
  different_import_source: "มาจากช่องทางบันทึกข้อมูลคนละช่องทาง",
  same_bangkok_day: "เกิดขึ้นในวันเดียวกัน (เวลาไทย)",
  explicit_debt_destination: "ชื่อร้านค้าหรือบันทึกระบุชื่อหนี้ตรงกันชัดเจน",
  due_date_proximity: "ใกล้เคียงกับวันครบกำหนดชำระหนี้",
  multiple_debt_matches: "พบหนี้ที่ตรงเงื่อนไขมากกว่าหนึ่งรายการ",
  partial_refund_amount: "ยอดคืนเงินน้อยกว่ายอดซื้อเดิม (คืนเงินบางส่วน)",
  multiple_earlier_expenses: "พบรายการซื้อก่อนหน้าที่ตรงเงื่อนไขมากกว่าหนึ่งรายการ",
};

export function reconciliationReasonCodeText(reasonCode: ReconciliationReasonCode): string {
  return REASON_CODE_TEXT_TH[reasonCode];
}

/** Short, plain-language summary built only from reason codes already present -- never inventing a reason that wasn't actually established. */
export function buildReconciliationEvidenceSummary(evidence: ReconciliationEvidence[]): string {
  if (evidence.length === 0) return "";
  return evidence.map((item) => reconciliationReasonCodeText(item.reasonCode)).join(" · ");
}

const CANDIDATE_TYPE_LABEL_TH: Record<ReconciliationCandidateType, string> = {
  own_account_transfer: "การโอนเงินระหว่างบัญชีของคุณเอง",
  possible_duplicate: "รายการที่อาจซ้ำกัน",
  likely_debt_payment: "การชำระหนี้",
  possible_refund: "เงินคืน",
};

export type ReconciliationExplanationContext = {
  candidateType: ReconciliationCandidateType;
  policyOutcome: ReconciliationPolicyOutcome;
  evidence: ReconciliationEvidence[];
};

/**
 * The deterministic fallback copy PR B's Review Inbox can always render,
 * independent of any AI-generated natural-language variant. `auto_match_safe`
 * still renders as a review prompt, not a "done" message -- PR A never
 * executes it, so the copy must never imply that anything was written.
 */
export function buildDeterministicReconciliationExplanation(context: ReconciliationExplanationContext): string {
  const label = CANDIDATE_TYPE_LABEL_TH[context.candidateType];

  switch (context.policyOutcome) {
    case "auto_match_safe":
      return `TangLak พบว่ารายการนี้น่าจะเป็น${label}ด้วยหลักฐานที่ชัดเจน กรุณาตรวจสอบก่อนยืนยัน`;
    case "suggest_with_notice":
      return `TangLak พบว่ารายการนี้น่าจะเป็น${label} กรุณาตรวจสอบก่อนยืนยัน`;
    case "require_confirmation":
      return `TangLak พบรายการที่อาจเกี่ยวข้องกับ${label} กรุณาตรวจสอบและยืนยันด้วยตนเอง`;
    case "reject_candidate": {
      const primary = context.evidence[0]?.reasonCode;
      if (primary) return reconciliationReasonCodeText(primary);
      return `ไม่สามารถประมวลผลรายการ${label}นี้ได้`;
    }
    default:
      return "TangLak ตรวจพบความสัมพันธ์ระหว่างรายการนี้กับรายการอื่น";
  }
}
