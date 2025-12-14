-- Fix foreign key constraints for profiles and terms_acceptance
-- Ensure they reference auth.users instead of a (non-existent) public.users table

DO $$
BEGIN
  -- Drop existing FK on profiles (if it exists)
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_id_fkey'
      AND table_name = 'profiles'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_fkey;
  END IF;

  -- Recreate FK referencing auth.users
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE;

  -- Drop existing FK on terms_acceptance (if it exists)
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'terms_acceptance_user_id_fkey'
      AND table_name = 'terms_acceptance'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.terms_acceptance DROP CONSTRAINT terms_acceptance_user_id_fkey;
  END IF;

  -- Recreate FK referencing auth.users
  ALTER TABLE public.terms_acceptance
    ADD CONSTRAINT terms_acceptance_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE;
END $$;

