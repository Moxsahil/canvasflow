CREATE TABLE "board_activity" (
	"board_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"changes" integer DEFAULT 0 NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_activity_board_id_user_id_day_pk" PRIMARY KEY("board_id","user_id","day")
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_kind";--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_scope";--> statement-breakpoint
ALTER TABLE "board_activity" ADD CONSTRAINT "board_activity_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_activity" ADD CONSTRAINT "board_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_activity_board_day_idx" ON "board_activity" USING btree ("board_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_once_account" ON "notification_deliveries" USING btree ("kind","source_id","recipient_id") WHERE "notification_deliveries"."board_id" is null and "notification_deliveries"."workspace_id" is null;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_kind" CHECK ("notification_deliveries"."kind" in ('comment-mention', 'board-joined', 'workspace-joined', 'access-changed', 'weekly-digest'));--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_scope" CHECK ("notification_deliveries"."board_id" is not null or "notification_deliveries"."workspace_id" is not null or "notification_deliveries"."kind" = 'weekly-digest');