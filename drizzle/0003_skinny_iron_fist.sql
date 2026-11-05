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
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_receipts" ADD CONSTRAINT "import_receipts_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_receipts" ADD CONSTRAINT "import_receipts_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_book" ON "import_batches" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_receipt_transaction" ON "import_receipts" USING btree ("transaction_id");