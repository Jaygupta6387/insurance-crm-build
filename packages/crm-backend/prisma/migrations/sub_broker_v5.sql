-- Migration: Remove address column from sub_brokers table
ALTER TABLE sub_brokers DROP COLUMN IF EXISTS address;
