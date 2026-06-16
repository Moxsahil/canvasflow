ALTER TYPE "public"."baord_visibility" RENAME TO "board_visibility";--> statement-breakpoint
ALTER TABLE "boards" RENAME COLUMN "text" TO "title";--> statement-breakpoint
CREATE INDEX "board_versions_board_id_idx" ON "board_versions" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "boards_workspace_id_idx" ON "boards" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "boards_owner_id_idx" ON "boards" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "boards_workspace_id_deleted_at_idx" ON "boards" USING btree ("workspace_id","deleted_at");