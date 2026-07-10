"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadStatementAction } from "@/app/actions/history-import";
import type { Account } from "@/types/domain";
import Link from "next/link";

interface HistoryImportClientProps {
  accounts: Account[];
}

export function HistoryImportClient({ accounts: initialAccounts }: HistoryImportClientProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<string>("bank_statement");
  const [accountId, setAccountId] = useState<string>("skip");
  const [newAccountName, setNewAccountName] = useState<string>("");
  const [newAccountLastFour, setNewAccountLastFour] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMsg("กรุณาเลือกไฟล์ที่ต้องการนำเข้า");
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sourceType", sourceType);

      if (accountId === "new") {
        if (!newAccountName) {
          setErrorMsg("กรุณาระบุชื่อบัญชีใหม่");
          setIsUploading(false);
          return;
        }

        // Call database to create account first via an ad-hoc server call,
        // or let's create it. We can import createAccount action.
        // For simple execution, we can call createAccount directly via Server Action!
        // Let's call the repository functions or implement a simple action for this.
        // Actually, we can define a simple server action for creating accounts or call createAccount repository function inside uploadStatementAction!
        // But it's much cleaner to do it here or inside uploadStatementAction!
        // Let's pass the new account details to the upload action, and let it create it!
        fd.append("createAccount", "true");
        fd.append("newAccountName", newAccountName);
        fd.append("newAccountLastFour", newAccountLastFour);
      } else if (accountId !== "skip") {
        fd.append("accountId", accountId);
      }

      const res = await uploadStatementAction({ ok: true }, fd);
      if (res.ok && res.batchId) {
        router.push(`/history-import/${res.batchId}/review`);
      } else {
        setErrorMsg(res.message || "การนำเข้าไฟล์ล้มเหลว");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการอัปโหลด");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Source Selection */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-text-secondary">ประเภทชุดข้อมูลประวัติการเงิน</label>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          className="h-11 rounded-xl border border-border bg-white px-3 text-sm font-medium text-foreground outline-none"
        >
          <option value="bank_statement">รายการเดินบัญชีธนาคาร (Bank Statement PDF)</option>
          <option value="credit_card_statement">สลิป/ประวัติบัตรเครดิต (Credit Card Statement PDF)</option>
          <option value="transaction_history_csv">ประวัติธุรกรรมส่งออก (Transaction History CSV)</option>
          <option value="other_history">รูปแบบอื่นๆ (Other History)</option>
        </select>
      </div>

      {/* Account Linking Selector */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-text-secondary">บัญชีผู้รับเงิน / บัญชีต้นทาง</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="h-11 rounded-xl border border-border bg-white px-3 text-sm font-medium text-foreground outline-none"
        >
          <option value="skip">ไม่ระบุ / ข้ามการเชื่อมต่อบัญชีก่อน</option>
          {initialAccounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              🏦 {acc.name} {acc.accountLastFour ? `(•••• ${acc.accountLastFour})` : ""}
            </option>
          ))}
          <option value="new">+ สร้างบัญชีธนาคาร/บัตรเครดิตใหม่...</option>
        </select>
      </div>

      {/* Dynamic Account Creation Fields */}
      {accountId === "new" && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <h4 className="text-xs font-bold text-primary">เพิ่มบัญชีธนาคาร/บัตรเครดิตใหม่</h4>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="ชื่อเรียกบัญชี เช่น กสิกร ออมทรัพย์, บัตร KTC"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              className="h-10 rounded-lg border border-border bg-white px-3 text-xs outline-none"
            />
            <input
              type="text"
              placeholder="เลขท้ายบัญชี 4 หลัก (ระบุหรือไม่ระบุก็ได้)"
              value={newAccountLastFour}
              maxLength={4}
              onChange={(e) => setNewAccountLastFour(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-10 rounded-lg border border-border bg-white px-3 text-xs outline-none"
            />
          </div>
        </div>
      )}

      {/* File Dropzone */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-text-secondary">อัปโหลดไฟล์ Statement (PDF / CSV)</label>
        <div className="relative flex min-h-[140px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-white p-4 text-center hover:bg-slate-50">
          <input
            type="file"
            accept=".pdf,.csv"
            onChange={handleFileChange}
            disabled={isUploading}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          <div className="flex flex-col items-center gap-2">
            <span className="text-3xl">📄</span>
            {file ? (
              <div className="flex flex-col">
                <span className="text-sm font-bold text-primary truncate max-w-[260px]">{file.name}</span>
                <span className="text-xs text-text-secondary">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            ) : (
              <div className="flex flex-col text-xs text-text-secondary">
                <span className="font-semibold text-primary">กดเพื่อเลือกไฟล์ หรือ ลากไฟล์วางที่นี่</span>
                <span>รองรับขนาดไม่เกิน 10MB</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Limitations Disclaimer Box */}
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
        <p className="font-bold mb-1">💡 ข้อมูลการรองรับและข้อจำกัดการใช้งาน</p>
        <p>
          ระบบพยายามอ่านข้อมูลรายการจากตารางใน PDF และ CSV อย่างเต็มความสามารถ
          หากเอกสารมีรูปแบบพิเศษหรือหน้าสแกนไม่ชัดเจน คุณสามารถดาวน์โหลดประวัติเป็นไฟล์ CSV
          จากบริการของธนาคารและอัปโหลดแทนได้เพื่อความแม่นยำสูงสุด
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={isUploading}
          className="flex min-h-12 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow-sm hover:bg-primary-dark disabled:opacity-50"
        >
          {isUploading ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>กำลังประมวลผลข้อมูล...</span>
            </div>
          ) : (
            "ประมวลผลและนำเข้าชุดข้อมูล"
          )}
        </button>

        <div className="text-center text-xs text-text-secondary">
          มีสลิปเดี่ยวใบเดียว?{" "}
          <Link href="/upload" className="font-semibold text-primary underline hover:text-primary-dark">
            อัปโหลดหลักฐานปกติแทน
          </Link>
        </div>
      </div>
    </form>
  );
}
