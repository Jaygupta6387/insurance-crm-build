-- ─────────────────────────────────────────────────────────────────────────────
-- Sub-Broker V3 Migration: Relational Commission Architecture
-- Refactors commission tables from denormalized text to FK-based relational design
-- Adds master tables: lobs, products, sub_products, insurance_companies, policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Create new PostgreSQL ENUMs
CREATE TYPE "CommissionBasis" AS ENUM ('PREMIUM_PERCENTAGE', 'COMMISSION_PERCENTAGE', 'FIXED_AMOUNT');
CREATE TYPE "CommissionComponentType" AS ENUM ('OD', 'TP', 'ADDON', 'RSA', 'ZERO_DEP', 'PREMIUM', 'TOPUP', 'YEAR_1', 'RENEWAL', 'OTHER');
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- Step 2: Create lobs table
CREATE TABLE lobs (
  id          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  name        TEXT        NOT NULL,
  code        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lobs_pkey    PRIMARY KEY (id),
  CONSTRAINT lobs_code_key UNIQUE (code)
);

-- Step 3: Create insurance_companies table (standalone, no FK dependencies)
CREATE TABLE insurance_companies (
  id          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  name        TEXT        NOT NULL,
  code        TEXT,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT insurance_companies_pkey     PRIMARY KEY (id),
  CONSTRAINT insurance_companies_code_key UNIQUE (code)
);

