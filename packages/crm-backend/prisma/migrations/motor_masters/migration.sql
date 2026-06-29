-- Create motor_makes table
CREATE TABLE IF NOT EXISTS "motor_makes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "make_name" VARCHAR(255) NOT NULL UNIQUE,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on make_name
CREATE INDEX "motor_makes_make_name_idx" ON "motor_makes"("make_name");

-- Create motor_models table
CREATE TABLE IF NOT EXISTS "motor_models" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "make_id" UUID NOT NULL,
  "model_name" VARCHAR(255) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_motor_models_make" FOREIGN KEY ("make_id") REFERENCES "motor_makes"("id") ON DELETE CASCADE,
  UNIQUE("make_id", "model_name")
);

-- Create indexes on motor_models
CREATE INDEX "motor_models_make_id_idx" ON "motor_models"("make_id");
CREATE INDEX "motor_models_model_name_idx" ON "motor_models"("model_name");

-- Create motor_variants table
CREATE TABLE IF NOT EXISTS "motor_variants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "make_id" UUID NOT NULL,
  "model_id" UUID NOT NULL,
  "variant_name" VARCHAR(255) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_motor_variants_make" FOREIGN KEY ("make_id") REFERENCES "motor_makes"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_motor_variants_model" FOREIGN KEY ("model_id") REFERENCES "motor_models"("id") ON DELETE CASCADE,
  UNIQUE("model_id", "variant_name")
);

-- Create indexes on motor_variants
CREATE INDEX "motor_variants_make_id_idx" ON "motor_variants"("make_id");
CREATE INDEX "motor_variants_model_id_idx" ON "motor_variants"("model_id");
CREATE INDEX "motor_variants_variant_name_idx" ON "motor_variants"("variant_name");

-- Create rto_codes table
CREATE TABLE IF NOT EXISTS "rto_codes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "rto_code" VARCHAR(50) NOT NULL UNIQUE,
  "rto_name" VARCHAR(255) NOT NULL,
  "city" VARCHAR(255) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes on rto_codes
CREATE INDEX "rto_codes_rto_code_idx" ON "rto_codes"("rto_code");
CREATE INDEX "rto_codes_city_idx" ON "rto_codes"("city");

-- Create add_on_coverages table
CREATE TABLE IF NOT EXISTS "add_on_coverages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "add_on_name" VARCHAR(255) NOT NULL UNIQUE,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on add_on_name
CREATE INDEX "add_on_coverages_add_on_name_idx" ON "add_on_coverages"("add_on_name");

-- Add motor master permissions to executive_permissions
ALTER TABLE "executive_permissions" ADD COLUMN IF NOT EXISTS "can_view_motor_masters" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "executive_permissions" ADD COLUMN IF NOT EXISTS "can_create_motor_masters" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "executive_permissions" ADD COLUMN IF NOT EXISTS "can_edit_motor_masters" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "executive_permissions" ADD COLUMN IF NOT EXISTS "can_delete_motor_masters" BOOLEAN NOT NULL DEFAULT false;
