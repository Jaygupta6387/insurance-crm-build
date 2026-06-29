-- Policy change requests (edit/delete approval workflow for executives)

CREATE TABLE IF NOT EXISTS "policy_change_requests" (
  "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "policy_id"    TEXT         NOT NULL,
  "request_type" TEXT         NOT NULL,
  "status"       TEXT         NOT NULL DEFAULT 'PENDING',
  "payload"      JSONB,
  "reason"       TEXT,
  "requested_by" TEXT         NOT NULL,
  "reviewed_by"  TEXT,
  "reviewed_at"  TIMESTAMP(3),
  "review_note"  TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "policy_change_requests_policy_id_idx" ON "policy_change_requests"("policy_id");
CREATE INDEX IF NOT EXISTS "policy_change_requests_status_idx" ON "policy_change_requests"("status");

DO $$ BEGIN
  ALTER TABLE "policy_change_requests"
    ADD CONSTRAINT "policy_change_requests_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
