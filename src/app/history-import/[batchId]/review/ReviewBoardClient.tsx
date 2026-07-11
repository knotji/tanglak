"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmBatchAction, deleteBatchAction } from "@/app/actions/history-import";
import type { ImportBatch, ImportRow, Debt, TransactionType } from "@/types/domain";

interface ReviewBoardClientProps {
  batch: ImportBatch;
  initialRows: ImportRow[];
  debts: Debt[];
}

export function ReviewBoardClient({ batch, initialRows, debts }: ReviewBoardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const batchContext = batch.originalFilename || batch.id;

  const [rows, setRows] = useState<ImportRow[]>(initialRows);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>("all");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Statistics
  const totalCount = rows.length;
  const readyCount = rows.filter(r => r.reviewStatus === "ready").length;
  const duplicateCount = rows.filter(r => r.reviewStatus === "possible_duplicate").length;
  const needsReviewCount = rows.filter(r => r.reviewStatus === "needs_review").length;
  const transferCount = rows.filter(r => r.reviewStatus === "possible_transfer").length;
  const debtPaymentCount = rows.filter(r => r.reviewStatus === "possible_debt_payment").length;
  const skippedCount = rows.filter(r => r.importDecision === "skip").length;
  const warningCount = rows.filter(r => r.validationWarnings.length > 0).length;

  // Filter rows based on activeTab
  const filteredRows = rows.filter(row => {
    switch (activeTab) {
      case "ready":
        return row.reviewStatus === "ready";
      case "duplicate":
        return row.reviewStatus === "possible_duplicate";
      case "needs_review":
        return row.reviewStatus === "needs_review" || row.reviewStatus === "invalid";
      case "transfer":
        return row.reviewStatus === "possible_transfer";
      case "debt_payment":
        return row.reviewStatus === "possible_debt_payment";
      case "skip":
        return row.importDecision === "skip";
      case "warnings":
        return row.validationWarnings.length > 0;
      case "all":
      default:
        return true;
    }
  });

  const statementMetadata = batch.statementMetadata as
    | {
        bankName?: { value?: string };
        accountLastFour?: { value?: string };
        statementType?: { value?: string };
      }
    | undefined;
  const detectedLayout = batch.detectedLayout as
    | { layoutId?: string; confidence?: number; needsReview?: boolean; warnings?: string[] }
    | undefined;

  // Select handlers
  const handleSelectRow = (id: string) => {
    const next = new Set(selectedRowIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedRowIds(next);
  };

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedRowIds);
    filteredRows.forEach(row => next.add(row.id));
    setSelectedRowIds(next);
  };

  const handleDeselectAllFiltered = () => {
    const next = new Set(selectedRowIds);
    filteredRows.forEach(row => next.delete(row.id));
    setSelectedRowIds(next);
  };

  // Modify row values
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleUpdateRowField = (rowId: string, field: keyof ImportRow, value: any) => {
    setRows(prev =>
      prev.map(row => {
        if (row.id === rowId) {
          const nextRow = { ...row, [field]: value };
          // If decision changes, check if we need to adjust status
          if (field === "importDecision" && value === "skip") {
            // keep reviewStatus or modify
          }
          return nextRow;
        }
        return row;
      })
    );
  };

  // Bulk operations
  const handleBulkChangeType = (type: TransactionType) => {
    if (selectedRowIds.size === 0) return;
    setRows(prev =>
      prev.map(row => {
        if (selectedRowIds.has(row.id)) {
          return { ...row, suggestedTransactionType: type };
        }
        return row;
      })
    );
  };

  const handleBulkChangeCategory = (cat: string) => {
    if (selectedRowIds.size === 0) return;
    setRows(prev =>
      prev.map(row => {
        if (selectedRowIds.has(row.id)) {
          return { ...row, suggestedCategory: cat };
        }
        return row;
      })
    );
  };

  const handleBulkSetDecision = (decision: "import" | "merge_existing" | "skip") => {
    if (selectedRowIds.size === 0) return;
    setRows(prev =>
      prev.map(row => {
        if (selectedRowIds.has(row.id)) {
          return { ...row, importDecision: decision };
        }
        return row;
      })
    );
  };

  const handleSkipAllDuplicates = () => {
    setRows(prev =>
      prev.map(row => {
        if (row.reviewStatus === "possible_duplicate") {
          return { ...row, importDecision: "skip" };
        }
        return row;
      })
    );
  };

  // Delete/Cancel Batch
  const handleDeleteBatch = async () => {
    if (!window.confirm("คุณต้องการลบชุดนำเข้านี้ใช่หรือไม่? ไฟล์ที่อัปโหลดและรายการชั่วคราวจะถูกลบทั้งหมด")) {
      return;
    }
    const res = await deleteBatchAction(batch.id);
    if (res.ok) {
      router.push("/settings/data");
    } else {
      setErrorMsg(res.message || "ลบชุดข้อมูลล้มเหลว");
    }
  };

  // Confirm Import Commit
  const handleConfirmImport = async () => {
    setErrorMsg(null);
    const unresolvedCount = rows.filter(r => r.importDecision === "unresolved").length;
    if (unresolvedCount > 0) {
      if (!window.confirm(`มีอีก ${unresolvedCount} รายการที่ยังไม่ได้เลือกผลการตรวจสอบ คุณต้องการข้ามรายการที่เหลือและนำเข้ารายการที่ระบุไว้ใช่หรือไม่?`)) {
        return;
      }
    }

    const payload = rows
      .filter(r => r.importDecision !== "unresolved")
      .map(r => ({
        rowId: r.id,
        decision: r.importDecision as "import" | "merge_existing" | "skip",
        transactionType: r.suggestedTransactionType,
        category: r.suggestedCategory,
        debtId: r.suggestedDebtId,
        occurredAt: r.occurredAt,
        merchant: r.merchant || r.description,
        amountSatang: r.amountSatang,
        duplicateTransactionId: r.duplicateTransactionId,
      }));

    startTransition(async () => {
      const res = await confirmBatchAction(batch.id, batch.accountId, payload);
      if (res.ok) {
        router.push(`/history-import/${batch.id}/summary`);
      } else {
        setErrorMsg(res.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {errorMsg && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Header Info */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-foreground">📁 {batch.originalFilename}</h2>
        <p className="text-[11px] text-text-secondary mt-1">
          ประเภทต้นทาง: {batch.sourceType} | ช่วงเวลา: {batch.periodStart || "-"} ถึง {batch.periodEnd || "-"}
        </p>

        {(statementMetadata?.bankName?.value || statementMetadata?.accountLastFour?.value || batch.pageCount) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
            {statementMetadata?.bankName?.value && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-text-secondary">
                🏦 {statementMetadata.bankName.value}
              </span>
            )}
            {statementMetadata?.accountLastFour?.value && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-text-secondary">
                •••• {statementMetadata.accountLastFour.value}
              </span>
            )}
            {batch.pageCount && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-text-secondary">
                {batch.pageCount} หน้า
              </span>
            )}
            {detectedLayout?.layoutId && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-text-secondary">
                รูปแบบ {detectedLayout.layoutId} ({Math.round((detectedLayout.confidence ?? 0) * 100)}%)
              </span>
            )}
            {detectedLayout?.needsReview && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                ควรตรวจสอบความแม่นยำ
              </span>
            )}
          </div>
        )}

        {/* Staging stats overview */}
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          <div className="rounded-lg bg-slate-50 p-2">
            <span className="block font-bold text-foreground">{totalCount}</span>
            <span className="text-[10px] text-text-secondary">ทั้งหมด</span>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2">
            <span className="block font-bold text-emerald-600">{readyCount}</span>
            <span className="text-[10px] text-emerald-600">พร้อม</span>
          </div>
          <div className="rounded-lg bg-amber-50 p-2">
            <span className="block font-bold text-amber-600">{duplicateCount}</span>
            <span className="text-[10px] text-amber-600">อาจซ้ำ</span>
          </div>
          <div className="rounded-lg bg-rose-50 p-2">
            <span className="block font-bold text-rose-600">{needsReviewCount + transferCount + debtPaymentCount}</span>
            <span className="text-[10px] text-rose-600">ควรตรวจ</span>
          </div>
        </div>
      </div>

      {/* Bulk Toolbar */}
      {selectedRowIds.size > 0 && (
        <div className="rounded-xl border border-primary bg-indigo-50/50 p-3 text-xs flex flex-col gap-2 shadow-sm animate-fade-in">
          <div className="flex items-center justify-between font-semibold text-primary">
            <span>เลือกอยู่ {selectedRowIds.size} รายการ</span>
            <button onClick={() => setSelectedRowIds(new Set())} className="underline">ยกเลิก</button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1 border-t border-indigo-100">
            <button onClick={() => handleBulkSetDecision("import")} className="rounded bg-primary px-2.5 py-1 font-bold text-white">นำเข้า</button>
            <button onClick={() => handleBulkSetDecision("skip")} className="rounded bg-gray-200 px-2.5 py-1 font-semibold text-text-secondary">ข้าม</button>
            <select
              onChange={(e) => handleBulkChangeType(e.target.value as TransactionType)}
              defaultValue=""
              className="rounded border border-border bg-white px-2 py-0.5"
            >
              <option value="" disabled>ตั้งประเภท...</option>
              <option value="expense">รายจ่าย</option>
              <option value="income">รายรับ</option>
              <option value="transfer">โอนเงิน</option>
              <option value="debt_payment">ชำระหนี้</option>
            </select>
            <select
              onChange={(e) => handleBulkChangeCategory(e.target.value)}
              defaultValue=""
              className="rounded border border-border bg-white px-2 py-0.5"
            >
              <option value="" disabled>ตั้งหมวดหมู่...</option>
              <option value="รายได้">รายได้</option>
              <option value="อาหาร">อาหาร</option>
              <option value="เดลิเวอรี">เดลิเวอรี</option>
              <option value="โอนเงิน">โอนเงิน</option>
              <option value="อื่น ๆ">อื่น ๆ</option>
            </select>
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-border text-xs scrollbar-none">
        {[
          { id: "all", label: "ทั้งหมด" },
          { id: "ready", label: `พร้อม (${readyCount})` },
          { id: "duplicate", label: `อาจซ้ำ (${duplicateCount})` },
          { id: "transfer", label: `คู่โอน (${transferCount})` },
          { id: "debt_payment", label: `ชำระหนี้ (${debtPaymentCount})` },
          { id: "skip", label: `ข้าม (${skippedCount})` },
          { id: "warnings", label: `มีคำเตือนการอ่าน (${warningCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 font-bold rounded-lg whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-primary text-white"
                : "text-text-secondary bg-surface hover:bg-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table actions bar */}
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <div className="flex items-center gap-2">
          <button onClick={handleSelectAllFiltered} className="hover:underline text-primary font-semibold">เลือกทั้งหมด</button>
          <span>|</span>
          <button onClick={handleDeselectAllFiltered} className="hover:underline">ไม่เลือกทั้งหมด</button>
        </div>
        {duplicateCount > 0 && (
          <button onClick={handleSkipAllDuplicates} className="hover:underline text-rose-600 font-semibold">
            ข้ามรายการซ้ำทั้งหมด
          </button>
        )}
      </div>

      {/* Staging Rows List */}
      <div className="flex flex-col gap-2">
        {filteredRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-xs text-text-secondary">
            ไม่มีรายการในหมวดหมู่นี้
          </div>
        ) : (
          filteredRows.map((row) => {
            const isExpanded = expandedRowId === row.id;
            const fieldIdBase = `import-row-${row.id}`;
            const isSelected = selectedRowIds.has(row.id);
            const dateObj = new Date(row.occurredAt);
            const displayTime = dateObj.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
            const displayDate = dateObj.toLocaleDateString("th-TH", { day: "2-digit", month: "short" });

            return (
              <div
                key={row.id}
                className={`rounded-xl border border-border bg-white shadow-sm overflow-hidden transition-all duration-200 ${
                  isSelected ? "border-primary bg-indigo-50/10" : ""
                }`}
              >
                {/* Compact view */}
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50/50"
                  onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectRow(row.id)}
                    onClick={(e) => e.stopPropagation()} // avoid expand
                    className="h-4 w-4 rounded border-border"
                  />
                  <div className="text-center min-w-[36px]">
                    <span className="block font-bold text-foreground text-xs">{displayDate}</span>
                    <span className="block text-[9px] text-text-secondary">{displayTime}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-foreground truncate">
                      {row.merchant || row.description}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-text-secondary truncate max-w-[120px]">
                        {row.description}
                      </span>
                      {row.reviewStatus === "possible_duplicate" && (
                        <span className="rounded bg-rose-50 px-1 py-0.2 text-[8px] font-bold text-rose-600">
                          ซ้ำ ({row.duplicateScore}%)
                        </span>
                      )}
                      {row.reviewStatus === "possible_transfer" && (
                        <span className="rounded bg-blue-50 px-1 py-0.2 text-[8px] font-bold text-blue-600">
                          โอนบัญชี
                        </span>
                      )}
                      {row.reviewStatus === "possible_debt_payment" && (
                        <span className="rounded bg-amber-50 px-1 py-0.2 text-[8px] font-bold text-amber-600">
                          จ่ายหนี้
                        </span>
                      )}
                      {row.pageNumber && (
                        <span className="rounded bg-slate-100 px-1 py-0.2 text-[8px] font-semibold text-text-secondary">
                          ดูจากหน้า {row.pageNumber}
                        </span>
                      )}
                      {row.validationWarnings.length > 0 && (
                        <span className="rounded bg-amber-50 px-1 py-0.2 text-[8px] font-bold text-amber-700">
                          ⚠ คำเตือนการอ่าน
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-xs font-bold ${
                        row.direction === "credit" ? "text-emerald-600" : "text-foreground"
                      }`}
                    >
                      {row.direction === "credit" ? "+" : "-"}฿{(row.amountSatang / 100).toLocaleString()}
                    </span>
                    <span className="block text-[9px] text-text-secondary mt-0.5">
                      {row.importDecision === "import"
                        ? "นำเข้า"
                        : row.importDecision === "skip"
                        ? "ข้าม"
                        : row.importDecision === "merge_existing"
                        ? "รวมรายการ"
                        : "รอกำหนด"}
                    </span>
                  </div>
                </div>

                {/* Expanded edit details form */}
                {isExpanded && (
                  <div className="border-t border-border bg-slate-50/50 p-3 text-xs flex flex-col gap-3 animate-slide-down">
                    {row.validationWarnings.length > 0 && (
                      <div className="rounded bg-amber-50 border border-amber-100 p-2 text-[10px] text-amber-700">
                        {row.validationWarnings.map((w, index) => <div key={index}>{w}</div>)}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      {/* Name Edit */}
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`${fieldIdBase}-merchant`} className="text-[10px] font-bold text-text-secondary">ชื่อธุรกรรม / ร้านค้า</label>
                        <input
                          id={`${fieldIdBase}-merchant`}
                          type="text"
                          value={row.merchant || ""}
                          onChange={(e) => handleUpdateRowField(row.id, "merchant", e.target.value)}
                          className="h-8 rounded border border-border bg-white px-2"
                        />
                      </div>

                      {/* Occurred At Date Edit */}
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`${fieldIdBase}-occurred-at`} className="text-[10px] font-bold text-text-secondary">วันเวลาธุรกรรม</label>
                        <input
                          id={`${fieldIdBase}-occurred-at`}
                          type="datetime-local"
                          value={row.occurredAt.slice(0, 16)}
                          onChange={(e) => handleUpdateRowField(row.id, "occurredAt", new Date(e.target.value).toISOString())}
                          className="h-8 rounded border border-border bg-white px-2"
                        />
                      </div>

                      {/* Type Select */}
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`${fieldIdBase}-type`} className="text-[10px] font-bold text-text-secondary">ประเภทรายการ</label>
                        <select
                          id={`${fieldIdBase}-type`}
                          value={row.suggestedTransactionType || "expense"}
                          onChange={(e) => handleUpdateRowField(row.id, "suggestedTransactionType", e.target.value)}
                          className="h-8 rounded border border-border bg-white px-2"
                        >
                          <option value="expense">รายจ่าย (Expense)</option>
                          <option value="income">รายรับ (Income)</option>
                          <option value="transfer">โอนเงิน (Transfer)</option>
                          <option value="debt_payment">ชำระหนี้ (Debt Payment)</option>
                        </select>
                      </div>

                      {/* Category Select */}
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`${fieldIdBase}-category`} className="text-[10px] font-bold text-text-secondary">หมวดหมู่</label>
                        <select
                          id={`${fieldIdBase}-category`}
                          value={row.suggestedCategory || "อื่น ๆ"}
                          onChange={(e) => handleUpdateRowField(row.id, "suggestedCategory", e.target.value)}
                          className="h-8 rounded border border-border bg-white px-2"
                        >
                          <option value="รายได้">รายได้</option>
                          <option value="อาหาร">อาหาร</option>
                          <option value="เดลิเวอรี">เดลิเวอรี</option>
                          <option value="โอนเงิน">โอนเงิน</option>
                          <option value="อื่น ๆ">อื่น ๆ</option>
                        </select>
                      </div>

                      {/* Debt Selector if Type is debt_payment */}
                      {row.suggestedTransactionType === "debt_payment" && (
                        <div className="flex flex-col gap-1 col-span-2">
                          <label htmlFor={`${fieldIdBase}-debt`} className="text-[10px] font-bold text-text-secondary">บัญชีหนี้สินที่ชำระ</label>
                          <select
                            id={`${fieldIdBase}-debt`}
                            value={row.suggestedDebtId || ""}
                            onChange={(e) => handleUpdateRowField(row.id, "suggestedDebtId", e.target.value)}
                            className="h-8 rounded border border-border bg-white px-2 font-semibold"
                          >
                            <option value="">-- เลือกบัญชีหนี้สิน --</option>
                            {debts.map(d => (
                              <option key={d.id} value={d.id}>
                                💳 {d.creditor} - {d.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Duplicate Linking Area */}
                    {row.reviewStatus === "possible_duplicate" && row.duplicateTransactionId && (
                      <div className="rounded bg-rose-50/50 border border-rose-100 p-2.5 flex flex-col gap-1">
                        <div className="font-semibold text-rose-700">ตรวจพบรายการซ้ำที่น่าจะเป็นไปได้:</div>
                        <p className="text-[10px] text-text-secondary">
                          มีรายการเดิมในระบบในวันและจํานวนเงินที่สอดคล้องกัน (คะแนนประเมินการซ้ำ {row.duplicateScore}%)
                        </p>
                      </div>
                    )}

                    {/* Import Decision Radio Options */}
                    <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                      <span className="text-[10px] font-bold text-text-secondary mb-1">ผลการนำเข้า</span>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`decision-${row.id}`}
                            checked={row.importDecision === "import"}
                            onChange={() => handleUpdateRowField(row.id, "importDecision", "import")}
                            className="h-3.5 w-3.5"
                          />
                          <span>นำเข้าเป็นธุรกรรมใหม่</span>
                        </label>

                        {row.duplicateTransactionId && (
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={`decision-${row.id}`}
                              checked={row.importDecision === "merge_existing"}
                              onChange={() => handleUpdateRowField(row.id, "importDecision", "merge_existing")}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-emerald-700 font-semibold">จับคู่กับรายการเดิมที่มีอยู่</span>
                          </label>
                        )}

                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`decision-${row.id}`}
                            checked={row.importDecision === "skip"}
                            onChange={() => handleUpdateRowField(row.id, "importDecision", "skip")}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-rose-600">ข้ามรายการนี้</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Buttons */}
      <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4">
        <button
          onClick={handleConfirmImport}
          disabled={isPending}
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow hover:bg-primary-dark disabled:opacity-50"
        >
          {isPending ? "กำลังบันทึกธุรกรรม..." : `ยืนยันการนำเข้าทั้งหมด (${rows.filter(r => r.importDecision !== "skip" && r.importDecision !== "unresolved").length} รายการ)`}
        </button>

        <button
          onClick={handleDeleteBatch}
          aria-label={`ยกเลิกนำเข้าและลบชุด ${batchContext}`}
          className="flex min-h-11 w-full items-center justify-center rounded-xl bg-rose-50 text-xs font-bold text-rose-600 hover:bg-rose-100"
        >
          ยกเลิกนำเข้าและลบชุดนี้
        </button>
      </div>
    </div>
  );
}
