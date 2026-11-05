import "server-only";
import path from "node:path";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadWiki } from "./load";
import { validateWiki } from "./wiki-core";

export function getWikiPage(slug: string) {
  return loadWiki(slug, async () => {
    if (!await getCurrentUser()) redirect("/login");
  }, () => validateWiki(path.join(process.cwd(), "docs/wiki")));
}
