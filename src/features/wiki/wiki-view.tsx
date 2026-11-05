import Link from "next/link";
import { WikiMarkdown } from "./wiki-markdown";
import { targetHref, wikiHref, type WikiDocument, type WikiIndex } from "./wiki-core";
import styles from "./wiki.module.css";

export function WikiView({ index, document }: { index: WikiIndex; document: WikiDocument }) {
  return <div className={styles.shell}>
    <a className={styles.skip} href="#wiki-content">跳到正文</a>
    <header className={styles.header}>
      <Link href="/wiki">年年有鱼 · 项目 Wiki</Link>
      <Link href="/">返回账本</Link>
    </header>
    <div className={styles.layout}>
      <nav aria-label="Wiki 主题" className={styles.navigation}>
        {index.documents.map(page => <Link key={page.id} href={wikiHref(index.basePath, page.slug)} aria-current={page.slug === document.slug ? "page" : undefined}>{page.title}</Link>)}
      </nav>
      <main id="wiki-content" className={styles.main}>
        <p className={styles.summary}>{document.summary}</p>
        <article className={styles.article}>
          <WikiMarkdown index={index} document={document} tableClassName={styles.table} />
        </article>
        {document.related.length > 0 && <aside className={styles.related} aria-label="相关主题">{document.related.map(id => {
          const target = index.find(id, "id")!;
          return <Link key={id} href={targetHref(index, target)}>{target.document.title}</Link>;
        })}</aside>}
      </main>
      <nav aria-label="本页目录" className={styles.toc}>
        {document.headings.filter(h => h.depth === 2 || h.depth === 3).map(h => <a key={h.anchor} href={"#" + encodeURIComponent(h.anchor)}>{h.text}</a>)}
      </nav>
    </div>
  </div>;
}
