import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RoleSwitcher } from "@/components/RoleSwitcher";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "门店 AI 经营助手";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "门店私有化 AI 经营助手 —— 员工工作指导 + 老板经营管理",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0ea5a4",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="mx-auto min-h-screen w-full max-w-md bg-white shadow-sm">
          {children}
        </div>
        <RoleSwitcher />
      </body>
    </html>
  );
}
