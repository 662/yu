import { isWikiSlug, type WikiIndex } from "./wiki-core";

// Authorization must finish before reading content, resolving aliases or returning navigation.
export async function loadWiki(
  slug: string,
  authorize: () => Promise<void>,
  readIndex: () => Promise<WikiIndex>,
) {
  await authorize();
  if (!isWikiSlug(slug)) return null;
  const index = await readIndex();
  const target = index.find(slug, "slug");
  return target ? { index, target } : null;
}