-- Step 4: Create products table (depends on lobs)
CREATE TABLE products (
  id          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  lob_id      TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  code        TEXT,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT products_pkey        PRIMARY KEY (id),
  CONSTRAINT products_lob_id_fkey FOREIGN KEY (lob_id) REFERENCES lobs(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX idx_products_lob_id    ON products(lob_id);
CREATE INDEX idx_products_is_active ON products(is_active);

-- Step 5: Create sub_products table (depends on products)
CREATE TABLE sub_products (
  id          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  product_id  TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  code        TEXT,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sub_products_pkey            PRIMARY KEY (id),
  CONSTRAINT sub_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX idx_sub_products_product_id ON sub_products(product_id);
CREATE INDEX idx_sub_products_is_active  ON sub_products(is_active);

-- Step 6: Create policies table (depends on customers, lobs, products, sub_products, insurance_companies)
CREATE TABLE policies (
  id                   TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  policy_number        TEXT,
  customer_id          TEXT         NOT NULL,
  lob_id               TEXT,
  product_id           TEXT,
  sub_product_id       TEXT,
  insurance_company_id TEXT,
  premium_amount       NUMERIC(15,2),
  sum_insured          NUMERIC(15,2),
  start_date           DATE,
  end_date             DATE,
  status               TEXT         NOT NULL DEFAULT 'ACTIVE',
  notes                TEXT,
  created_by           TEXT,
  created_at           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT policies_pkey                     PRIMARY KEY (id),
  CONSTRAINT policies_customer_id_fkey         FOREIGN KEY (customer_id)          REFERENCES customers(id)          ON DELETE RESTRICT  ON UPDATE CASCADE,
  CONSTRAINT policies_lob_id_fkey              FOREIGN KEY (lob_id)               REFERENCES lobs(id)               ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT policies_product_id_fkey          FOREIGN KEY (product_id)           REFERENCES products(id)           ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT policies_sub_product_id_fkey      FOREIGN KEY (sub_product_id)       REFERENCES sub_products(id)       ON DELETE SET NULL  ON UPDATE CASCADE,
  CONSTRAINT policies_insurance_company_id_fkey FOREIGN KEY (insurance_company_id) REFERENCES insurance_companies(id) ON DELETE SET NULL  ON UPDATE CASCADE
);

CREATE INDEX idx_policies_customer_id          ON policies(customer_id);
CREATE INDEX idx_policies_lob_id               ON policies(lob_id);
CREATE INDEX idx_policies_product_id           ON policies(product_id);
CREATE INDEX idx_policies_insurance_company_id ON policies(insurance_company_id);
CREATE INDEX idx_policies_status               ON policies(status);

-- Step 7: Clear commission tables (schema is being fully refactored)
-- Items are cascade-deleted automatically when commissions are truncated
TRUNCATE TABLE policy_sub_broker_commissions CASCADE;

-- Step 8: Refactor policy_sub_broker_commissions
-- 8a: Remove old denormalized text columns
ALTER TABLE policy_sub_broker_commissions
  DROP COLUMN customer_name,
  DROP COLUMN insurer_name,
  DROP COLUMN policy_type,
  DROP COLUMN premium_amount,
  DROP COLUMN commission_rate,
  DROP COLUMN commission_amount;

-- 8b: Convert status from TEXT to CommissionStatus enum
ALTER TABLE policy_sub_broker_commissions
  ALTER COLUMN status TYPE "CommissionStatus" USING status::"CommissionStatus",
  ALTER COLUMN status SET DEFAULT 'PENDING'::"CommissionStatus";

-- 8c: Add relational + new columns
ALTER TABLE policy_sub_broker_commissions
  ADD COLUMN policy_id                TEXT,
  ADD COLUMN customer_id              TEXT,
  ADD COLUMN lob_id                   TEXT,
  ADD COLUMN product_id               TEXT,
  ADD COLUMN sub_product_id           TEXT,
  ADD COLUMN insurance_company_id     TEXT,
  ADD COLUMN commission_basis         "CommissionBasis",
  ADD COLUMN total_commission_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN is_wallet_credited       BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN wallet_transaction_id    TEXT          UNIQUE;

-- 8d: Remove the default (enforced at app level)
ALTER TABLE policy_sub_broker_commissions
  ALTER COLUMN total_commission_amount DROP DEFAULT;

-- 8e: Add FK constraints
ALTER TABLE policy_sub_broker_commissions
  ADD CONSTRAINT psbc_policy_id_fkey              FOREIGN KEY (policy_id)              REFERENCES policies(id)              ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT psbc_customer_id_fkey            FOREIGN KEY (customer_id)            REFERENCES customers(id)             ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT psbc_lob_id_fkey                 FOREIGN KEY (lob_id)                 REFERENCES lobs(id)                  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT psbc_product_id_fkey             FOREIGN KEY (product_id)             REFERENCES products(id)              ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT psbc_sub_product_id_fkey         FOREIGN KEY (sub_product_id)         REFERENCES sub_products(id)          ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT psbc_insurance_company_id_fkey   FOREIGN KEY (insurance_company_id)   REFERENCES insurance_companies(id)   ON DELETE SET NULL ON UPDATE CASCADE;

-- 8f: Add indexes
CREATE INDEX idx_psbc_sub_broker_id      ON policy_sub_broker_commissions(sub_broker_id);
CREATE INDEX idx_psbc_policy_id          ON policy_sub_broker_commissions(policy_id);
CREATE INDEX idx_psbc_customer_id        ON policy_sub_broker_commissions(customer_id);
CREATE INDEX idx_psbc_lob_id             ON policy_sub_broker_commissions(lob_id);
CREATE INDEX idx_psbc_product_id         ON policy_sub_broker_commissions(product_id);
CREATE INDEX idx_psbc_sub_product_id     ON policy_sub_broker_commissions(sub_product_id);
CREATE INDEX idx_psbc_insurance_id       ON policy_sub_broker_commissions(insurance_company_id);
CREATE INDEX idx_psbc_created_at         ON policy_sub_broker_commissions(created_at);

-- Step 9: Refactor policy_sub_broker_commission_items
-- Table is already empty (cascade cleared in step 7)
-- 9a: Remove old generic columns
ALTER TABLE policy_sub_broker_commission_items
  DROP COLUMN description,
  DROP COLUMN amount;

-- 9b: Add structured breakdown columns
ALTER TABLE policy_sub_broker_commission_items
  ADD COLUMN component_type    "CommissionComponentType" NOT NULL,
  ADD COLUMN base_amount       NUMERIC(15,2),
  ADD COLUMN percentage        NUMERIC(5,2),
  ADD COLUMN commission_amount NUMERIC(15,2) NOT NULL;

-- 9c: Add unique constraint (one row per component per commission)
ALTER TABLE policy_sub_broker_commission_items
  ADD CONSTRAINT psbci_commission_component_unique UNIQUE (commission_id, component_type);

-- Step 10: Add analytics columns to sub_broker_wallet_transactions
ALTER TABLE sub_broker_wallet_transactions
  ADD COLUMN policy_id                         TEXT,
  ADD COLUMN customer_id                       TEXT,
  ADD COLUMN lob_id                            TEXT,
  ADD COLUMN product_id                        TEXT,
  ADD COLUMN sub_product_id                    TEXT,
  ADD COLUMN insurance_company_id              TEXT,
  ADD COLUMN customer_name_snapshot            TEXT,
  ADD COLUMN insurance_company_name_snapshot   TEXT,
  ADD COLUMN product_name_snapshot             TEXT;

-- 10a: Add FK constraints on wallet transactions
ALTER TABLE sub_broker_wallet_transactions
  ADD CONSTRAINT sbwt_policy_id_fkey              FOREIGN KEY (policy_id)              REFERENCES policies(id)              ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT sbwt_customer_id_fkey            FOREIGN KEY (customer_id)            REFERENCES customers(id)             ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT sbwt_lob_id_fkey                 FOREIGN KEY (lob_id)                 REFERENCES lobs(id)                  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT sbwt_product_id_fkey             FOREIGN KEY (product_id)             REFERENCES products(id)              ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT sbwt_sub_product_id_fkey         FOREIGN KEY (sub_product_id)         REFERENCES sub_products(id)          ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT sbwt_insurance_company_id_fkey   FOREIGN KEY (insurance_company_id)   REFERENCES insurance_companies(id)   ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 11: Add wallet_transaction_id → wallet_transactions FK (after wallet table is altered)
ALTER TABLE policy_sub_broker_commissions
  ADD CONSTRAINT psbc_wallet_transaction_id_fkey  FOREIGN KEY (wallet_transaction_id)  REFERENCES sub_broker_wallet_transactions(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 10b: Add indexes on wallet transactions
CREATE INDEX idx_sbwt_policy_id              ON sub_broker_wallet_transactions(policy_id);
CREATE INDEX idx_sbwt_customer_id            ON sub_broker_wallet_transactions(customer_id);
CREATE INDEX idx_sbwt_lob_id                 ON sub_broker_wallet_transactions(lob_id);
CREATE INDEX idx_sbwt_product_id             ON sub_broker_wallet_transactions(product_id);
CREATE INDEX idx_sbwt_insurance_company_id   ON sub_broker_wallet_transactions(insurance_company_id);

-- Step 12: Add indexes on master tables
CREATE INDEX idx_lobs_is_active                ON lobs(is_active);
CREATE INDEX idx_insurance_companies_is_active ON insurance_companies(is_active);
