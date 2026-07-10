"use client";

import { useRef, useState } from "react";
import {
  Banknote,
  Camera,
  CreditCard,
  FileText,
  HandCoins,
  ReceiptText,
  ScanLine,
  ShoppingBag,
  UploadCloud,
  FileIcon,
  Trash2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { uploadAndExtractAction } from "@/app/actions/documents";

const documentTypes = [
  { label: "เงินเดือน", icon: Banknote, value: "salary_slip" },
  { label: "รายจ่าย", icon: HandCoins, value: "receipt" },
  { label: "ใบเสร็จ", icon: ReceiptText, value: "receipt" },
  { label: "เดลิเวอรี", icon: ShoppingBag, value: "delivery_receipt" },
  { label: "ชำระหนี้", icon: CreditCard, value: "transfer_slip" },
  { label: "ใบแจ้งหนี้", icon: FileText, value: "debt_statement" },
  { label: "Statement", icon: ScanLine, value: "debt_statement" },
  { label: "อื่น ๆ", icon: UploadCloud, value: "other" },
];

export function UploadClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<string>("other");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCardClick = () => {
    setDocType("other");
    fileInputRef.current?.click();
  };

  const handleTypeClick = (value: string) => {
    setDocType(value);
    fileInputRef.current?.click();
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
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("documentType", docType);

    try {
      const res = await uploadAndExtractAction({ ok: false }, formData);
      if (res.ok && res.documentId) {
        // Successful extraction redirect to review
        window.location.href = `/upload/review/${res.documentId}`;
      } else {
        setErrorMessage(res.message || "เกิดข้อผิดพลาดในการวิเคราะห์ข้อมูล");
        setIsProcessing(false);
      }
    } catch (err) {
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
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleFileChange}
      />

      {/* Main Upload Box Card */}
      {!selectedFile ? (
        <section
          onClick={handleCardClick}
          className="cursor-pointer rounded-[16px] border border-dashed border-primary/30 bg-surface p-8 text-center shadow-[0_12px_30px_rgba(24,32,29,0.05)] transition hover:border-primary/50 hover:bg-primary-soft/10"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] bg-primary-soft text-primary">
            <Camera size={26} aria-hidden />
          </div>
          <p className="mt-4 text-xl font-bold">ถ่ายรูป หรือเลือกไฟล์</p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            รองรับ JPG, PNG, WEBP, PDF (สูงสุด 15MB)
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
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>

          {/* Error Message banner */}
          {errorMessage && (
            <div className="mt-4 rounded-[12px] border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600 flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{errorMessage}</span>
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
                  className="flex-1 rounded-[16px] bg-primary py-3 text-center text-sm font-bold text-white shadow-md hover:bg-primary-dark"
                >
                  วิเคราะห์ด้วย AI
                </button>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center gap-2 rounded-[16px] bg-primary-soft py-3.5 text-center text-sm font-extrabold text-primary shadow-inner">
                <RefreshCw size={16} className="animate-spin" />
                กำลังอัปโหลดและวิเคราะห์ด้วย AI...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grid of Document Types for Fast Select */}
      {!selectedFile && (
        <div className="grid grid-cols-4 gap-2">
          {documentTypes.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.label}
                onClick={() => handleTypeClick(type.value)}
                className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-[16px] border border-border bg-surface px-2 text-xs font-bold text-foreground transition hover:border-primary/40 hover:bg-primary-soft/10"
              >
                <Icon size={18} className="text-primary" aria-hidden />
                {type.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
