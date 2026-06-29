-- Add created_by and updated_by columns to products, sub_products, and insurance_companies tables
-- Purpose: Track who created and last updated each master data record for audit purposes

ALTER TABLE products
ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

ALTER TABLE sub_products
ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

ALTER TABLE insurance_companies
ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
