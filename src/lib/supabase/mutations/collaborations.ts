import { supabase } from '../client';

type InviteResult =
  | { type: 'success' }
  | { type: 'not_found' }
  | { type: 'self' }
  | { type: 'error'; error: unknown };

export async function inviteCollaborator(email: string, role: 'editor' | 'viewer'): Promise<InviteResult> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;

  if (authError || !user) {
    console.error('inviteCollaborator: no auth user', authError);
    return { type: 'error', error: 'not_authenticated' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { type: 'error', error: new Error('Email is required') };
  }

  // Look up profile by email (case-insensitive, but avoid PostgREST single-row errors)
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')
    .ilike('email', normalizedEmail);

  console.log('inviteCollaborator: profile lookup result', { profiles, profileError });

  if (profileError) {
    console.error('inviteCollaborator: profile lookup error', profileError);
    return { type: 'error', error: profileError };
  }

  if (!profiles || profiles.length === 0) {
    return { type: 'not_found' };
  }

  // If multiple profiles share the same email, pick the first one but log a warning
  if (profiles.length > 1) {
    console.warn('inviteCollaborator: multiple profiles found for email, using first result', {
      normalizedEmail,
      count: profiles.length,
    });
  }

  const profile = profiles[0];

  if (profile.id === user.id) {
    return { type: 'self' };
  }

  const { error: insertError } = await supabase
    .from('collaborations')
    .insert({
      owner_id: user.id,
      member_id: profile.id,
      role,
      status: 'pending',
    });

  console.log('inviteCollaborator: insert result', { insertError });

  if (insertError) {
    return { type: 'error', error: insertError };
  }

  return { type: 'success' };
}

/**
 * Remove a collaborator (owner only).
 */
export async function removeCollaborator(ownerId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('collaborations')
    .delete()
    .eq('owner_id', ownerId)
    .eq('member_id', memberId);

  if (error) {
    console.error('Error removing collaborator:', error);
    throw error;
  }
}

/**
 * Accept a pending invitation (member only).
 */
export async function acceptInvitation(ownerId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('collaborations')
    .update({ status: 'active' })
    .eq('owner_id', ownerId)
    .eq('member_id', memberId)
    .eq('status', 'pending');

  if (error) {
    console.error('Error accepting invitation:', error);
    throw error;
  }
}

/**
 * Decline a pending invitation (member only).
 * Deletes the collaboration row.
 */
export async function declineInvitation(ownerId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('collaborations')
    .delete()
    .eq('owner_id', ownerId)
    .eq('member_id', memberId)
    .eq('status', 'pending');

  if (error) {
    console.error('Error declining invitation:', error);
    throw error;
  }
}

/**
 * Update collaborator role (owner only).
 */
export async function updateCollaboratorRole(
  ownerId: string,
  memberId: string,
  newRole: 'editor' | 'viewer'
): Promise<void> {
  const { error } = await supabase
    .from('collaborations')
    .update({ role: newRole })
    .eq('owner_id', ownerId)
    .eq('member_id', memberId);

  if (error) {
    console.error('Error updating collaborator role:', error);
    throw error;
  }
}

