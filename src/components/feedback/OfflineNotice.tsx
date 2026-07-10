"use client";

import { useEffect, useState } from "react";

export function OfflineNotice() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;
  return (
    <div className="rounded-[16px] border border-overdue/30 bg-overdue/10 px-4 py-3 text-sm font-bold text-overdue">
      ตอนนี้ออฟไลน์อยู่ ลองเชื่อมต่อใหม่แล้วกดบันทึกอีกครั้ง
    </div>
  );
}
