ALTER TABLE "sbc_sets" ADD COLUMN "public_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "sbc_sets" ADD COLUMN "public_at" timestamp with time zone;--> statement-breakpoint
-- sets from before the vouched snapshot came from real syncs (pre-launch, like 0025 for challenges): they stay public.
-- Placeholder rows (raw '{}' from challenges that arrived before their set) get none.
UPDATE "sbc_sets" SET "public_at" = now(), "public_snapshot" = jsonb_build_object(
	'name', "name", 'description', "description", 'categoryId', "category_id",
	'repeatabilityMode', "repeatability_mode", 'endTime', "end_time",
	'raw', jsonb_build_object(
		'releaseTime', CASE WHEN jsonb_typeof("raw"->'releaseTime') = 'number' THEN "raw"->'releaseTime' ELSE 'null'::jsonb END,
		'hidden', CASE WHEN jsonb_typeof("raw"->'hidden') = 'boolean' THEN "raw"->'hidden' ELSE 'null'::jsonb END,
		'awards', CASE WHEN jsonb_typeof("raw"->'awards') = 'array' THEN "raw"->'awards' ELSE '[]'::jsonb END,
		'repeats', CASE WHEN jsonb_typeof("raw"->'repeats') = 'number' THEN "raw"->'repeats' ELSE 'null'::jsonb END,
		'repeatRefreshInterval', CASE WHEN jsonb_typeof("raw"->'repeatRefreshInterval') = 'number' THEN "raw"->'repeatRefreshInterval' ELSE 'null'::jsonb END,
		'challengesCount', CASE WHEN jsonb_typeof("raw"->'challengesCount') = 'number' THEN "raw"->'challengesCount' ELSE 'null'::jsonb END))
WHERE jsonb_typeof("raw") = 'object' AND "raw" ? 'setId';
