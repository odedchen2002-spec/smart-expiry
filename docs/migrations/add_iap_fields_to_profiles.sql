-- Migration: add IAP metadata columns to profiles
-- Run this SQL in Supabase SQL editor to add columns for storing native purchase info

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS iap_platform text,
  ADD COLUMN IF NOT EXISTS iap_original_transaction_id text,
  ADD COLUMN IF NOT EXISTS iap_purchase_token text,
  ADD COLUMN IF NOT EXISTS iap_receipt text;


