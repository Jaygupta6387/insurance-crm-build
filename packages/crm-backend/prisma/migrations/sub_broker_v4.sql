-- Migration: Remove pan_card and notes columns from sub_brokers table
ALTER TABLE sub_brokers DROP COLUMN IF EXISTS pan_card;
ALTER TABLE sub_brokers DROP COLUMN IF EXISTS notes;
