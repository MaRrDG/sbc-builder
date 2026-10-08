CREATE TABLE "daily_answers" (
	"day" integer PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"drop_at" timestamp with time zone NOT NULL,
	"asset_id" integer NOT NULL,
	"picked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_plays" (
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"guesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"won" boolean DEFAULT false NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "daily_plays_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"asset_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"nation" integer NOT NULL,
	"league" integer NOT NULL,
	"club" integer NOT NULL,
	"position" text NOT NULL,
	"rating" integer NOT NULL,
	"rareflag" integer NOT NULL,
	"card_type" text NOT NULL,
	"base_clubs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "daily_answers_drop" ON "daily_answers" USING btree ("drop_at");--> statement-breakpoint
CREATE INDEX "players_league_rating" ON "players" USING btree ("league","rating");--> statement-breakpoint
CREATE UNIQUE INDEX "point_ledger_daily" ON "point_ledger" USING btree ("user_id","ref") WHERE reason = 'daily_streak';