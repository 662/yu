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
	"user_id" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "revision_nonnegative" CHECK ("books"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"book_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"icon" text NOT NULL,
	"tone" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"is_preset" boolean DEFAULT false NOT NULL,
	CONSTRAINT "categories_book_id_id_pk" PRIMARY KEY("book_id","id"),
	CONSTRAINT "category_kind" CHECK ("categories"."kind" in ('expense','income')),
	CONSTRAINT "category_position" CHECK ("categories"."sort_order" >= 0),
	CONSTRAINT "category_icon" CHECK ("categories"."icon" in ('Utensils','ShoppingBag','TrainFront','House','Coffee','HeartPulse','Package','Ellipsis','Briefcase','Gift','TrendingUp','GraduationCap','PawPrint','Plane')),
	CONSTRAINT "category_tone" CHECK ("categories"."tone" in ('orange','pink','blue','green','purple','olive','neutral'))
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"source" text NOT NULL,
	"filename" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"rolled_back" boolean DEFAULT false NOT NULL,
	CONSTRAINT "import_source" CHECK ("import_batches"."source" in ('wechat','alipay','cmb-debit','cmb-credit'))
);
--> statement-breakpoint
CREATE TABLE "import_receipts" (
	"book_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"transaction_id" text NOT NULL,
	"signature" text NOT NULL,
	CONSTRAINT "import_receipts_book_id_source_source_key_pk" PRIMARY KEY("book_id","source","source_key")
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
CREATE TABLE "oidc_flows" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"verifier" text NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
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
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_receipts" ADD CONSTRAINT "import_receipts_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_receipts" ADD CONSTRAINT "import_receipts_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reimbursement_for_transactions_id_fk" FOREIGN KEY ("reimbursement_for") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_book" ON "accounts" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "books_user" ON "books" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_book_kind_name" ON "categories" USING btree ("book_id","kind","name");--> statement-breakpoint
CREATE INDEX "import_batches_book" ON "import_batches" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_receipt_transaction" ON "import_receipts" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "journal_account" ON "journal_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "oidc_flows_expiry" ON "oidc_flows" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_expiry" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "transactions_book_date" ON "transactions" USING btree ("book_id","date");--> statement-breakpoint
CREATE INDEX "transactions_reimbursement" ON "transactions" USING btree ("reimbursement_for");--> statement-breakpoint
CREATE UNIQUE INDEX "users_oidc_identity" ON "users" USING btree ("issuer","subject");
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
