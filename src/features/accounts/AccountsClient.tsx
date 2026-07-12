"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAccountAction,
  setAccountActiveAction,
  setDefaultAccountAction,
} from "@/app/actions/accounts";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/components/feedback/ToastProvider";
import { MobileBottomSheet } from "@/components/MobileBottomSheet";
import { PageHeader } from "@/components/PageHeader";
import { AccountCard } from "@/features/accounts/AccountCard";
import { AccountEmptyState } from "@/features/accounts/AccountEmptyState";
import { AccountForm } from "@/features/accounts/AccountForm";
import type { Account } from "@/types/domain";

type SheetState = "create" | "edit" | null;
type ConfirmState =
  | { kind: "deactivate" | "reactivate" | "delete"; account: Account }
  | null;

export function AccountsClient({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [selected, setSelected] = useState<Account | undefined>();
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function closeSheet(message?: string) {
    setSheet(null);
    setSelected(undefined);
    if (message) showToast(message, "success");
    // No router.refresh() here -- saveAccountAction already calls
    // revalidatePath("/settings/accounts") etc., and Next.js automatically
    // refetches once the useActionState-bound form action resolves.
  }

  function runAction(account: Account, action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusyId(account.id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      showToast(result.message ?? (result.ok ? "เรียบร้อยแล้ว" : "ทำรายการไม่สำเร็จ"), result.ok ? "success" : "error");
      if (result.ok) router.refresh();
    });
  }

  function confirmAction() {
    if (!confirm) return;
    const { account, kind } = confirm;
    setConfirm(null);
    if (kind === "deactivate") runAction(account, () => setAccountActiveAction(account.id, false));
    if (kind === "reactivate") runAction(account, () => setAccountActiveAction(account.id, true));
    if (kind === "delete") runAction(account, () => deleteAccountAction(account.id));
  }

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="บัญชีและกระเป๋าเงิน" subtitle="เก็บเฉพาะข้อมูลที่พอใช้แยกที่มาของเงิน" />
        <button
          onClick={() => setSheet("create")}
          className="min-h-11 shrink-0 rounded-[16px] bg-primary px-4 text-sm font-bold text-white"
        >
          + เพิ่ม
        </button>
      </div>
      <section className="rounded-[16px] border border-border bg-surface p-4 text-sm leading-6 text-text-secondary">
        เพื่อความปลอดภัย ตั้งหลักไม่เก็บเลขบัญชีหรือเลขบัตรเต็ม ใช้ได้แค่เลขท้าย 4 หลักสำหรับแยกรายการ
      </section>
      {accounts.length ? (
        <div className="space-y-3">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              busy={busyId === account.id || isPending}
              onEdit={() => {
                setSelected(account);
                setSheet("edit");
              }}
              onDefault={() => runAction(account, () => setDefaultAccountAction(account.id))}
              onDeactivate={() => setConfirm({ kind: "deactivate", account })}
              onReactivate={() => setConfirm({ kind: "reactivate", account })}
              onDelete={() => setConfirm({ kind: "delete", account })}
            />
          ))}
        </div>
      ) : (
        <AccountEmptyState />
      )}
      <MobileBottomSheet title="เพิ่มบัญชี" open={sheet === "create"} onClose={() => setSheet(null)}>
        <AccountForm onSaved={closeSheet} />
      </MobileBottomSheet>
      <MobileBottomSheet title="แก้ไขบัญชี" open={sheet === "edit"} onClose={() => setSheet(null)}>
        {selected ? <AccountForm account={selected} onSaved={closeSheet} /> : null}
      </MobileBottomSheet>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.kind === "delete"
            ? "ลบบัญชีนี้?"
            : confirm?.kind === "reactivate"
              ? "เปิดใช้งานบัญชีนี้?"
              : "ปิดการใช้งานบัญชีนี้?"
        }
        body={
          confirm?.kind === "delete"
            ? "ลบได้เฉพาะบัญชีที่ยังไม่มีรายการ หนี้ เอกสาร หรือประวัตินำเข้าผูกอยู่ ถ้ามีข้อมูลแล้วระบบจะบล็อกและแนะนำให้ปิดใช้งานแทน"
            : "สถานะบัญชีจะเปลี่ยนสำหรับรายการใหม่ ประวัติเดิมจะยังอยู่ครบ"
        }
        confirmLabel="ยืนยัน"
        onCancel={() => setConfirm(null)}
        onConfirm={confirmAction}
      />
    </AppShell>
  );
}
