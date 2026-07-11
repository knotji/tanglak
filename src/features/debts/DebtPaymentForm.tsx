"use client";

import { useActionState, useEffect, useState } from "react";
import { addDebtPaymentAction } from "@/app/actions/finance";
import { parseRequiredMoney } from "@/lib/finance/money-guards";

export function DebtPaymentForm({
  debtId,
  onSaved,
}: {
  debtId: string;
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(addDebtPaymentAction, { ok: false });
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onSaved?.();
  }, [onSaved, state.ok]);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget);
        const amountResult = parseRequiredMoney(formData.get("amount"), "positive");
        if (!amountResult.ok) {
          event.preventDefault();
          setClientError(amountResult.error);
          return;
        }
        setClientError(null);
      }}
      className="rounded-[16px] border border-border bg-surface p-4"
    >
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
      {clientError ? (
        <p role="alert" className="mt-3 text-sm text-overdue">{clientError}</p>
      ) : state.message ? (
        <p className="mt-3 text-sm text-overdue">{state.message}</p>
      ) : null}
      <button disabled={pending} className="mt-4 min-h-11 w-full rounded-[16px] bg-primary px-4 font-bold text-white disabled:opacity-60">
        {pending ? "กำลังบันทึก..." : "บันทึกการชำระ"}
      </button>
    </form>
  );
}
