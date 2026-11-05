import Link from "next/link";
import { BookOpen, Leaf } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { WikiMarkdown } from "./wiki-markdown";
import { targetHref, wikiHref, type WikiDocument, type WikiIndex } from "./wiki-core";
import styles from "./wiki.module.css";

export function WikiView({ index, document }: { index: WikiIndex; document: WikiDocument }) {
  return <div className={styles.shell}>
    <a className={styles.skip} href="#wiki-content">跳到正文</a>
    <div data-wiki-layout className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeading}><span className={styles.mark}><BookOpen aria-hidden="true" /></span><div><strong>项目 Wiki</strong><p>了解每一笔背后的规则</p></div></div>
        <p className={styles.caption}>阅读目录</p>
        <nav aria-label="Wiki 主题" className={styles.navigation}>
          {index.documents.map((page, position) => <Link key={page.id} href={wikiHref(index.basePath, page.slug)} aria-current={page.slug === document.slug ? "page" : undefined}><span className={styles.pageNumber} aria-hidden="true">{String(position + 1).padStart(2, "0")}</span>{page.title}</Link>)}
        </nav>
        <p className={styles.sidebarNote}><Leaf aria-hidden="true" />把规则读懂，让记录更安心。</p>
      </aside>
      <main id="wiki-content" className={styles.main}>
        <Card className={styles.contentCard}>
          <CardHeader>
            <p className={styles.eyebrow}>年年有鱼 · 项目知识库</p>
            <CardTitle><h1 id={document.headings.find(h => h.depth === 1)?.anchor} className={styles.title}>{document.title}</h1></CardTitle>
            <CardDescription>{document.summary}</CardDescription>
          </CardHeader>
          <CardContent>
            <article className={styles.article}><WikiMarkdown index={index} document={document} tableClassName={styles.table} omitTitle /></article>
          </CardContent>
          {document.related.length > 0 && <CardFooter className={styles.related} aria-label="相关主题">{document.related.map(id => {
            const target = index.find(id, "id")!;
            return <Link key={id} href={targetHref(index, target)}>{target.document.title}</Link>;
          })}</CardFooter>}
        </Card>
      </main>
      <aside className={styles.toc}>
        <p className={styles.caption}>本页目录</p>
        <nav aria-label="本页目录">{document.headings.filter(h => h.depth === 2 || h.depth === 3).map(h => <a key={h.anchor} href={"#" + encodeURIComponent(h.anchor)} data-depth={h.depth}>{h.text}</a>)}</nav>
      </aside>
    </div>
  </div>;
}
