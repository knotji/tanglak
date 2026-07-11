"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  FilePenLine,
  FileIcon,
  ReceiptText,
  Trash2,
  AlertTriangle,
  Camera,
} from "lucide-react";
import { uploadAndExtractAction } from "@/app/actions/documents";
import { StepProgress } from "@/components/feedback/StepProgress";

/**
 * Slip-first document type quick-select. Bank-statement/CSV import
 * ("debt_statement"/"loan_schedule") is deliberately not offered here --
 * that flow still exists (see /history-import) but is no longer promoted
 * as a primary upload path. See docs/SLIP_FIRST_PRODUCT_DIRECTION.md.
 */
const documentTypes = [
  { label: "สลิปโอนเงินออก", icon: ArrowUpRight, value: "transfer_slip" },
  { label: "สลิปรับเงิน", icon: ArrowDownLeft, value: "transfer_slip" },
  { label: "ใบเสร็จ/ค่าอาหาร", icon: ReceiptText, value: "receipt" },
  { label: "สลิปชำระหนี้หรือบัตรเครดิต", icon: CreditCard, value: "transfer_slip" },
];

const uploadSteps = [
  { id: "upload_evidence", label: "อัปโหลดหลักฐาน" },
  { id: "ai_reading", label: "AI กำลังอ่าน" },
  { id: "checking_data", label: "กำลังตรวจข้อมูล" },
  { id: "ready_to_confirm", label: "พร้อมให้คุณยืนยัน" },
];

export function UploadClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<string>("other");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState(uploadSteps[0].id);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openFileDialog = (nextDocType?: string) => {
    if (nextDocType) setDocType(nextDocType);
    fileInputRef.current?.click();
  };

  const handleCardClick = () => {
    openFileDialog("other");
  };

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
      e.preventDefault();
      openFileDialog("other");
    }
  };

  const handleTypeClick = (value: string) => {
    openFileDialog(value);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      setErrorMessage(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadAndProcess = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setProgressStep("upload_evidence");
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("documentType", docType);

    try {
      setProgressStep("ai_reading");
      const res = await uploadAndExtractAction({ ok: false }, formData);
      setProgressStep("checking_data");
      if (res.ok && res.documentId) {
        setProgressStep("ready_to_confirm");
        // Successful extraction redirect to review
        window.location.href = `/upload/review/${res.documentId}`;
      } else {
        setErrorMessage(res.message || "เกิดข้อผิดพลาดในการวิเคราะห์ข้อมูล");
        setIsProcessing(false);
      }
    } catch (_err) {
      setErrorMessage("เกิดข้อผิดพลาดในการอัปโหลด กรุณาลองใหม่อีกครั้ง");
      setIsProcessing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden Native File Input */}
      <input
        id="document-upload-file"
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleFileChange}
      />

      {/* Main Upload Box Card */}
      {!selectedFile ? (
        <section
          role="button"
          tabIndex={0}
          aria-controls="document-upload-file"
          aria-describedby="document-upload-help"
          aria-label="ถ่ายรูป หรือเลือกไฟล์หลักฐาน"
          onClick={handleCardClick}
          onKeyDown={handleCardKeyDown}
          className="cursor-pointer rounded-[16px] border border-dashed border-primary/30 bg-surface p-8 text-center shadow-[0_12px_30px_rgba(24,32,29,0.05)] transition hover:border-primary/50 hover:bg-primary-soft/10"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] bg-primary-soft text-primary">
            <Camera size={26} aria-hidden />
          </div>
          <p className="mt-4 text-xl font-bold">อัปโหลดสลิป</p>
          <p id="document-upload-help" className="mt-1 text-sm leading-6 text-text-secondary">
            ถ่ายรูปหรือเลือกไฟล์ — รองรับ JPG, PNG, WEBP, PDF (สูงสุด 15MB)
          </p>
        </section>
      ) : (
        <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
              <FileIcon size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-foreground truncate">
                {selectedFile.name}
              </div>
              <div className="text-xs text-text-secondary mt-0.5">
                ขนาด: {formatSize(selectedFile.size)} | ประเภท: {selectedFile.type || "ไม่ทราบ"}
              </div>
            </div>
            {!isProcessing && (
              <button
                type="button"
                onClick={handleRemoveFile}
                className="text-red-500 hover:text-red-700 p-2"
                aria-label="ลบไฟล์ที่เลือก"
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>

          {/* Error Message banner */}
          {errorMessage && (
            <div role="alert" className="mt-4 rounded-[12px] border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600 flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isProcessing && (
            <div className="mt-4">
              <StepProgress
                steps={uploadSteps}
                currentStep={progressStep}
                canRetry={false}
              />
            </div>
          )}

          {/* Action Trigger */}
          <div className="mt-5 flex gap-2">
            {!isProcessing ? (
              <>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="flex-1 rounded-[16px] border border-border bg-white py-3 text-center text-sm font-bold shadow-sm hover:bg-gray-50"
                >
                  เปลี่ยนไฟล์
                </button>
                <button
                  type="button"
                  onClick={handleUploadAndProcess}
                  disabled={isProcessing}
                  aria-busy={isProcessing}
                  className="flex-1 rounded-[16px] bg-primary py-3 text-center text-sm font-bold text-white shadow-md hover:bg-primary-dark"
                >
                  วิเคราะห์ด้วย AI
                </button>
              </>
            ) : (
              <div
                aria-live="polite"
                aria-busy="true"
                className="flex-1 rounded-[16px] bg-primary-soft py-3.5 text-center text-sm font-extrabold text-primary shadow-inner"
              >
                กำลังโหลดข้อมูล...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slip-type quick select -- primary upload intents only. */}
      {!selectedFile && (
        <div className="grid grid-cols-2 gap-2">
          {documentTypes.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.label}
                onClick={() => handleTypeClick(type.value)}
                className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-[16px] border border-border bg-surface px-2 text-center text-xs font-bold text-foreground transition hover:border-primary/40 hover:bg-primary-soft/10"
              >
                <Icon size={18} className="text-primary" aria-hidden />
                {type.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Secondary: manual entry, always available -- never traps the user
          inside AI processing. */}
      {!selectedFile && (
        <Link
          href="/transactions"
          className="flex min-h-11 items-center justify-center gap-2 rounded-[16px] border border-border bg-surface text-sm font-bold text-primary"
        >
          <FilePenLine size={18} aria-hidden />
          เพิ่มรายการเอง
        </Link>
      )}
    </div>
  );
}
