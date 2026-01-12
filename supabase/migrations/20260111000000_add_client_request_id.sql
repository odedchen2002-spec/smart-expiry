-- Add client_request_id for idempotency on item creates
-- This allows clients to safely retry create operations without duplicating items

-- 1. Add column
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS client_request_id UUID DEFAULT NULL;

-- 2. Create unique constraint to prevent duplicate creates with same client_request_id
-- Scoped to owner_id to avoid collisions across users
CREATE UNIQUE INDEX IF NOT EXISTS items_client_request_id_unique
ON public.items (owner_id, client_request_id)
WHERE client_request_id IS NOT NULL;

-- 3. Add index for efficient lookups when handling retries
CREATE INDEX IF NOT EXISTS items_client_request_id_idx
ON public.items (client_request_id)
WHERE client_request_id IS NOT NULL;

-- 4. Add comment for documentation
COMMENT ON COLUMN public.items.client_request_id IS 
  'Client-generated UUID for idempotency. Ensures retried creates do not duplicate items. Optional field used only for create operations.';

-- Note: No RLS policy changes needed. The client_request_id is a nullable field
-- that clients can optionally provide. RLS policies on items table already
-- handle owner_id checks, and client_request_id is just an additional constraint.
-- The INSERT policy allows authenticated users to insert items for their owner_id,
-- and the client_request_id will be validated by the unique constraint.
