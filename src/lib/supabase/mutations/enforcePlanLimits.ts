/**
 * Call the Postgres function to enforce plan limits
 * This replaces the TypeScript implementation to bypass RLS
 */

import { supabase } from '../client';

// In-memory lock to prevent concurrent execution for the same user
const enforceLocks = new Map<string, boolean>();

export async function enforcePlanLimitAfterCreate(ownerId: string) {
    // Check if already running for this owner
    if (enforceLocks.get(ownerId)) {
        console.log(`[enforcePlanLimit] Already running for owner ${ownerId}, skipping...`);
        return;
    }

    // Set lock
    enforceLocks.set(ownerId, true);

    try {
        console.log(`[enforcePlanLimit] Calling Postgres function for owner:`, ownerId);

        // Call the Postgres function that bypasses RLS
        const { data, error } = await supabase.rpc('enforce_plan_limits', {
            p_owner_id: ownerId
        });

        if (error) {
            console.error('[enforcePlanLimit] Error calling enforce_plan_limits:', error);
            return;
        }

        if (data) {
            console.log('[enforcePlanLimit] Result:', data.message);
            console.log('[enforcePlanLimit] Details:', {
                tier: data.tier,
                limit: data.limit,
                total: data.total,
                locked: data.locked
            });
        }
    } catch (error) {
        console.error('[enforcePlanLimit] Exception while enforcing plan limit:', error);
    } finally {
        // Release lock
        enforceLocks.delete(ownerId);
    }
}
