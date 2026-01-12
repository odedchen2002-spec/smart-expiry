import { supabase } from '../client';
import type { Database } from '@/types/database';

export type CollaborationRow = Database['public']['Tables']['collaborations']['Row'];

export interface CollaborationWithMember {
  collaboration: CollaborationRow;
  memberProfile?: {
    id: string;
    email?: string | null;
    profile_name?: string | null;
  } | null;
}

export interface CollaborationWithOwner {
  collaboration: CollaborationRow;
  ownerProfile?: {
    id: string;
    email?: string | null;
    profile_name?: string | null;
  } | null;
}

/**
 * Fetch collaborations for an owner and hydrate member profile details.
 */
export async function getCollaborationsByOwner(ownerId: string): Promise<CollaborationWithMember[]> {
  const { data, error } = await supabase
    .from('collaborations')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching collaborations:', error);
    throw error;
  }

  const collaborations = data ?? [];
  const memberIds = Array.from(new Set(collaborations.map((c) => c.member_id)));

  let memberProfilesMap = new Map<string, CollaborationWithMember['memberProfile']>();

  if (memberIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, profile_name')
      .in('id', memberIds);

    if (profileError) {
      console.error('Error fetching member profiles:', profileError);
      throw profileError;
    }

    (profiles ?? []).forEach((profile) => {
      memberProfilesMap.set(profile.id, profile);
    });
  }

  return collaborations.map((collaboration) => ({
    collaboration,
    memberProfile: memberProfilesMap.get(collaboration.member_id),
  }));
}

/**
 * Fetch pending invitations for the current user (member side).
 */
export async function getPendingInvitations(memberId: string): Promise<CollaborationWithOwner[]> {
  const { data, error } = await supabase
    .from('collaborations')
    .select('*')
    .eq('member_id', memberId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending invitations:', error);
    throw error;
  }

  const invitations = data ?? [];
  const ownerIds = Array.from(new Set(invitations.map((i) => i.owner_id)));

  let ownerProfilesMap = new Map<string, CollaborationWithOwner['ownerProfile']>();

  if (ownerIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, profile_name')
      .in('id', ownerIds);

    if (profileError) {
      console.error('Error fetching owner profiles:', profileError);
      throw profileError;
    }

    (profiles ?? []).forEach((profile) => {
      ownerProfilesMap.set(profile.id, profile);
    });
  }

  return invitations.map((invitation) => ({
    collaboration: invitation,
    ownerProfile: ownerProfilesMap.get(invitation.owner_id),
  }));
}

/**
 * Check if an error is a network-related error
 */
function isNetworkError(error: any): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() || '';
  return (
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('offline') ||
    error.code === 'NETWORK_ERROR'
  );
}

/**
 * Fetch active collaborations for the current user (member side).
 */
export async function getActiveCollaborations(memberId: string): Promise<CollaborationWithOwner[]> {
  const { data, error } = await supabase
    .from('collaborations')
    .select('*')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    // Network errors - log as warning and return empty (graceful degradation)
    if (isNetworkError(error)) {
      console.warn('[Collaborations] Network error - returning empty:', error.message);
      return [];
    }
    console.error('Error fetching active collaborations:', error);
    throw error;
  }

  const collaborations = data ?? [];
  const ownerIds = Array.from(new Set(collaborations.map((c) => c.owner_id)));

  let ownerProfilesMap = new Map<string, CollaborationWithOwner['ownerProfile']>();

  if (ownerIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, profile_name')
      .in('id', ownerIds);

    if (profileError) {
      console.error('Error fetching owner profiles:', profileError);
      throw profileError;
    }

    (profiles ?? []).forEach((profile) => {
      ownerProfilesMap.set(profile.id, profile);
    });
  }

  return collaborations.map((collaboration) => ({
    collaboration,
    ownerProfile: ownerProfilesMap.get(collaboration.owner_id),
  }));
}

