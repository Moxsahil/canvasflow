CREATE TABLE "board_images" (
	"board_id" uuid NOT NULL,
	"file_id" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_images_board_id_file_id_pk" PRIMARY KEY("board_id","file_id")
);
--> statement-breakpoint
ALTER TABLE "board_images" ADD CONSTRAINT "board_images_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_images" ADD CONSTRAINT "board_images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_images_board_id_idx" ON "board_images" USING btree ("board_id");