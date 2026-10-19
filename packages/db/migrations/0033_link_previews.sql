CREATE TABLE "link_previews" (
	"url_hash" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"status" text NOT NULL,
	"title" text,
	"description" text,
	"site_name" text,
	"image" text,
	"image_width" integer,
	"image_height" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "link_previews_expires_at_idx" ON "link_previews" USING btree ("expires_at");