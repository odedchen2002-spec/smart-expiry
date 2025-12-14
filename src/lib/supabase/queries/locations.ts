import { supabase } from '../client';

export interface Location {
  id: string;
  owner_id?: string; // New field
  business_id?: string; // Legacy field
  name: string;
  display_order: number;
}

/**
 * Get or create a default location for an owner
 */
export async function getOrCreateDefaultLocation(ownerId: string): Promise<string> {
  // Try to find an existing location by owner_id
  const { data: existing, error: fetchError } = await supabase
    .from('locations')
    .select('id')
    .eq('owner_id', ownerId)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return existing.id;
  }

  // If no location exists, create a default one
  const { data: created, error: createError } = await supabase
    .from('locations')
    .insert({
      owner_id: ownerId,
      name: 'Default',
      display_order: 0,
    } as any)
    .select('id')
    .single();

  if (createError || !created) {
    throw new Error(`Failed to create default location: ${createError?.message || 'Unknown error'}`);
  }

  return created.id;
}

