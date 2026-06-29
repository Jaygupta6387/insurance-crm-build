-- Sub-broker V2 migration
-- Step 1: Create new ENUMs
CREATE TYPE "SubBrokerStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "WalletTransactionReason" AS ENUM ('COMMISSION_EARNED', 'MANUAL_CREDIT', 'MANUAL_DEBIT', 'PAYOUT', 'ADJUSTMENT');

-- Step 2: Alter sub_brokers table - add new columns
ALTER TABLE sub_brokers
  ADD COLUMN address TEXT,
  ADD COLUMN pan_card TEXT,
  ADD COLUMN notes TEXT,
  ADD COLUMN status "SubBrokerStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN wallet_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN created_by TEXT,
  ADD COLUMN updated_by TEXT,
  ADD COLUMN deleted_by TEXT,
  ADD COLUMN deleted_at TIMESTAMP(3);

-- Step 3: Drop old columns
ALTER TABLE sub_brokers
  DROP COLUMN commission_percentage,
  DROP COLUMN is_active;

-- Step 4: Create sub_broker_wallet_transactions table
CREATE TABLE sub_broker_wallet_transactions (
  id              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  sub_broker_id   TEXT NOT NULL,
  type            "WalletTransactionType" NOT NULL,
  reason          "WalletTransactionReason" NOT NULL,
  amount          NUMERIC(15,2) NOT NULL,
  balance_after   NUMERIC(15,2) NOT NULL,
  note            TEXT,
  reference_id    TEXT,
  performed_by    TEXT,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sub_broker_wallet_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT sub_broker_wallet_transactions_sub_broker_id_fkey
    FOREIGN KEY (sub_broker_id) REFERENCES sub_brokers(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 5: Create policy_sub_broker_commissions table
CREATE TABLE policy_sub_broker_commissions (
  id                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  sub_broker_id     TEXT NOT NULL,
  policy_number     TEXT,
  customer_name     TEXT,
  insurer_name      TEXT,
  policy_type       TEXT,
  premium_amount    NUMERIC(15,2),
  commission_rate   NUMERIC(5,2),
  commission_amount NUMERIC(15,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'PENDING',
  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT policy_sub_broker_commissions_pkey PRIMARY KEY (id),
  CONSTRAINT policy_sub_broker_commissions_sub_broker_id_fkey
    FOREIGN KEY (sub_broker_id) REFERENCES sub_brokers(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 6: Create policy_sub_broker_commission_items table
CREATE TABLE policy_sub_broker_commission_items (
  id            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  commission_id TEXT NOT NULL,
  description   TEXT NOT NULL,
  amount        NUMERIC(15,2) NOT NULL,
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT policy_sub_broker_commission_items_pkey PRIMARY KEY (id),
  CONSTRAINT policy_sub_broker_commission_items_commission_id_fkey
    FOREIGN KEY (commission_id) REFERENCES policy_sub_broker_commissions(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 7: Add sub-broker permission columns to executive_permissions
ALTER TABLE executive_permissions
  ADD COLUMN can_view_sub_brokers   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN can_create_sub_brokers BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN can_edit_sub_brokers   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN can_delete_sub_brokers BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN can_adjust_wallet      BOOLEAN NOT NULL DEFAULT FALSE;
