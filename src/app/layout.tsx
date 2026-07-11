import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_Thai } from "next/font/google";
import { ToastProvider } from "@/components/feedback/ToastProvider";
import "./globals.css";

const thaiSans = Noto_Sans_Thai({
  variable: "--font-geist-sans",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ตั้งหลัก",
  description: "เห็นเงินชัด จัดหนี้เป็น ใช้ชีวิตต่อได้",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ตั้งหลัก",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${thaiSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#main-content" className="skip-link">
          ข้ามไปยังเนื้อหา
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
