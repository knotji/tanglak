"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { NextActionCard } from "@/components/NextActionCard";
import {
  confirmDocumentAction,
  deleteDocumentAction,
  retryExtractionAction,
  resolveDuplicateAction,
} from "@/app/actions/documents";
import type { FinanceDocument, DocumentExtraction, Debt, Transaction } from "@/types/domain";
import type { ExtractedFinancialDocument } from "@/lib/ai/schemas";
import { DOCUMENT_EXTRACTION_FALLBACK_MESSAGE } from "@/lib/ai/extraction-errors";
import { formatTHB } from "@/lib/finance/money";
import { getBangkokTodayString, getBangkokNowDateTimeLocalString } from "@/lib/finance/date";
import {
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Trash2,
  ArrowRight,
} from "lucide-react";

interface ReviewFormProps {
  document: FinanceDocument;
  extraction: DocumentExtraction | null;
  debts: Debt[];
  duplicateTransactions: (Transaction & { score: number; reasons: string[] })[];
  previewUrl: string;
}

export function ReviewForm({
  document: initialDocument,
  extraction,
  debts,
  duplicateTransactions,
  previewUrl,
}: ReviewFormProps) {
  const router = useRouter();
  const [doc] = useState<FinanceDocument>(initialDocument);
  const normalizedPreview = extraction?.normalizedPreview as ExtractedFinancialDocument | undefined;
  const [docType, setDocType] = useState<string>(
    normalizedPreview?.documentType || doc.documentType || "other"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const failedMessage = doc.errorMessage && !/Zod|expected|received|[\[\{]|Gemini|quota|stack|Error/i.test(doc.errorMessage)
    ? doc.errorMessage
    : DOCUMENT_EXTRACTION_FALLBACK_MESSAGE;

  // AI Normalized Preview Shortcuts
  const extData = (normalizedPreview || {}) as Partial<ExtractedFinancialDocument>;
  const initialTx = extData.transaction || {};
  const initialSalary = extData.salary || {};
  const initialReceipt = extData.receipt || {};
  const initialDebt = extData.debt || {};

  // Form Fields State
  // 1. Salary slip fields
  const [employer, setEmployer] = useState(initialSalary.employer || initialTx.merchant || "");
  const [payPeriod, setPayPeriod] = useState(initialSalary.payPeriod || "");
  const [grossIncome, setGrossIncome] = useState(initialSalary.grossIncome?.toString() || "");
  const [netIncome, setNetIncome] = useState(
    initialSalary.netIncome?.toString() || initialTx.amount?.toString() || ""
  );
  const [tax, setTax] = useState(initialSalary.tax?.toString() || "0");
  const [socialSecurity, setSocialSecurity] = useState(
    initialSalary.socialSecurity?.toString() || "0"
  );
  const [paymentDate, setPaymentDate] = useState(
    initialTx.occurredAt?.slice(0, 10) || getBangkokTodayString()
  );

  // 2. Receipt / Delivery receipt fields
  const [merchant, setMerchant] = useState(initialTx.merchant || "");
  const [occurredAt, setOccurredAt] = useState(
    initialTx.occurredAt?.slice(0, 16) || getBangkokNowDateTimeLocalString()
  );
  const [subtotal, setSubtotal] = useState(initialReceipt.subtotal?.toString() || "");
  const [deliveryFee, setDeliveryFee] = useState(initialReceipt.deliveryFee?.toString() || "0");
  const [serviceFee, setServiceFee] = useState(initialReceipt.serviceFee?.toString() || "0");
  const [discount, setDiscount] = useState(initialReceipt.discount?.toString() || "0");
  const [totalPaid, setTotalPaid] = useState(
    initialReceipt.totalPaid?.toString() || initialTx.amount?.toString() || ""
  );
  const [paymentMethod, setPaymentMethod] = useState(initialTx.paymentMethod || "Cash");
  const [items, setItems] = useState<Array<{ name: string; quantity?: number; amount?: number }>>(
    initialReceipt.items || []
  );

  // 3. Transfer slip fields
  const [transferAmount, setTransferAmount] = useState(initialTx.amount?.toString() || "");
  const [transferDate, setTransferDate] = useState(
    initialTx.occurredAt?.slice(0, 16) || getBangkokNowDateTimeLocalString()
  );
  const [destinationName, setDestinationName] = useState(initialTx.merchant || "");
  const [refNumber, setRefNumber] = useState(initialTx.referenceNumber || "");
  const [bank, setBank] = useState(initialTx.bank || "");
  const [senderLastFour, setSenderLastFour] = useState(initialTx.accountLastFour || "");
  const [destLastFour, setDestLastFour] = useState(initialTx.destinationAccountLastFour || "");
  const [transferType, setTransferType] = useState<string>(
    initialTx.possibleDebtPayment ? "debt_payment" : initialTx.possibleOwnAccountTransfer ? "transfer" : "expense"
  );
  const [linkedDebtId, setLinkedDebtId] = useState<string>("");

  // 4. Debt statement fields
  const [creditor, setCreditor] = useState(initialDebt.creditor || "");
  const [debtName, setDebtName] = useState(initialDebt.debtName || "");
  const [debtType, setDebtType] = useState(initialDebt.debtType || "credit_card");
  const [outstandingBalance, setOutstandingBalance] = useState(
    initialDebt.outstandingBalance?.toString() || ""
  );
  const [statementBalance, setStatementBalance] = useState(
    initialDebt.statementBalance?.toString() || ""
  );
  const [amountDue, setAmountDue] = useState(initialDebt.amountDue?.toString() || "");
  const [minimumPayment, setMinimumPayment] = useState(initialDebt.minimumPayment?.toString() || "");
  const [dueDate, setDueDate] = useState(initialDebt.dueDate?.slice(0, 10) || "");
  const [interestRate, setInterestRate] = useState(initialDebt.interestRateAnnual?.toString() || "");
  const [remainingInstallments, setRemainingInstallments] = useState(
    initialDebt.remainingInstallments?.toString() || ""
  );
  const [accountLastFour, setAccountLastFour] = useState(initialDebt.accountLastFour || "");
  const [debtActionType, setDebtActionType] = useState<"create" | "update">("create");
  const [existingDebtId, setExistingDebtId] = useState<string>("");
  const reviewFieldId = (field: string) => `review-${doc.id}-${docType}-${field}`;

  // Confidence Calculation
  const confidence = extraction?.confidence ?? 1.0;
  const unclearCount = extraction?.unclearFields?.length ?? 0;
  let thaiConfidenceText = "อ่านได้ชัด";
  let confidenceColor = "bg-green-soft text-primary border-primary/20";

  if (confidence < 0.6 || unclearCount > 0) {
    thaiConfidenceText = "อ่านไม่ครบ";
    confidenceColor = "bg-red-50 text-red-500 border-red-100";
  } else if (confidence < 0.8) {
    thaiConfidenceText = "ควรตรวจอีกครั้ง";
    confidenceColor = "bg-yellow-50 text-yellow-600 border-yellow-100";
  }

  // Action: Retry
  const handleRetry = async () => {
    setIsRetrying(true);
    const res = await retryExtractionAction(doc.id);
    if (res.ok) {
      alert("เริ่มสแกนเอกสารอีกครั้งแล้ว");
      router.refresh();
    } else {
      alert(res.message || DOCUMENT_EXTRACTION_FALLBACK_MESSAGE);
      setIsRetrying(false);
    }
  };

  // Action: Delete
  const handleDelete = async () => {
    if (!confirm("คุณต้องการลบสลิป/หลักฐานและรายการทั้งหมดจากเอกสารชิ้นนี้ใช่หรือไม่?")) return;
    setIsDeleting(true);
    const res = await deleteDocumentAction(doc.id);
    if (res.ok) {
      router.push("/today");
    } else {
      alert(res.message);
      setIsDeleting(false);
    }
  };

  // Action: Duplicate resolution
  const handleResolveDuplicate = async (
    resolution: "use_existing" | "merge",
    existingTxId: string
  ) => {
    setIsSubmitting(true);
    const res = await resolveDuplicateAction(doc.id, resolution, existingTxId);
    if (res.ok) {
      router.push("/today");
    } else {
      alert(res.message);
      setIsSubmitting(false);
    }
  };

  // Action: Confirm Form Submission
  const handleConfirmSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const fd = new FormData(e.currentTarget);
    fd.append("documentType", docType);

    // Append special complex lists
    if (docType === "receipt" || docType === "delivery_receipt") {
      fd.append("items", JSON.stringify(items));
    }

    const res = await confirmDocumentAction(doc.id, fd);
    if (res.ok) {
      router.push("/today");
    } else {
      alert(res.message);
      setIsSubmitting(false);
    }
  };

  // Helper calculation functions inside UI
  const calculateTotalPaidFromItems = () => {
    const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
    const delFee = Number(deliveryFee) || 0;
    const svcFee = Number(serviceFee) || 0;
    const disc = Number(discount) || 0;
    const finalVal = total + delFee + svcFee - disc;
    setTotalPaid(finalVal > 0 ? finalVal.toString() : "0");
  };

  const handleAddItem = () => {
    setItems([...items, { name: "รายการใหม่", quantity: 1, amount: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: "name" | "quantity" | "amount", value: string | number) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      [field]: field === "name" ? value : Number(value),
    };
    setItems(updated);
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <PageHeader
          title={manualMode ? "บันทึกเอกสารด้วยตัวเอง" : "ตรวจสลิปและหลักฐาน"}
          subtitle="สแกนด้วย AI แล้ว โปรดตรวจสอบรายละเอียดความถูกต้องก่อนกดยืนยัน"
        />

        {/* Top Actions & Loader */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-sm font-semibold shadow-sm ${confidenceColor}`}>
              สถานะ: {thaiConfidenceText}
            </span>
          </div>
          <div className="flex gap-2">
            {doc.status === "failed" && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex items-center gap-2 rounded-[16px] border border-border bg-surface px-4 py-2 text-sm font-bold shadow-sm hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw size={16} className={isRetrying ? "animate-spin" : ""} />
                ประมวลผลใหม่
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 rounded-[16px] border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-500 shadow-sm hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 size={16} />
              ลบหลักฐาน
            </button>
          </div>
        </div>

        {/* Failed State Screen */}
        {doc.status === "failed" && !manualMode && (
          <div className="rounded-[16px] border border-red-200 bg-red-50/50 p-6 text-center shadow-[0_12px_24px_rgba(239,68,68,0.05)]">
            <AlertTriangle className="mx-auto text-red-500" size={48} />
            <h3 className="mt-4 text-lg font-bold text-red-700">การอ่านสลิปไม่สำเร็จ</h3>
            <p className="mt-2 whitespace-pre-line text-sm text-red-600">{failedMessage}</p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex items-center gap-2 rounded-[16px] bg-primary px-6 py-3 font-bold text-white shadow-sm hover:bg-primary-dark disabled:opacity-50"
              >
                <RefreshCw size={18} className={isRetrying ? "animate-spin" : ""} />
                ลองประมวลผลอีกครั้ง
              </button>
              <button
                onClick={() => setManualMode(true)}
                className="rounded-[16px] border border-border bg-white px-6 py-3 font-bold text-foreground shadow-sm hover:bg-gray-50"
              >
                กรอกข้อมูลด้วยตนเอง
              </button>
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {(isSubmitting || isDeleting || isRetrying) && (
          <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl rounded-[16px] border border-primary/20 bg-white px-4 py-3 text-sm font-bold text-primary shadow-lg">
            <p aria-live="polite" aria-busy="true">กำลังโหลดข้อมูล...</p>
          </div>
        )}

        {/* Main Interface Grid */}
        {(doc.status !== "failed" || manualMode) && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left: Document Image/PDF Preview */}
            <div className="md:col-span-5 flex flex-col gap-2">
              <div className="font-bold text-sm text-text-secondary">รูปหลักฐานต้นฉบับ</div>
              <div className="sticky top-4 overflow-hidden rounded-[16px] border border-border bg-surface shadow-sm">
                {doc.mimeType === "application/pdf" ? (
                  <iframe src={previewUrl} title="ตัวอย่างเอกสาร PDF สำหรับตรวจสอบ" className="h-[500px] w-full border-0" />
                ) : (
                  <img
                    src={previewUrl}
                    alt="ภาพถ่ายหรือสแกนเอกสารหลักฐานสำหรับตรวจสอบ"
                    className="w-full object-contain max-h-[600px]"
                  />
                )}
              </div>
            </div>

            {/* Right: Validation & Editing Forms */}
            <div className="md:col-span-7 flex flex-col gap-4">
              {/* Warnings and Unclear fields display */}
              {extraction && extraction.warnings.length > 0 && (
                <div className="rounded-[16px] border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 flex gap-2">
                  <AlertTriangle className="text-yellow-600 shrink-0" size={18} />
                  <div>
                    <div className="font-bold">ข้อควรระวังในการแปลงไฟล์:</div>
                    <ul className="list-disc pl-4 mt-1">
                      {extraction.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {extraction && extraction.unclearFields.length > 0 && (
                <div className="rounded-[16px] border border-red-150 bg-red-50/70 p-4 text-sm text-red-800 flex gap-2">
                  <HelpCircle className="text-red-500 shrink-0" size={18} />
                  <div>
                    <div className="font-bold">ข้อมูลอ่านได้ไม่ครบ (กรุณาตรวจสอบ):</div>
                    <p className="mt-1">
                      ฟิลด์ที่ไม่ชัดเจน:{" "}
                      <span className="font-mono bg-red-100 px-1 py-0.5 rounded">
                        {extraction.unclearFields.join(", ")}
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {/* Duplicate Candidates Display */}
              {duplicateTransactions.length > 0 && (
                <div className="rounded-[16px] border border-primary/20 bg-primary-soft/40 p-5 shadow-sm">
                  <div className="flex items-center gap-2 font-bold text-primary">
                    <AlertTriangle size={18} />
                    ตรวจพบรายการที่อาจซ้ำซ้อนกัน ({duplicateTransactions.length} รายการ)
                  </div>
                  <div className="mt-3 flex flex-col gap-3">
                    {duplicateTransactions.map((dup) => (
                      <div
                        key={dup.id}
                        className="rounded-[12px] border border-border bg-white p-4 shadow-sm"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-bold text-foreground">
                              {dup.merchant || "ไม่ระบุชื่อร้าน"}
                            </div>
                            <div className="text-xs text-text-secondary mt-1">
                              วันที่บันทึก: {new Date(dup.occurredAt).toLocaleString("th-TH")}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {dup.reasons?.map((reason: string, rIdx: number) => (
                                <span
                                  key={rIdx}
                                  className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-extrabold text-foreground">
                              {formatTHB(dup.amountSatang)}
                            </div>
                            <div className="text-xs font-bold text-primary mt-1">
                              ความคล้าย: {dup.score}%
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => handleResolveDuplicate("use_existing", dup.id)}
                            className="flex items-center gap-1 rounded-[12px] bg-primary-soft text-primary px-3 py-1.5 text-xs font-bold hover:bg-primary-soft-dark"
                          >
                            เชื่อมโยงหลักฐาน
                            <ArrowRight size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Form Card */}
              <form
                onSubmit={handleConfirmSubmit}
                method="POST"
                action="javascript:void(0);"
                className="rounded-[16px] border border-border bg-surface p-5 shadow-sm flex flex-col gap-4"
              >
                {/* Document Type Selector */}
                <div>
                  <label htmlFor={reviewFieldId("docType")} className="block text-sm font-bold text-foreground mb-1">ประเภทเอกสาร</label>
                  <select
                    id={reviewFieldId("docType")}
                    className="w-full rounded-[12px] border border-border bg-white p-3 text-sm font-medium"
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                  >
                    <option value="salary_slip">เงินเดือน (Salary Slip)</option>
                    <option value="receipt">ใบเสร็จ (Receipt)</option>
                    <option value="delivery_receipt">ค่าอาหาร/เดลิเวอรี (Delivery Slip)</option>
                    <option value="transfer_slip">สลิปโอนเงิน (Bank Transfer Slip)</option>
                    <option value="debt_statement">ใบแจ้งหนี้บัตรเครดิต/หนี้สิน (Debt Statement)</option>
                    <option value="other">อื่น ๆ (Other)</option>
                  </select>
                </div>

                {/* Form Fields: SALARY SLIP */}
                {docType === "salary_slip" && (
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <h3 className="font-bold text-primary text-sm">ข้อมูลสลิปเงินเดือน</h3>

                    <div>
                      <label htmlFor={reviewFieldId("employer")} className="block text-xs text-text-secondary font-semibold mb-1">
                        นายจ้าง / บริษัท
                      </label>
                      <input
                        id={reviewFieldId("employer")}
                        type="text"
                        name="employer"
                        className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                        value={employer}
                        onChange={(e) => setEmployer(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("payPeriod")} className="block text-xs text-text-secondary font-semibold mb-1">
                          งวดเงินเดือน (เช่น 07/2026)
                        </label>
                        <input
                          id={reviewFieldId("payPeriod")}
                          type="text"
                          name="payPeriod"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={payPeriod}
                          onChange={(e) => setPayPeriod(e.target.value)}
                          placeholder="MM/YYYY"
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("paymentDate")} className="block text-xs text-text-secondary font-semibold mb-1">
                          วันที่จ่ายเงิน
                        </label>
                        <input
                          id={reviewFieldId("paymentDate")}
                          type="date"
                          name="paymentDate"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("grossIncome")} className="block text-xs text-text-secondary font-semibold mb-1">
                          รายได้ก่อนหัก (Gross)
                        </label>
                        <input
                          id={reviewFieldId("grossIncome")}
                          type="number"
                          step="0.01"
                          name="grossIncome"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={grossIncome}
                          onChange={(e) => setGrossIncome(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("netIncome")} className="block text-xs text-text-secondary font-semibold mb-1">
                          รายได้สุทธิ (Net Income - บันทึกเข้าบัญชี)
                        </label>
                        <input
                          id={reviewFieldId("netIncome")}
                          type="number"
                          step="0.01"
                          name="netIncome"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm font-bold text-primary"
                          value={netIncome}
                          onChange={(e) => setNetIncome(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("tax")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ภาษีหัก ณ ที่จ่าย
                        </label>
                        <input
                          id={reviewFieldId("tax")}
                          type="number"
                          step="0.01"
                          name="tax"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={tax}
                          onChange={(e) => setTax(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("socialSecurity")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ประกันสังคม (SSO)
                        </label>
                        <input
                          id={reviewFieldId("socialSecurity")}
                          type="number"
                          step="0.01"
                          name="socialSecurity"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={socialSecurity}
                          onChange={(e) => setSocialSecurity(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Form Fields: RECEIPT or DELIVERY RECEIPT */}
                {(docType === "receipt" || docType === "delivery_receipt") && (
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <h3 className="font-bold text-primary text-sm">ข้อมูลใบเสร็จรับเงิน</h3>

                    <div>
                      <label htmlFor={reviewFieldId("merchant")} className="block text-xs text-text-secondary font-semibold mb-1">
                        ชื่อร้านค้า / แพลตฟอร์ม
                      </label>
                      <input
                        id={reviewFieldId("merchant")}
                        type="text"
                        name="merchant"
                        className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                        value={merchant}
                        onChange={(e) => setMerchant(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("occurredAt")} className="block text-xs text-text-secondary font-semibold mb-1">
                          วันและเวลาทำรายการ
                        </label>
                        <input
                          id={reviewFieldId("occurredAt")}
                          type="datetime-local"
                          name="occurredAt"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={occurredAt}
                          onChange={(e) => setOccurredAt(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("paymentMethod")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ช่องทางการจ่ายเงิน
                        </label>
                        <input
                          id={reviewFieldId("paymentMethod")}
                          type="text"
                          name="paymentMethod"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label htmlFor={reviewFieldId("subtotal")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          ยอดรวมย่อย (Sub)
                        </label>
                        <input
                          id={reviewFieldId("subtotal")}
                          type="number"
                          step="0.01"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                          value={subtotal}
                          onChange={(e) => setSubtotal(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("deliveryFee")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          ค่าส่ง (Delivery)
                        </label>
                        <input
                          id={reviewFieldId("deliveryFee")}
                          type="number"
                          step="0.01"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                          value={deliveryFee}
                          onChange={(e) => setDeliveryFee(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("discount")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          ส่วนลด (Discount)
                        </label>
                        <input
                          id={reviewFieldId("discount")}
                          type="number"
                          step="0.01"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                          value={discount}
                          onChange={(e) => setDiscount(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("serviceFee")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          ค่าบริการ (Svc)
                        </label>
                        <input
                          id={reviewFieldId("serviceFee")}
                          type="number"
                          step="0.01"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                          value={serviceFee}
                          onChange={(e) => setServiceFee(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center bg-gray-50 p-3 rounded-[12px] border border-dashed border-border mt-1">
                      <button
                        type="button"
                        onClick={calculateTotalPaidFromItems}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        คำนวณยอดเงินจ่ายจริงอัตโนมัติ
                      </button>
                      <div className="flex items-center gap-2">
                        <label htmlFor={reviewFieldId("totalPaid")} className="text-xs font-bold text-text-secondary">ยอดรวมจ่ายจริง:</label>
                        <input
                          id={reviewFieldId("totalPaid")}
                          type="number"
                          step="0.01"
                          name="totalPaid"
                          className="w-28 rounded-[12px] border border-border bg-white p-2 text-sm font-extrabold text-primary text-right"
                          value={totalPaid}
                          onChange={(e) => setTotalPaid(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    {/* Items table */}
                    <div className="mt-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-text-secondary">รายการสินค้า</span>
                        <button
                          type="button"
                          onClick={handleAddItem}
                          className="text-xs font-bold text-primary hover:underline"
                        >
                          + เพิ่มรายการย่อย
                        </button>
                      </div>
                      <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                        {items.map((item, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <input
                              aria-label={`ชื่อรายการย่อยที่ ${idx + 1}`}
                              type="text"
                              className="flex-1 rounded-[12px] border border-border bg-white p-2 text-xs"
                              placeholder="ชื่อรายการ"
                              value={item.name}
                              onChange={(e) => handleItemChange(idx, "name", e.target.value)}
                              required
                            />
                            <input
                              aria-label={`จำนวนของรายการย่อยที่ ${idx + 1}`}
                              type="number"
                              className="w-12 rounded-[12px] border border-border bg-white p-2 text-xs text-center"
                              placeholder="จำนวน"
                              value={item.quantity || 1}
                              onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                            />
                            <input
                              aria-label={`ราคาของรายการย่อยที่ ${idx + 1}`}
                              type="number"
                              step="0.01"
                              className="w-16 rounded-[12px] border border-border bg-white p-2 text-xs text-right"
                              placeholder="ราคา"
                              value={item.amount || 0}
                              onChange={(e) => handleItemChange(idx, "amount", e.target.value)}
                            />
                            <button
                              type="button"
                              aria-label={`ลบรายการย่อยที่ ${idx + 1}`}
                              onClick={() => handleRemoveItem(idx)}
                              className="flex min-h-11 min-w-11 items-center justify-center text-red-500 hover:text-red-700"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Form Fields: TRANSFER SLIP */}
                {docType === "transfer_slip" && (
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <h3 className="font-bold text-primary text-sm">ข้อมูลสลิปการโอนเงิน</h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("amount")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ยอดโอน (บาท)
                        </label>
                        <input
                          id={reviewFieldId("amount")}
                          type="number"
                          step="0.01"
                          name="amount"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm font-bold text-primary"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("occurredAt")} className="block text-xs text-text-secondary font-semibold mb-1">
                          วันและเวลาโอน
                        </label>
                        <input
                          id={reviewFieldId("occurredAt")}
                          type="datetime-local"
                          name="occurredAt"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={transferDate}
                          onChange={(e) => setTransferDate(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("destinationName")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ผู้รับเงินปลายทาง (Merchant/Payee)
                        </label>
                        <input
                          id={reviewFieldId("destinationName")}
                          type="text"
                          name="destinationName"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={destinationName}
                          onChange={(e) => setDestinationName(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("bank")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ธนาคาร
                        </label>
                        <input
                          id={reviewFieldId("bank")}
                          type="text"
                          name="bank"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={bank}
                          onChange={(e) => setBank(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label htmlFor={reviewFieldId("referenceNumber")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          เลขอ้างอิง (Ref)
                        </label>
                        <input
                          id={reviewFieldId("referenceNumber")}
                          type="text"
                          name="referenceNumber"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                          value={refNumber}
                          onChange={(e) => setRefNumber(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("accountLastFour")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          ผู้โอนท้าย (Sender 4)
                        </label>
                        <input
                          id={reviewFieldId("accountLastFour")}
                          type="text"
                          name="accountLastFour"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs text-center"
                          value={senderLastFour}
                          onChange={(e) => setSenderLastFour(e.target.value)}
                          maxLength={4}
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("destinationAccountLastFour")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          ผู้รับท้าย (Receiver 4)
                        </label>
                        <input
                          id={reviewFieldId("destinationAccountLastFour")}
                          type="text"
                          name="destinationAccountLastFour"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs text-center"
                          value={destLastFour}
                          onChange={(e) => setDestLastFour(e.target.value)}
                          maxLength={4}
                        />
                      </div>
                    </div>

                    <div className="border-t border-dashed border-border pt-3 mt-1">
                      <div id={reviewFieldId("transferTypeGroup")} className="block text-xs font-bold text-foreground mb-1">
                        การจัดกลุ่มประเภทการทำรายการโอน
                      </div>
                      <div role="radiogroup" aria-labelledby={reviewFieldId("transferTypeGroup")} className="grid grid-cols-3 gap-2">
                        <label className="flex items-center justify-center p-2 rounded-[12px] border border-border bg-white text-xs font-bold cursor-pointer [&:has(input:checked)]:border-primary [&:has(input:checked)]:bg-primary-soft text-foreground">
                          <input
                            type="radio"
                            name="type"
                            value="expense"
                            checked={transferType === "expense"}
                            onChange={() => setTransferType("expense")}
                            className="hidden"
                          />
                          ใช้จ่าย (Expense)
                        </label>
                        <label className="flex items-center justify-center p-2 rounded-[12px] border border-border bg-white text-xs font-bold cursor-pointer [&:has(input:checked)]:border-primary [&:has(input:checked)]:bg-primary-soft text-foreground">
                          <input
                            type="radio"
                            name="type"
                            value="transfer"
                            checked={transferType === "transfer"}
                            onChange={() => setTransferType("transfer")}
                            className="hidden"
                          />
                          โอนบัญชีตนเอง
                        </label>
                        <label className="flex items-center justify-center p-2 rounded-[12px] border border-border bg-white text-xs font-bold cursor-pointer [&:has(input:checked)]:border-primary [&:has(input:checked)]:bg-primary-soft text-foreground">
                          <input
                            type="radio"
                            name="type"
                            value="debt_payment"
                            checked={transferType === "debt_payment"}
                            onChange={() => setTransferType("debt_payment")}
                            className="hidden"
                          />
                          ชำระหนี้สิน
                        </label>
                      </div>
                    </div>

                    {/* Linked debt dropdown when selecting debt_payment */}
                    {transferType === "debt_payment" && (
                      <div className="bg-yellow-50/50 p-3 rounded-[12px] border border-yellow-100 flex flex-col gap-2">
                        <label htmlFor={reviewFieldId("debtId")} className="block text-xs font-bold text-yellow-800">
                          เชื่อมต่อกับหนี้สินคงค้าง
                        </label>
                        <select
                          id={reviewFieldId("debtId")}
                          name="debtId"
                          className="w-full rounded-[12px] border border-yellow-200 bg-white p-2.5 text-xs font-medium"
                          value={linkedDebtId}
                          onChange={(e) => setLinkedDebtId(e.target.value)}
                          required
                        >
                          <option value="">-- กรุณาเลือกบัญชีหนี้สินเพื่อชำระ --</option>
                          {debts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.creditor || "หนี้"} - {d.name} (ค้างจ่ายขั้นต่ำ: {formatTHB(d.minimumPaymentSatang || 0)})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Form Fields: DEBT STATEMENT */}
                {docType === "debt_statement" && (
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <h3 className="font-bold text-primary text-sm">ข้อมูลใบแจ้งหนี้บัตรเครดิต / เงินกู้</h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("creditor")} className="block text-xs text-text-secondary font-semibold mb-1">
                          เจ้าหนี้ / ผู้ให้บริการ
                        </label>
                        <input
                          id={reviewFieldId("creditor")}
                          type="text"
                          name="creditor"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={creditor}
                          onChange={(e) => setCreditor(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("debtName")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ชื่อหนี้บัตร / สินเชื่อ
                        </label>
                        <input
                          id={reviewFieldId("debtName")}
                          type="text"
                          name="debtName"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={debtName}
                          onChange={(e) => setDebtName(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label htmlFor={reviewFieldId("debtType")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          ประเภทหนี้สิน
                        </label>
                        <select
                          id={reviewFieldId("debtType")}
                          name="debtType"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                          value={debtType}
                          onChange={(e) => setDebtType(e.target.value as Debt["debtType"])}
                        >
                          <option value="credit_card">บัตรเครดิต</option>
                          <option value="personal_loan">สินเชื่อบุคคล</option>
                          <option value="installment">ผ่อนสินค้า/จ่ายงวด</option>
                          <option value="mortgage">บ้าน/ที่อยู่อาศัย</option>
                          <option value="auto_loan">เช่าซื้อรถยนต์</option>
                          <option value="buy_now_pay_later">BNPL</option>
                          <option value="other">อื่น ๆ</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("dueDate")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          วันครบกำหนดชำระ
                        </label>
                        <input
                          id={reviewFieldId("dueDate")}
                          type="date"
                          name="dueDate"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("accountLastFour")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          เลขบัตร/บัญชี (ท้าย 4 หลัก)
                        </label>
                        <input
                          id={reviewFieldId("accountLastFour")}
                          type="text"
                          name="accountLastFour"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs text-center"
                          value={accountLastFour}
                          onChange={(e) => setAccountLastFour(e.target.value)}
                          maxLength={4}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label htmlFor={reviewFieldId("outstandingBalance")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          ยอดค้างชำระทั้งหมด
                        </label>
                        <input
                          id={reviewFieldId("outstandingBalance")}
                          type="number"
                          step="0.01"
                          name="outstandingBalance"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                          value={outstandingBalance}
                          onChange={(e) => setOutstandingBalance(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("statementBalance")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          ยอดเรียกเก็บรอบนี้
                        </label>
                        <input
                          id={reviewFieldId("statementBalance")}
                          type="number"
                          step="0.01"
                          name="statementBalance"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs font-bold text-primary"
                          value={statementBalance}
                          onChange={(e) => setStatementBalance(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("amountDue")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          ยอดต้องชำระ (Due)
                        </label>
                        <input
                          id={reviewFieldId("amountDue")}
                          type="number"
                          step="0.01"
                          name="amountDue"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs font-bold text-primary"
                          value={amountDue}
                          onChange={(e) => setAmountDue(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("minimumPayment")} className="block text-[10px] text-text-secondary font-semibold mb-1">
                          ยอดขั้นต่ำ (Min)
                        </label>
                        <input
                          id={reviewFieldId("minimumPayment")}
                          type="number"
                          step="0.01"
                          name="minimumPayment"
                          className="w-full rounded-[12px] border border-border bg-white p-2 text-xs"
                          value={minimumPayment}
                          onChange={(e) => setMinimumPayment(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("interestRateAnnual")} className="block text-xs text-text-secondary font-semibold mb-1">
                          อัตราดอกเบี้ยรายปี (%)
                        </label>
                        <input
                          id={reviewFieldId("interestRateAnnual")}
                          type="number"
                          step="0.001"
                          name="interestRateAnnual"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={interestRate}
                          onChange={(e) => setInterestRate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("remainingInstallments")} className="block text-xs text-text-secondary font-semibold mb-1">
                          งวดคงเหลือ (ถ้ามี)
                        </label>
                        <input
                          id={reviewFieldId("remainingInstallments")}
                          type="number"
                          name="remainingInstallments"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={remainingInstallments}
                          onChange={(e) => setRemainingInstallments(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="border-t border-dashed border-border pt-3 mt-1">
                      <div id={reviewFieldId("debtActionTypeGroup")} className="block text-xs font-bold text-foreground mb-1">
                        การบันทึกหนี้ในแอป
                      </div>
                      <div role="radiogroup" aria-labelledby={reviewFieldId("debtActionTypeGroup")} className="grid grid-cols-2 gap-3">
                        <label className="flex items-center justify-center p-2.5 rounded-[12px] border border-border bg-white text-xs font-bold cursor-pointer [&:has(input:checked)]:border-primary [&:has(input:checked)]:bg-primary-soft text-foreground">
                          <input
                            type="radio"
                            name="debtActionType"
                            value="create"
                            checked={debtActionType === "create"}
                            onChange={() => setDebtActionType("create")}
                            className="hidden"
                          />
                          สร้างเป็นบัญชีหนี้ใหม่
                        </label>
                        <label className="flex items-center justify-center p-2.5 rounded-[12px] border border-border bg-white text-xs font-bold cursor-pointer [&:has(input:checked)]:border-primary [&:has(input:checked)]:bg-primary-soft text-foreground">
                          <input
                            type="radio"
                            name="debtActionType"
                            value="update"
                            checked={debtActionType === "update"}
                            onChange={() => setDebtActionType("update")}
                            className="hidden"
                          />
                          อัปเดตยอดหนี้เดิมที่มีอยู่
                        </label>
                      </div>
                    </div>

                    {debtActionType === "update" && (
                      <div className="bg-yellow-50/50 p-3 rounded-[12px] border border-yellow-100 flex flex-col gap-2">
                        <label htmlFor={reviewFieldId("existingDebtId")} className="block text-xs font-bold text-yellow-800">
                          เลือกหนี้สินเดิมเพื่ออัปเดตยอด
                        </label>
                        <select
                          id={reviewFieldId("existingDebtId")}
                          name="existingDebtId"
                          className="w-full rounded-[12px] border border-yellow-200 bg-white p-2.5 text-xs font-medium"
                          value={existingDebtId}
                          onChange={(e) => setExistingDebtId(e.target.value)}
                          required
                        >
                          <option value="">-- กรุณาเลือกบัญชีหนี้เดิม --</option>
                          {debts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.creditor || "หนี้"} - {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Form Fields: OTHER */}
                {docType === "other" && (
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <h3 className="font-bold text-primary text-sm">ข้อมูลธุรกรรมการเงิน</h3>

                    <div>
                      <label htmlFor={reviewFieldId("merchant")} className="block text-xs text-text-secondary font-semibold mb-1">
                        คำอธิบาย / รายละเอียดธุรกรรม
                      </label>
                      <input
                        id={reviewFieldId("merchant")}
                        type="text"
                        name="merchant"
                        className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                        value={merchant}
                        onChange={(e) => setMerchant(e.target.value)}
                        required
                        placeholder="เช่น ค่าเดินทาง, ค่าอุปกรณ์คอมพิวเตอร์"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("totalPaid")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ยอดเงิน (บาท)
                        </label>
                        <input
                          id={reviewFieldId("totalPaid")}
                          type="number"
                          step="0.01"
                          name="totalPaid"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm font-bold text-primary"
                          value={totalPaid}
                          onChange={(e) => setTotalPaid(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("occurredAt")} className="block text-xs text-text-secondary font-semibold mb-1">
                          วันและเวลาที่ทำรายการ
                        </label>
                        <input
                          id={reviewFieldId("occurredAt")}
                          type="datetime-local"
                          name="occurredAt"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={occurredAt}
                          onChange={(e) => setOccurredAt(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={reviewFieldId("type")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ประเภทธุรกรรม
                        </label>
                        <select
                          id={reviewFieldId("type")}
                          name="type"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm font-semibold text-foreground"
                          defaultValue="expense"
                        >
                          <option value="expense">รายจ่าย (Expense)</option>
                          <option value="income">รายรับ (Income)</option>
                          <option value="transfer">โอนเงินระหว่างบัญชี (Transfer)</option>
                          <option value="refund">เงินคืน (Refund)</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={reviewFieldId("paymentMethod")} className="block text-xs text-text-secondary font-semibold mb-1">
                          ช่องทางการทำรายการ
                        </label>
                        <input
                          id={reviewFieldId("paymentMethod")}
                          type="text"
                          name="paymentMethod"
                          className="w-full rounded-[12px] border border-border bg-white p-3 text-sm"
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          placeholder="เช่น เงินสด, บัตรเครดิต"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit Buttons */}
                <div className="flex gap-3 border-t border-border pt-4 mt-2">
                  <button
                    type="button"
                    onClick={() => router.push("/today")}
                    className="flex-1 rounded-[16px] border border-border bg-white py-3.5 text-center text-sm font-bold hover:bg-gray-50"
                  >
                    ยกเลิก / ปิด
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    aria-busy={isSubmitting}
                    className="flex-1 rounded-[16px] bg-primary py-3.5 text-center text-sm font-bold text-white shadow-md hover:bg-primary-dark disabled:opacity-50"
                  >
                    {isSubmitting ? "กำลังบันทึก..." : "ยืนยันความถูกต้อง"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
