CREATE TABLE "model_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid,
	"message_id" text NOT NULL,
	"provider" text,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "model_usage_message_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "organization_mcp_server" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"mcp_server_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "organization_mcp_unique" UNIQUE("organization_id","mcp_server_id")
);
--> statement-breakpoint
CREATE TABLE "organization_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "organization_member_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tool_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid,
	"message_id" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"tool_source" varchar NOT NULL,
	"mcp_server_id" uuid,
	"mcp_server_name" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "tool_usage_call_unique" UNIQUE("tool_call_id")
);
--> statement-breakpoint
ALTER TABLE "mcp_server" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "model_usage_log" ADD CONSTRAINT "model_usage_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_usage_log" ADD CONSTRAINT "model_usage_log_thread_id_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_mcp_server" ADD CONSTRAINT "organization_mcp_server_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_mcp_server" ADD CONSTRAINT "organization_mcp_server_mcp_server_id_mcp_server_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_server"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_usage_log" ADD CONSTRAINT "tool_usage_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_usage_log" ADD CONSTRAINT "tool_usage_log_thread_id_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_usage_log" ADD CONSTRAINT "tool_usage_log_mcp_server_id_mcp_server_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_server"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_usage_user_idx" ON "model_usage_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "model_usage_thread_idx" ON "model_usage_log" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "organization_mcp_org_idx" ON "organization_mcp_server" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_mcp_server_idx" ON "organization_mcp_server" USING btree ("mcp_server_id");--> statement-breakpoint
CREATE INDEX "organization_member_org_idx" ON "organization_member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_member_user_idx" ON "organization_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_owner_idx" ON "organization" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "tool_usage_user_idx" ON "tool_usage_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tool_usage_mcp_idx" ON "tool_usage_log" USING btree ("mcp_server_id");--> statement-breakpoint
ALTER TABLE "mcp_server" ADD CONSTRAINT "mcp_server_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_server_owner_idx" ON "mcp_server" USING btree ("owner_user_id");