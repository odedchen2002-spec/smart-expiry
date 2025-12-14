-- Migration: Create RPC functions for signup data insertion
-- These bypass RLS by using SECURITY DEFINER
-- Run this SQL in your Supabase SQL editor

-- 1. RPC function to insert terms acceptance
create or replace function public.insert_terms_acceptance(
  p_user_id uuid,
  p_username text,
  p_business_name text,
  p_terms_text text,
  p_signed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.terms_acceptance (
    user_id,
    username,
    business_name,
    terms_text,
    signed_at
  ) values (
    p_user_id,
    p_username,
    p_business_name,
    p_terms_text,
    p_signed_at
  )
  returning id into v_id;
  
  return v_id;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.insert_terms_acceptance(uuid, text, text, text, timestamptz) to authenticated;

-- 2. RPC function to upsert profile
create or replace function public.upsert_profile_on_signup(
  p_user_id uuid,
  p_business_name text,
  p_accepted_terms_at timestamptz,
  p_terms_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    business_name,
    accepted_terms_at,
    terms_hash,
    updated_at
  ) values (
    p_user_id,
    p_business_name,
    p_accepted_terms_at,
    p_terms_hash,
    p_accepted_terms_at
  )
  on conflict (id) do update set
    business_name = excluded.business_name,
    accepted_terms_at = excluded.accepted_terms_at,
    terms_hash = excluded.terms_hash,
    updated_at = excluded.updated_at;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.upsert_profile_on_signup(uuid, text, timestamptz, text) to authenticated;

