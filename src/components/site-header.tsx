"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Fish } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function SiteHeader() {
  const pathname = usePathname();
  const wiki = pathname === "/wiki" || pathname.startsWith("/wiki/");
  return <header className="site-header" data-workspace={["/ledger", "/accounts", "/imports", "/categories"].includes(pathname) || undefined}>
    <Link href="/ledger" className="site-brand"><Fish aria-hidden="true" /><span>年年有鱼</span></Link>
    <nav aria-label="站点导航">
      <Link data-slot="button" className={buttonVariants({ variant: "ghost", size: "sm" })} href="/ledger">我的账本</Link>
      <Link data-slot="button" className={buttonVariants({ variant: wiki ? "secondary" : "ghost", size: "sm" })} href="/wiki" aria-current={wiki ? "page" : undefined}><BookOpen data-icon="inline-start" />项目 Wiki</Link>
    </nav>
  </header>;
}
