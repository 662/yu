"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Fish } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const pathname = usePathname();
  const wiki = pathname === "/wiki" || pathname.startsWith("/wiki/");
  return <header className="site-header" data-workspace={pathname === "/" || undefined}>
    <Link href="/" className="site-brand"><Fish aria-hidden="true" /><span>年年有鱼</span></Link>
    <nav aria-label="站点导航">
      <Button variant="ghost" size="sm" render={<Link href="/" />} nativeButton={false}>我的账本</Button>
      <Button variant={wiki ? "secondary" : "ghost"} size="sm" render={<Link href="/wiki" aria-current={wiki ? "page" : undefined} />} nativeButton={false}><BookOpen data-icon="inline-start" />项目 Wiki</Button>
    </nav>
  </header>;
}
