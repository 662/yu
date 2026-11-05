import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toast";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "年年有鱼",
  description: "年年有鱼 · 记账软件",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col"><Suspense fallback={<header className="site-header"><Link href="/">年年有鱼</Link><Link href="/wiki">项目 Wiki</Link></header>}><SiteHeader /></Suspense>{children}<Toaster timeout={5000} limit={3} /></body>
    </html>
  );
}
