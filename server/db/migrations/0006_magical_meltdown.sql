CREATE TABLE "evo_trainings" (
	"persona_id" bigint NOT NULL,
	"slot_id" integer NOT NULL,
	"level" integer NOT NULL,
	"level_count" integer NOT NULL,
	"slot_name" text DEFAULT '' NOT NULL,
	"item_id" bigint,
	"player" jsonb,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"ready" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp with time zone,
	"tries" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evo_trainings_persona_id_slot_id_level_pk" PRIMARY KEY("persona_id","slot_id","level")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lang" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "evo_emails" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "evo_trainings_due" ON "evo_trainings" USING btree ("ends_at");