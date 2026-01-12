// Supabase Edge Function: cleanup-expired-items
// Runs daily to delete expired items based on user retention settings
// Similar to check-expiring-items but for cleanup

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all owners with their retention settings
    // Default is 7 days if not set
    const { data: owners, error: ownersError } = await supabase
      .from('profiles')
      .select('id')
      .not('id', 'is', null);

    if (ownersError) {
      console.error('Error fetching owners:', ownersError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch owners' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let totalDeleted = 0;
    const results = [];

    for (const owner of owners || []) {
      try {
        // Get retention days from owner's settings (stored in metadata or separate table)
        // For now, we'll query items directly - you can enhance this with a settings table
        const DEFAULT_RETENTION_DAYS = 7;
        
        // Note: In production, you should store retention_days in profiles table
        // For now, we use the default or you can add a column:
        // ALTER TABLE profiles ADD COLUMN retention_days INTEGER DEFAULT 7;
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('retention_days')
          .eq('id', owner.id)
          .maybeSingle();
        
        const retentionDays = profile?.retention_days || DEFAULT_RETENTION_DAYS;
        
        if (retentionDays <= 0) {
          continue; // Auto-delete disabled for this owner
        }

        // Calculate cutoff date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const cutoffDate = new Date(today);
        cutoffDate.setDate(today.getDate() - retentionDays);
        const cutoffDateISO = cutoffDate.toISOString().split('T')[0];

        // Find expired items to delete
        const { data: itemsToDelete, error: fetchError } = await supabase
          .from('items')
          .select('id, product_id, owner_id, expiry_date, barcode_snapshot')
          .eq('owner_id', owner.id)
          .lt('expiry_date', cutoffDateISO)
          .neq('status', 'resolved');

        if (fetchError || !itemsToDelete || itemsToDelete.length === 0) {
          continue;
        }

        // Fetch product names for logging
        const productIds = [...new Set(itemsToDelete.map(item => item.product_id).filter(Boolean))];
        let productsMap = new Map();

        if (productIds.length > 0) {
          const { data: products } = await supabase
            .from('products')
            .select('id, name')
            .in('id', productIds);

          if (products) {
            productsMap = new Map(products.map((p: any) => [p.id, p.name]));
          }
        }

        // Log EXPIRED_AUTO_ARCHIVED events
        try {
          const eventsToLog = itemsToDelete.map((item: any) => ({
            owner_id: owner.id,
            event_type: 'EXPIRED_AUTO_ARCHIVED',
            barcode: item.barcode_snapshot,
            product_name: item.product_id ? productsMap.get(item.product_id) : null,
            expiry_date: item.expiry_date,
            created_at: new Date().toISOString(),
          }));

          await supabase.from('expiry_events').insert(eventsToLog);
        } catch (logError) {
          console.error('Error logging events:', logError);
        }

        // Delete items
        const itemIds = itemsToDelete.map(item => item.id);
        const { error: deleteError } = await supabase
          .from('items')
          .delete()
          .in('id', itemIds);

        if (!deleteError) {
          totalDeleted += itemIds.length;
          results.push({
            ownerId: owner.id,
            deleted: itemIds.length,
            retentionDays,
          });
        }
      } catch (ownerError) {
        console.error(`Error processing owner ${owner.id}:`, ownerError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalDeleted,
        ownersProcessed: results.length,
        results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in cleanup function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
