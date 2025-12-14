-- Migration: Create RPC function to insert terms acceptance
-- This bypasses RLS by using SECURITY DEFINER
-- Run this SQL in your Supabase SQL editor

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
  -- Insert the terms acceptance record
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

