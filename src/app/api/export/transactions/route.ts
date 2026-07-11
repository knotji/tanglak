import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listTransactions } from "@/lib/data/finance-repository";
import { formatTHB } from "@/lib/finance/money";
import { getBangkokMonthString } from "@/lib/finance/date";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const month = getBangkokMonthString();
  const transactions = await listTransactions(user.id, month);
  const header = [
    "วันที่",
    "เวลา",
    "ประเภท",
    "ร้านค้า",
    "หมวด",
    "จำนวนเงิน",
    "บัญชี",
    "หนี้ที่เกี่ยวข้อง",
    "หมายเหตุ",
    "แหล่งข้อมูล",
    "สถานะ",
  ];
  const rows = transactions.map((transaction) => {
    const date = new Date(transaction.occurredAt);
    return [
      transaction.occurredAt.slice(0, 10),
      date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      transaction.type,
      transaction.merchant ?? "",
      transaction.category ?? "",
      formatTHB(transaction.amountSatang),
      transaction.sourceAccountId ?? "",
      transaction.debtId ?? "",
      transaction.note ?? "",
      transaction.source,
      transaction.status,
    ];
  });
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tanglak-transactions.csv"',
    },
  });
}
