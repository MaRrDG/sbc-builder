CREATE TABLE "completion_marks" (
	"persona_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"item_id" bigint NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "completion_marks_persona_id_kind_item_id_pk" PRIMARY KEY("persona_id","kind","item_id")
);
--> statement-breakpoint
CREATE TABLE "completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"persona_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"item_id" bigint NOT NULL,
	"seq" integer NOT NULL,
	"count" integer NOT NULL,
	"baseline" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "completions_item_seq" ON "completions" USING btree ("persona_id","kind","item_id","seq");--> statement-breakpoint
CREATE INDEX "completions_persona" ON "completions" USING btree ("persona_id","kind");