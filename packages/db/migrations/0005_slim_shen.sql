-- Board-level access control + share links.
--
-- WRITTEN IDEMPOTENT ON PURPOSE. Some databases already carry
-- board_members, board_access_requests and their enums: they were applied by
-- a migration whose .sql file no longer exists in this repo, so drizzle's
-- history has no record of them and regenerates them here. A plain CREATE
-- would abort on those databases ("type board_role already exists") while
-- still being required on a clean one.
--
-- Every statement below is therefore a no-op when its object is already
-- present, which lets the same file converge a drifted development database
-- and a fresh CI database to the identical schema.

-- Enums. Postgres has no CREATE TYPE IF NOT EXISTS.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'board_role') THEN
    CREATE TYPE "public"."board_role" AS ENUM('owner', 'editor', 'viewer');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'board_member_status') THEN
    CREATE TYPE "public"."board_member_status" AS ENUM('active', 'revoked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'board_access_request_status') THEN
    CREATE TYPE "public"."board_access_request_status" AS ENUM('pending', 'approved', 'rejected', 'expired');
  END IF;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "board_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"status" "board_access_request_status" DEFAULT 'pending' NOT NULL,
	"requested_role" "board_role" DEFAULT 'editor' NOT NULL,
	"responded_by" uuid,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "board_role" DEFAULT 'editor' NOT NULL,
	"status" "board_member_status" DEFAULT 'active' NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"role" "board_role" DEFAULT 'editor' NOT NULL,
	"created_by" uuid NOT NULL,
	"allow_guests" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_guest" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Unique and foreign-key constraints. Declared out-of-line rather than inside
-- the CREATE TABLE bodies above, because IF NOT EXISTS skips the entire
-- statement — including its inline constraints — on a table that already
-- exists, which is exactly the drifted case this migration has to repair.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_members_board_user_unique') THEN
    ALTER TABLE "board_members" ADD CONSTRAINT "board_members_board_user_unique" UNIQUE("board_id","user_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_share_links_token_hash_unique') THEN
    ALTER TABLE "board_share_links" ADD CONSTRAINT "board_share_links_token_hash_unique" UNIQUE("token_hash");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_access_requests_board_id_boards_id_fk') THEN
    ALTER TABLE "board_access_requests" ADD CONSTRAINT "board_access_requests_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_access_requests_requester_id_users_id_fk') THEN
    ALTER TABLE "board_access_requests" ADD CONSTRAINT "board_access_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_access_requests_responded_by_users_id_fk') THEN
    ALTER TABLE "board_access_requests" ADD CONSTRAINT "board_access_requests_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_members_board_id_boards_id_fk') THEN
    ALTER TABLE "board_members" ADD CONSTRAINT "board_members_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_members_user_id_users_id_fk') THEN
    ALTER TABLE "board_members" ADD CONSTRAINT "board_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_members_granted_by_users_id_fk') THEN
    ALTER TABLE "board_members" ADD CONSTRAINT "board_members_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_share_links_board_id_boards_id_fk') THEN
    ALTER TABLE "board_share_links" ADD CONSTRAINT "board_share_links_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_share_links_created_by_users_id_fk') THEN
    ALTER TABLE "board_share_links" ADD CONSTRAINT "board_share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "board_access_requests_board_id_idx" ON "board_access_requests" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_access_requests_requester_id_idx" ON "board_access_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_access_requests_board_id_status_idx" ON "board_access_requests" USING btree ("board_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_members_board_id_idx" ON "board_members" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_members_user_id_idx" ON "board_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_share_links_board_id_idx" ON "board_share_links" USING btree ("board_id");
