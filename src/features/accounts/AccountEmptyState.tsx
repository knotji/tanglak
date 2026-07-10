import { EmptyState } from "@/components/EmptyState";

export function AccountEmptyState() {
  return (
    <EmptyState
      title="ยังไม่มีบัญชีหรือกระเป๋าเงิน"
      body="เพิ่มเฉพาะชื่อบัญชีและเลขท้าย 4 หลักพอ ไม่ต้องเก็บเลขบัญชีเต็ม"
    />
  );
}
