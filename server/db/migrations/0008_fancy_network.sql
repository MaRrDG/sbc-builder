CREATE TABLE "codes" (
	"code" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"owner_id" text,
	"days" integer,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"disabled" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"persona_id" bigint,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invited_by" text;--> statement-breakpoint
CREATE UNIQUE INDEX "codes_one_invite" ON "codes" USING btree ("owner_id") WHERE kind = 'invite';--> statement-breakpoint
CREATE INDEX "codes_owner" ON "codes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "point_ledger_user" ON "point_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "point_ledger_invite_persona" ON "point_ledger" USING btree ("persona_id") WHERE reason = 'invite';--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_code_user" ON "redemptions" USING btree ("code","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_one_invite" ON "redemptions" USING btree ("user_id") WHERE kind = 'invite';--> statement-breakpoint
CREATE INDEX "redemptions_code" ON "redemptions" USING btree ("code");