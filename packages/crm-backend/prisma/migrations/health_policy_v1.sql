-- Health policy module v1 — idempotent tenant migration
-- Apply: psql "$DATABASE_URL" -f prisma/migrations/health_policy_v1.sql

-- ─── health_plans ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "health_plans" (
  "id"                   TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "name"                 TEXT         NOT NULL,
  "insurance_company_id" TEXT,
  "is_active"            BOOLEAN      NOT NULL DEFAULT true,
  "created_by"           TEXT,
  "updated_by"           TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "health_plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "health_plans_name_idx" ON "health_plans"("name");

-- ─── health_policy_details ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "health_policy_details" (
  "id"                TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "policy_id"         TEXT         NOT NULL,
  "health_plan_id"    TEXT,
  "deductible"        DECIMAL(15,2),
  "sum_insured"       DECIMAL(15,2),
  "cumulative_bonus"  DECIMAL(15,2),
  "base_premium"      DECIMAL(15,2),
  "gst_percent"       DECIMAL(5,2),
  "gst_amount"        DECIMAL(15,2),
  "net_premium"       DECIMAL(15,2),
  "total_premium"     DECIMAL(15,2),
  "payment_mode"      TEXT,
  "payment_reference" TEXT,
  "is_full_payment"   BOOLEAN      NOT NULL DEFAULT true,
  "amount_received"   DECIMAL(15,2),
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "health_policy_details_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "health_policy_details_policy_id_key" ON "health_policy_details"("policy_id");

-- ─── health_policy_members ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "health_policy_members" (
  "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "policy_id"    TEXT         NOT NULL,
  "customer_id"  TEXT,
  "relation"     "FamilyRelation",
  "member_name"  TEXT         NOT NULL,
  "member_phone" TEXT,
  "member_email" TEXT,
  "member_age"   INTEGER,
  "is_covered"   BOOLEAN      NOT NULL DEFAULT true,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "health_policy_members_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "health_policy_members_policy_id_idx" ON "health_policy_members"("policy_id");
CREATE INDEX IF NOT EXISTS "health_policy_members_customer_id_idx" ON "health_policy_members"("customer_id");

-- ─── Foreign keys ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "health_plans" ADD CONSTRAINT "health_plans_insurance_company_id_fkey"
    FOREIGN KEY ("insurance_company_id") REFERENCES "insurance_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "health_policy_details" ADD CONSTRAINT "health_policy_details_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "health_policy_details" ADD CONSTRAINT "health_policy_details_health_plan_id_fkey"
    FOREIGN KEY ("health_plan_id") REFERENCES "health_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "health_policy_members" ADD CONSTRAINT "health_policy_members_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "health_policy_members" ADD CONSTRAINT "health_policy_members_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
