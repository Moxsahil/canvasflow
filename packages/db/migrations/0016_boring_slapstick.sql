CREATE TABLE "auth_session_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_session_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" DROP CONSTRAINT "auth_sessions_refresh_token_hash_unique";--> statement-breakpoint
ALTER TABLE "auth_session_tokens" ADD CONSTRAINT "auth_session_tokens_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_session_tokens_session_id_idx" ON "auth_session_tokens" USING btree ("session_id");--> statement-breakpoint
ALTER TABLE "auth_sessions" DROP COLUMN "refresh_token_hash";