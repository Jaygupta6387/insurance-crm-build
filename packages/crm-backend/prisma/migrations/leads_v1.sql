-- ─── Lead Status Enum ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'HOT', 'WARM', 'COLD', 'CONVERTED', 'LOST');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ─── Leads Table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "leads" (
  "id"                        UUID            NOT NULL DEFAULT gen_random_uuid(),
  "lead_code"                 TEXT            NOT NULL,
  "lead_name"                 TEXT            NOT NULL,
  "phone_number"              TEXT            NOT NULL,
  "email"                     TEXT,
  "expected_premium"          DECIMAL(12, 2),
  "referred_by_type"          "ReferredByType" NOT NULL DEFAULT 'SELF',
  "referred_by_sub_broker_id" TEXT,
  "referred_by_customer_id"   TEXT,
  "lob_id"                    TEXT,
  "product_id"                TEXT,
  "sub_product_id"            TEXT,
  "assigned_to"               TEXT,
  "status"                    "LeadStatus"    NOT NULL DEFAULT 'NEW',
  "notes"                     TEXT,
  "is_active"                 BOOLEAN         NOT NULL DEFAULT TRUE,
  "deleted_at"                TIMESTAMPTZ,
  "created_by"                TEXT,
  "updated_by"                TEXT,
  "created_at"                TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  "updated_at"                TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "leads_lead_code_key" ON "leads"("lead_code");
CREATE INDEX IF NOT EXISTS "leads_phone_number_idx"  ON "leads"("phone_number");
CREATE INDEX IF NOT EXISTS "leads_status_idx"        ON "leads"("status");
CREATE INDEX IF NOT EXISTS "leads_assigned_to_idx"   ON "leads"("assigned_to");
CREATE INDEX IF NOT EXISTS "leads_lob_id_idx"        ON "leads"("lob_id");

-- ─── Lead Follow-ups Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "lead_follow_ups" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "lead_id"        UUID        NOT NULL,
  "notes"          TEXT,
  "follow_up_date" TIMESTAMPTZ,
  "is_done"        BOOLEAN     NOT NULL DEFAULT FALSE,
  "created_by"     TEXT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "lead_follow_ups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_follow_ups_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "lead_follow_ups_lead_id_idx" ON "lead_follow_ups"("lead_id");

-- ─── Lead Documents Table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "lead_documents" (
  "id"            UUID            NOT NULL DEFAULT gen_random_uuid(),
  "lead_id"       UUID            NOT NULL,
  "document_type" "DocumentType"  NOT NULL,
  "file_name"     TEXT            NOT NULL,
  "file_url"      TEXT            NOT NULL,
  "created_by"    TEXT,
  "created_at"    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT "lead_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_documents_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "lead_documents_lead_id_idx" ON "lead_documents"("lead_id");
