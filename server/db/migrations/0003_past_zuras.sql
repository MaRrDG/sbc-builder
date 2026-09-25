CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"user_id" text,
	"persona_id" bigint,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_type_at" ON "events" USING btree ("type","at");--> statement-breakpoint
CREATE INDEX "events_user_at" ON "events" USING btree ("user_id","at");