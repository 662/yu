CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"opening_balance" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_type" CHECK ("accounts"."type" in ('bank','balance','cash','credit','investment')),
	CONSTRAINT "opening_balance_range" CHECK (abs("accounts"."opening_balance") <= 99999999999)
);
--> statement-breakpoint
CREATE TABLE "auth_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "revision_nonnegative" CHECK ("books"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"transaction_id" text NOT NULL,
	"position" integer NOT NULL,
	"account_id" text NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "journal_entries_transaction_id_position_pk" PRIMARY KEY("transaction_id","position"),
	CONSTRAINT "journal_nonzero" CHECK ("journal_entries"."amount" <> 0 and abs("journal_entries"."amount") <= 99999999999)
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" integer PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "single_owner" CHECK ("owners"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"date" date NOT NULL,
	"category" text NOT NULL,
	"from_account" text DEFAULT '' NOT NULL,
	"to_account" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reimbursable" boolean DEFAULT false NOT NULL,
	"reimbursement_for" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_amount_range" CHECK ("transactions"."amount" > 0 and "transactions"."amount" <= 99999999999),
	CONSTRAINT "transaction_kind" CHECK ("transactions"."kind" in ('expense','income','transfer','repayment','reimbursement','adjustment','opening'))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reimbursement_for_transactions_id_fk" FOREIGN KEY ("reimbursement_for") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_book" ON "accounts" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "journal_account" ON "journal_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "transactions_book_date" ON "transactions" USING btree ("book_id","date");--> statement-breakpoint
CREATE INDEX "transactions_reimbursement" ON "transactions" USING btree ("reimbursement_for");--> statement-breakpoint
INSERT INTO books (id, revision) VALUES ('personal', 0) ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION assert_transaction_balanced(target_id text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  expected bigint;
  line_count bigint;
  balance numeric;
  debits numeric;
BEGIN
  SELECT amount INTO expected FROM transactions WHERE id = target_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*), coalesce(sum(amount), 0), coalesce(sum(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)
    INTO line_count, balance, debits FROM journal_entries WHERE transaction_id = target_id;
  IF line_count <> 2 OR balance <> 0 OR debits <> expected THEN
    RAISE EXCEPTION 'Journal must have two balanced entries matching transaction amount' USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION validate_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN PERFORM assert_transaction_balanced(NEW.transaction_id); END IF;
  IF TG_OP <> 'INSERT' THEN PERFORM assert_transaction_balanced(OLD.transaction_id); END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION validate_transaction_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_transaction_balanced(NEW.id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_balance_check AFTER INSERT OR UPDATE OR DELETE ON journal_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_journal_balance();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER transaction_balance_check AFTER INSERT OR UPDATE ON transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_transaction_balance();
