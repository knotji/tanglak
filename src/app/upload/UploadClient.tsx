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
  CheckCircle2,
  Camera,
} from "lucide-react";
import { uploadAndExtractAction } from "@/app/actions/documents";
import { StepProgress } from "@/components/feedback/StepProgress";
import type { FinanceDocument } from "@/types/domain";

/**
 * Slip-first document type quick-select. Bulk history upload is deliberately
 * not offered here; this page is for evidence the user reviews before save.
 */
const documentTypes = [
  { label: "สลิปโอนเงินออก", icon: ArrowUpRight, value: "transfer_slip" },
  { label: "สลิปรับเงิน", icon: ArrowDownLeft, value: "transfer_slip" },
  { label: "ใบเสร็จ/ค่าอาหาร", icon: ReceiptText, value: "receipt" },
  { label: "สลิปชำระหนี้หรือบัตรเครดิต", icon: CreditCard, value: "transfer_slip" },
];

const uploadSteps = [
  { id: "upload_evidence", label: "กำลังอัปโหลดสลิป" },
  { id: "ai_reading", label: "กำลังอ่านข้อมูลจากสลิป" },
  { id: "checking_data", label: "ตรวจสอบข้อมูลก่อนบันทึก" },
  { id: "ready_to_confirm", label: "พร้อมให้คุณยืนยันรายการ" },
];

// Keeps a batch upload bounded to a size that finishes in a reasonable
// time and doesn't hammer the extraction API -- each file is still
// processed one at a time, in sequence, never in parallel.
const MAX_BATCH_SIZE = 10;

type FileResult = {
  file: File;
  status: "pending" | "processing" | "needs_review" | "auto_saved" | "error";
  documentId?: string;
  autopilotTransactionId?: string;
  message?: string;
};

