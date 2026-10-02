CREATE TABLE "persona_links" (
	"persona_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "persona_links_persona_id_user_id_pk" PRIMARY KEY("persona_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "link_blocked_at" timestamp with time zone;--> statement-breakpoint
-- history so far: the current owner and the one a takeover replaced
INSERT INTO "persona_links" ("persona_id", "user_id", "linked_at")
SELECT "persona_id", "user_id", "linked_at" FROM "personas"
UNION
SELECT "persona_id", "previous_user_id", "linked_at" FROM "personas" WHERE "previous_user_id" IS NOT NULL
ON CONFLICT DO NOTHING;
