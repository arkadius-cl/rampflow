-- Change 02 (tenant-lifecycle): tenants that existed before activation was recorded are active
-- since their creation. Drizzle cannot express a data update (ADR-0001, point 8).
UPDATE "org" SET "activated_at" = "created_at" WHERE "kind" = 'tenant' AND "activated_at" IS NULL;--> statement-breakpoint
-- Change 02 (RG-03): the known-account email goes out in the account's language, so the lookup
-- before sign-in also answers the locale. A new result column needs DROP and CREATE.
DROP FUNCTION app.user_by_email(citext);--> statement-breakpoint
CREATE FUNCTION app.user_by_email(address citext)
  RETURNS TABLE (id uuid, password_hash text, email_verified_at timestamptz, disabled_at timestamptz, locale text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS
  $$ SELECT u.id, u.password_hash, u.email_verified_at, u.disabled_at, u.locale FROM public.app_user u
     WHERE app.party() IN ('anonymous', 'token', 'public') AND u.email = address $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.user_by_email(citext) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.user_by_email(citext) TO rampflow_app;
