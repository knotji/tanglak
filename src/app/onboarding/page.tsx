import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { OnboardingForm } from "@/features/onboarding/OnboardingForm";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profile-repository";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string }>;
}) {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const params = await searchParams;
  if (profile?.onboardingCompleted && params?.edit !== "1") redirect("/today");

  return (
    <AppShell nav={false}>
      <PageHeader
        title={profile?.onboardingCompleted ? "แก้ไขโปรไฟล์" : "เริ่มตั้งหลัก"}
        subtitle="กรอกเท่าที่สะดวก ข้ามได้ถ้ายังไม่พร้อม"
      />
      <OnboardingForm profile={profile} />
    </AppShell>
  );
}
