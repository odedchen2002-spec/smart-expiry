-- Migration: Add terms acceptance fields to profiles table
-- Run this SQL in your Supabase SQL editor

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS has_accepted_terms boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;