export function UploadClient({ pendingDocuments = [] }: { pendingDocuments?: FinanceDocument[] }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [docType, setDocType] = useState<string>("other");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState(uploadSteps[0].id);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [results, setResults] = useState<FileResult[] | null>(null);

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
    // Snapshot into a plain array immediately -- e.target.files is a live
    // FileList tied to the input element. Resetting the input's value below
    // (so re-selecting the same file again later still fires onChange) would
    // otherwise clear this same FileList out from under the setSelectedFiles
    // updater, which React may not invoke until after this handler returns.
    const newFiles = e.target.files ? Array.from(e.target.files) : [];
    if (newFiles.length > 0) {
      const totalRequested = selectedFiles.length + newFiles.length;
      setSelectedFiles((prev) => [...prev, ...newFiles].slice(0, MAX_BATCH_SIZE));
      setErrorMessage(
        totalRequested > MAX_BATCH_SIZE ? `เลือกได้สูงสุดครั้งละ ${MAX_BATCH_SIZE} รูป (ใช้ ${MAX_BATCH_SIZE} รูปแรกที่เลือก)` : null,
      );
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (index?: number) => {
    if (index === undefined) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    }
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadAndProcess = async () => {
    if (selectedFiles.length === 0) return;

    setIsProcessing(true);
    setProgressStep("upload_evidence");
    setErrorMessage(null);

    // A single selected file keeps the exact original single-upload
    // behavior (immediate navigation to the result/review page) instead of
    // showing the batch results list -- that list only makes sense once
    // there's more than one outcome to distinguish between.
    if (selectedFiles.length === 1) {
      const formData = new FormData();
      formData.append("file", selectedFiles[0]);
      formData.append("documentType", docType);

      try {
        setProgressStep("ai_reading");
        const res = await uploadAndExtractAction({ ok: false }, formData);
        setProgressStep("checking_data");
        if (res.ok && res.documentId) {
          setProgressStep("ready_to_confirm");
          if (res.autopilotHandled && res.autopilotTransactionId) {
            window.location.href = `/upload/result/${res.documentId}?tx=${res.autopilotTransactionId}`;
          } else {
            window.location.href = `/upload/review/${res.documentId}`;
          }
        } else {
          setErrorMessage(res.message || "อ่านข้อมูลจากสลิปไม่สำเร็จ คุณยังกรอกเองได้");
          setIsProcessing(false);
        }
      } catch (_err) {
        setErrorMessage("อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setIsProcessing(false);
      }
      return;
    }

    setResults(selectedFiles.map((file) => ({ file, status: "pending" })));
    setProgressStep("ai_reading");

    // Sequential, not parallel -- every slip still goes through the exact
    // same single-document extraction/autopilot pipeline as before, one at
    // a time, so nothing about how a slip is read, scored, or (rarely)
    // auto-saved changes for a batch versus a single upload.
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setResults((prev) => prev?.map((r, idx) => (idx === i ? { ...r, status: "processing" } : r)) ?? prev);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", docType);

      try {
        const res = await uploadAndExtractAction({ ok: false }, formData);
        setResults(
          (prev) =>
            prev?.map((r, idx) =>
              idx === i
                ? res.ok && res.documentId
                  ? {
                      ...r,
                      status: res.autopilotHandled ? "auto_saved" : "needs_review",
                      documentId: res.documentId,
                      autopilotTransactionId: res.autopilotTransactionId,
                    }
                  : { ...r, status: "error", message: res.message || "อ่านข้อมูลจากสลิปไม่สำเร็จ" }
                : r,
            ) ?? prev,
        );
      } catch (_err) {
        setResults(
          (prev) =>
            prev?.map((r, idx) => (idx === i ? { ...r, status: "error", message: "อัปโหลดสลิปไม่สำเร็จ" } : r)) ?? prev,
        );
      }
    }

    setProgressStep("checking_data");
    setProgressStep("ready_to_confirm");
    setIsProcessing(false);
  };

  const handleStartOver = () => {
    // A full navigation (not just resetting local state) so the pending-
    // review section below re-fetches fresh from the server -- a batch
    // that just finished can have left new review_ready/needs_review
    // documents behind (any the user didn't click into), and the
    // `pendingDocuments` prop was only ever captured once, when this page
    // first loaded, so it wouldn't otherwise reflect them.
    window.location.href = "/upload";
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (results) {
    const doneCount = results.filter((r) => r.status !== "pending" && r.status !== "processing").length;
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm font-bold text-foreground">
            ประมวลผลแล้ว {doneCount} จาก {results.length} รูป
          </p>
          <p className="mt-1 text-xs text-text-secondary">แต่ละรูปยังต้องให้คุณตรวจสอบหรือดูผลลัพธ์ทีละรูปเหมือนเดิม</p>

          {isProcessing && (
            <div className="mt-4">
              <StepProgress steps={uploadSteps} currentStep={progressStep} canRetry={false} />
            </div>
          )}

          <ul className="mt-4 flex flex-col gap-2">
            {results.map((r, idx) => (
              <li
                key={idx}
                className="flex items-center gap-3 rounded-[12px] border border-border bg-white px-3 py-2.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                  <FileIcon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-foreground">{r.file.name}</div>
                  <div className="mt-0.5 text-xs text-text-secondary">
                    {r.status === "pending" && "รอคิว..."}
                    {r.status === "processing" && "กำลังอ่าน..."}
                    {r.status === "auto_saved" && "TangLak จัดการให้แล้ว"}
                    {r.status === "needs_review" && "ต้องตรวจสอบก่อนบันทึก"}
                    {r.status === "error" && (r.message || "อ่านข้อมูลไม่สำเร็จ")}
                  </div>
                </div>
                {r.status === "auto_saved" && r.documentId && (
                  <Link
                    href={`/upload/result/${r.documentId}${r.autopilotTransactionId ? `?tx=${r.autopilotTransactionId}` : ""}`}
                    className="shrink-0 rounded-[10px] bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
                  >
                    ดูผล
                  </Link>
                )}
                {r.status === "needs_review" && r.documentId && (
                  <Link
                    href={`/upload/review/${r.documentId}`}
                    className="shrink-0 rounded-[10px] bg-primary px-3 py-1.5 text-xs font-bold text-white"
                  >
                    ตรวจสอบ
                  </Link>
                )}
                {r.status === "auto_saved" && <CheckCircle2 size={18} className="shrink-0 text-income" aria-hidden />}
                {r.status === "error" && <AlertTriangle size={18} className="shrink-0 text-overdue" aria-hidden />}
              </li>
            ))}
          </ul>
        </div>

        {!isProcessing && (
          <button
            type="button"
            onClick={handleStartOver}
            className="min-h-11 rounded-[16px] border border-border bg-white text-sm font-bold text-foreground shadow-sm hover:bg-gray-50"
          >
            อัปโหลดเพิ่ม
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden Native File Input */}
      <input
        id="document-upload-file"
        ref={fileInputRef}
        className="hidden"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleFileChange}
      />

      {/* Pending review documents -- slips already read by AI but not yet
          confirmed, e.g. from an earlier multi-file batch where the user
          navigated away to review one and the rest fell out of this
          page's in-memory results list. The document itself was never
          lost (it's still sitting here, unconfirmed), just previously
          impossible to get back to without this section. */}
      {selectedFiles.length === 0 && pendingDocuments.length > 0 && (
        <div className="rounded-[16px] border border-primary/20 bg-primary-soft/20 p-4">
          <p className="text-sm font-bold text-foreground">
            มีรายการรอตรวจสอบอยู่ {pendingDocuments.length} รายการ
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {pendingDocuments.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-[12px] border border-border bg-white px-3 py-2.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                  <FileIcon size={18} />
                </div>
                <div className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                  {doc.originalFilename || "สลิป"}
                </div>
                <Link
                  href={`/upload/review/${doc.id}`}
                  className="shrink-0 rounded-[10px] bg-primary px-3 py-1.5 text-xs font-bold text-white"
                >
                  ตรวจสอบ
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Upload Box Card */}
      {selectedFiles.length === 0 ? (
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
            ถ่ายรูปหรือเลือกไฟล์ได้หลายรูปพร้อมกัน — รองรับ JPG, PNG, WEBP, PDF (สูงสุด 15MB ต่อรูป, ไม่เกิน {MAX_BATCH_SIZE} รูปต่อครั้ง)
          </p>
        </section>
      ) : (
        <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">เลือกไว้ {selectedFiles.length} รูป</p>
            {!isProcessing && (
              <button
                type="button"
                onClick={() => openFileDialog()}
                className="text-xs font-bold text-primary"
              >
                + เพิ่มรูป
              </button>
            )}
          </div>

          <ul className="mt-3 flex flex-col gap-2">
            {selectedFiles.map((file, idx) => (
              <li key={idx} className="flex items-center gap-3 rounded-[12px] border border-border bg-white px-3 py-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                  <FileIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-foreground">{file.name}</div>
                  <div className="mt-0.5 text-xs text-text-secondary">{formatSize(file.size)}</div>
                </div>
                {!isProcessing && (
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(idx)}
                    className="shrink-0 p-1.5 text-overdue"
                    aria-label={`ลบ ${file.name}`}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {/* Error Message banner */}
          {errorMessage && (
            <div role="alert" className="mt-4 rounded-[12px] border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600 flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isProcessing && (
            <div className="mt-4">
              <StepProgress steps={uploadSteps} currentStep={progressStep} canRetry={false} />
            </div>
          )}

          {/* Action Trigger */}
          <div className="mt-5 flex gap-2">
            {!isProcessing ? (
              <>
                <button
                  type="button"
                  onClick={() => handleRemoveFile()}
                  className="flex-1 rounded-[16px] border border-border bg-white py-3 text-center text-sm font-bold shadow-sm hover:bg-gray-50"
                >
                  ล้างรายการ
                </button>
                <button
                  type="button"
                  onClick={handleUploadAndProcess}
                  disabled={isProcessing}
                  aria-busy={isProcessing}
                  className="flex-1 rounded-[16px] bg-primary py-3 text-center text-sm font-bold text-white shadow-md hover:bg-primary-dark"
                >
                  อ่านสลิป{selectedFiles.length > 1 ? ` (${selectedFiles.length} รูป)` : ""}
                </button>
              </>
            ) : (
              <div
                aria-live="polite"
                aria-busy="true"
                className="flex-1 rounded-[16px] bg-primary-soft py-3.5 text-center text-sm font-extrabold text-primary shadow-inner"
              >
                กำลังอ่านสลิป...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slip-type quick select -- primary upload intents only. */}
      {selectedFiles.length === 0 && (
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
      {selectedFiles.length === 0 && (
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
