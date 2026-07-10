"use client";

export function LoadingButton({
  pending,
  children,
  pendingLabel = "กำลังบันทึก...",
  className = "",
}: {
  pending?: boolean;
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  return (
    <button
      disabled={pending}
      className={`min-h-11 rounded-[16px] bg-primary px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
