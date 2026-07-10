"use client";

import { useEffect, useState } from "react";

export function OnlineStatus() {
  const [online, setOnline] = useState(true);

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
    <div className="rounded-[16px] border border-debt/20 bg-debt/10 px-4 py-3 text-sm font-medium text-debt">
      ตอนนี้ออฟไลน์ รายการที่ยังไม่บันทึกจะอยู่เป็นฉบับร่าง
    </div>
  );
}
