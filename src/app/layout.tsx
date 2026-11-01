import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MERIT ERP", template: "%s｜MERIT ERP" },
  description: "電腦整機、零件、周邊銷售管理系統",
  appleWebApp: { capable: true, title: "MERIT ERP", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant-TW">
      <body className="antialiased">{children}</body>
    </html>
  );
}
