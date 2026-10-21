ALTER TABLE "bookable_resource" ADD COLUMN "door_type" text DEFAULT 'dock_leveler' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookable_resource" ADD COLUMN "temperature_zone" text DEFAULT 'ambient' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookable_resource" ADD COLUMN "adr_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookable_resource" ADD COLUMN "hall_id" uuid;--> statement-breakpoint
ALTER TABLE "resource_dock" ADD COLUMN "door_type" text DEFAULT 'dock_leveler' NOT NULL;--> statement-breakpoint
ALTER TABLE "resource_dock" ADD COLUMN "temperature_zone" text DEFAULT 'ambient' NOT NULL;--> statement-breakpoint
ALTER TABLE "resource_dock" ADD COLUMN "adr_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bookable_resource_default_pool_key" ON "bookable_resource" USING btree ("hall_id","door_type","temperature_zone","adr_allowed") WHERE "bookable_resource"."hall_id" is not null;--> statement-breakpoint
ALTER TABLE "bookable_resource" ADD CONSTRAINT "bookable_resource_id_profile_key" UNIQUE("id","door_type","temperature_zone","adr_allowed");--> statement-breakpoint
ALTER TABLE "dock" ADD CONSTRAINT "dock_id_profile_key" UNIQUE("id","door_type","temperature_zone","adr_allowed");--> statement-breakpoint
ALTER TABLE "bookable_resource" ADD CONSTRAINT "bookable_resource_hall_fk" FOREIGN KEY ("hall_id","site_id") REFERENCES "public"."hall"("id","site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_dock" ADD CONSTRAINT "resource_dock_dock_profile_fk" FOREIGN KEY ("dock_id","door_type","temperature_zone","adr_allowed") REFERENCES "public"."dock"("id","door_type","temperature_zone","adr_allowed") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_dock" ADD CONSTRAINT "resource_dock_resource_profile_fk" FOREIGN KEY ("resource_id","door_type","temperature_zone","adr_allowed") REFERENCES "public"."bookable_resource"("id","door_type","temperature_zone","adr_allowed") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookable_resource" ADD CONSTRAINT "bookable_resource_door_type_check" CHECK ("bookable_resource"."door_type" in ('dock_leveler', 'ground_level', 'side_loading', 'yard_open'));--> statement-breakpoint
ALTER TABLE "bookable_resource" ADD CONSTRAINT "bookable_resource_temperature_zone_check" CHECK ("bookable_resource"."temperature_zone" in ('ambient', 'chilled', 'frozen'));--> statement-breakpoint
ALTER TABLE "bookable_resource" ADD CONSTRAINT "bookable_resource_hall_check" CHECK ("bookable_resource"."hall_id" is null or "bookable_resource"."kind" in ('pool'));--> statement-breakpoint
CREATE POLICY "tenant_update_activate" ON "org" AS PERMISSIVE FOR UPDATE TO public USING (((select app.party()) = 'tenant') and ("org"."id" = (select app.tenant_id()) and "org"."activated_at" is null)) WITH CHECK (((select app.party()) = 'tenant') and ("org"."id" = (select app.tenant_id()) and "org"."activated_at" is not null));