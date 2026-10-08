CREATE TABLE "daily_anon_stats" (
	"day" integer PRIMARY KEY NOT NULL,
	"finished" integer DEFAULT 0 NOT NULL,
	"won" integer DEFAULT 0 NOT NULL,
	"d1" integer DEFAULT 0 NOT NULL,
	"d2" integer DEFAULT 0 NOT NULL,
	"d3" integer DEFAULT 0 NOT NULL,
	"d4" integer DEFAULT 0 NOT NULL,
	"d5" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_guess_counts" (
	"day" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_guess_counts_day_asset_id_pk" PRIMARY KEY("day","asset_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "leaderboard" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "leaderboard_asked_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower" ON "users" USING btree (lower("username"));