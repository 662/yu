import type { ImportBatch, Source } from "../import/types";
import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, books, categories, journalEntries, transactions, importBatches, importReceipts } from "@/db/schema";
import { applyCommand, type Command } from "./commands";
import type { Category } from "./categories";
import { bookEtag } from "./version";
import type { Account, Book, Transaction } from "./ledger";

type Executor = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update" | "delete" | "execute">;

async function readBook(db: Executor, userId: string, existingHead?: typeof books.$inferSelect): Promise<Book> {
  const head = existingHead ?? (await db.select().from(books).where(eq(books.userId, userId)))[0];
  if (!head) throw new Error("User book is missing");
  const bookId = head.id;
  const batches = await db.select().from(importBatches).where(eq(importBatches.bookId, bookId)).orderBy(asc(importBatches.createdAt));
  const receipts = await db.select().from(importReceipts).where(eq(importReceipts.bookId, bookId));
  const categoryRows = await db.select().from(categories).where(eq(categories.bookId, bookId)).orderBy(asc(categories.order), asc(categories.id));
  const wallets = await db.select().from(accounts).where(eq(accounts.bookId, bookId)).orderBy(asc(accounts.createdAt), asc(accounts.id));
  const rows = await db.select().from(transactions).where(and(eq(transactions.bookId, bookId), ne(transactions.kind, "opening"))).orderBy(desc(transactions.createdAt), desc(transactions.id));
  const lines = rows.length ? await db.select({ transactionId: journalEntries.transactionId, accountId: journalEntries.accountId, amount: journalEntries.amount }).from(journalEntries)
    .innerJoin(transactions, eq(journalEntries.transactionId, transactions.id))
    .where(and(eq(transactions.bookId, bookId), ne(transactions.kind, "opening"))).orderBy(asc(journalEntries.position)) : [];
  const grouped = new Map<string, { accountId: string; amount: number }[]>();
  for (const line of lines) grouped.set(line.transactionId, [...(grouped.get(line.transactionId) ?? []), { accountId: line.accountId, amount: line.amount }]);
  const receiptsByBatch = new Map<string, ImportBatch["items"]>();
  for (const { batchId, key, transactionId, signature } of receipts) {
    const items = receiptsByBatch.get(batchId) ?? [];
    items.push({ key, transactionId, signature });
    receiptsByBatch.set(batchId, items);
  }
  return {
    version: 1, revision: head.revision, ownerId: userId,
    imports: batches.map(b => ({ id: b.id, source: b.source as Source, filename: b.filename, createdAt: b.createdAt.toISOString(), rolledBack: b.rolledBack, items: receiptsByBatch.get(b.id) ?? [] } as ImportBatch)),
    categories: categoryRows.map(({ id, name, kind, icon, tone, archived, order, preset }) => ({ id, name, kind, icon, tone, archived, order, preset } as Category)),
    accounts: wallets.map(({ id, name, type, openingBalance, note }) => ({ id, name, type: type as Account["type"], openingBalance, note })),
    transactions: rows.map(({ id, kind, amount, date, category, from, to, note, reimbursable, reimbursementFor }) => ({
      id, kind: kind as Transaction["kind"], amount, date, category, from, to, note, reimbursable,
      reimbursementFor: reimbursementFor ?? undefined, entries: grouped.get(id) ?? [],
    })),
  };
}

export function getBook(userId: string) {
  return getDb().transaction((tx) => readBook(tx, userId), { isolationLevel: "repeatable read", accessMode: "read only" });
}

