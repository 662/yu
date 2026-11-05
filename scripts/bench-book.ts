import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { saveTransaction, summarizeBook, type Book } from "../src/features/book/ledger";

const seed = saveTransaction({ version: 1, accounts: [
  { id: "bank", name: "基准测试账户", type: "bank", openingBalance: 100000, note: "" },
], transactions: [] }, { kind: "expense", amount: 100, date: "2026-01-01", category: "food", from: "bank", to: "", note: "", reimbursable: false }, "seed");
for (const count of [1000, 10000, 100000]) {
  const book: Book = { ...seed, transactions: Array.from({ length: count }, (_, i) => ({ ...seed.transactions[i % seed.transactions.length], id: `scale-${i}` })) };
  const start = performance.now();
  const summary = summarizeBook(book);
  const elapsed = performance.now() - start;
  assert.equal(Number.isFinite(summary.net), true);
  console.log(JSON.stringify({ transactions: count, accounts: book.accounts.length, aggregationMs: Number(elapsed.toFixed(2)), payloadBytes: Buffer.byteLength(JSON.stringify(book)) }));
}
