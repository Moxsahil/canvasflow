CREATE TYPE "public"."account_deletion_status" AS ENUM('scheduled', 'cancelled', 'completed');--> statement-breakpoint
CREATE TABLE "account_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	"status" "account_deletion_status" DEFAULT 'scheduled' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account_deletions" ADD CONSTRAINT "account_deletions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletions_one_scheduled_per_user" ON "account_deletions" USING btree ("user_id") WHERE "account_deletions"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "account_deletions_purge_after_idx" ON "account_deletions" USING btree ("purge_after") WHERE "account_deletions"."status" = 'scheduled';