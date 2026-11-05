import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadWiki } from "./load";
import { parseLink, resolveLink, validateWiki } from "./wiki-core";
import { WikiMarkdown } from "./wiki-markdown";

const page = (id: string, title: string, body = "", extra = "") => `---\nid: ${id}\ntitle: ${title}\nsummary: 测试页面\n${extra}---\n\n# ${title}\n\n${body}`;
async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "yu-wiki-"));
  try { await writeFile(path.join(root, "index.md"), page("home", "首页")); await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("AST links, reference links, Chinese and duplicate heading anchors match rendered HTML", () => fixture(async root => {
  await writeFile(path.join(root, "guide.md"), page("guide", "指南", "## 中文 `代码`\n\n## 中文 `代码`\n\n[重复标题][section]\n\n[section]: #中文-代码-1\n\n| 账户 | 余额 |\n| --- | --- |\n| 银行卡 | 100 |\n\n```sh\necho '[not a link](missing.md)'\n```\n\n<script>alert('unsafe')</script>\n", "aliases:\n  - id: old-guide\n    slug: old-guide\n    anchor: 中文-代码\n"));
  const index = await validateWiki(root);
  const document = index.find("guide", "slug")!.document;
  assert.equal(resolveLink(index, "guide.md#中文-代码-1", "index.md"), "/wiki/guide#" + encodeURIComponent("中文-代码-1"));
  assert.equal(resolveLink(index, "old-guide.md", "index.md"), "/wiki/guide#" + encodeURIComponent("中文-代码"));
  const html = renderToStaticMarkup(createElement(WikiMarkdown, { index, document }));
  assert.match(html, /id="中文-代码-1"/);
  assert.match(html, /<table>/);
  assert.match(html, /<pre><code class="language-sh">/);
  assert.doesNotMatch(html, /<script|alert\('unsafe'\)/);
}));

test("rejects missing pages, anchors and related IDs; aliases and index paths cannot collide", async () => {
  for (const body of ["[bad](missing.md)", "[bad](#不存在)"]) await fixture(async root => {
    await writeFile(path.join(root, "index.md"), page("home", "首页", body));
    await assert.rejects(validateWiki(root), /Missing/);
  });
  await fixture(async root => {
    await writeFile(path.join(root, "other.md"), page("other", "其他", "", "related: [missing]\n"));
    await assert.rejects(validateWiki(root), /related/);
  });
  await fixture(async root => {
    await writeFile(path.join(root, "guide.md"), page("guide", "指南"));
    await mkdir(path.join(root, "guide"));
    await writeFile(path.join(root, "guide/index.md"), page("nested", "重复地址"));
    await assert.rejects(validateWiki(root), /Duplicate/);
  });
  await fixture(async root => {
    await writeFile(path.join(root, "other.md"), page("other", "其他", "", "aliases:\n  - id: home\n    slug: old-home\n"));
    await assert.rejects(validateWiki(root), /Duplicate/);
  });
});

test("rejects path escape, encoded traversal, dangerous protocols, symlinks and executable frontmatter", async () => {
  for (const href of ["../../../etc/passwd", "%2e%2e/%2e%2e/.env", "../../.env", "javascript:alert(1)", "data:text/html,x", "//evil.test/x", "%5c..%5csecret.md", "https://user:password@example.test", "guide.md?x=1"]) {
    assert.throws(() => parseLink(href, "index.md"), { name: "Error" }, href);
  }
  assert.match(parseLink("../../src/db/schema.ts", "index.md").href, /^https:\/\/github.com\/662\/yu\/blob\/main\/src\/db\/schema.ts$/);
  await fixture(async root => {
    await symlink(path.join(root, "index.md"), path.join(root, "linked.md"));
    await assert.rejects(validateWiki(root), /Symlink/);
  });
  await fixture(async root => {
    await writeFile(path.join(root, "index.md"), "---js\nthrow new Error('executed')\n---\n# 首页");
    await assert.rejects(validateWiki(root), /YAML/);
  });
});

test("unauthorized requests cannot read index, content or aliases; invalid and unknown slugs return no page", () => fixture(async root => {
  let reads = 0;
  const read = async () => { reads++; return validateWiki(root); };
  for (const slug of ["", "old-page", "../secret"]) {
    await assert.rejects(loadWiki(slug, async () => { throw new Error("unauthorized"); }, read), /unauthorized/);
  }
  assert.equal(reads, 0);
  assert.equal(await loadWiki("../secret", async () => {}, read), null);
  assert.equal(reads, 0);
  assert.equal(await loadWiki("unknown", async () => {}, read), null);
  assert.ok(await loadWiki("", async () => {}, read));
}));
