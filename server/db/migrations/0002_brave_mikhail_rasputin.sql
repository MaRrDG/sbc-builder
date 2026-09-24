ALTER TABLE "users" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quota_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quota_used" integer DEFAULT 0 NOT NULL;