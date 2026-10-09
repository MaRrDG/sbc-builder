ALTER TABLE "users" ADD COLUMN "discord_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discord_name" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_discord_id" ON "users" USING btree ("discord_id");