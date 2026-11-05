import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import GithubSlugger from 'github-slugger';
import matter from 'gray-matter';
import { toString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { z } from 'zod';
import repositoryFiles from './repository-files.json';

const segment = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const isSegment = (v: string) => v.match(segment)?.[0] === v;
export const isWikiSlug = (v: string) => v === '' || v.split('/').every(isSegment);
const id = z.string().refine(isSegment, 'Expected a stable kebab-case ID');
const aliasSchema = z.object({ id, slug: z.string().min(1).refine(isWikiSlug), anchor: z.string().min(1).optional() }).strict();
export const frontmatterSchema = z.object({
  id, title: z.string().trim().min(1), summary: z.string().trim().min(1),
  kind: z.string().trim().min(1).optional(), order: z.number().int().nonnegative().default(0),
  related: z.array(id).default([]), aliases: z.array(aliasSchema).default([]),
}).passthrough();
export type Heading = { depth: number; text: string; anchor: string };
export type WikiDocument = z.infer<typeof frontmatterSchema> & { sourcePath: string; slug: string; markdown: string; headings: Heading[]; links: string[] };
export type WikiTarget = { document: WikiDocument; anchor?: string; alias: boolean };
export type WikiIndex = { documents: WikiDocument[]; basePath: string; find: (value: string, field: 'id' | 'slug') => WikiTarget | undefined };

export function sourceSlug(source: string) {
  if (!source.endsWith('.md') || source === '.md' || !isWikiSlug(source.slice(0, -3))) throw new Error(`Invalid Markdown path: ${source}`);
  const name = source.slice(0, -3);
  return name === 'index' ? '' : name.replace(/\/index$/, '');
}
function basePath(value: string) {
  if (value === '/') return '';
  if (!value.startsWith('/') || !isWikiSlug(value.slice(1))) throw new Error('Invalid Wiki basePath');
  return value;
}
export function wikiHref(base: string, slug = '', anchor?: string) {
  const prefix = basePath(base || '/');
  if (!isWikiSlug(slug)) throw new Error('Invalid Wiki slug');
  return (prefix + (slug ? `/${slug}` : '') || '/') + (anchor ? `#${encodeURIComponent(anchor)}` : '');
}
export function targetHref(index: WikiIndex, target: WikiTarget) {
  return wikiHref(index.basePath, target.document.slug, target.anchor);
}
export function parseLink(href: string, sourcePath: string, base = '/wiki'): { href: string; slug?: string; anchor?: string } {
  const prefix = basePath(base || '/');
  if (!href || /[\s\u0000-\u001f\u007f\\]/u.test(href)) throw new Error('Invalid link characters');
  if (/^(https?:|mailto:)/i.test(href)) {
    const url = new URL(href);
    if (url.username || url.password) throw new Error('Credentials in external links are forbidden');
    return { href };
  }
  let decoded: string;
  try { decoded = decodeURIComponent(href); } catch { throw new Error('Invalid URL encoding'); }
  if (/[\u0000-\u001f\u007f\\?]/u.test(decoded) || decoded.startsWith('//')) throw new Error('Invalid local link');
  const [name, anchor, ...extra] = decoded.split('#');
  if (extra.length) throw new Error('Invalid fragment');
  let slug: string;
  if (!name) slug = sourceSlug(sourcePath);
  else if (name === (prefix || '/')) slug = '';
  else if (name.startsWith('/') && (!prefix || name.startsWith(prefix + '/'))) slug = name.slice(prefix.length + 1);
  else {
    if (name.startsWith('/')) throw new Error('Local links must target Wiki Markdown');
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), name));
    if (resolved === '..' || resolved.startsWith('../')) {
      const repositoryPath = path.posix.normalize(path.posix.join('docs/wiki', resolved));
      if (!repositoryFiles.includes(repositoryPath)) throw new Error('Link escapes Wiki root or source allowlist');
      return { href: 'https://github.com/662/yu/blob/main/' + repositoryPath.split('/').map(encodeURIComponent).join('/') + (anchor ? '#' + encodeURIComponent(anchor) : '') };
    }
    slug = sourceSlug(resolved);
  }
  if (!isWikiSlug(slug)) throw new Error('Invalid Wiki link path');
  return { href: wikiHref(prefix, slug, anchor), slug, anchor };
}
export function resolveLink(index: WikiIndex, href: string, sourcePath: string) {
  const link = parseLink(href, sourcePath, index.basePath);
  if (link.slug === undefined) return link.href;
  const target = index.find(link.slug, 'slug');
  if (!target) throw new Error(`Missing Wiki page: ${href}`);
  // A merged page can map its former fragment to the declared destination section.
  const anchor = link.anchor && target.document.headings.some(h => h.anchor === link.anchor)
    ? link.anchor : target.anchor ?? link.anchor;
  if (anchor && !target.document.headings.some(h => h.anchor === anchor)) throw new Error(`Missing heading: ${href}`);
  return wikiHref(index.basePath, target.document.slug, anchor);
}
async function markdownFiles(root: string, relative = ''): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Symlink not allowed in Wiki: ${entry.name}`);
    if (entry.name.startsWith('.')) continue;
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await markdownFiles(root, name));
    else if (entry.isFile() && name.endsWith('.md')) result.push(name);
  }
  return result.sort();
}
export async function validateWiki(root: string, options: { basePath?: string } = {}): Promise<WikiIndex> {
  const base = basePath(options.basePath ?? '/wiki');
  const rootStat = await lstat(root);
  if (await realpath(root) !== path.resolve(root) || !rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Invalid Wiki root');
  const files = await markdownFiles(root);
  if (!files.includes('index.md')) throw new Error('Wiki needs an index.md entry');
  const documents: WikiDocument[] = [];
  const ids = new Map<string, WikiTarget>(), slugs = new Map<string, WikiTarget>();
  for (const sourcePath of files) {
    const source = (await readFile(path.join(root, sourcePath), 'utf8')).replace(/\r\n/g, '\n');
    // Reject gray-matter's executable frontmatter language selection (e.g. ---js).
    if (!source.startsWith('---\n')) throw new Error(`${sourcePath}: YAML frontmatter is required`);
    const parsed = matter(source);
    const meta = frontmatterSchema.parse(parsed.data);
    const headings: Heading[] = [], links: string[] = [];
    const slugger = new GithubSlugger();
    const tree = unified().use(remarkParse).use(remarkGfm).parse(parsed.content);
    const definitions = new Map<string, string>();
    visit(tree, 'definition', node => { definitions.set(node.identifier, node.url); });
    visit(tree, 'heading', node => { const text = toString(node); headings.push({ depth: node.depth, text, anchor: slugger.slug(text) }); });
    visit(tree, 'link', node => { links.push(node.url); });
    visit(tree, 'linkReference', node => { const url = definitions.get(node.identifier); if (!url) throw new Error('Missing reference definition'); links.push(url); });
    visit(tree, node => { if (node.type === 'image' || node.type === 'imageReference') throw new Error(`${sourcePath}: configure an authenticated image resolver before embedding images`); });
    visit(tree, 'code', node => {
      if (node.lang === 'mermaid') throw new Error('Diagram rendering is not enabled');
    });
    if (headings.filter(h => h.depth === 1).length !== 1 || headings.find(h => h.depth === 1)?.text !== meta.title) throw new Error(`${sourcePath}: use one H1 matching title`);
    const document: WikiDocument = { ...meta, sourcePath, slug: sourceSlug(sourcePath), markdown: parsed.content.trim(), headings, links };
    for (const identity of [{ id: document.id, slug: document.slug, anchor: undefined, alias: false }, ...meta.aliases.map(a => ({ ...a, alias: true }))]) {
      if (ids.has(identity.id) || slugs.has(identity.slug)) throw new Error(`Duplicate Wiki ID/slug: ${sourcePath}`);
      if (identity.anchor && !headings.some(h => h.anchor === identity.anchor)) throw new Error('Alias heading does not exist');
      const target = { document, anchor: identity.anchor, alias: identity.alias };
      ids.set(identity.id, target); slugs.set(identity.slug, target);
    }
    documents.push(document);
  }
  const index: WikiIndex = { documents: documents.sort((a,b) => a.order - b.order || a.title.localeCompare(b.title)), basePath: base, find: (value, field) => (field === 'id' ? ids : slugs).get(value) };
  for (const document of documents) {
    for (const id of document.related) if (!index.find(id, 'id')) throw new Error(`${document.sourcePath}: missing related ID ${id}`);
    for (const href of document.links) try { resolveLink(index, href, document.sourcePath); } catch (e) { throw new Error(`${document.sourcePath}: ${href}: ${e instanceof Error ? e.message : 'invalid link'}`); }
  }
  return index;
}
