-- EA's set endTime is seconds left, not a date: snapshots written so far hold the raw value.
-- Make it absolute from when that value was relayed (last_seen), on the 5 min grid of shared-sbc.ts setSnapshot;
-- 5 years or more left (Gold Upgrade and other permanent sets) means no end.
UPDATE "sbc_sets" SET "public_snapshot" = jsonb_set("public_snapshot", '{endTime}',
	CASE
		WHEN jsonb_typeof("public_snapshot"->'endTime') <> 'number' OR ("public_snapshot"->>'endTime')::numeric >= 157680000 THEN 'null'::jsonb
		ELSE to_jsonb((round((extract(epoch FROM "last_seen") + greatest(0, ("public_snapshot"->>'endTime')::numeric)) / 300) * 300)::bigint)
	END)
WHERE "public_snapshot" IS NOT NULL;
