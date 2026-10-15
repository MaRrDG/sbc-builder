CREATE TABLE "challenge_sightings" (
	"set_id" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"persona_id" bigint NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_sightings_set_id_fingerprint_persona_id_pk" PRIMARY KEY("set_id","fingerprint","persona_id")
);
--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "vouched" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "challenge_sightings_persona" ON "challenge_sightings" USING btree ("persona_id");--> statement-breakpoint
-- rows from before vouching came from real syncs (pre-launch): they stay shared
UPDATE "challenges" SET "vouched" = true;