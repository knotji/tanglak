"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { saveTransactionAction } from "@/app/actions/finance";
import { AccountSelector } from "@/features/accounts/AccountSelector";
import { DEBT_ERROR_UNLINKED_PAYMENT_TH } from "@/lib/finance/debt-guards";
import { parseRequiredMoney } from "@/lib/finance/money-guards";
import type { Account, Debt, Transaction } from "@/types/domain";

const schema = z.object({
  type: z.enum(["income", "expense", "debt_payment", "transfer", "refund"]),
  amount: z.string().min(1, "ใส่จำนวนเงิน"),
  label: z.string().min(1, "ใส่ชื่อรายการ"),
  category: z.string().optional(),
  date: z.string().min(1),
  sourceAccountId: z.string().optional(),
  debtId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function ManualTransactionForm({
  transaction,
  accounts = [],
  debts = [],
  onSaved,
}: {
  transaction?: Transaction;
  accounts?: Account[];
  debts?: Debt[];
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(saveTransactionAction, { ok: false });
  const [clientError, setClientError] = useState<string | null>(null);
  const { register, reset, formState, control } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: transaction?.type ?? "expense",
      amount: transaction ? String(transaction.amountSatang / 100) : "",
      label: transaction?.merchant ?? "",
      category: transaction?.category ?? "อาหาร",
      date: transaction?.occurredAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      sourceAccountId: transaction?.sourceAccountId ?? "",
      debtId: transaction?.debtId ?? "",
    },
  });
  // Derived from the form's own live "type" field (not a separately
  // synced useState) so it never needs an effect to stay in sync when the
  // form is reset from a saved draft or after a successful save.
  const selectedType = useWatch({ control, name: "type" });

  useEffect(() => {
    const saved = window.localStorage.getItem("tanglak.transactionDraft");
    if (!transaction && saved) {
      reset(JSON.parse(saved) as FormValues);
    }
  }, [reset, transaction]);

  useEffect(() => {
    if (state.ok) {
      window.localStorage.removeItem("tanglak.transactionDraft");
      reset({ type: "expense", amount: "", label: "", category: "อาหาร", date: new Date().toISOString().slice(0, 10), debtId: "" });
      onSaved?.();
    }
  }, [onSaved, reset, state.ok]);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget);
        const type = String(formData.get("type") || "expense");
        const amountResult = parseRequiredMoney(formData.get("amount"), type === "debt_payment" ? "positive" : "nonnegative");
        if (!amountResult.ok) {
          event.preventDefault();
          setClientError(amountResult.error);
          return;
        }
        if (type === "debt_payment" && !String(formData.get("debtId") || "")) {
          event.preventDefault();
          setClientError(DEBT_ERROR_UNLINKED_PAYMENT_TH);
          return;
        }
        setClientError(null);
      }}
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
          <select
            className="min-h-11 w-full rounded-[16px] border border-border bg-white px-3"
            {...register("type")}
            name="type"
          >
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
      {selectedType === "debt_payment" ? (
        <label className="mt-3 block space-y-1 text-sm">
          <span className="font-medium">หนี้ที่เกี่ยวข้อง</span>
          <select
            className="min-h-11 w-full rounded-[16px] border border-border bg-white px-3"
            {...register("debtId")}
            name="debtId"
            required
          >
            <option value="">เลือกหนี้</option>
            {debts.map((debt) => (
              <option key={debt.id} value={debt.id}>
                {debt.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <input type="hidden" value="อาหาร" {...register("category")} name="category" />
      {formState.errors.amount || formState.errors.label ? (
        <p className="mt-3 text-sm text-overdue">กรอกข้อมูลขั้นต่ำให้ครบก่อนบันทึก</p>
      ) : null}
      {clientError ? (
        <p role="alert" className="mt-3 text-sm text-overdue">{clientError}</p>
      ) : state.message && !state.ok ? (
        <p className="mt-3 text-sm text-overdue">{state.message}</p>
      ) : null}
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
