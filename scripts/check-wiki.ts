import path from "node:path";
import { realpath, stat } from "node:fs/promises";
import { validateWiki } from "../src/features/wiki/wiki-core";
import repositoryFiles from "../src/features/wiki/repository-files.json";

async function main() {
  const root = process.cwd();
  for (const file of repositoryFiles) {
    const resolved = await realpath(path.join(root, file));
    if (!resolved.startsWith(root + path.sep) || !(await stat(resolved)).isFile()) throw new Error(`Invalid repository reference: ${file}`);
  }
  const index = await validateWiki(path.join(root, "docs/wiki"));
  console.log(`Wiki valid: ${index.documents.length} pages; ${repositoryFiles.length} repository references verified`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
