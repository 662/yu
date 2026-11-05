import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { resolveLink, type WikiIndex, type WikiDocument } from "./wiki-core";

export function WikiMarkdown({ index, document, tableClassName, omitTitle = false }: { index: WikiIndex; document: WikiDocument; tableClassName?: string; omitTitle?: boolean }) {
  return <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={{
    ...(omitTitle ? { h1: () => null } : {}),
    a: ({ href = "", children }) => {
      const target = resolveLink(index, href, document.sourcePath);
      return /^https?:|^mailto:/i.test(target)
        ? <a href={target} target="_blank" rel="noopener noreferrer">{children}</a>
        : <Link href={target}>{children}</Link>;
    },
    table: ({ children }) => <div className={tableClassName} role="region" aria-label="可横向滚动的表格" tabIndex={0}><table>{children}</table></div>,
  }}>{document.markdown}</ReactMarkdown>;
}
