-- Migration: Create terms_acceptance table
-- Run this SQL in your Supabase SQL editor

-- Create the terms_acceptance table
create table if not exists public.terms_acceptance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  business_name text not null,
  signed_at timestamptz not null default now(),
  terms_text text not null
);

-- Create indexes for faster queries
create index if not exists idx_terms_acceptance_user_id on public.terms_acceptance(user_id);
create index if not exists idx_terms_acceptance_signed_at on public.terms_acceptance(signed_at);

-- Add comments for documentation
comment on table public.terms_acceptance is 'Stores user acceptance of Terms of Use during registration';
comment on column public.terms_acceptance.user_id is 'Reference to the user who accepted the terms';
comment on column public.terms_acceptance.username is 'Username provided during registration';
comment on column public.terms_acceptance.business_name is 'Business name provided during registration';
comment on column public.terms_acceptance.signed_at is 'Timestamp when the user accepted the terms';
comment on column public.terms_acceptance.terms_text is 'The exact Terms of Use text that was accepted';

-- Enable Row Level Security (RLS)
alter table public.terms_acceptance enable row level security;

-- Create policy: Users can only read their own terms acceptance records
create policy "Users can view their own terms acceptance"
  on public.terms_acceptance
  for select
  using (auth.uid() = user_id);

-- Create policy: Service role can insert terms acceptance records
-- This is needed for the signup process
create policy "Service role can insert terms acceptance"
  on public.terms_acceptance
  for insert
  with check (true);

