CREATE TABLE "organization_agent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "organization_agent_unique" UNIQUE("organization_id","agent_id")
);
--> statement-breakpoint
ALTER TABLE "organization_agent" ADD CONSTRAINT "organization_agent_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_agent" ADD CONSTRAINT "organization_agent_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_agent_org_idx" ON "organization_agent" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_agent_agent_idx" ON "organization_agent" USING btree ("agent_id");