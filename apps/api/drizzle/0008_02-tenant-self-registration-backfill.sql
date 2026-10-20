-- Change 02 (tenant-lifecycle): tenants that existed before activation was recorded are active
-- since their creation. Drizzle cannot express a data update (ADR-0001, point 8).
UPDATE "org" SET "activated_at" = "created_at" WHERE "kind" = 'tenant' AND "activated_at" IS NULL;
