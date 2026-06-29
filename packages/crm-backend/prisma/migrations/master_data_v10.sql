-- Remove code columns from master-data tables per updated requirements.

ALTER TABLE lobs DROP COLUMN IF EXISTS code;
ALTER TABLE products DROP COLUMN IF EXISTS code;
ALTER TABLE sub_products DROP COLUMN IF EXISTS code;
ALTER TABLE insurance_companies DROP COLUMN IF EXISTS code;
