ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_kind";--> statement-breakpoint
ALTER TABLE "notification_deliveries" ALTER COLUMN "board_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_once_workspace" ON "notification_deliveries" USING btree ("kind","workspace_id","source_id","recipient_id") WHERE "notification_deliveries"."board_id" is null;--> statement-breakpoint
CREATE INDEX "notification_deliveries_workspace_recent_idx" ON "notification_deliveries" USING btree ("recipient_id","workspace_id","emailed_at");--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_scope" CHECK ("notification_deliveries"."board_id" is not null or "notification_deliveries"."workspace_id" is not null);--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_kind" CHECK ("notification_deliveries"."kind" in ('comment-mention', 'board-joined', 'workspace-joined', 'access-changed'));