CREATE TABLE "account" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ig_user_id" text NOT NULL,
	"username" text NOT NULL,
	"access_token" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_ig_user_id_unique" UNIQUE("ig_user_id"),
	CONSTRAINT "account_status_check" CHECK ("account"."status" IN ('connected', 'disconnected'))
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"post_id" text,
	"keyword" text NOT NULL,
	"comment_reply_text" text NOT NULL,
	"dm_text" text NOT NULL,
	"collect_type" text NOT NULL,
	"wrong_answer_text" text NOT NULL,
	"final_message" text NOT NULL,
	"max_wrong_answers" integer DEFAULT 3 NOT NULL,
	"timeout_minutes" integer DEFAULT 1440 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_post_keyword_uniq" UNIQUE NULLS NOT DISTINCT("account_id","post_id","keyword"),
	CONSTRAINT "campaign_keyword_lowercase" CHECK ("campaign"."keyword" = lower("campaign"."keyword")),
	CONSTRAINT "campaign_collect_type_check" CHECK ("campaign"."collect_type" IN ('email', 'phone', 'text'))
);
--> statement-breakpoint
CREATE TABLE "processed_message" (
	"mid" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" bigint NOT NULL,
	"campaign_id" bigint NOT NULL,
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"collected_value" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"wrong_answer_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"private_reply_sent_at" timestamp with time zone,
	"comment_replied_at" timestamp with time zone,
	"last_interaction_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_comment_id_unique" UNIQUE("comment_id"),
	CONSTRAINT "run_status_check" CHECK ("run"."status" IN ('pending', 'awaiting_answer', 'answer_received', 'completed', 'rejected', 'failed', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_tenant_id_account_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_one_active_per_user" ON "run" USING btree ("tenant_id","campaign_id","user_id") WHERE "run"."status" IN ('pending', 'awaiting_answer', 'answer_received');--> statement-breakpoint
CREATE INDEX "run_awaiting_expiry" ON "run" USING btree ("expires_at") WHERE "run"."status" = 'awaiting_answer';--> statement-breakpoint
CREATE INDEX "run_waiting_by_user" ON "run" USING btree ("tenant_id","user_id") WHERE "run"."status" = 'awaiting_answer';