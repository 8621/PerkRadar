import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "每日优惠情报",
  description: "服务器每两小时抓取近 7 天的真实优惠，失败来源会标明并在下一轮重试。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f3ee",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh bg-[#f6f3ee] font-sans text-[#1c2118] antialiased">{children}</body>
    </html>
  );
}
