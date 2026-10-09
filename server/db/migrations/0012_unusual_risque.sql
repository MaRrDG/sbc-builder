CREATE TABLE "daily_reminders" (
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"sent_at" timestamp with time zone,
	"tries" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_reminders_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "daily_reminder" boolean DEFAULT false NOT NULL;