import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { BookApp } from "@/features/book/book-app";
import { getBook } from "@/features/book/repository";
import { getCurrentUser } from "@/lib/auth";

async function CurrentBook({ children }: { children: ReactNode }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  return <BookApp initial={await getBook(user.id)} today={today} user={{ name: user.name, email: user.email }}>{children}</BookApp>;
}

export default function BookLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="opening-book" role="status">正在打开生活账本…</div>}><CurrentBook>{children}</CurrentBook></Suspense>;
}
