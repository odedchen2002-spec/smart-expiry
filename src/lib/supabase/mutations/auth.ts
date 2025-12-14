/**
 * Account deletion functions
 */

import { supabase } from '@/lib/supabase/client';

/**
 * Delete user account permanently
 * Deletes all user-related data directly from the database
 */
export async function deleteUserAccount(): Promise<void> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user?.id) {
    console.error('deleteUserAccount: no valid session', error);
    throw new Error('No valid session');
  }

  const userId = session.user.id;
  console.log('deleteUserAccount: Starting deletion for user:', userId);

  try {
    // Delete items (using business_id which is the profile/user id)
    console.log('deleteUserAccount: Deleting items...');
    const { error: itemsError } = await supabase
      .from('items')
      .delete()
      .eq('business_id', userId);
    
    if (itemsError) {
      console.error('deleteUserAccount: Error deleting items', itemsError);
      // Continue even if some deletions fail
    }

    // Delete products
    console.log('deleteUserAccount: Deleting products...');
    const { error: productsError } = await supabase
      .from('products')
      .delete()
      .eq('business_id', userId);
    
    if (productsError) {
      console.error('deleteUserAccount: Error deleting products', productsError);
    }

    // Delete locations
    console.log('deleteUserAccount: Deleting locations...');
    const { error: locationsError } = await supabase
      .from('locations')
      .delete()
      .eq('business_id', userId);
    
    if (locationsError) {
      console.error('deleteUserAccount: Error deleting locations', locationsError);
    }

    // Delete collaborations where user is owner or member
    console.log('deleteUserAccount: Deleting collaborations...');
    const { error: collaborationsOwnerError } = await supabase
      .from('collaborations')
      .delete()
      .eq('owner_id', userId);
    
    if (collaborationsOwnerError) {
      console.error('deleteUserAccount: Error deleting collaborations (owner)', collaborationsOwnerError);
    }

    const { error: collaborationsMemberError } = await supabase
      .from('collaborations')
      .delete()
      .eq('member_id', userId);
    
    if (collaborationsMemberError) {
      console.error('deleteUserAccount: Error deleting collaborations (member)', collaborationsMemberError);
    }

    // Delete notification logs
    console.log('deleteUserAccount: Deleting notification logs...');
    const { error: notificationsError } = await supabase
      .from('notification_sent_log')
      .delete()
      .eq('user_id', userId);
    
    if (notificationsError) {
      console.error('deleteUserAccount: Error deleting notification logs', notificationsError);
    }

    // Also delete by owner_id in case it exists
    const { error: notificationsOwnerError } = await supabase
      .from('notification_sent_log')
      .delete()
      .eq('owner_id', userId);
    
    if (notificationsOwnerError) {
      console.error('deleteUserAccount: Error deleting notification logs (owner_id)', notificationsOwnerError);
    }

    // Delete events
    console.log('deleteUserAccount: Deleting events...');
    const { error: eventsError } = await supabase
      .from('events')
      .delete()
      .eq('business_id', userId);
    
    if (eventsError) {
      console.error('deleteUserAccount: Error deleting events', eventsError);
    }

    // Delete events by actor_uid (user who created them)
    const { error: eventsActorError } = await supabase
      .from('events')
      .delete()
      .eq('actor_uid', userId);
    
    if (eventsActorError) {
      console.error('deleteUserAccount: Error deleting events (actor)', eventsActorError);
    }

    // Finally delete profile - verify it was actually deleted
    console.log('deleteUserAccount: Deleting profile...');
    const { error: profileError, data: deletedProfiles } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)
      .select('id');
    
    console.log('deleteUserAccount: deleted profiles', deletedProfiles);
    
    if (profileError) {
      console.error('deleteUserAccount: failed to delete profile', profileError);
      throw new Error(`Failed to delete profile: ${profileError.message}`);
    }

    // Verify that a profile was actually deleted
    if (!deletedProfiles || deletedProfiles.length === 0) {
      console.error('deleteUserAccount: No profile was deleted - profile may not exist');
      throw new Error('Profile deletion failed: No profile found to delete');
    }

    console.log('deleteUserAccount: Profile deleted successfully, deleted count:', deletedProfiles.length);
    console.log('deleteUserAccount: All data deleted successfully');
  } catch (error: any) {
    console.error('deleteUserAccount: Unexpected error during deletion', error);
    throw new Error('Failed to delete account data');
  }
}

