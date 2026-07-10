"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { saveDebtAction } from "@/app/actions/finance";
import type { Debt } from "@/types/domain";

const schema = z.object({
  name: z.string().min(1),
  creditor: z.string().optional(),
  outstanding: z.string().optional(),
  amount: z.string().min(1),
  minimum: z.string().optional(),
  dueDate: z.string().min(1),
  recurringDueDay: z.string().optional(),
  paymentMode: z.enum(["fixed_monthly", "variable_monthly", "installment", "one_time"]).optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function ManualDebtForm({
  debt,
  onSaved,
}: {
  debt?: Debt;
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(saveDebtAction, { ok: false });
  const { register, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: debt?.name ?? "",
      creditor: debt?.creditor ?? "",
      outstanding: debt?.outstandingBalanceSatang ? String(debt.outstandingBalanceSatang / 100) : "",
      amount: debt?.amountDueSatang ? String(debt.amountDueSatang / 100) : "",
      minimum: debt?.minimumPaymentSatang ? String(debt.minimumPaymentSatang / 100) : "",
      dueDate: debt?.dueDate ?? new Date().toISOString().slice(0, 10),
      recurringDueDay: debt?.recurringDueDay ? String(debt.recurringDueDay) : "",
      paymentMode: debt?.paymentMode ?? "variable_monthly",
      notes: debt?.notes ?? "",
    },
  });

  useEffect(() => {
    const saved = window.localStorage.getItem("tanglak.debtDraft");
    if (!debt && saved) reset(JSON.parse(saved) as FormValues);
  }, [debt, reset]);

  useEffect(() => {
    if (state.ok) {
      window.localStorage.removeItem("tanglak.debtDraft");
      reset({
        name: "",
        creditor: "",
        outstanding: "",
        amount: "",
        minimum: "",
        dueDate: new Date().toISOString().slice(0, 10),
        recurringDueDay: "",
        paymentMode: "variable_monthly",
        notes: "",
      });
      onSaved?.();
    }
  }, [onSaved, reset, state.ok]);

  return (
    <form
      action={action}
      onInput={(event) => {
        const formData = new FormData(event.currentTarget);
        window.localStorage.setItem("tanglak.debtDraft", JSON.stringify(Object.fromEntries(formData)));
      }}
      className="rounded-[16px] border border-border bg-surface p-4"
    >
      {debt ? <input type="hidden" name="id" value={debt.id} /> : null}
      <div className="grid gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">ชื่อหนี้</span>
          <input className="min-h-11 w-full rounded-[16px] border border-border px-3" {...register("name")} name="name" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">เจ้าหนี้</span>
          <input className="min-h-11 w-full rounded-[16px] border border-border px-3" {...register("creditor")} name="creditor" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">ยอดคงเหลือ</span>
            <input inputMode="decimal" className="min-h-11 w-full rounded-[16px] border border-border px-3" {...register("outstanding")} name="outstanding" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">ยอดเดือนนี้</span>
            <input inputMode="decimal" className="min-h-11 w-full rounded-[16px] border border-border px-3" {...register("amount")} name="amount" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">ขั้นต่ำ</span>
            <input inputMode="decimal" className="min-h-11 w-full rounded-[16px] border border-border px-3" {...register("minimum")} name="minimum" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">ครบกำหนด</span>
            <input type="date" className="min-h-11 w-full rounded-[16px] border border-border px-3" {...register("dueDate")} name="dueDate" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">วันครบกำหนดซ้ำ</span>
            <input inputMode="numeric" placeholder="18" className="min-h-11 w-full rounded-[16px] border border-border px-3" {...register("recurringDueDay")} name="recurringDueDay" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">รูปแบบจ่าย</span>
            <select className="min-h-11 w-full rounded-[16px] border border-border px-3" {...register("paymentMode")} name="paymentMode">
              <option value="variable_monthly">ยอดเปลี่ยนรายเดือน</option>
              <option value="fixed_monthly">ยอดคงที่รายเดือน</option>
              <option value="installment">ผ่อนเป็นงวด</option>
              <option value="one_time">จ่ายครั้งเดียว</option>
            </select>
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium">โน้ต</span>
          <textarea className="min-h-24 w-full rounded-[16px] border border-border px-3 py-2" {...register("notes")} name="notes" />
        </label>
      </div>
      {state.message ? <p className="mt-3 text-sm text-overdue">{state.message}</p> : null}
      <button
        disabled={pending}
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] bg-primary px-4 font-bold text-white disabled:opacity-60"
      >
        <Plus size={18} aria-hidden />
        {pending ? "กำลังบันทึก..." : debt ? "บันทึกการแก้ไข" : "เพิ่มหนี้"}
      </button>
    </form>
  );
}
