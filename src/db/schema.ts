import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text().primaryKey(),
  issuer: text().notNull(),
  subject: text().notNull(),
  name: text().notNull(),
  email: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("users_oidc_identity").on(t.issuer, t.subject)]);

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [index("sessions_expiry").on(t.expiresAt)]);

export const oidcFlows = pgTable("oidc_flows", {
  tokenHash: text("token_hash").primaryKey(),
  state: text().notNull(),
  verifier: text().notNull(),
  nonce: text().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [index("oidc_flows_expiry").on(t.expiresAt)]);

export const authAttempts = pgTable("auth_attempts", {
  key: text().primaryKey(),
  count: integer().notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const books = pgTable("books", {
  id: text().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  revision: integer().notNull().default(0),
}, (t) => [check("revision_nonnegative", sql`${t.revision} >= 0`), uniqueIndex("books_user").on(t.userId)]);

export const categories = pgTable("categories", {
  bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  id: text().notNull(),
  name: text().notNull(),
  kind: text().notNull(),
  icon: text().notNull(),
  tone: text().notNull(),
  archived: boolean().notNull().default(false),
  order: integer("sort_order").notNull(),
  preset: boolean("is_preset").notNull().default(false),
}, (t) => [
  primaryKey({ columns: [t.bookId, t.id] }),
  uniqueIndex("categories_book_kind_name").on(t.bookId, t.kind, t.name),
  check("category_kind", sql`${t.kind} in ('expense','income')`),
  check("category_position", sql`${t.order} >= 0`),
  check("category_icon", sql`${t.icon} in ('Utensils','ShoppingBag','TrainFront','House','Coffee','HeartPulse','Package','Ellipsis','Briefcase','Gift','TrendingUp','GraduationCap','PawPrint','Plane')`),
  check("category_tone", sql`${t.tone} in ('orange','pink','blue','green','purple','olive','neutral')`),
]);

export const accounts = pgTable("accounts", {
  id: text().primaryKey(),
  bookId: text("book_id").notNull().references(() => books.id),
  name: text().notNull(),
  type: text().notNull(),
  openingBalance: bigint("opening_balance", { mode: "number" }).notNull(),
  note: text().notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("accounts_book").on(t.bookId),
  check("account_type", sql`${t.type} in ('bank','balance','cash','credit','investment')`),
  check("opening_balance_range", sql`abs(${t.openingBalance}) <= 99999999999`),
]);

export const transactions = pgTable("transactions", {
  id: text().primaryKey(),
  bookId: text("book_id").notNull().references(() => books.id),
  kind: text().notNull(),
  amount: bigint({ mode: "number" }).notNull(),
  date: date().notNull(),
  category: text().notNull(),
  from: text("from_account").notNull().default(""),
  to: text("to_account").notNull().default(""),
  note: text().notNull().default(""),
  reimbursable: boolean().notNull().default(false),
  reimbursementFor: text("reimbursement_for").references((): AnyPgColumn => transactions.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("transactions_book_date").on(t.bookId, t.date),
  index("transactions_reimbursement").on(t.reimbursementFor),
  check("transaction_amount_range", sql`${t.amount} > 0 and ${t.amount} <= 99999999999`),
  check("transaction_kind", sql`${t.kind} in ('expense','income','transfer','repayment','reimbursement','adjustment','opening')`),
]);

// Internal ledgers (expense:food, receivable, equity:opening) share the same journal
// as real wallet accounts. Signed amounts represent debits (+) and credits (-).
export const journalEntries = pgTable("journal_entries", {
  transactionId: text("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  position: integer().notNull(),
  accountId: text("account_id").notNull(),
  amount: bigint({ mode: "number" }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.transactionId, t.position] }),
  index("journal_account").on(t.accountId),
  check("journal_nonzero", sql`${t.amount} <> 0 and abs(${t.amount}) <= 99999999999`),
]);

export const importBatches = pgTable('import_batches', {
  id: text().primaryKey(),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  source: text().notNull(), filename: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  rolledBack: boolean('rolled_back').notNull().default(false),
}, t => [index('import_batches_book').on(t.bookId), check('import_source', sql`${t.source} in ('wechat','alipay','cmb-debit','cmb-credit')`)]);
export const importReceipts = pgTable('import_receipts', {
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  batchId: text('batch_id').notNull().references(() => importBatches.id, { onDelete: 'cascade' }),
  source: text().notNull(), key: text('source_key').notNull(),
  transactionId: text('transaction_id').notNull(),
  signature: text().notNull(),
}, t => [primaryKey({ columns: [t.bookId, t.source, t.key] }), uniqueIndex('import_receipt_transaction').on(t.transactionId)]);
