-- ============================================================================
-- Migration: Barcode Catalog, Pending Items, and Expiry Events
-- Smart Expiry - Refactoring for minimal user input workflow
-- ============================================================================

-- ============================================================================
-- A1) GLOBAL BARCODE NAME SYSTEM
-- ============================================================================

-- Table: barcode_catalog (GLOBAL)
-- Purpose: Default product name for each barcode, shared across all users.
-- This table is read-only for clients - only server functions can write.
CREATE TABLE IF NOT EXISTS public.barcode_catalog (
    barcode TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    locale TEXT NULL,
    source TEXT NOT NULL DEFAULT 'stub', -- 'stub' | 'api' | 'user' | 'mixed'
    confidence_score NUMERIC NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for barcode_catalog: readable by authenticated users, NOT writable by clients
ALTER TABLE public.barcode_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "barcode_catalog_select_policy" ON public.barcode_catalog
    FOR SELECT TO authenticated
    USING (true);

-- No INSERT/UPDATE/DELETE policies for clients - only service role can modify

COMMENT ON TABLE public.barcode_catalog IS 'Global barcode-to-name mapping shared across all users. Read-only for clients.';

-- ============================================================================
-- Table: barcode_name_suggestions
-- Purpose: Users can suggest names without breaking the global catalog.
-- These are reviewed and potentially promoted to the catalog by admins.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.barcode_name_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barcode TEXT NOT NULL,
    suggested_name TEXT NOT NULL,
    locale TEXT NULL,
    store_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_barcode_suggestions_barcode ON public.barcode_name_suggestions(barcode);
CREATE INDEX IF NOT EXISTS idx_barcode_suggestions_store ON public.barcode_name_suggestions(store_id);

-- RLS for barcode_name_suggestions: Insert allowed for authenticated users
ALTER TABLE public.barcode_name_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "barcode_suggestions_insert_policy" ON public.barcode_name_suggestions
    FOR INSERT TO authenticated
    WITH CHECK (store_id = auth.uid());

CREATE POLICY "barcode_suggestions_select_own_policy" ON public.barcode_name_suggestions
    FOR SELECT TO authenticated
    USING (store_id = auth.uid());

COMMENT ON TABLE public.barcode_name_suggestions IS 'User suggestions for barcode names. Not directly promoted to catalog.';

-- ============================================================================
-- Table: store_barcode_overrides
-- Purpose: Custom naming per store/business (shared by collaborators).
-- Takes precedence over the global catalog for that store.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.store_barcode_overrides (
    store_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    barcode TEXT NOT NULL,
    custom_name TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (store_id, barcode)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_store_overrides_barcode ON public.store_barcode_overrides(barcode);

-- RLS for store_barcode_overrides: Full CRUD within same store_id
ALTER TABLE public.store_barcode_overrides ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has access to a store (owner or active collaborator)
CREATE OR REPLACE FUNCTION public.user_has_store_access(target_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- User is the owner
    IF target_store_id = auth.uid() THEN
        RETURN TRUE;
    END IF;
    
    -- User is an active collaborator
    RETURN EXISTS (
        SELECT 1 FROM public.collaborations
        WHERE owner_id = target_store_id
          AND member_id = auth.uid()
          AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "store_overrides_select_policy" ON public.store_barcode_overrides
    FOR SELECT TO authenticated
    USING (public.user_has_store_access(store_id));

CREATE POLICY "store_overrides_insert_policy" ON public.store_barcode_overrides
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_store_access(store_id));

CREATE POLICY "store_overrides_update_policy" ON public.store_barcode_overrides
    FOR UPDATE TO authenticated
    USING (public.user_has_store_access(store_id))
    WITH CHECK (public.user_has_store_access(store_id));

CREATE POLICY "store_overrides_delete_policy" ON public.store_barcode_overrides
    FOR DELETE TO authenticated
    USING (public.user_has_store_access(store_id));

COMMENT ON TABLE public.store_barcode_overrides IS 'Store-specific barcode name overrides. Takes precedence over global catalog.';

-- ============================================================================
-- A2) SUPPLIER INTAKE (NO EXPIRY ESTIMATION)
-- ============================================================================

-- Table: pending_items
-- Purpose: Items detected from supplier documents waiting for a real expiry date.
-- These are NOT items/batches yet - just placeholders to be resolved during scanning.
CREATE TABLE IF NOT EXISTS public.pending_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    barcode TEXT NULL,
    raw_name TEXT NULL,
    quantity INTEGER NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ NULL
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_pending_items_store ON public.pending_items(store_id);
CREATE INDEX IF NOT EXISTS idx_pending_items_barcode ON public.pending_items(barcode);
CREATE INDEX IF NOT EXISTS idx_pending_items_unresolved ON public.pending_items(store_id) 
    WHERE resolved_at IS NULL;

-- RLS for pending_items: Store scoped
ALTER TABLE public.pending_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_items_select_policy" ON public.pending_items
    FOR SELECT TO authenticated
    USING (public.user_has_store_access(store_id));

CREATE POLICY "pending_items_insert_policy" ON public.pending_items
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_store_access(store_id));

CREATE POLICY "pending_items_update_policy" ON public.pending_items
    FOR UPDATE TO authenticated
    USING (public.user_has_store_access(store_id))
    WITH CHECK (public.user_has_store_access(store_id));

CREATE POLICY "pending_items_delete_policy" ON public.pending_items
    FOR DELETE TO authenticated
    USING (public.user_has_store_access(store_id));

COMMENT ON TABLE public.pending_items IS 'Supplier intake items waiting for real expiry dates. Do NOT estimate expiry.';

-- ============================================================================
-- A3) HISTORY / EVENTS (for Level B savings tracking)
-- ============================================================================

