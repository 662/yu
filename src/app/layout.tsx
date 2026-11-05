import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "年年有鱼",
  description: "年年有鱼 · 记账软件",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
