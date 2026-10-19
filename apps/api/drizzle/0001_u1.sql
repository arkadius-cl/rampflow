CREATE TABLE "avis" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"carrier_id" uuid,
	"counterparty_name" text NOT NULL,
	"load_units" jsonb NOT NULL,
	"pallet_positions" integer,
	"gross_weight_kg" numeric(8, 1),
	"pallet_exchange" boolean,
	"vehicle_type" text,
	"plate" text,
	"plate_country" char(2),
	"trailer_plate" text,
	"driver_name" text,
	"driver_phone" text,
	"driver_locale" text,
	"dangerous_goods" jsonb DEFAULT '{"present":false}'::jsonb NOT NULL,
	"temperature" jsonb DEFAULT '{"controlled":false}'::jsonb NOT NULL,
	"notes" text,
	"plate_seen" text,
	"phone_erased_at" timestamp with time zone,
	"pseudonymized_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avis_notes_length" CHECK (char_length("avis"."notes") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "avis" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "avis_reference" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"carrier_id" uuid,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"value_norm" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avis_reference_type_check" CHECK ("avis_reference"."type" in ('purchase_order', 'delivery_note', 'shipment', 'transport_order', 'customer_ref', 'container', 'other')),
	CONSTRAINT "avis_reference_value_length" CHECK (char_length("avis_reference"."value") between 1 and 35)
);
--> statement-breakpoint
ALTER TABLE "avis_reference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "carrier_invitation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"email" "citext" NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_carrier_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carrier_invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "carrier_invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "carrier_registration" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"country" char(2) NOT NULL,
	"contact_name" text NOT NULL,
	"email" "citext" NOT NULL,
	"user_id" uuid,
	"carrier_id" uuid,
	"status" text NOT NULL,
	"reject_reason" text,
	"email_verified_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carrier_registration_status_check" CHECK ("carrier_registration"."status" in ('pending_email', 'pending_approval', 'approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "carrier_registration" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "public_link" (
	"slug" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookable_resource" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"directions" text[] NOT NULL,
	"capacity_cap" integer,
	"daily_cap" integer,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookable_resource_id_kind_key" UNIQUE("id","kind"),
	CONSTRAINT "bookable_resource_id_site_key" UNIQUE("id","site_id"),
	CONSTRAINT "bookable_resource_kind_check" CHECK ("bookable_resource"."kind" in ('pool', 'single')),
	CONSTRAINT "bookable_resource_directions_check" CHECK (cardinality("bookable_resource"."directions") >= 1 and "bookable_resource"."directions" <@ array['inbound', 'outbound']::text[]),
	CONSTRAINT "bookable_resource_capacity_cap_check" CHECK ("bookable_resource"."capacity_cap" is null or ("bookable_resource"."kind" = 'pool' and "bookable_resource"."capacity_cap" >= 1)),
	CONSTRAINT "bookable_resource_daily_cap_check" CHECK ("bookable_resource"."daily_cap" is null or "bookable_resource"."daily_cap" >= 1)
);
--> statement-breakpoint
ALTER TABLE "bookable_resource" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "closure" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"resource_id" uuid,
	"kind" text NOT NULL,
	"starts_local" timestamp NOT NULL,
	"ends_local" timestamp NOT NULL,
	"reason" text,
	"source" text NOT NULL,
	"holiday_date" date,
	"holiday_name" text,
	"reopened_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closure_kind_check" CHECK ("closure"."kind" in ('closed', 'blocked')),
	CONSTRAINT "closure_source_check" CHECK ("closure"."source" in ('manual', 'holiday')),
	CONSTRAINT "closure_window_check" CHECK ("closure"."starts_local" < "closure"."ends_local"),
	CONSTRAINT "closure_holiday_date_check" CHECK (("closure"."source" = 'holiday') = ("closure"."holiday_date" is not null))
);
--> statement-breakpoint
ALTER TABLE "closure" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "load_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"direction" text NOT NULL,
	"duration" jsonb NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"carrier_bookable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "load_type_id_site_key" UNIQUE("id","site_id"),
	CONSTRAINT "load_type_direction_check" CHECK ("load_type"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "load_type_buffer_check" CHECK ("load_type"."buffer_minutes" between 0 and 240)
);
--> statement-breakpoint
ALTER TABLE "load_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "load_type_resource" (
	"load_type_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "load_type_resource_load_type_id_resource_id_pk" PRIMARY KEY("load_type_id","resource_id")
);
--> statement-breakpoint
ALTER TABLE "load_type_resource" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "opening_hours" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"resource_id" uuid,
	"weekday" smallint NOT NULL,
	"opens" time NOT NULL,
	"closes" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_hours_weekday_check" CHECK ("opening_hours"."weekday" between 1 and 7),
	CONSTRAINT "opening_hours_window_check" CHECK ("opening_hours"."opens" < "opening_hours"."closes")
);
--> statement-breakpoint
ALTER TABLE "opening_hours" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "resource_dock" (
	"dock_id" uuid PRIMARY KEY NOT NULL,
	"resource_id" uuid NOT NULL,
	"resource_kind" text NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resource_dock" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "booking" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"load_type_id" uuid NOT NULL,
	"carrier_id" uuid,
	"carrier_name" text NOT NULL,
	"code" char(8) NOT NULL,
	"status" text NOT NULL,
	"direction" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"blocks_until" timestamp with time zone NOT NULL,
	"site_time_zone" text NOT NULL,
	"load_units" integer NOT NULL,
	"created_party" text NOT NULL,
	"created_by" uuid,
	"client_request_id" uuid,
	"forced" boolean DEFAULT false NOT NULL,
	"walk_in" boolean DEFAULT false NOT NULL,
	"dock_id" uuid,
	"punctuality" text,
	"punctuality_minutes" integer,
	"checked_in_at" timestamp with time zone,
	"called_at" timestamp with time zone,
	"at_dock_at" timestamp with time zone,
	"loading_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"departed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"no_show_at" timestamp with time zone,
	"turned_away_at" timestamp with time zone,
	"actual_load_units" integer,
	"discrepancy_note" text,
	"cancel_reason" text,
	"cancelled_late" boolean DEFAULT false NOT NULL,
	"departure_reason" text,
	"turn_away_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_tenant_code_key" UNIQUE("tenant_id","code"),
	CONSTRAINT "booking_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "booking_status_check" CHECK ("booking"."status" in ('requested', 'confirmed', 'checked_in', 'called', 'at_dock', 'loading', 'done', 'departed', 'cancelled', 'no_show', 'turned_away')),
	CONSTRAINT "booking_direction_check" CHECK ("booking"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "booking_created_party_check" CHECK ("booking"."created_party" in ('carrier', 'staff')),
	CONSTRAINT "booking_punctuality_check" CHECK ("booking"."punctuality" in ('early', 'on_time', 'late')),
	CONSTRAINT "booking_turn_away_reason_check" CHECK ("booking"."turn_away_reason" in ('safety_not_completed', 'no_capacity', 'too_late', 'documents_missing', 'wrong_load', 'damaged', 'other')),
	CONSTRAINT "booking_window_check" CHECK ("booking"."starts_at" < "booking"."ends_at" and "booking"."ends_at" <= "booking"."blocks_until"),
	CONSTRAINT "booking_dock_check" CHECK ("booking"."dock_id" is not null or "booking"."status" not in ('called', 'at_dock', 'loading'))
);
--> statement-breakpoint
ALTER TABLE "booking" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "booking_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"carrier_id" uuid,
	"type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"at" timestamp with time zone NOT NULL,
	"actor_party" text NOT NULL,
	"actor_user_id" uuid,
	"actor_job" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "booking_event_actor_party_check" CHECK ("booking_event"."actor_party" in ('carrier', 'tenant', 'driver', 'system'))
);
--> statement-breakpoint
ALTER TABLE "booking_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenant_logo" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_logo_content_type_check" CHECK ("tenant_logo"."content_type" in ('image/png', 'image/jpeg')),
	CONSTRAINT "tenant_logo_size_check" CHECK ("tenant_logo"."byte_size" <= 262144)
);
--> statement-breakpoint
ALTER TABLE "tenant_logo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"locale" text,
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email"),
	CONSTRAINT "app_user_locale_check" CHECK ("app_user"."locale" in ('de', 'en', 'pl'))
);
--> statement-breakpoint
ALTER TABLE "app_user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth_token" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_token_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "auth_token_kind_check" CHECK ("auth_token"."kind" in ('magic_link', 'password_reset'))
);
--> statement-breakpoint
CREATE TABLE "dock" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"hall_id" uuid NOT NULL,
	"code" text NOT NULL,
	"door_type" text NOT NULL,
	"temperature_zone" text NOT NULL,
	"adr_allowed" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dock_site_code_key" UNIQUE("site_id","code"),
	CONSTRAINT "dock_id_site_key" UNIQUE("id","site_id"),
	CONSTRAINT "dock_code_length" CHECK (char_length("dock"."code") between 1 and 16),
	CONSTRAINT "dock_door_type_check" CHECK ("dock"."door_type" in ('dock_leveler', 'ground_level', 'side_loading', 'yard_open')),
	CONSTRAINT "dock_temperature_zone_check" CHECK ("dock"."temperature_zone" in ('ambient', 'chilled', 'frozen')),
	CONSTRAINT "dock_status_check" CHECK ("dock"."status" in ('active', 'maintenance', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "dock" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entitlement_override" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_override_tenant_id_key_pk" PRIMARY KEY("tenant_id","key"),
	CONSTRAINT "entitlement_override_value_wrapped" CHECK (jsonb_typeof("entitlement_override"."value") = 'object' and "entitlement_override"."value" ? 'v')
);
--> statement-breakpoint
ALTER TABLE "entitlement_override" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hall" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hall_id_site_key" UNIQUE("id","site_id")
);
--> statement-breakpoint
ALTER TABLE "hall" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"org_kind" text NOT NULL,
	"email" "citext" NOT NULL,
	"role" text NOT NULL,
	"site_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitation_role_check" CHECK (("invitation"."org_kind" = 'platform' and "invitation"."role" in ('platform_admin')) or ("invitation"."org_kind" = 'tenant' and "invitation"."role" in ('tenant_admin', 'dispatcher', 'gate_operator', 'dock_operator')) or ("invitation"."org_kind" = 'carrier' and "invitation"."role" in ('carrier_admin', 'carrier_user')))
);
--> statement-breakpoint
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job_run" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_run_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job" text NOT NULL,
	"tenant_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"org_kind" text NOT NULL,
	"role" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_user_org_key" UNIQUE("user_id","org_id"),
	CONSTRAINT "membership_id_org_key" UNIQUE("id","org_id"),
	CONSTRAINT "membership_role_check" CHECK (("membership"."org_kind" = 'platform' and "membership"."role" in ('platform_admin')) or ("membership"."org_kind" = 'tenant' and "membership"."role" in ('tenant_admin', 'dispatcher', 'gate_operator', 'dock_operator')) or ("membership"."org_kind" = 'carrier' and "membership"."role" in ('carrier_admin', 'carrier_user')))
);
--> statement-breakpoint
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_site" (
	"membership_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "membership_site_membership_id_site_id_pk" PRIMARY KEY("membership_id","site_id")
);
--> statement-breakpoint
ALTER TABLE "membership_site" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"country" char(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_id_kind_key" UNIQUE("id","kind"),
	CONSTRAINT "org_kind_check" CHECK ("org"."kind" in ('platform', 'tenant', 'carrier')),
	CONSTRAINT "org_name_length" CHECK (char_length("org"."name") between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "org" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_limit_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rate_limit_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bucket" text NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_event_bucket_check" CHECK ("rate_limit_event"."bucket" in ('login_failed', 'magic_link_request', 'reset_request', 'driver_exchange'))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" "bytea" PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setting_value" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid,
	"site_id" uuid,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setting_value_scope_key" UNIQUE NULLS NOT DISTINCT("tenant_id","site_id","key"),
	CONSTRAINT "setting_value_value_wrapped" CHECK (jsonb_typeof("setting_value"."value") = 'object' and "setting_value"."value" ? 'v'),
	CONSTRAINT "setting_value_site_needs_tenant" CHECK ("setting_value"."site_id" is null or "setting_value"."tenant_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "setting_value" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "site" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"postal_code" text NOT NULL,
	"city" text NOT NULL,
	"country" char(2) NOT NULL,
	"subdivision" text,
	"time_zone" text NOT NULL,
	"default_locale" text NOT NULL,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "site_default_locale_check" CHECK ("site"."default_locale" in ('de', 'en', 'pl'))
);
--> statement-breakpoint
ALTER TABLE "site" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenant_carrier_link" (
	"tenant_id" uuid NOT NULL,
	"carrier_id" uuid NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_carrier_link_tenant_id_carrier_id_pk" PRIMARY KEY("tenant_id","carrier_id"),
	CONSTRAINT "tenant_carrier_link_status_check" CHECK ("tenant_carrier_link"."status" in ('active', 'deactivated')),
	CONSTRAINT "tenant_carrier_link_source_check" CHECK ("tenant_carrier_link"."source" in ('invitation', 'public_link'))
);
--> statement-breakpoint
ALTER TABLE "tenant_carrier_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenant_subscription" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"package" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_subscription_package_check" CHECK ("tenant_subscription"."package" in ('start', 'pro', 'enterprise'))
);
--> statement-breakpoint
ALTER TABLE "tenant_subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "driver_access" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"carrier_id" uuid,
	"token_hash" "bytea" NOT NULL,
	"channel" text NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_access_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "driver_access_channel_check" CHECK ("driver_access"."channel" in ('link', 'staff'))
);
--> statement-breakpoint
ALTER TABLE "driver_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outbox_message" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid,
	"template" text NOT NULL,
	"to_email" "citext" NOT NULL,
	"locale" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_message_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "outbox_message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "privacy_request_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"matched_bookings" integer NOT NULL,
	"matched_acknowledgements" integer NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_request_log_kind_check" CHECK ("privacy_request_log"."kind" in ('export', 'erase'))
);
--> statement-breakpoint
ALTER TABLE "privacy_request_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "booking_acknowledgement" (
	"booking_id" uuid NOT NULL,
	"instruction_id" uuid NOT NULL,
	"acknowledgement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"via" text NOT NULL,
	"linked_by_party" text NOT NULL,
	"linked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_acknowledgement_booking_id_instruction_id_pk" PRIMARY KEY("booking_id","instruction_id"),
	CONSTRAINT "booking_acknowledgement_via_check" CHECK ("booking_acknowledgement"."via" in ('completed', 'pass', 'gate_lookup'))
);
--> statement-breakpoint
ALTER TABLE "booking_acknowledgement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "safety_acknowledgement" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"instruction_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"content_hash" "bytea" NOT NULL,
	"booking_id" uuid,
	"carrier_id" uuid,
	"driver_name" text NOT NULL,
	"statement_shown" text NOT NULL,
	"channel" text NOT NULL,
	"score" integer,
	"attempts" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"restricted_at" timestamp with time zone,
	"pseudonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_acknowledgement_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "safety_acknowledgement_channel_check" CHECK ("safety_acknowledgement"."channel" in ('link', 'staff'))
);
--> statement-breakpoint
ALTER TABLE "safety_acknowledgement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "safety_attempt" (
	"booking_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_score" integer,
	"passed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_attempt_booking_id_version_id_pk" PRIMARY KEY("booking_id","version_id")
);
--> statement-breakpoint
ALTER TABLE "safety_attempt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "safety_content" (
	"version_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"statement" text NOT NULL,
	"translation" text NOT NULL,
	"content_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_content_version_id_locale_pk" PRIMARY KEY("version_id","locale"),
	CONSTRAINT "safety_content_translation_check" CHECK ("safety_content"."translation" in ('source', 'machine', 'reviewed'))
);
--> statement-breakpoint
ALTER TABLE "safety_content" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "safety_instruction" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"all_sites" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_instruction_id_tenant_key" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "safety_instruction" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "safety_instruction_site" (
	"instruction_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "safety_instruction_site_instruction_id_site_id_pk" PRIMARY KEY("instruction_id","site_id")
);
--> statement-breakpoint
ALTER TABLE "safety_instruction_site" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "safety_pass" (
	"device_hash" "bytea" NOT NULL,
	"tenant_id" uuid NOT NULL,
	"instruction_id" uuid NOT NULL,
	"acknowledgement_id" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_pass_device_hash_tenant_id_instruction_id_pk" PRIMARY KEY("device_hash","tenant_id","instruction_id")
);
--> statement-breakpoint
ALTER TABLE "safety_pass" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "safety_version" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"instruction_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"material_change" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_version_instruction_version_key" UNIQUE("instruction_id","version"),
	CONSTRAINT "safety_version_id_tenant_key" UNIQUE("id","tenant_id"),
	CONSTRAINT "safety_version_status_check" CHECK ("safety_version"."status" in ('draft', 'published', 'retired'))
);
--> statement-breakpoint
ALTER TABLE "safety_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "avis" ADD CONSTRAINT "avis_booking_id_tenant_id_booking_id_tenant_id_fk" FOREIGN KEY ("booking_id","tenant_id") REFERENCES "public"."booking"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avis_reference" ADD CONSTRAINT "avis_reference_booking_id_avis_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."avis"("booking_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_invitation" ADD CONSTRAINT "carrier_invitation_tenant_id_org_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_invitation" ADD CONSTRAINT "carrier_invitation_invited_by_app_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_invitation" ADD CONSTRAINT "carrier_invitation_accepted_carrier_id_org_id_fk" FOREIGN KEY ("accepted_carrier_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_registration" ADD CONSTRAINT "carrier_registration_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_registration" ADD CONSTRAINT "carrier_registration_carrier_id_org_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_registration" ADD CONSTRAINT "carrier_registration_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_registration" ADD CONSTRAINT "carrier_registration_site_id_tenant_id_site_id_tenant_id_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."site"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_link" ADD CONSTRAINT "public_link_site_id_tenant_id_site_id_tenant_id_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."site"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookable_resource" ADD CONSTRAINT "bookable_resource_site_id_tenant_id_site_id_tenant_id_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."site"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closure" ADD CONSTRAINT "closure_site_id_tenant_id_site_id_tenant_id_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."site"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closure" ADD CONSTRAINT "closure_resource_id_site_id_bookable_resource_id_site_id_fk" FOREIGN KEY ("resource_id","site_id") REFERENCES "public"."bookable_resource"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_type" ADD CONSTRAINT "load_type_site_id_tenant_id_site_id_tenant_id_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."site"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_type_resource" ADD CONSTRAINT "load_type_resource_load_type_id_site_id_load_type_id_site_id_fk" FOREIGN KEY ("load_type_id","site_id") REFERENCES "public"."load_type"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_type_resource" ADD CONSTRAINT "load_type_resource_resource_id_site_id_bookable_resource_id_site_id_fk" FOREIGN KEY ("resource_id","site_id") REFERENCES "public"."bookable_resource"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_site_id_tenant_id_site_id_tenant_id_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."site"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_resource_id_site_id_bookable_resource_id_site_id_fk" FOREIGN KEY ("resource_id","site_id") REFERENCES "public"."bookable_resource"("id","site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_dock" ADD CONSTRAINT "resource_dock_resource_id_resource_kind_bookable_resource_id_kind_fk" FOREIGN KEY ("resource_id","resource_kind") REFERENCES "public"."bookable_resource"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_dock" ADD CONSTRAINT "resource_dock_dock_id_site_id_dock_id_site_id_fk" FOREIGN KEY ("dock_id","site_id") REFERENCES "public"."dock"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_dock" ADD CONSTRAINT "resource_dock_resource_id_site_id_bookable_resource_id_site_id_fk" FOREIGN KEY ("resource_id","site_id") REFERENCES "public"."bookable_resource"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_carrier_id_org_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_site_id_tenant_id_site_id_tenant_id_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."site"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_resource_id_site_id_bookable_resource_id_site_id_fk" FOREIGN KEY ("resource_id","site_id") REFERENCES "public"."bookable_resource"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_load_type_id_site_id_load_type_id_site_id_fk" FOREIGN KEY ("load_type_id","site_id") REFERENCES "public"."load_type"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_dock_id_site_id_dock_id_site_id_fk" FOREIGN KEY ("dock_id","site_id") REFERENCES "public"."dock"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_event" ADD CONSTRAINT "booking_event_booking_id_tenant_id_booking_id_tenant_id_fk" FOREIGN KEY ("booking_id","tenant_id") REFERENCES "public"."booking"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_logo" ADD CONSTRAINT "tenant_logo_tenant_id_org_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_logo" ADD CONSTRAINT "tenant_logo_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_token" ADD CONSTRAINT "auth_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dock" ADD CONSTRAINT "dock_site_id_tenant_id_site_id_tenant_id_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."site"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dock" ADD CONSTRAINT "dock_hall_id_site_id_hall_id_site_id_fk" FOREIGN KEY ("hall_id","site_id") REFERENCES "public"."hall"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_override" ADD CONSTRAINT "entitlement_override_tenant_id_org_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_override" ADD CONSTRAINT "entitlement_override_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hall" ADD CONSTRAINT "hall_site_id_tenant_id_site_id_tenant_id_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."site"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_app_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_accepted_user_id_app_user_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_org_id_org_kind_org_id_kind_fk" FOREIGN KEY ("org_id","org_kind") REFERENCES "public"."org"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_org_id_org_kind_org_id_kind_fk" FOREIGN KEY ("org_id","org_kind") REFERENCES "public"."org"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_site" ADD CONSTRAINT "membership_site_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_site" ADD CONSTRAINT "membership_site_membership_id_tenant_id_membership_id_org_id_fk" FOREIGN KEY ("membership_id","tenant_id") REFERENCES "public"."membership"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_site" ADD CONSTRAINT "membership_site_site_id_tenant_id_site_id_tenant_id_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."site"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setting_value" ADD CONSTRAINT "setting_value_tenant_id_org_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setting_value" ADD CONSTRAINT "setting_value_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setting_value" ADD CONSTRAINT "setting_value_site_id_tenant_id_site_id_tenant_id_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."site"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_tenant_id_org_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_carrier_link" ADD CONSTRAINT "tenant_carrier_link_tenant_id_org_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_carrier_link" ADD CONSTRAINT "tenant_carrier_link_carrier_id_org_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_subscription" ADD CONSTRAINT "tenant_subscription_tenant_id_org_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_subscription" ADD CONSTRAINT "tenant_subscription_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_access" ADD CONSTRAINT "driver_access_booking_id_tenant_id_booking_id_tenant_id_fk" FOREIGN KEY ("booking_id","tenant_id") REFERENCES "public"."booking"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_message" ADD CONSTRAINT "outbox_message_tenant_id_org_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_request_log" ADD CONSTRAINT "privacy_request_log_tenant_id_org_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_request_log" ADD CONSTRAINT "privacy_request_log_actor_user_id_app_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_acknowledgement" ADD CONSTRAINT "booking_acknowledgement_booking_id_tenant_id_booking_id_tenant_id_fk" FOREIGN KEY ("booking_id","tenant_id") REFERENCES "public"."booking"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_acknowledgement" ADD CONSTRAINT "booking_acknowledgement_acknowledgement_id_tenant_id_safety_acknowledgement_id_tenant_id_fk" FOREIGN KEY ("acknowledgement_id","tenant_id") REFERENCES "public"."safety_acknowledgement"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_acknowledgement" ADD CONSTRAINT "safety_acknowledgement_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_acknowledgement" ADD CONSTRAINT "safety_acknowledgement_instruction_id_tenant_id_safety_instruction_id_tenant_id_fk" FOREIGN KEY ("instruction_id","tenant_id") REFERENCES "public"."safety_instruction"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_acknowledgement" ADD CONSTRAINT "safety_acknowledgement_version_id_tenant_id_safety_version_id_tenant_id_fk" FOREIGN KEY ("version_id","tenant_id") REFERENCES "public"."safety_version"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_attempt" ADD CONSTRAINT "safety_attempt_booking_id_tenant_id_booking_id_tenant_id_fk" FOREIGN KEY ("booking_id","tenant_id") REFERENCES "public"."booking"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_attempt" ADD CONSTRAINT "safety_attempt_version_id_tenant_id_safety_version_id_tenant_id_fk" FOREIGN KEY ("version_id","tenant_id") REFERENCES "public"."safety_version"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_content" ADD CONSTRAINT "safety_content_version_id_tenant_id_safety_version_id_tenant_id_fk" FOREIGN KEY ("version_id","tenant_id") REFERENCES "public"."safety_version"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_instruction" ADD CONSTRAINT "safety_instruction_tenant_id_org_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_instruction_site" ADD CONSTRAINT "safety_instruction_site_instruction_id_tenant_id_safety_instruction_id_tenant_id_fk" FOREIGN KEY ("instruction_id","tenant_id") REFERENCES "public"."safety_instruction"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_instruction_site" ADD CONSTRAINT "safety_instruction_site_site_id_tenant_id_site_id_tenant_id_fk" FOREIGN KEY ("site_id","tenant_id") REFERENCES "public"."site"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_pass" ADD CONSTRAINT "safety_pass_acknowledgement_id_tenant_id_safety_acknowledgement_id_tenant_id_fk" FOREIGN KEY ("acknowledgement_id","tenant_id") REFERENCES "public"."safety_acknowledgement"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_version" ADD CONSTRAINT "safety_version_published_by_app_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_version" ADD CONSTRAINT "safety_version_instruction_id_tenant_id_safety_instruction_id_tenant_id_fk" FOREIGN KEY ("instruction_id","tenant_id") REFERENCES "public"."safety_instruction"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avis_tenant_id_idx" ON "avis" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "avis_site_id_idx" ON "avis" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "avis_carrier_id_idx" ON "avis" USING btree ("carrier_id");--> statement-breakpoint
CREATE INDEX "avis_tenant_driver_name_idx" ON "avis" USING btree ("tenant_id",lower("driver_name"));--> statement-breakpoint
CREATE INDEX "avis_tenant_plate_idx" ON "avis" USING btree ("tenant_id","plate");--> statement-breakpoint
CREATE INDEX "avis_tenant_driver_phone_idx" ON "avis" USING btree ("tenant_id","driver_phone");--> statement-breakpoint
CREATE INDEX "avis_reference_booking_id_idx" ON "avis_reference" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "avis_reference_tenant_value_idx" ON "avis_reference" USING btree ("tenant_id","value_norm");--> statement-breakpoint
CREATE INDEX "avis_reference_site_id_idx" ON "avis_reference" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "avis_reference_carrier_id_idx" ON "avis_reference" USING btree ("carrier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carrier_invitation_pending_email_key" ON "carrier_invitation" USING btree ("tenant_id","email") WHERE "carrier_invitation"."accepted_at" is null and "carrier_invitation"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "carrier_registration_tenant_status_idx" ON "carrier_registration" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "carrier_registration_site_id_idx" ON "carrier_registration" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "carrier_registration_carrier_id_idx" ON "carrier_registration" USING btree ("carrier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "public_link_active_site_key" ON "public_link" USING btree ("site_id") WHERE "public_link"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "public_link_tenant_id_idx" ON "public_link" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bookable_resource_tenant_id_idx" ON "bookable_resource" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bookable_resource_site_id_idx" ON "bookable_resource" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "closure_holiday_key" ON "closure" USING btree ("site_id","holiday_date") WHERE "closure"."source" = 'holiday';--> statement-breakpoint
CREATE INDEX "closure_site_starts_idx" ON "closure" USING btree ("site_id","starts_local");--> statement-breakpoint
CREATE INDEX "closure_tenant_id_idx" ON "closure" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "closure_resource_id_idx" ON "closure" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "load_type_tenant_id_idx" ON "load_type" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "load_type_site_id_idx" ON "load_type" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "load_type_resource_resource_id_idx" ON "load_type_resource" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "load_type_resource_tenant_id_idx" ON "load_type_resource" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "load_type_resource_site_id_idx" ON "load_type_resource" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "opening_hours_tenant_id_idx" ON "opening_hours" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "opening_hours_site_id_idx" ON "opening_hours" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "opening_hours_resource_id_idx" ON "opening_hours" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_dock_single_key" ON "resource_dock" USING btree ("resource_id") WHERE "resource_dock"."resource_kind" = 'single';--> statement-breakpoint
CREATE INDEX "resource_dock_resource_id_idx" ON "resource_dock" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "resource_dock_tenant_id_idx" ON "resource_dock" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "resource_dock_site_id_idx" ON "resource_dock" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_client_request_key" ON "booking" USING btree ("created_by","client_request_id") WHERE "booking"."client_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_dock_occupied" ON "booking" USING btree ("dock_id") WHERE "booking"."status" in ('called', 'at_dock', 'loading');--> statement-breakpoint
CREATE INDEX "booking_resource_load_idx" ON "booking" USING btree ("resource_id","starts_at") WHERE "booking"."status" in ('confirmed', 'checked_in', 'called', 'at_dock', 'loading', 'done');--> statement-breakpoint
CREATE INDEX "booking_tenant_site_starts_idx" ON "booking" USING btree ("tenant_id","site_id","starts_at");--> statement-breakpoint
CREATE INDEX "booking_site_id_idx" ON "booking" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "booking_carrier_starts_idx" ON "booking" USING btree ("carrier_id","starts_at");--> statement-breakpoint
CREATE INDEX "booking_confirmed_idx" ON "booking" USING btree ("tenant_id","status","starts_at") WHERE "booking"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "booking_event_booking_at_idx" ON "booking_event" USING btree ("booking_id","at");--> statement-breakpoint
CREATE INDEX "booking_event_tenant_id_idx" ON "booking_event" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "booking_event_site_id_idx" ON "booking_event" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "booking_event_carrier_id_idx" ON "booking_event" USING btree ("carrier_id");--> statement-breakpoint
CREATE INDEX "auth_token_user_id_idx" ON "auth_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dock_tenant_id_idx" ON "dock" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "dock_hall_id_idx" ON "dock" USING btree ("hall_id");--> statement-breakpoint
CREATE INDEX "hall_tenant_id_idx" ON "hall" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "hall_site_id_idx" ON "hall" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_pending_email_key" ON "invitation" USING btree ("org_id","email") WHERE "invitation"."accepted_at" is null and "invitation"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "job_run_job_started_idx" ON "job_run" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "job_run_tenant_id_idx" ON "job_run" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "membership_org_id_idx" ON "membership" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "membership_site_tenant_id_idx" ON "membership_site" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "membership_site_site_id_idx" ON "membership_site" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "membership_site_user_id_idx" ON "membership_site" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_single_platform" ON "org" USING btree ("kind") WHERE "org"."kind" = 'platform';--> statement-breakpoint
CREATE INDEX "rate_limit_event_lookup_idx" ON "rate_limit_event" USING btree ("bucket","key_hash","at");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "setting_value_site_id_idx" ON "setting_value" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "site_tenant_id_idx" ON "site" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_carrier_link_carrier_id_idx" ON "tenant_carrier_link" USING btree ("carrier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_access_active_link_key" ON "driver_access" USING btree ("booking_id") WHERE "driver_access"."channel" = 'link' and "driver_access"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "driver_access_booking_id_idx" ON "driver_access" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "driver_access_tenant_id_idx" ON "driver_access" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "driver_access_site_id_idx" ON "driver_access" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "driver_access_carrier_id_idx" ON "driver_access" USING btree ("carrier_id");--> statement-breakpoint
CREATE INDEX "outbox_message_due_idx" ON "outbox_message" USING btree ("next_attempt_at") WHERE "outbox_message"."sent_at" is null and "outbox_message"."failed_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_message_tenant_id_idx" ON "outbox_message" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "privacy_request_log_tenant_id_idx" ON "privacy_request_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "booking_acknowledgement_tenant_id_idx" ON "booking_acknowledgement" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "booking_acknowledgement_site_id_idx" ON "booking_acknowledgement" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "booking_acknowledgement_acknowledgement_id_idx" ON "booking_acknowledgement" USING btree ("acknowledgement_id");--> statement-breakpoint
CREATE INDEX "safety_acknowledgement_tenant_completed_idx" ON "safety_acknowledgement" USING btree ("tenant_id","completed_at");--> statement-breakpoint
CREATE INDEX "safety_acknowledgement_tenant_driver_idx" ON "safety_acknowledgement" USING btree ("tenant_id",lower("driver_name"));--> statement-breakpoint
CREATE INDEX "safety_acknowledgement_booking_id_idx" ON "safety_acknowledgement" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "safety_acknowledgement_carrier_id_idx" ON "safety_acknowledgement" USING btree ("carrier_id");--> statement-breakpoint
CREATE INDEX "safety_attempt_tenant_id_idx" ON "safety_attempt" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "safety_content_tenant_id_idx" ON "safety_content" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "safety_instruction_tenant_id_idx" ON "safety_instruction" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "safety_instruction_site_site_id_idx" ON "safety_instruction_site" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "safety_instruction_site_tenant_id_idx" ON "safety_instruction_site" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "safety_pass_tenant_id_idx" ON "safety_pass" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "safety_pass_acknowledgement_id_idx" ON "safety_pass" USING btree ("acknowledgement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "safety_version_one_draft" ON "safety_version" USING btree ("instruction_id") WHERE "safety_version"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "safety_version_one_published" ON "safety_version" USING btree ("instruction_id") WHERE "safety_version"."status" = 'published';--> statement-breakpoint
CREATE INDEX "safety_version_tenant_id_idx" ON "safety_version" USING btree ("tenant_id");--> statement-breakpoint
CREATE POLICY "tenant_all" ON "avis" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("avis"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("avis"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("avis"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("avis"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "avis" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and ("avis"."carrier_id" = (select app.carrier_id())));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "avis" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and (("avis"."tenant_id" = (select app.tenant_id())) and ("avis"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_insert" ON "avis" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'carrier_at_tenant') and (("avis"."tenant_id" = (select app.tenant_id())) and ("avis"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_update" ON "avis" AS PERMISSIVE FOR UPDATE TO public USING (((select app.party()) = 'carrier_at_tenant') and (("avis"."tenant_id" = (select app.tenant_id())) and ("avis"."carrier_id" = (select app.carrier_id())))) WITH CHECK (((select app.party()) = 'carrier_at_tenant') and (("avis"."tenant_id" = (select app.tenant_id())) and ("avis"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "avis_reference" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("avis_reference"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("avis_reference"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("avis_reference"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("avis_reference"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "avis_reference" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and ("avis_reference"."carrier_id" = (select app.carrier_id())));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "avis_reference" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and (("avis_reference"."tenant_id" = (select app.tenant_id())) and ("avis_reference"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_insert" ON "avis_reference" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'carrier_at_tenant') and (("avis_reference"."tenant_id" = (select app.tenant_id())) and ("avis_reference"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_update" ON "avis_reference" AS PERMISSIVE FOR UPDATE TO public USING (((select app.party()) = 'carrier_at_tenant') and (("avis_reference"."tenant_id" = (select app.tenant_id())) and ("avis_reference"."carrier_id" = (select app.carrier_id())))) WITH CHECK (((select app.party()) = 'carrier_at_tenant') and (("avis_reference"."tenant_id" = (select app.tenant_id())) and ("avis_reference"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "carrier_invitation" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("carrier_invitation"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("carrier_invitation"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "token_select" ON "carrier_invitation" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'token') and ("carrier_invitation"."token_hash" = (select app.token_hash())));--> statement-breakpoint
CREATE POLICY "token_update" ON "carrier_invitation" AS PERMISSIVE FOR UPDATE TO public USING (((select app.party()) = 'token') and ("carrier_invitation"."token_hash" = (select app.token_hash()))) WITH CHECK (((select app.party()) = 'token') and ("carrier_invitation"."token_hash" = (select app.token_hash())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "carrier_registration" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("carrier_registration"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("carrier_registration"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "public_insert" ON "carrier_registration" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'public') and ("carrier_registration"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "carrier_registration" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and ("carrier_registration"."carrier_id" = (select app.carrier_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "bookable_resource" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("bookable_resource"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("bookable_resource"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("bookable_resource"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("bookable_resource"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "bookable_resource" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and (app.linked_tenant("bookable_resource"."tenant_id")));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "bookable_resource" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("bookable_resource"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "bookable_resource" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("bookable_resource"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "closure" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("closure"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("closure"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("closure"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("closure"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "closure" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("closure"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "load_type" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("load_type"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("load_type"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("load_type"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("load_type"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "load_type" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and (app.linked_tenant("load_type"."tenant_id")));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "load_type" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("load_type"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "load_type" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("load_type"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "load_type_resource" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("load_type_resource"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("load_type_resource"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("load_type_resource"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("load_type_resource"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "load_type_resource" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("load_type_resource"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "opening_hours" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("opening_hours"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("opening_hours"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("opening_hours"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("opening_hours"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "opening_hours" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("opening_hours"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "resource_dock" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("resource_dock"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("resource_dock"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("resource_dock"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("resource_dock"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "resource_dock" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("resource_dock"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "booking" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("booking"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("booking"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("booking"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("booking"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "booking" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and ("booking"."carrier_id" = (select app.carrier_id())));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "booking" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and (("booking"."tenant_id" = (select app.tenant_id())) and ("booking"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_insert" ON "booking" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'carrier_at_tenant') and (("booking"."tenant_id" = (select app.tenant_id())) and ("booking"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_update" ON "booking" AS PERMISSIVE FOR UPDATE TO public USING (((select app.party()) = 'carrier_at_tenant') and (("booking"."tenant_id" = (select app.tenant_id())) and ("booking"."carrier_id" = (select app.carrier_id())))) WITH CHECK (((select app.party()) = 'carrier_at_tenant') and (("booking"."tenant_id" = (select app.tenant_id())) and ("booking"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "driver_select" ON "booking" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("booking"."id" = (select app.booking_id())));--> statement-breakpoint
CREATE POLICY "driver_update_lock" ON "booking" AS PERMISSIVE FOR UPDATE TO public USING (((select app.party()) = 'driver') and ("booking"."id" = (select app.booking_id()))) WITH CHECK (((select app.party()) = 'driver') and (false));--> statement-breakpoint
CREATE POLICY "tenant_select" ON "booking_event" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'tenant') and (("booking_event"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("booking_event"."site_id"))));--> statement-breakpoint
CREATE POLICY "tenant_insert" ON "booking_event" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'tenant') and (("booking_event"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("booking_event"."site_id"))));--> statement-breakpoint
CREATE POLICY "tenant_delete" ON "booking_event" AS PERMISSIVE FOR DELETE TO public USING (((select app.party()) = 'tenant') and (("booking_event"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("booking_event"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "booking_event" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and ("booking_event"."carrier_id" = (select app.carrier_id())));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "booking_event" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and (("booking_event"."tenant_id" = (select app.tenant_id())) and ("booking_event"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_insert" ON "booking_event" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'carrier_at_tenant') and (("booking_event"."tenant_id" = (select app.tenant_id())) and ("booking_event"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "driver_select" ON "booking_event" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("booking_event"."booking_id" = (select app.booking_id())));--> statement-breakpoint
CREATE POLICY "driver_insert" ON "booking_event" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'driver') and (("booking_event"."tenant_id" = (select app.tenant_id())) and ("booking_event"."booking_id" = (select app.booking_id()))));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "tenant_logo" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("tenant_logo"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("tenant_logo"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "tenant_logo" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and (app.linked_tenant("tenant_logo"."tenant_id")));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "tenant_logo" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("tenant_logo"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "tenant_logo" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("tenant_logo"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "public_select" ON "tenant_logo" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'public') and ("tenant_logo"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "platform_all" ON "app_user" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'platform') and (true)) WITH CHECK (((select app.party()) = 'platform') and (true));--> statement-breakpoint
CREATE POLICY "user_select" ON "app_user" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'user') and ("app_user"."id" = (select app.user_id())));--> statement-breakpoint
CREATE POLICY "user_update" ON "app_user" AS PERMISSIVE FOR UPDATE TO public USING (((select app.party()) = 'user') and ("app_user"."id" = (select app.user_id()))) WITH CHECK (((select app.party()) = 'user') and ("app_user"."id" = (select app.user_id())));--> statement-breakpoint
CREATE POLICY "token_select" ON "app_user" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'token') and ("app_user"."id" = (select app.user_id())));--> statement-breakpoint
CREATE POLICY "token_update" ON "app_user" AS PERMISSIVE FOR UPDATE TO public USING (((select app.party()) = 'token') and ("app_user"."id" = (select app.user_id()))) WITH CHECK (((select app.party()) = 'token') and ("app_user"."id" = (select app.user_id())));--> statement-breakpoint
CREATE POLICY "token_insert" ON "app_user" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'token') and (true));--> statement-breakpoint
CREATE POLICY "public_insert" ON "app_user" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'public') and (true));--> statement-breakpoint
CREATE POLICY "tenant_select" ON "app_user" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'tenant') and (app.shares_org("app_user"."id")));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "app_user" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and (app.shares_org("app_user"."id")));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "app_user" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and (app.shares_org("app_user"."id")));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "dock" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("dock"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("dock"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("dock"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("dock"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "dock" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and (app.linked_tenant("dock"."tenant_id")));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "dock" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("dock"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "dock" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("dock"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "platform_all" ON "entitlement_override" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'platform') and (true)) WITH CHECK (((select app.party()) = 'platform') and (true));--> statement-breakpoint
CREATE POLICY "tenant_select" ON "entitlement_override" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'tenant') and ("entitlement_override"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "hall" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("hall"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("hall"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("hall"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("hall"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "hall" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and (app.linked_tenant("hall"."tenant_id")));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "hall" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("hall"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "hall" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("hall"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "platform_all" ON "invitation" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'platform') and (true)) WITH CHECK (((select app.party()) = 'platform') and (true));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "invitation" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("invitation"."org_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("invitation"."org_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "carrier_all" ON "invitation" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'carrier') and ("invitation"."org_id" = (select app.carrier_id()))) WITH CHECK (((select app.party()) = 'carrier') and ("invitation"."org_id" = (select app.carrier_id())));--> statement-breakpoint
CREATE POLICY "token_select" ON "invitation" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'token') and ("invitation"."token_hash" = (select app.token_hash())));--> statement-breakpoint
CREATE POLICY "token_update" ON "invitation" AS PERMISSIVE FOR UPDATE TO public USING (((select app.party()) = 'token') and ("invitation"."token_hash" = (select app.token_hash()))) WITH CHECK (((select app.party()) = 'token') and ("invitation"."token_hash" = (select app.token_hash())));--> statement-breakpoint
CREATE POLICY "user_select" ON "membership" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'user') and ("membership"."user_id" = (select app.user_id())));--> statement-breakpoint
CREATE POLICY "platform_all" ON "membership" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'platform') and (true)) WITH CHECK (((select app.party()) = 'platform') and (true));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "membership" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("membership"."org_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("membership"."org_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "carrier_all" ON "membership" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'carrier') and ("membership"."org_id" = (select app.carrier_id()))) WITH CHECK (((select app.party()) = 'carrier') and ("membership"."org_id" = (select app.carrier_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "membership_site" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("membership_site"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("membership_site"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "user_select" ON "membership_site" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'user') and ("membership_site"."user_id" = (select app.user_id())));--> statement-breakpoint
CREATE POLICY "platform_all" ON "org" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'platform') and (true)) WITH CHECK (((select app.party()) = 'platform') and (true));--> statement-breakpoint
CREATE POLICY "user_select" ON "org" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'user') and (exists (select 1 from membership m where m.org_id = "org"."id" and m.user_id = (select app.user_id()))));--> statement-breakpoint
CREATE POLICY "tenant_select" ON "org" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'tenant') and ("org"."id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "org" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("org"."id" = (select app.tenant_id()) or "org"."id" = (select app.carrier_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "org" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("org"."id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "public_select" ON "org" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'public') and ("org"."id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "org" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and ("org"."id" = (select app.carrier_id()) or app.linked_tenant("org"."id")));--> statement-breakpoint
CREATE POLICY "system_select" ON "org" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'system') and (true));--> statement-breakpoint
CREATE POLICY "user_insert" ON "org" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'user') and ("org"."kind" = 'carrier'));--> statement-breakpoint
CREATE POLICY "token_insert" ON "org" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'token') and ("org"."kind" = 'carrier'));--> statement-breakpoint
CREATE POLICY "any_select_platform_rows" ON "setting_value" AS PERMISSIVE FOR SELECT TO public USING ((select app.party()) is not null and "setting_value"."tenant_id" is null);--> statement-breakpoint
CREATE POLICY "platform_all" ON "setting_value" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'platform') and ("setting_value"."tenant_id" is null)) WITH CHECK (((select app.party()) = 'platform') and ("setting_value"."tenant_id" is null));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "setting_value" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("setting_value"."tenant_id" = (select app.tenant_id())) and ("setting_value"."site_id" is null or app.site_allowed("setting_value"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("setting_value"."tenant_id" = (select app.tenant_id())) and ("setting_value"."site_id" is null or app.site_allowed("setting_value"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "setting_value" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("setting_value"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "setting_value" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("setting_value"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "public_select" ON "setting_value" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'public') and ("setting_value"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "setting_value" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and (app.linked_tenant("setting_value"."tenant_id")));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "site" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("site"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("site"."id")))) WITH CHECK (((select app.party()) = 'tenant') and (("site"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("site"."id"))));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "site" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and (app.linked_tenant("site"."tenant_id")));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "site" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("site"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "site" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("site"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "public_select" ON "site" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'public') and ("site"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "tenant_carrier_link" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("tenant_carrier_link"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("tenant_carrier_link"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "tenant_carrier_link" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and ("tenant_carrier_link"."carrier_id" = (select app.carrier_id())));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "tenant_carrier_link" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and (("tenant_carrier_link"."tenant_id" = (select app.tenant_id())) and ("tenant_carrier_link"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "platform_all" ON "tenant_subscription" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'platform') and (true)) WITH CHECK (((select app.party()) = 'platform') and (true));--> statement-breakpoint
CREATE POLICY "tenant_select" ON "tenant_subscription" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'tenant') and ("tenant_subscription"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "tenant_subscription" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and ("tenant_subscription"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "tenant_subscription" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("tenant_subscription"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "public_select" ON "tenant_subscription" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'public') and ("tenant_subscription"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "tenant_subscription" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and (app.linked_tenant("tenant_subscription"."tenant_id")));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "driver_access" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("driver_access"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("driver_access"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("driver_access"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("driver_access"."site_id"))));--> statement-breakpoint
CREATE POLICY "carrier_select" ON "driver_access" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier') and ("driver_access"."carrier_id" = (select app.carrier_id())));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_select" ON "driver_access" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'carrier_at_tenant') and (("driver_access"."tenant_id" = (select app.tenant_id())) and ("driver_access"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_insert" ON "driver_access" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'carrier_at_tenant') and (("driver_access"."tenant_id" = (select app.tenant_id())) and ("driver_access"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "carrier_at_tenant_update" ON "driver_access" AS PERMISSIVE FOR UPDATE TO public USING (((select app.party()) = 'carrier_at_tenant') and (("driver_access"."tenant_id" = (select app.tenant_id())) and ("driver_access"."carrier_id" = (select app.carrier_id())))) WITH CHECK (((select app.party()) = 'carrier_at_tenant') and (("driver_access"."tenant_id" = (select app.tenant_id())) and ("driver_access"."carrier_id" = (select app.carrier_id()))));--> statement-breakpoint
CREATE POLICY "driver_select" ON "driver_access" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("driver_access"."booking_id" = (select app.booking_id())));--> statement-breakpoint
CREATE POLICY "token_select" ON "driver_access" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'token') and ("driver_access"."token_hash" = (select app.token_hash())));--> statement-breakpoint
CREATE POLICY "token_update" ON "driver_access" AS PERMISSIVE FOR UPDATE TO public USING (((select app.party()) = 'token') and ("driver_access"."token_hash" = (select app.token_hash()))) WITH CHECK (((select app.party()) = 'token') and ("driver_access"."token_hash" = (select app.token_hash())));--> statement-breakpoint
CREATE POLICY "any_insert" ON "outbox_message" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((select app.party()) is not null and ("outbox_message"."tenant_id" is null or "outbox_message"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "system_select" ON "outbox_message" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'system') and (true));--> statement-breakpoint
CREATE POLICY "system_update" ON "outbox_message" AS PERMISSIVE FOR UPDATE TO public USING (((select app.party()) = 'system') and (true)) WITH CHECK (((select app.party()) = 'system') and (true));--> statement-breakpoint
CREATE POLICY "system_delete" ON "outbox_message" AS PERMISSIVE FOR DELETE TO public USING (((select app.party()) = 'system') and (true));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "privacy_request_log" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("privacy_request_log"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("privacy_request_log"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "booking_acknowledgement" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and (("booking_acknowledgement"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("booking_acknowledgement"."site_id")))) WITH CHECK (((select app.party()) = 'tenant') and (("booking_acknowledgement"."tenant_id" = (select app.tenant_id())) and (app.site_allowed("booking_acknowledgement"."site_id"))));--> statement-breakpoint
CREATE POLICY "driver_select" ON "booking_acknowledgement" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and (("booking_acknowledgement"."tenant_id" = (select app.tenant_id())) and ("booking_acknowledgement"."booking_id" = (select app.booking_id()))));--> statement-breakpoint
CREATE POLICY "driver_insert" ON "booking_acknowledgement" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'driver') and (("booking_acknowledgement"."tenant_id" = (select app.tenant_id())) and ("booking_acknowledgement"."booking_id" = (select app.booking_id()))));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "safety_acknowledgement" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("safety_acknowledgement"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("safety_acknowledgement"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "safety_acknowledgement" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and (("safety_acknowledgement"."tenant_id" = (select app.tenant_id())) and ("safety_acknowledgement"."booking_id" = (select app.booking_id()))));--> statement-breakpoint
CREATE POLICY "driver_insert" ON "safety_acknowledgement" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'driver') and (("safety_acknowledgement"."tenant_id" = (select app.tenant_id())) and ("safety_acknowledgement"."booking_id" = (select app.booking_id()))));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "safety_attempt" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("safety_attempt"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("safety_attempt"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_all" ON "safety_attempt" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'driver') and (("safety_attempt"."tenant_id" = (select app.tenant_id())) and ("safety_attempt"."booking_id" = (select app.booking_id())))) WITH CHECK (((select app.party()) = 'driver') and (("safety_attempt"."tenant_id" = (select app.tenant_id())) and ("safety_attempt"."booking_id" = (select app.booking_id()))));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "safety_content" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("safety_content"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("safety_content"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "safety_content" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and (("safety_content"."tenant_id" = (select app.tenant_id())) and (exists (select 1 from safety_version v where v.id = "safety_content"."version_id" and v.status = 'published'))));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "safety_instruction" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("safety_instruction"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("safety_instruction"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "safety_instruction" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("safety_instruction"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "safety_instruction_site" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("safety_instruction_site"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("safety_instruction_site"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "safety_instruction_site" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and ("safety_instruction_site"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "safety_pass" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("safety_pass"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("safety_pass"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_insert" ON "safety_pass" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select app.party()) = 'driver') and ("safety_pass"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "tenant_all" ON "safety_version" AS PERMISSIVE FOR ALL TO public USING (((select app.party()) = 'tenant') and ("safety_version"."tenant_id" = (select app.tenant_id()))) WITH CHECK (((select app.party()) = 'tenant') and ("safety_version"."tenant_id" = (select app.tenant_id())));--> statement-breakpoint
CREATE POLICY "driver_select" ON "safety_version" AS PERMISSIVE FOR SELECT TO public USING (((select app.party()) = 'driver') and (("safety_version"."tenant_id" = (select app.tenant_id())) and ("safety_version"."status" = 'published')));