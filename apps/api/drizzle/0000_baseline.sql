-- Baseline (ADR-0001, ADR-0002): extensions, the app schema with the RLS accessors, and the
-- default privileges of rampflow_app. Runs as the owner role; rampflow_app must exist.
-- Function bodies are checked at call time, so app.linked_tenant() can name a table that the
-- next migration creates.
SET LOCAL check_function_bodies = off;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE SCHEMA app;--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO PUBLIC;--> statement-breakpoint
CREATE FUNCTION app.party() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.party', true), '') $$;--> statement-breakpoint
CREATE FUNCTION app.user_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;--> statement-breakpoint
CREATE FUNCTION app.tenant_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;--> statement-breakpoint
CREATE FUNCTION app.carrier_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.carrier_id', true), '')::uuid $$;--> statement-breakpoint
CREATE FUNCTION app.booking_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.booking_id', true), '')::uuid $$;--> statement-breakpoint
CREATE FUNCTION app.token_hash() RETURNS bytea LANGUAGE sql STABLE AS
  $$ SELECT decode(nullif(current_setting('app.token_hash', true), ''), 'hex') $$;--> statement-breakpoint
CREATE FUNCTION app.site_allowed(site uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT CASE WHEN current_setting('app.site_ids', true) = '*' THEN true
         ELSE site = ANY (string_to_array(nullif(current_setting('app.site_ids', true), ''), ',')::uuid[])
         END $$;--> statement-breakpoint
CREATE FUNCTION app.linked_tenant(tenant uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT EXISTS (SELECT 1 FROM public.tenant_carrier_link l
                    WHERE l.tenant_id = tenant AND l.carrier_id = app.carrier_id()) $$;--> statement-breakpoint
-- Whether a user is visible to the current party: a member of its tenant or carrier, or, for a
-- tenant, a member of a linked carrier (booking contacts). Definer rights, because the caller's
-- own membership policy hides other orgs' memberships.
CREATE FUNCTION app.shares_org(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.membership m WHERE m.user_id = target AND (
          (app.party() = 'tenant' AND m.org_id = app.tenant_id())
       OR (app.party() IN ('carrier', 'carrier_at_tenant') AND m.org_id = app.carrier_id())
       OR (app.party() = 'tenant' AND m.org_kind = 'carrier' AND EXISTS (
             SELECT 1 FROM public.tenant_carrier_link l
             WHERE l.tenant_id = app.tenant_id() AND l.carrier_id = m.org_id)))) $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.shares_org(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.shares_org(uuid) TO rampflow_app;--> statement-breakpoint
-- Sign-in, magic-link and reset requests look a user up by email before anyone is signed in.
CREATE FUNCTION app.user_by_email(address citext)
  RETURNS TABLE (id uuid, password_hash text, email_verified_at timestamptz, disabled_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS
  $$ SELECT u.id, u.password_hash, u.email_verified_at, u.disabled_at FROM public.app_user u
     WHERE app.party() IN ('anonymous', 'token', 'public') AND u.email = address $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.user_by_email(citext) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.user_by_email(citext) TO rampflow_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rampflow_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO rampflow_app;
