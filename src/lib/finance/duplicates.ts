import type { DuplicateCandidate, Transaction } from "@/types/domain";

function minutesBetween(left: string, right: string): number {
  return Math.abs(new Date(left).getTime() - new Date(right).getTime()) / 60_000;
}

export function scoreDuplicateCandidate(
  incoming: Transaction,
  existing: Transaction,
): DuplicateCandidate {
  const reasons: string[] = [];
  let score = 0;

  if (
    incoming.referenceNumber &&
    incoming.referenceNumber === existing.referenceNumber
  ) {
    score += 90;
    reasons.push("เลขอ้างอิงตรงกัน");
  }

  if (incoming.amountSatang === existing.amountSatang) {
    score += 25;
    reasons.push("ยอดเงินเท่ากัน");
  }

  if (
    incoming.merchant &&
    existing.merchant &&
    incoming.merchant.toLowerCase() === existing.merchant.toLowerCase()
  ) {
    score += 25;
    reasons.push("ร้านค้าตรงกัน");
  }

  if (incoming.occurredAt.slice(0, 10) === existing.occurredAt.slice(0, 10)) {
    score += 15;
    reasons.push("วันที่เดียวกัน");
  }

  if (minutesBetween(incoming.occurredAt, existing.occurredAt) <= 10) {
    score += 25;
    reasons.push("เวลาใกล้กันไม่เกิน 10 นาที");
  }

  if (
    incoming.accountLastFour &&
    existing.accountLastFour &&
    incoming.accountLastFour === existing.accountLastFour
  ) {
    score += 15;
    reasons.push("เลขบัญชีสี่ตัวท้ายตรงกัน");
  }

  if (incoming.debtId && existing.debtId && incoming.debtId === existing.debtId) {
    score += 20;
    reasons.push("หนี้สินที่เกี่ยวข้องตรงกัน");
  }

  if (incoming.source && existing.source && incoming.source === existing.source) {
    score += 10;
    reasons.push("ประเภทหลักฐานตรงกัน");
  }

  return {
    transactionId: existing.id,
    score: Math.min(100, score),
    reasons,
  };
}

export function findDuplicateCandidates(
  incoming: Transaction,
  existing: Transaction[],
): DuplicateCandidate[] {
  return existing
    .map((transaction) => scoreDuplicateCandidate(incoming, transaction))
    .filter((candidate) => candidate.score >= 25)
    .sort((a, b) => b.score - a.score);
}
