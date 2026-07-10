"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveOnboardingAction } from "@/app/actions/profile";
import { InlineError } from "@/components/feedback/InlineError";
import { LoadingButton } from "@/components/feedback/LoadingButton";
import type { Profile } from "@/lib/data/profile-repository";

export function OnboardingForm({ profile }: { profile: Profile | null }) {
  const [state, action, pending] = useActionState(saveOnboardingAction, { ok: false });
  const draftKey = "tanglak.onboardingDraft";
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    window.setTimeout(() => {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) setDraft(JSON.parse(saved) as Record<string, string>);
    }, 0);
  }, []);

  const reminders = useMemo(() => new Set(profile?.preferredReminderDays ?? [7, 3, 1]), [profile]);

  function persist(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    window.localStorage.setItem(draftKey, JSON.stringify(Object.fromEntries(formData)));
  }

  return (
    <form action={action} onInput={persist} className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">ชื่อที่อยากให้เรียก</span>
        <input
          name="displayName"
          defaultValue={draft.displayName ?? profile?.displayName ?? ""}
          className="min-h-11 w-full rounded-[16px] border border-border px-3"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">สกุลเงิน</span>
        <select name="preferredCurrency" className="min-h-11 w-full rounded-[16px] border border-border px-3" defaultValue="THB">
          <option value="THB">THB</option>
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">เขตเวลา</span>
        <input
          name="timezone"
          defaultValue={draft.timezone ?? profile?.timezone ?? "Asia/Bangkok"}
          required
          className="min-h-11 w-full rounded-[16px] border border-border px-3"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">วันเงินเดือนออก</span>
        <input
          name="salaryDay"
          inputMode="numeric"
          placeholder="เช่น 30"
          defaultValue={draft.salaryDay ?? profile?.salaryDay ?? ""}
          className="min-h-11 w-full rounded-[16px] border border-border px-3"
        />
      </label>
      <fieldset className="rounded-[16px] bg-muted p-3 text-sm">
        <legend className="font-medium">เตือนก่อนครบกำหนด</legend>
        <label className="mt-2 flex min-h-11 items-center gap-2">
          <input name="reminder7" type="checkbox" defaultChecked={draft.reminder7 === "on" || (!Object.keys(draft).length && reminders.has(7))} /> 7 วันก่อน
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input name="reminder3" type="checkbox" defaultChecked={draft.reminder3 === "on" || (!Object.keys(draft).length && reminders.has(3))} /> 3 วันก่อน
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input name="reminder1" type="checkbox" defaultChecked={draft.reminder1 === "on" || (!Object.keys(draft).length && reminders.has(1))} /> 1 วันก่อน
        </label>
      </fieldset>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input name="wantsBudgetGuidance" type="checkbox" defaultChecked={draft.wantsBudgetGuidance === "on" || profile?.wantsBudgetGuidance} />
        ช่วยแนะนำการแบ่งเงินรายเดือน
      </label>
      <InlineError message={state.message} />
      <LoadingButton pending={pending} className="w-full">
        เริ่มใช้งาน
      </LoadingButton>
    </form>
  );
}
