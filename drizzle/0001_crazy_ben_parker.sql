-- Development-only transition: the user explicitly authorized resetting the old
-- single-owner book. Keycloak users start with independent empty books.
DELETE FROM "sessions";
--> statement-breakpoint
DELETE FROM "transactions";
--> statement-breakpoint
DELETE FROM "accounts";
--> statement-breakpoint
DELETE FROM "books";
--> statement-breakpoint
DELETE FROM "auth_attempts";
--> statement-breakpoint
CREATE TABLE "oidc_flows" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"verifier" text NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
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
ALTER TABLE "owners" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "owners" CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_owner_id_owners_id_fk";
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
CREATE INDEX "oidc_flows_expiry" ON "oidc_flows" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_oidc_identity" ON "users" USING btree ("issuer","subject");--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "books_user" ON "books" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "owner_id";