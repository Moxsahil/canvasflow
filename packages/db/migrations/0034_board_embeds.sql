CREATE TABLE "board_embeds" (
	"board_id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_embeds_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "board_embeds" ADD CONSTRAINT "board_embeds_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;