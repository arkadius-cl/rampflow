CREATE TABLE "tenant_signup" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"status" text NOT NULL,
	"email" "citext" NOT NULL,
	"salutation" text,
	"given_name" text NOT NULL,
	"family_name" text NOT NULL,
	"password_hash" text,
	"company_name" text NOT NULL,
	"country" char(2) NOT NULL,
	"tax_id_type" text NOT NULL,
	"tax_id_value" text NOT NULL,
	"locale" text,
	"token_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"tenant_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_signup_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "tenant_signup_status_check" CHECK ("tenant_signup"."status" in ('pending_email', 'verified', 'superseded')),
	CONSTRAINT "tenant_signup_salutation_check" CHECK ("tenant_signup"."salutation" in ('mr', 'ms')),
	CONSTRAINT "tenant_signup_tax_id_type_check" CHECK ("tenant_signup"."tax_id_type" in ('eu_vat', 'de_stn', 'pl_nip')),
	CONSTRAINT "tenant_signup_locale_check" CHECK ("tenant_signup"."locale" in ('de', 'en', 'pl')),
	CONSTRAINT "tenant_signup_company_name_length" CHECK (char_length("tenant_signup"."company_name") between 1 and 120),
	CONSTRAINT "tenant_signup_pending_password_check" CHECK (not ("tenant_signup"."status" in ('pending_email')) or "tenant_signup"."password_hash" is not null),
	CONSTRAINT "tenant_signup_verified_at_check" CHECK (not ("tenant_signup"."status" in ('verified')) or "tenant_signup"."verified_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "rate_limit_event" DROP CONSTRAINT "rate_limit_event_bucket_check";--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "given_name" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "family_name" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "salutation" text;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "tax_id_type" text;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "tax_id_value" text;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "tax_id_status" text;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "tax_id_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "possible_duplicate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_signup" ADD CONSTRAINT "tenant_signup_tenant_id_org_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_signup" ADD CONSTRAINT "tenant_signup_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_signup_pending_email_key" ON "tenant_signup" USING btree ("email") WHERE "tenant_signup"."status" in ('pending_email');--> statement-breakpoint
CREATE INDEX "tenant_signup_expires_at_idx" ON "tenant_signup" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "tenant_signup_tenant_id_idx" ON "tenant_signup" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_signup_user_id_idx" ON "tenant_signup" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "org_tax_id_value_idx" ON "org" USING btree ("tax_id_value") WHERE "org"."kind" in ('tenant');--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_salutation_check" CHECK ("app_user"."salutation" in ('mr', 'ms'));--> statement-breakpoint
ALTER TABLE "org" ADD CONSTRAINT "org_tenant_facts_check" CHECK ("org"."kind" in ('tenant') or ("org"."tax_id_type" is null and "org"."tax_id_value" is null and "org"."tax_id_status" is null and "org"."tax_id_checked_at" is null and not "org"."possible_duplicate" and "org"."activated_at" is null));--> statement-breakpoint
ALTER TABLE "org" ADD CONSTRAINT "org_tax_id_check" CHECK ((("org"."tax_id_type" is null and "org"."tax_id_value" is null and "org"."tax_id_status" is null) or ("org"."tax_id_type" is not null and "org"."tax_id_value" is not null and "org"."tax_id_status" is not null)) and "org"."tax_id_type" in ('eu_vat', 'de_stn', 'pl_nip') and "org"."tax_id_status" in ('pending', 'verified', 'unverified', 'unavailable'));--> statement-breakpoint
ALTER TABLE "rate_limit_event" ADD CONSTRAINT "rate_limit_event_bucket_check" CHECK ("rate_limit_event"."bucket" in ('login_failed', 'login_ip', 'magic_link_request', 'reset_request', 'driver_exchange', 'registration_request', 'registration_ip', 'signup_request', 'signup_ip', 'altcha_solution'));--> statement-breakpoint
CREATE POLICY "token_insert" ON "tenant_subscription" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'token') and ("tenant_subscription"."package" in ('start')));--> statement-breakpoint
ALTER POLICY "token_insert" ON "org" TO public WITH CHECK (((select app.party()) = 'token') and ("org"."kind" = 'carrier' or ("org"."kind" in ('tenant') and "org"."activated_at" is null)));