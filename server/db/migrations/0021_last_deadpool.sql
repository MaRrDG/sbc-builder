CREATE TABLE "founder_spots" (
	"id" serial PRIMARY KEY NOT NULL,
	"persona_id" bigint,
	"founder_at" timestamp with time zone NOT NULL,
	CONSTRAINT "founder_spots_persona_id_unique" UNIQUE("persona_id")
);
