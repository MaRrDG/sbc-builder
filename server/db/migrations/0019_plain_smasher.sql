CREATE INDEX "challenges_set" ON "challenges" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "events_persona_at" ON "events" USING btree ("persona_id","at");