export function getBookConditional(userId: string, ifNoneMatch: string | null) {
  return getDb().transaction(async (tx) => {
    const [head] = await tx.select().from(books).where(eq(books.userId, userId));
    if (!head) throw new Error("User book is missing");
    const etag = bookEtag({ ownerId: userId, revision: head.revision })!;
    // The transaction snapshot keeps the header and body at the same revision.
    return { etag, book: ifNoneMatch === etag ? null : await readBook(tx, userId, head) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export class RevisionConflict extends Error {
  constructor(public book: Book) { super("账本已在其他窗口或设备更新。已载入最新数据，请检查后再保存。"); }
}

export class MutationError extends Error {}

export async function mutateBook(userId: string, command: Command, revision: number): Promise<Book> {
  return getDb().transaction(async (tx) => {
    const [head] = await tx.select().from(books).where(eq(books.userId, userId)).for("update");
    if (!head) throw new Error("User book is missing");
    const bookId = head.id;
    const current = await readBook(tx, userId, head);
    if (current.revision !== revision) throw new RevisionConflict(current);
    let next: Book;
    try { next = applyCommand(current, command); }
    catch (error) { throw new MutationError(error instanceof Error ? error.message : "账目内容无效"); }
    const previousCategories = new Map(current.categories?.map((c) => [c.id, c]) ?? []);
    const nextCategoryIds = new Set(next.categories?.map((c) => c.id) ?? []);
    for (const old of current.categories ?? []) {
      if (!nextCategoryIds.has(old.id)) await tx.delete(categories).where(and(eq(categories.bookId, bookId), eq(categories.id, old.id)));
    }
    for (const category of next.categories ?? []) {
      const old = previousCategories.get(category.id);
      if (old === category) continue;
      if (old) await tx.update(categories).set(category).where(and(eq(categories.bookId, bookId), eq(categories.id, category.id)));
      else await tx.insert(categories).values({ ...category, bookId });
    }
    const previousAccounts = new Map(current.accounts.map(a => [a.id, a]));
    for (const account of next.accounts) {
      const old = previousAccounts.get(account.id);
      if (old === account) continue;
      if (old) {
        await tx.update(accounts).set({ name: account.name, note: account.note }).where(and(eq(accounts.id, account.id), eq(accounts.bookId, bookId)));
      } else {
        await tx.insert(accounts).values({ ...account, bookId });
        if (account.openingBalance) {
          const openingId = `opening:${account.id}`;
          await tx.insert(transactions).values({ id: openingId, bookId, kind: "opening", amount: Math.abs(account.openingBalance), date: command.type === "account.save" ? command.date : new Date().toISOString().slice(0, 10), category: "期初余额", to: account.id });
          await tx.insert(journalEntries).values([
            { transactionId: openingId, position: 0, accountId: account.id, amount: account.openingBalance },
            { transactionId: openingId, position: 1, accountId: "equity:opening", amount: -account.openingBalance },
          ]);
        }
      }
    }
    const previousTransactions = new Map(current.transactions.map((t) => [t.id, t]));
    const nextIds = new Set(next.transactions.map((t) => t.id));
    const removed = current.transactions.filter((t) => !nextIds.has(t.id)).map((t) => t.id);
    if (removed.length) await tx.delete(transactions).where(and(inArray(transactions.id, removed), eq(transactions.bookId, bookId)));
    const newTransactions: (typeof transactions.$inferInsert)[] = [];
    const newEntries: (typeof journalEntries.$inferInsert)[] = [];
    for (const transaction of next.transactions) {
      const old = previousTransactions.get(transaction.id);
      if (old === transaction) continue;
      const { entries, reimbursementFor, ...data } = transaction;
      if (old) {
        await tx.update(transactions).set({ ...data, reimbursementFor: reimbursementFor ?? null }).where(and(eq(transactions.id, transaction.id), eq(transactions.bookId, bookId)));
        await tx.delete(journalEntries).where(eq(journalEntries.transactionId, transaction.id));
      } else {
        newTransactions.push({ ...data, bookId, reimbursementFor: reimbursementFor ?? null });
      }
      const lines = entries.map((e, position) => ({ ...e, transactionId: transaction.id, position }));
      if (old) await tx.insert(journalEntries).values(lines);
      else newEntries.push(...lines);
    }
    for (let offset = 0; offset < newTransactions.length; offset += 500) await tx.insert(transactions).values(newTransactions.slice(offset, offset + 500));
    for (let offset = 0; offset < newEntries.length; offset += 1000) await tx.insert(journalEntries).values(newEntries.slice(offset, offset + 1000));
    const previousBatches = new Map(current.imports?.map(b => [b.id, b]));
    for (const batch of next.imports ?? []) {
      const old = previousBatches.get(batch.id);
      if (!old) {
        await tx.insert(importBatches).values({ id: batch.id, bookId, source: batch.source, filename: batch.filename, createdAt: new Date(batch.createdAt), rolledBack: false });
        await tx.insert(importReceipts).values(batch.items.map(item => ({ ...item, bookId, batchId: batch.id, source: batch.source })));
      } else if (!old.rolledBack && batch.rolledBack) {
        await tx.delete(importReceipts).where(and(eq(importReceipts.bookId, bookId), eq(importReceipts.batchId, batch.id)));
        await tx.update(importBatches).set({ rolledBack: true }).where(and(eq(importBatches.bookId, bookId), eq(importBatches.id, batch.id)));
      }
    }
    await tx.update(books).set({ revision: sql`${books.revision} + 1` }).where(eq(books.id, bookId));
    return { ...next, revision: revision + 1 };
  });
}