-- Table: expiry_events
-- Purpose: Track outcomes and auto-archival for future reports.
-- Event types: SOLD_FINISHED, THROWN, UPDATED_DATE, EXPIRED_AUTO_ARCHIVED
CREATE TABLE IF NOT EXISTS public.expiry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    batch_id UUID NULL, -- References items table (which we treat as batches)
    barcode TEXT NULL,
    product_name TEXT NULL, -- Snapshot of product name at event time
    event_type TEXT NOT NULL CHECK (event_type IN (
        'SOLD_FINISHED',
        'THROWN',
        'UPDATED_DATE',
        'EXPIRED_AUTO_ARCHIVED'
    )),
    event_source TEXT NOT NULL DEFAULT 'user' CHECK (event_source IN ('user', 'system')),
    metadata JSONB NULL, -- Additional context (e.g., new_expiry_date for UPDATED_DATE)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for faster lookups and reporting
CREATE INDEX IF NOT EXISTS idx_expiry_events_store ON public.expiry_events(store_id);
CREATE INDEX IF NOT EXISTS idx_expiry_events_batch ON public.expiry_events(batch_id);
CREATE INDEX IF NOT EXISTS idx_expiry_events_barcode ON public.expiry_events(barcode);
CREATE INDEX IF NOT EXISTS idx_expiry_events_type ON public.expiry_events(event_type);
CREATE INDEX IF NOT EXISTS idx_expiry_events_created ON public.expiry_events(created_at);

-- RLS for expiry_events: Store scoped read, insert only
ALTER TABLE public.expiry_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expiry_events_select_policy" ON public.expiry_events
    FOR SELECT TO authenticated
    USING (public.user_has_store_access(store_id));

CREATE POLICY "expiry_events_insert_policy" ON public.expiry_events
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_store_access(store_id));

-- No UPDATE or DELETE policies - events are immutable history

COMMENT ON TABLE public.expiry_events IS 'Immutable history of expiry-related events for Level B savings tracking.';

-- ============================================================================
-- RPC FUNCTION: resolve_barcode_name (STUB)
-- ============================================================================

-- This function implements the name resolution order:
-- 1. Check store_barcode_overrides (store_id + barcode)
-- 2. Else check barcode_catalog
-- 3. Else return NULL (no external API yet - stub behavior)
--
-- Later, step 3 will be replaced with a real barcode lookup API call.
CREATE OR REPLACE FUNCTION public.resolve_barcode_name(
    p_barcode TEXT,
    p_store_id UUID DEFAULT NULL,
    p_locale TEXT DEFAULT NULL
)
RETURNS TABLE (
    name TEXT,
    source TEXT,
    confidence_score NUMERIC
) AS $$
DECLARE
    v_override_name TEXT;
    v_catalog_name TEXT;
    v_catalog_source TEXT;
    v_catalog_confidence NUMERIC;
