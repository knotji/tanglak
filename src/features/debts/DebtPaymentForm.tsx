"use client";

import { useActionState, useEffect } from "react";
import { addDebtPaymentAction } from "@/app/actions/finance";

export function DebtPaymentForm({
  debtId,
  onSaved,
}: {
  debtId: string;
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(addDebtPaymentAction, { ok: false });

  useEffect(() => {
    if (state.ok) onSaved?.();
  }, [onSaved, state.ok]);

  return (
    <form action={action} className="rounded-[16px] border border-border bg-surface p-4">
      <input type="hidden" name="debtId" value={debtId} />
      <label className="space-y-1 text-sm">
        <span className="font-medium">ยอดที่ชำระ</span>
        <input
          name="amount"
          inputMode="decimal"
          className="min-h-11 w-full rounded-[16px] border border-border px-3"
          placeholder="1500"
        />
      </label>
      {state.message ? <p className="mt-3 text-sm text-overdue">{state.message}</p> : null}
      <button className="mt-4 min-h-11 w-full rounded-[16px] bg-primary px-4 font-bold text-white">
        {pending ? "กำลังบันทึก..." : "บันทึกการชำระ"}
      </button>
    </form>
  );
}
