import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getWikiPage } from "@/features/wiki/server";
import { targetHref } from "@/features/wiki/wiki-core";
import { WikiView } from "@/features/wiki/wiki-view";

export const metadata: Metadata = { title: "项目 Wiki · 年年有鱼", robots: { index: false, follow: false } };

async function Content({ params }: PageProps<"/wiki/[[...slug]]">) {
  await connection();
  const { slug = [] } = await params;
  const result = await getWikiPage(slug.join("/"));
  if (!result) notFound();
  if (result.target.alias) redirect(targetHref(result.index, result.target));
  return <WikiView index={result.index} document={result.target.document} />;
}

export default function Page(props: PageProps<"/wiki/[[...slug]]">) {
  return <Suspense fallback={<div className="opening-book" role="status">正在打开项目 Wiki…</div>}><Content {...props} /></Suspense>;
}
