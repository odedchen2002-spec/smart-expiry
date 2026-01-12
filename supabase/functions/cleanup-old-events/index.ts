/**
 * Supabase Edge Function: Cleanup Old Events
 * 
 * Purpose:
 * - Automatically delete expiry_events older than 1 year
 * - Keeps database size manageable
 * - Runs daily via Supabase Cron Job
 * 
 * Schedule:
 * - Run once daily at 2:00 AM (adjust in Supabase dashboard)
 * - Cron expression: "0 2 * * *"
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate cutoff date (1 year ago from now)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const cutoffDate = oneYearAgo.toISOString();

    console.log(`[cleanup-old-events] Starting cleanup for events older than ${cutoffDate}`);

    // Delete expiry_events older than 1 year
    const { data, error, count } = await supabase
      .from('expiry_events')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffDate);

    if (error) {
      console.error('[cleanup-old-events] Error deleting old events:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          cutoffDate,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const deletedCount = count || 0;
    console.log(`[cleanup-old-events] Successfully deleted ${deletedCount} old events`);

    return new Response(
      JSON.stringify({
        success: true,
        deletedCount,
        cutoffDate,
        message: `Deleted ${deletedCount} expiry_events older than ${cutoffDate}`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('[cleanup-old-events] Unexpected error:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
