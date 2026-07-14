"use client";

export function LoadingButton({
  pending,
  children,
  pendingLabel = "กำลังบันทึก...",
  className = "",
  type = "submit",
}: {
  pending?: boolean;
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <button
      type={type}
      disabled={pending}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[16px] bg-primary px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending ? (
        <>
          <span className="h-4 w-4 rounded-full border-2 border-white/50 border-t-white" aria-hidden />
          <span aria-live="polite">{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
