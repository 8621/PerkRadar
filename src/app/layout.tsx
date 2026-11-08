import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PerkRadar · 多来源优惠线索聚合",
  description: "每两小时聚合七个公开来源的优惠线索，失败来源会标明并在下一轮重试。这是线索聚合，不是逐条认证的领取平台。",
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
