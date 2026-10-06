CREATE TABLE "added_libraries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"catalogue_id" text NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"credit" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "added_libraries" ADD CONSTRAINT "added_libraries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "added_libraries_owner_source_idx" ON "added_libraries" USING btree ("owner_id","source");