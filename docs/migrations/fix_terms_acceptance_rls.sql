-- Migration: Fix RLS policy for terms_acceptance table
-- Run this SQL in your Supabase SQL editor to allow users to insert their own records

-- Drop any existing insert policies
drop policy if exists "Service role can insert terms acceptance" on public.terms_acceptance;
drop policy if exists "Users can insert their own terms acceptance" on public.terms_acceptance;

-- Create policy: Users can insert their own terms acceptance records
create policy "Users can insert their own terms acceptance"
  on public.terms_acceptance
  for insert
  with check (auth.uid() = user_id);

