-- ════════════════════════════════════════════════════════════════════════════
-- Motor Policy domain (v1)
-- Idempotent: safe to run on existing tenant databases.
-- Creates vehicles, policy types, premium/GST masters, motor policy detail,
-- add-ons, documents, previous policy, agency commission, customer wallet;
-- extends executive_permissions / customers / policies; seeds defaults.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Column extensions ────────────────────────────────────────────────────────
ALTER TABLE "executive_permissions"
  ADD COLUMN IF NOT EXISTS "can_manage_policy_commission" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "wallet_balance" DECIMAL(15,2) NOT NULL DEFAULT 0;

ALTER TABLE "policies"
  ADD COLUMN IF NOT EXISTS "policy_type_id"            TEXT,
  ADD COLUMN IF NOT EXISTS "vehicle_id"                TEXT,
  ADD COLUMN IF NOT EXISTS "referred_by_type"          "ReferredByType",
  ADD COLUMN IF NOT EXISTS "referred_by_sub_broker_id" TEXT,
  ADD COLUMN IF NOT EXISTS "referred_by_customer_id"   TEXT,
  ADD COLUMN IF NOT EXISTS "issue_date"                TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updated_by"                TEXT;

-- ─── policy_types ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "policy_types" (
  "id"         TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "name"       TEXT         NOT NULL,
  "is_active"  BOOLEAN      NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "policy_types_name_key" ON "policy_types"("name");

-- ─── vehicles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vehicles" (
  "id"                  TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "customer_id"         TEXT         NOT NULL,
  "registration_number" TEXT         NOT NULL,
  "is_new_registration" BOOLEAN      NOT NULL DEFAULT false,
  -- motor-master ids are UUID-typed in this schema
  "rto_code_id"         UUID,
  "chassis_last6"       TEXT,
  "make_id"             UUID,
  "model_id"            UUID,
  "variant_id"          UUID,
  "manufacture_year"    INTEGER,
  "registration_date"   TIMESTAMP(3),
  "fuel_type"           TEXT,
  "cubic_capacity"      INTEGER,
  "battery_capacity"    TEXT,
  "seating_capacity"    INTEGER,
  "is_active"           BOOLEAN      NOT NULL DEFAULT true,
  "deleted_at"          TIMESTAMP(3),
  "created_by"          TEXT,
  "updated_by"          TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vehicles_customer_id_idx" ON "vehicles"("customer_id");
CREATE INDEX IF NOT EXISTS "vehicles_registration_number_idx" ON "vehicles"("registration_number");

-- ─── motor_premium_rates ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "motor_premium_rates" (
  "id"              TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "product_id"      TEXT,
  "sub_product_id"  TEXT,
  "zone"            TEXT         NOT NULL,
  "cc_bracket"      TEXT         NOT NULL,
  "age_bracket"     TEXT         NOT NULL,
  "od_rate_percent" DECIMAL(6,3) NOT NULL,
  "tp_premium"      DECIMAL(12,2) NOT NULL,
  "is_active"       BOOLEAN      NOT NULL DEFAULT true,
  "created_by"      TEXT,
  "updated_by"      TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "motor_premium_rates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "motor_premium_rates_product_id_idx" ON "motor_premium_rates"("product_id");
CREATE INDEX IF NOT EXISTS "motor_premium_rates_sub_product_id_idx" ON "motor_premium_rates"("sub_product_id");
CREATE INDEX IF NOT EXISTS "motor_premium_rates_lookup_idx" ON "motor_premium_rates"("zone","cc_bracket","age_bracket");

-- ─── gst_rates ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "gst_rates" (
  "id"                TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "lob_id"            TEXT,
  "product_id"        TEXT,
  "gst_on_od_percent" DECIMAL(5,2),
  "gst_on_tp_percent" DECIMAL(5,2),
  "gst_percent"       DECIMAL(5,2),
  "is_active"         BOOLEAN      NOT NULL DEFAULT true,
  "created_by"        TEXT,
  "updated_by"        TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gst_rates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gst_rates_lob_id_idx" ON "gst_rates"("lob_id");
CREATE INDEX IF NOT EXISTS "gst_rates_product_id_idx" ON "gst_rates"("product_id");

-- ─── motor_policy_details ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "motor_policy_details" (
  "id"                         TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "policy_id"                  TEXT         NOT NULL,
  "package_type"               TEXT,
  "idv"                        DECIMAL(15,2),
  "electric_accessory_idv"     DECIMAL(15,2),
  "non_electric_accessory_idv" DECIMAL(15,2),
  "od_start_date"              TIMESTAMP(3),
  "od_end_date"                TIMESTAMP(3),
  "tp_start_date"              TIMESTAMP(3),
  "tp_end_date"                TIMESTAMP(3),
  "rate_source"                TEXT         NOT NULL DEFAULT 'MANUAL',
  "basic_premium"              DECIMAL(15,2),
  "discount_percent"           DECIMAL(6,3),
  "basic_after_discount"       DECIMAL(15,2),
  "ncb_percent"                DECIMAL(6,3),
  "od_premium"                 DECIMAL(15,2),
  "tp_premium"                 DECIMAL(15,2),
  "addon_premium"              DECIMAL(15,2),
  "total_od_premium"           DECIMAL(15,2),
  "net_premium"                DECIMAL(15,2),
  "gst_on_od"                  DECIMAL(15,2),
  "gst_on_tp"                  DECIMAL(15,2),
  "total_gst"                  DECIMAL(15,2),
  "total_premium"              DECIMAL(15,2),
  "pa_owner"                   BOOLEAN      NOT NULL DEFAULT false,
  "pa_owner_amount"            DECIMAL(12,2),
  "pa_passenger_1l"            BOOLEAN      NOT NULL DEFAULT false,
  "pa_passenger_2l"            BOOLEAN      NOT NULL DEFAULT false,
  "pa_passenger_amount"        DECIMAL(12,2),
  "paid_driver"                BOOLEAN      NOT NULL DEFAULT false,
  "paid_driver_amount"         DECIMAL(12,2),
  "payment_mode"               TEXT,
  "payment_reference"          TEXT,
  "is_full_payment"            BOOLEAN      NOT NULL DEFAULT true,
  "amount_received"            DECIMAL(15,2),
  "created_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "motor_policy_details_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "motor_policy_details_policy_id_key" ON "motor_policy_details"("policy_id");

-- ─── policy_add_ons ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "policy_add_ons" (
  "id"                 TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "policy_id"          TEXT         NOT NULL,
  "add_on_coverage_id" UUID,
  "add_on_name"        TEXT         NOT NULL,
  "amount"             DECIMAL(12,2),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_add_ons_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "policy_add_ons_policy_id_idx" ON "policy_add_ons"("policy_id");

-- ─── policy_documents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "policy_documents" (
  "id"         TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "policy_id"  TEXT         NOT NULL,
  "category"   TEXT         NOT NULL DEFAULT 'POLICY_PDF',
  "file_name"  TEXT         NOT NULL,
  "file_url"   TEXT         NOT NULL,
  "mime_type"  TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "policy_documents_policy_id_idx" ON "policy_documents"("policy_id");

-- ─── previous_policies ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "previous_policies" (
  "id"                            TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "policy_id"                     TEXT         NOT NULL,
  "previous_policy_number"        TEXT,
  "previous_insurance_company_id" TEXT,
  "claim_status"                  TEXT,
  "claim_amount"                  DECIMAL(15,2),
  "claim_description"             TEXT,
  "created_at"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "previous_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "previous_policies_policy_id_key" ON "previous_policies"("policy_id");

-- ─── policy_commissions / items (agency commission) ───────────────────────────
CREATE TABLE IF NOT EXISTS "policy_commissions" (
  "id"                      TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "policy_id"               TEXT         NOT NULL,
  "total_commission_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "notes"                   TEXT,
  "created_by"              TEXT,
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_commissions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "policy_commissions_policy_id_idx" ON "policy_commissions"("policy_id");

CREATE TABLE IF NOT EXISTS "policy_commission_items" (
  "id"                TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "commission_id"     TEXT         NOT NULL,
  "component_type"    TEXT         NOT NULL,
  "base_amount"       DECIMAL(15,2),
  "percentage"        DECIMAL(6,3),
  "commission_amount" DECIMAL(15,2) NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_commission_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "policy_commission_items_commission_id_component_type_key"
  ON "policy_commission_items"("commission_id","component_type");

-- ─── customer_wallet_transactions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "customer_wallet_transactions" (
  "id"            TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "customer_id"   TEXT         NOT NULL,
  "type"          "WalletTransactionType" NOT NULL,
  "amount"        DECIMAL(15,2) NOT NULL,
  "balance_after" DECIMAL(15,2) NOT NULL,
  "reason"        TEXT,
  "policy_id"     TEXT,
  "policy_number" TEXT,
  "product_name"  TEXT,
  "note"          TEXT,
  "performed_by"  TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_wallet_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "customer_wallet_transactions_customer_id_idx" ON "customer_wallet_transactions"("customer_id");
CREATE INDEX IF NOT EXISTS "customer_wallet_transactions_policy_id_idx" ON "customer_wallet_transactions"("policy_id");

-- ─── Foreign keys (idempotent) ────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_rto_code_id_fkey" FOREIGN KEY ("rto_code_id") REFERENCES "rto_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_make_id_fkey" FOREIGN KEY ("make_id") REFERENCES "motor_makes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "motor_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "motor_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "policies" ADD CONSTRAINT "policies_policy_type_id_fkey" FOREIGN KEY ("policy_type_id") REFERENCES "policy_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "policies" ADD CONSTRAINT "policies_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "motor_premium_rates" ADD CONSTRAINT "motor_premium_rates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "motor_premium_rates" ADD CONSTRAINT "motor_premium_rates_sub_product_id_fkey" FOREIGN KEY ("sub_product_id") REFERENCES "sub_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "gst_rates" ADD CONSTRAINT "gst_rates_lob_id_fkey" FOREIGN KEY ("lob_id") REFERENCES "lobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "gst_rates" ADD CONSTRAINT "gst_rates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "motor_policy_details" ADD CONSTRAINT "motor_policy_details_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "policy_add_ons" ADD CONSTRAINT "policy_add_ons_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "policy_add_ons" ADD CONSTRAINT "policy_add_ons_add_on_coverage_id_fkey" FOREIGN KEY ("add_on_coverage_id") REFERENCES "add_on_coverages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "previous_policies" ADD CONSTRAINT "previous_policies_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "previous_policies" ADD CONSTRAINT "previous_policies_previous_insurance_company_id_fkey" FOREIGN KEY ("previous_insurance_company_id") REFERENCES "insurance_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "policy_commissions" ADD CONSTRAINT "policy_commissions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "policy_commission_items" ADD CONSTRAINT "policy_commission_items_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "policy_commissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_wallet_transactions" ADD CONSTRAINT "customer_wallet_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "customer_wallet_transactions" ADD CONSTRAINT "customer_wallet_transactions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Seed: policy types ───────────────────────────────────────────────────────
INSERT INTO "policy_types" ("id","name") VALUES
  (gen_random_uuid()::text, 'New'),
  (gen_random_uuid()::text, 'Renew'),
  (gen_random_uuid()::text, 'Port'),
  (gen_random_uuid()::text, 'Used')
ON CONFLICT ("name") DO NOTHING;

-- Premium rates: product + sub-product required; configure via CRM master UI / super-admin.

-- ─── Seed: default motor GST (18% OD / 18% TP, product-agnostic) ───────────────
INSERT INTO "gst_rates" ("id","lob_id","product_id","gst_on_od_percent","gst_on_tp_percent","gst_percent")
SELECT gen_random_uuid()::text, NULL, NULL, 18.00, 18.00, 18.00
WHERE NOT EXISTS (
  SELECT 1 FROM "gst_rates" g WHERE g."lob_id" IS NULL AND g."product_id" IS NULL
);
