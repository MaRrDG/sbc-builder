CREATE TABLE "brick_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"challenge_id" integer NOT NULL,
	"persona_id" bigint NOT NULL,
	"layout" jsonb NOT NULL,
	"layout_hash" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"challenge_id" integer PRIMARY KEY NOT NULL,
	"set_id" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"type" text,
	"formation" text,
	"elg_operation" text,
	"elg_req" jsonb NOT NULL,
	"raw" jsonb NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sbc_sets" (
	"set_id" integer PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category_id" integer,
	"repeatability_mode" text,
	"end_time" bigint,
	"raw" jsonb NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_accounts" (
	"persona_id" bigint PRIMARY KEY NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brick_reports" ADD CONSTRAINT "brick_reports_challenge_id_challenges_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("challenge_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_set_id_sbc_sets_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sbc_sets"("set_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brick_reports_unique" ON "brick_reports" USING btree ("challenge_id","persona_id","layout_hash");--> statement-breakpoint
CREATE INDEX "brick_reports_challenge" ON "brick_reports" USING btree ("challenge_id");