"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { saveTransactionAction } from "@/app/actions/finance";
import { AccountSelector } from "@/features/accounts/AccountSelector";
import type { Account, Transaction } from "@/types/domain";

const schema = z.object({
  type: z.enum(["income", "expense", "debt_payment", "transfer", "refund"]),
  amount: z.string().min(1, "ใส่จำนวนเงิน"),
  label: z.string().min(1, "ใส่ชื่อรายการ"),
  category: z.string().optional(),
  date: z.string().min(1),
  sourceAccountId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function ManualTransactionForm({
  transaction,
  accounts = [],
  onSaved,
}: {
  transaction?: Transaction;
  accounts?: Account[];
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(saveTransactionAction, { ok: false });
  const { register, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: transaction?.type ?? "expense",
      amount: transaction ? String(transaction.amountSatang / 100) : "",
      label: transaction?.merchant ?? "",
      category: transaction?.category ?? "อาหาร",
      date: transaction?.occurredAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      sourceAccountId: transaction?.sourceAccountId ?? "",
    },
  });

  useEffect(() => {
    const saved = window.localStorage.getItem("tanglak.transactionDraft");
    if (!transaction && saved) reset(JSON.parse(saved) as FormValues);
  }, [reset, transaction]);

  useEffect(() => {
    if (state.ok) {
      window.localStorage.removeItem("tanglak.transactionDraft");
      reset({ type: "expense", amount: "", label: "", category: "อาหาร", date: new Date().toISOString().slice(0, 10) });
      onSaved?.();
    }
  }, [onSaved, reset, state.ok]);

  return (
    <form
      action={action}
      onInput={(event) => {
        const formData = new FormData(event.currentTarget);
        window.localStorage.setItem("tanglak.transactionDraft", JSON.stringify(Object.fromEntries(formData)));
      }}
      className="rounded-[16px] border border-border bg-surface p-4"
    >
      {transaction ? <input type="hidden" name="id" value={transaction.id} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">ประเภท</span>
          <select className="min-h-11 w-full rounded-[16px] border border-border bg-white px-3" {...register("type")} name="type">
            <option value="expense">รายจ่าย</option>
            <option value="income">รายรับ</option>
            <option value="debt_payment">ชำระหนี้</option>
            <option value="transfer">โอนบัญชีตัวเอง</option>
            <option value="refund">เงินคืน</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">จำนวนเงิน</span>
          <input inputMode="decimal" className="min-h-11 w-full rounded-[16px] border border-border bg-white px-3" placeholder="189" {...register("amount")} name="amount" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">ชื่อรายการ</span>
          <input className="min-h-11 w-full rounded-[16px] border border-border bg-white px-3" placeholder="GrabFood" {...register("label")} name="label" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">วันที่</span>
          <input type="date" className="min-h-11 w-full rounded-[16px] border border-border bg-white px-3" {...register("date")} name="date" />
        </label>
      </div>
      {accounts.length ? (
        <label className="mt-3 block space-y-1 text-sm">
          <span className="font-medium">บัญชี</span>
          <AccountSelector accounts={accounts} name="sourceAccountId" defaultValue={transaction?.sourceAccountId} />
        </label>
      ) : null}
      <input type="hidden" value="อาหาร" {...register("category")} name="category" />
      {formState.errors.amount || formState.errors.label ? (
        <p className="mt-3 text-sm text-overdue">กรอกข้อมูลขั้นต่ำให้ครบก่อนบันทึก</p>
      ) : null}
      {state.message && !state.ok ? <p className="mt-3 text-sm text-overdue">{state.message}</p> : null}
      <button
        disabled={pending}
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] bg-primary px-4 font-bold text-white disabled:opacity-60"
      >
        <Plus size={18} aria-hidden />
        {pending ? "กำลังบันทึก..." : transaction ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}
      </button>
    </form>
  );
}
