ALTER TABLE "workspace" ADD COLUMN "ownership_offered_to" uuid;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "ownership_offered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_ownership_offered_to_users_id_fk" FOREIGN KEY ("ownership_offered_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;