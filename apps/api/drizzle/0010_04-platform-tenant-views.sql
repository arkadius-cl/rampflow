CREATE TABLE "tenant_note" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_note_kind_check" CHECK ("tenant_note"."kind" in ('note', 'suspended', 'reactivated')),
	CONSTRAINT "tenant_note_body_length" CHECK (char_length(trim("tenant_note"."body")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "tenant_note" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outbox_message" DROP CONSTRAINT "outbox_template_check";--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_note" ADD CONSTRAINT "tenant_note_tenant_id_org_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_note" ADD CONSTRAINT "tenant_note_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_note_tenant_created_idx" ON "tenant_note" USING btree ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE "org" ADD CONSTRAINT "org_suspended_tenant_only" CHECK ("org"."suspended_at" is null or "org"."kind" in ('tenant'));--> statement-breakpoint
ALTER TABLE "outbox_message" ADD CONSTRAINT "outbox_template_check" CHECK ("outbox_message"."template" in ('core.invitation', 'core.magic-link', 'core.password-reset', 'core.signup-known-account', 'core.signup-verify', 'core.tenant-suspended', 'core.tenant-reactivated', 'booking.cancelled', 'booking.carrier-invitation', 'booking.changed', 'booking.confirmed', 'booking.no-show', 'booking.registration-approved', 'booking.registration-rejected', 'booking.registration-verify', 'booking.reminder', 'driver.link', 'privacy.inactive-notice'));--> statement-breakpoint
CREATE POLICY "platform_select" ON "tenant_note" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'platform') and (true));--> statement-breakpoint
CREATE POLICY "platform_insert" ON "tenant_note" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'platform') and (true));