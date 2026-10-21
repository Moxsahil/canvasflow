CREATE TABLE "ai_usage" (
	"user_id" uuid NOT NULL,
	"month" date NOT NULL,
	"diagrams" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_user_id_month_pk" PRIMARY KEY("user_id","month"),
	CONSTRAINT "ai_usage_diagrams_not_negative" CHECK ("ai_usage"."diagrams" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;