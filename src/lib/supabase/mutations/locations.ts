/**
 * Location mutations for Supabase
 */

import { supabase } from '../client';
import type { Database } from '@/types/database';

type LocationInsert = Database['public']['Tables']['locations']['Insert'];
type LocationUpdate = Database['public']['Tables']['locations']['Update'];

/**
 * Create a new location
 */
export async function createLocation(
  location: LocationInsert
): Promise<Database['public']['Tables']['locations']['Row']> {
  const { data, error } = await supabase
    .from('locations')
    .insert(location)
    .select()
    .single();

  if (error) {
    console.error('Error creating location:', error);
    throw error;
  }

  return data;
}

/**
 * Update a location
 */
export async function updateLocation(
  locationId: string,
  updates: LocationUpdate
): Promise<Database['public']['Tables']['locations']['Row']> {
  const { data, error } = await supabase
    .from('locations')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', locationId)
    .select()
    .single();

  if (error) {
    console.error('Error updating location:', error);
    throw error;
  }

  return data;
}

/**
 * Delete a location
 */
export async function deleteLocation(locationId: string): Promise<void> {
  const { error } = await supabase
    .from('locations')
    .delete()
    .eq('id', locationId);

  if (error) {
    console.error('Error deleting location:', error);
    throw error;
  }
}

/**
 * Reorder locations
 */
export async function reorderLocations(
  locationIds: string[],
  ownerId: string
): Promise<void> {
  // Update display_order for each location based on its position in the array
  const updates = locationIds.map((id, index) =>
    supabase
      .from('locations')
      .update({ display_order: index })
      .eq('id', id)
      .eq('owner_id', ownerId)
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    console.error('Error reordering locations:', errors);
    throw new Error('Failed to reorder locations');
  }
}