BEGIN
    -- Step 1: Check store_barcode_overrides if store_id provided
    IF p_store_id IS NOT NULL THEN
        SELECT custom_name INTO v_override_name
        FROM public.store_barcode_overrides
        WHERE store_id = p_store_id AND barcode = p_barcode;
        
        IF v_override_name IS NOT NULL THEN
            RETURN QUERY SELECT v_override_name, 'store_override'::TEXT, 1.0::NUMERIC;
            RETURN;
        END IF;
    END IF;
    
    -- Step 2: Check barcode_catalog
    SELECT bc.name, bc.source, bc.confidence_score
    INTO v_catalog_name, v_catalog_source, v_catalog_confidence
    FROM public.barcode_catalog bc
    WHERE bc.barcode = p_barcode
      AND (p_locale IS NULL OR bc.locale IS NULL OR bc.locale = p_locale);
    
    IF v_catalog_name IS NOT NULL THEN
        RETURN QUERY SELECT v_catalog_name, ('catalog_' || v_catalog_source)::TEXT, v_catalog_confidence;
        RETURN;
    END IF;
    
    -- Step 3: STUB - Return NULL (no external API yet)
    -- In the future, this will call an external barcode API
    -- and potentially cache the result in barcode_catalog
    RETURN QUERY SELECT NULL::TEXT, 'not_found'::TEXT, NULL::NUMERIC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.resolve_barcode_name IS 
'Resolves barcode to product name. Order: store override → catalog → NULL (stub for future API).';

-- ============================================================================
-- RPC FUNCTION: log_expiry_event
-- ============================================================================

-- Helper function to log expiry events with proper validation
CREATE OR REPLACE FUNCTION public.log_expiry_event(
    p_store_id UUID,
    p_batch_id UUID DEFAULT NULL,
    p_barcode TEXT DEFAULT NULL,
    p_product_name TEXT DEFAULT NULL,
    p_event_type TEXT DEFAULT NULL,
    p_event_source TEXT DEFAULT 'user',
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    -- Validate event_type
    IF p_event_type NOT IN ('SOLD_FINISHED', 'THROWN', 'UPDATED_DATE', 'EXPIRED_AUTO_ARCHIVED') THEN
        RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
    END IF;
    
    -- Validate event_source
    IF p_event_source NOT IN ('user', 'system') THEN
        RAISE EXCEPTION 'Invalid event_source: %', p_event_source;
    END IF;
    
    -- Insert the event
    INSERT INTO public.expiry_events (
        store_id,
        batch_id,
        barcode,
        product_name,
        event_type,
        event_source,
        metadata
    ) VALUES (
        p_store_id,
        p_batch_id,
        p_barcode,
        p_product_name,
        p_event_type,
        p_event_source,
        p_metadata
    )
    RETURNING id INTO v_event_id;
    
    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_expiry_event IS 
'Logs an expiry event for Level B savings tracking. Returns the event ID.';

-- ============================================================================
-- RPC FUNCTION: resolve_pending_item
-- ============================================================================

-- Function to resolve a pending item when a matching barcode is scanned with an expiry date
CREATE OR REPLACE FUNCTION public.resolve_pending_item(
    p_store_id UUID,
    p_barcode TEXT
)
RETURNS TABLE (
    pending_item_id UUID,
    raw_name TEXT,
    quantity INTEGER
) AS $$
DECLARE
    v_pending pending_items%ROWTYPE;
BEGIN
    -- Find the oldest unresolved pending item for this barcode
    SELECT * INTO v_pending
    FROM public.pending_items
    WHERE store_id = p_store_id
      AND barcode = p_barcode
      AND resolved_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_pending.id IS NOT NULL THEN
        -- Mark as resolved
        UPDATE public.pending_items
        SET resolved_at = now()
        WHERE id = v_pending.id;
        
        -- Return the pending item details
        RETURN QUERY SELECT v_pending.id, v_pending.raw_name, v_pending.quantity;
    END IF;
    
    -- No matching pending item found
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.resolve_pending_item IS 
'Resolves a pending supplier item when barcode is scanned with expiry date.';

-- ============================================================================
-- Grant execute permissions on functions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.user_has_store_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_barcode_name TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_expiry_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pending_item TO authenticated;

