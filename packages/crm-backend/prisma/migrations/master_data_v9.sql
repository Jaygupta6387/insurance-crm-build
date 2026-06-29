-- Remove mistakenly added description column from insurance_companies
-- Keep the master data schema aligned with the intended design.

ALTER TABLE insurance_companies
DROP COLUMN IF EXISTS description;