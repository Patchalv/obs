CREATE TYPE "public"."staff_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"kind" text NOT NULL,
	"target_staff_id" uuid,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staff_member" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" "staff_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"deactivated_by" uuid,
	CONSTRAINT "staff_member_deactivated_by_with_at" CHECK (("staff_member"."deactivated_at" is null) = ("staff_member"."deactivated_by" is null))
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_id_staff_member_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff_member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_invited_by_staff_member_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."staff_member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_deactivated_by_staff_member_id_fk" FOREIGN KEY ("deactivated_by") REFERENCES "public"."staff_member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_event_created_at_idx" ON "audit_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
-- Row-level security backbone (ADR 0004, docs/spec/permissions.md). Hand-written, because
-- Drizzle doesn't emit roles, grants or FORCE ROW LEVEL SECURITY.
--
-- Roles are cluster-wide, so they are created only if missing. They get no password here:
-- `pnpm db:migrate` sets local ones, and each hosted environment sets its own out of band.
-- Neither role may bypass row-level security or own a table; the catalog guard checks both.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ping_app') THEN
    CREATE ROLE ping_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ping_system') THEN
    CREATE ROLE ping_system LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO ping_app, ping_system', current_database());
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO ping_app, ping_system;--> statement-breakpoint

-- The Staff member acting in this transaction, from set_config('app.staff_id', <id>, true).
-- Null when unset: once a transaction-local setting has been used, current_setting returns
-- '' rather than null, so both count as unset. Every policy fails closed on null.
CREATE FUNCTION public.current_staff_id() RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
  AS $$ SELECT nullif(current_setting('app.staff_id', true), '')::uuid $$;--> statement-breakpoint

-- Policy helper: is the acting Staff member an active Admin? SECURITY DEFINER so that the
-- staff_member policies can ask without querying staff_member under their own policy,
-- which would recurse. Runs as the table owner, which bypasses row-level security.
CREATE FUNCTION public.current_staff_is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.staff_member
      WHERE id = public.current_staff_id() AND role = 'admin' AND deactivated_at IS NULL
    )
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.current_staff_is_admin() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_staff_is_admin() TO ping_app, ping_system;--> statement-breakpoint

-- Better Auth's tables have no row-level security (an explicit allowlist in the catalog
-- guard). The auth module reaches them as ping_app.
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", "session", "account", "verification" TO ping_app;--> statement-breakpoint

-- staff_member: every signed-in Staff member reads; only an Admin writes, never their own
-- row; an Admin deletes only an Invited person.
GRANT SELECT, INSERT, UPDATE, DELETE ON "staff_member" TO ping_app;--> statement-breakpoint
ALTER TABLE "staff_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_member" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY staff_member_select ON "staff_member" FOR SELECT TO ping_app
  USING (public.current_staff_id() IS NOT NULL);--> statement-breakpoint
CREATE POLICY staff_member_insert ON "staff_member" FOR INSERT TO ping_app
  WITH CHECK (public.current_staff_is_admin());--> statement-breakpoint
CREATE POLICY staff_member_update ON "staff_member" FOR UPDATE TO ping_app
  USING (public.current_staff_is_admin() AND id <> public.current_staff_id())
  WITH CHECK (public.current_staff_is_admin() AND id <> public.current_staff_id());--> statement-breakpoint
CREATE POLICY staff_member_delete ON "staff_member" FOR DELETE TO ping_app
  USING (public.current_staff_is_admin() AND id <> public.current_staff_id() AND joined_at IS NULL);--> statement-breakpoint

-- audit_event: ping_app may only insert, as itself or anonymously (failed sign-ins).
-- Nothing reads it through the app. ping_system runs the retention sweeper.
GRANT INSERT ON "audit_event" TO ping_app;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "audit_event" TO ping_system;--> statement-breakpoint
ALTER TABLE "audit_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY audit_event_insert ON "audit_event" FOR INSERT TO ping_app
  WITH CHECK (actor_id IS NULL OR actor_id = public.current_staff_id());--> statement-breakpoint
CREATE POLICY audit_event_system ON "audit_event" FOR ALL TO ping_system
  USING (true) WITH CHECK (true);
