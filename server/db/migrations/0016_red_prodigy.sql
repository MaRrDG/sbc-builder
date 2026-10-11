ALTER TABLE "players" ADD COLUMN "gender" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "players" SET "gender" = 1 WHERE "league" IN (2215,2216,2218,2221,2222,2229,2236,2272);