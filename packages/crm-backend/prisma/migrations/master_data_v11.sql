-- Remove legacy description columns from products and sub_products.

ALTER TABLE products
DROP COLUMN IF EXISTS description;

ALTER TABLE sub_products
DROP COLUMN IF EXISTS description;