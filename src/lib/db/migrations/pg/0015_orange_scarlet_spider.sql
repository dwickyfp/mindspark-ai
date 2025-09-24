CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TYPE "public"."embedding_usage_operation" AS ENUM('ingest', 'query', 'delete');--> statement-breakpoint
CREATE TYPE "public"."knowledge_base_document_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "agent_knowledge_base" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "agent_knowledge_base_unique" UNIQUE("agent_id","knowledge_base_id")
);
--> statement-breakpoint
CREATE TABLE "embedding_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"agent_id" uuid,
	"knowledge_base_id" uuid,
	"document_id" uuid,
	"operation" "embedding_usage_operation" NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"model" text NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base_document_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid,
	"organization_id" uuid,
	"file_name" text NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"mime_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"checksum" text,
	"status" "knowledge_base_document_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"embedding_tokens" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "knowledge_base_document_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "knowledge_base" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visibility" varchar DEFAULT 'private' NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"organization_id" uuid,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "knowledge_base_owner_name_unique" UNIQUE("owner_user_id","name")
);
--> statement-breakpoint
ALTER TABLE "agent_knowledge_base" ADD CONSTRAINT "agent_knowledge_base_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_base" ADD CONSTRAINT "agent_knowledge_base_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_usage_log" ADD CONSTRAINT "embedding_usage_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_usage_log" ADD CONSTRAINT "embedding_usage_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_usage_log" ADD CONSTRAINT "embedding_usage_log_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_usage_log" ADD CONSTRAINT "embedding_usage_log_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_usage_log" ADD CONSTRAINT "embedding_usage_log_document_id_knowledge_base_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_base_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_document_chunk" ADD CONSTRAINT "knowledge_base_document_chunk_document_id_knowledge_base_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_base_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_document_chunk" ADD CONSTRAINT "knowledge_base_document_chunk_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_document" ADD CONSTRAINT "knowledge_base_document_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_document" ADD CONSTRAINT "knowledge_base_document_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_document" ADD CONSTRAINT "knowledge_base_document_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_knowledge_base_agent_idx" ON "agent_knowledge_base" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_knowledge_base_kb_idx" ON "agent_knowledge_base" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "embedding_usage_user_idx" ON "embedding_usage_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "embedding_usage_agent_idx" ON "embedding_usage_log" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "embedding_usage_kb_idx" ON "embedding_usage_log" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "embedding_usage_org_idx" ON "embedding_usage_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "knowledge_base_chunk_document_idx" ON "knowledge_base_document_chunk" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "knowledge_base_chunk_kb_idx" ON "knowledge_base_document_chunk" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "knowledge_base_chunk_embedding_idx" ON "knowledge_base_document_chunk" USING hnsw ("embedding" vector_l2_ops) WITH (m = 16, ef_construction = 64);--> statement-breakpoint
CREATE INDEX "knowledge_base_document_kb_idx" ON "knowledge_base_document" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "knowledge_base_document_status_idx" ON "knowledge_base_document" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_base_org_idx" ON "knowledge_base" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "knowledge_base_visibility_idx" ON "knowledge_base" USING btree ("visibility");
