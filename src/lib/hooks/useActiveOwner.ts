/**
 * Hook for managing active owner context
 * Handles owner/collaborator model where users can own products or collaborate on others' products
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from './useProfile';
import { supabase } from '../supabase/client';
import type { Database } from '@/types/database';
import { getActiveCollaborations } from '../supabase/queries/collaborations';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Collaboration = Database['public']['Tables']['collaborations']['Row'];

export interface OwnerProfile extends Profile {
  username: string | null;
  profile_name?: string | null;
  email?: string | null;
}

export interface AvailableOwner {
  id: string;
  profile: OwnerProfile;
  isSelf: boolean;
}

const ACTIVE_OWNER_ID_KEY = 'active_owner_id';

export function useActiveOwner() {
  const { user } = useAuth();
  const { profile: selfProfileData } = useProfile();
  const [activeOwnerId, setActiveOwnerIdState] = useState<string | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(true);
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [availableOwners, setAvailableOwners] = useState<AvailableOwner[]>([]);
  const [collaborationRole, setCollaborationRole] = useState<'editor' | 'viewer' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load activeOwnerId from storage
  const loadActiveOwnerId = useCallback(async (): Promise<string | null> => {
    try {
      const stored = await AsyncStorage.getItem(ACTIVE_OWNER_ID_KEY);
      return stored || null;
    } catch (err) {
      console.error('Error loading activeOwnerId from storage:', err);
      return null;
    }
  }, []);

  // Save activeOwnerId to storage
  const saveActiveOwnerId = useCallback(async (ownerId: string | null) => {
    try {
      if (ownerId) {
        await AsyncStorage.setItem(ACTIVE_OWNER_ID_KEY, ownerId);
      } else {
        await AsyncStorage.removeItem(ACTIVE_OWNER_ID_KEY);
      }
    } catch (err) {
      console.error('Error saving activeOwnerId to storage:', err);
    }
  }, []);

  // Fetch owner profile
  const fetchOwnerProfile = useCallback(
    async (ownerId: string) => {
      if (!user?.id) return;

      try {
        if (ownerId === user.id) {
          // Owner is the current user - use their profile
          if (selfProfileData) {
            setOwnerProfile({
              ...selfProfileData,
              username: (selfProfileData as any).username || (selfProfileData as any).profile_name || '',
            } as OwnerProfile);
          } else {
            // Fetch from database
            const { data: currentProfile, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', user.id)
              .maybeSingle();

            if (profileError) {
              console.error('Error fetching current profile:', profileError);
              return;
            }

            if (currentProfile) {
              setOwnerProfile({
                ...currentProfile,
                username: (currentProfile as any).username || (currentProfile as any).profile_name || '',
              } as OwnerProfile);
            }
          }
        } else {
          // Fetch the owner's profile
          const { data: ownerProf, error: ownerError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', ownerId)
            .maybeSingle();

          if (ownerError) {
            console.error('Error fetching owner profile:', ownerError);
            return;
          }

          if (ownerProf) {
            setOwnerProfile({
              ...ownerProf,
              username: (ownerProf as any).username || (ownerProf as any).profile_name || '',
            } as OwnerProfile);
          } else {
            setOwnerProfile(null);
          }
        }
      } catch (err) {
        console.error('Exception in fetchOwnerProfile:', err);
      }
    },
    [user?.id, selfProfileData]
  );

  // Set active owner (public API)
  const setActiveOwnerId = useCallback(
    async (ownerId: string | null) => {
      if (!user?.id) return;

      const finalOwnerId = ownerId || user.id;
      const isUserOwner = finalOwnerId === user.id;

      // Validate that ownerId is either user.id or an active collaboration
      if (!isUserOwner) {
        // Check both availableOwners and collaborations to ensure we have the latest data
        const isValidInOwners = availableOwners.some((o) => o.id === finalOwnerId);
        const isValidInCollaborations = collaborations.some((c) => c.owner_id === finalOwnerId && c.status === 'active');
        
        if (!isValidInOwners && !isValidInCollaborations) {
          // If not found in either, try refreshing available owners first
          // This handles the case where availableOwners might be stale
          const { data: collabsWithOwners } = await getActiveCollaborations(user.id);
          const refreshedCollabs = collabsWithOwners.map((c) => c.collaboration);
          const isValidInRefreshed = refreshedCollabs.some((c) => c.owner_id === finalOwnerId && c.status === 'active');
          
          if (!isValidInRefreshed) {
            console.error('Invalid ownerId:', finalOwnerId);
            return;
          }
        }

        // Determine collaboration role
        const activeCollab = collaborations.find((c) => c.owner_id === finalOwnerId && c.member_id === user.id);
        if (activeCollab) {
          setCollaborationRole(activeCollab.role as 'editor' | 'viewer');
        } else {
          setCollaborationRole(null);
        }
      } else {
        setCollaborationRole(null);
      }

      await saveActiveOwnerId(finalOwnerId === user.id ? null : finalOwnerId);
      setActiveOwnerIdState(finalOwnerId);
      setIsOwner(isUserOwner);
      await fetchOwnerProfile(finalOwnerId);
    },
    [user?.id, availableOwners, collaborations, saveActiveOwnerId, fetchOwnerProfile]
  );

  const fetchActiveOwner = useCallback(async () => {
    if (!user?.id) {
      setActiveOwnerIdState(null);
      setOwnerProfile(null);
      setIsOwner(true);
      setCollaborations([]);
      setAvailableOwners([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch current user's profile
      const { data: currentProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching current profile:', profileError);
        setError(profileError as Error);
        return;
      }

      if (!currentProfile) {
        // Profile doesn't exist yet - user is the owner of their own account
        const defaultOwnerId = user.id;
        setActiveOwnerIdState(defaultOwnerId);
        setIsOwner(true);
        setCollaborations([]);
        setAvailableOwners([
          {
            id: user.id,
            profile: {
              id: user.id,
              email: user.email || null,
              username: null,
              profile_name: null,
            } as OwnerProfile,
            isSelf: true,
          },
        ]);
        await saveActiveOwnerId(null); // Clear storage, use default
        setLoading(false);
        return;
      }

      const selfProfile: OwnerProfile = {
        ...currentProfile,
        username: (currentProfile as any).username || (currentProfile as any).profile_name || '',
      };

      // 2. Fetch active collaborations where user is a member
      let activeCollabs: Collaboration[] = [];
      try {
        const collabsWithOwners = await getActiveCollaborations(user.id);
        activeCollabs = collabsWithOwners.map((c) => c.collaboration);
      } catch (collabError) {
        console.error('Error fetching collaborations:', collabError);
        // Don't fail completely - user might not have any collaborations
      }

      setCollaborations(activeCollabs);

      // 3. Build available owners list (self + active collaborations)
      const owners: AvailableOwner[] = [
        {
          id: user.id,
          profile: selfProfile,
          isSelf: true,
        },
      ];

      // Add owners from active collaborations
      for (const collab of activeCollabs) {
        const { data: ownerProf } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', collab.owner_id)
          .maybeSingle();

        if (ownerProf) {
          owners.push({
            id: collab.owner_id,
            profile: {
              ...ownerProf,
              username: (ownerProf as any).username || (ownerProf as any).profile_name || '',
            } as OwnerProfile,
            isSelf: false,
          });
        }
      }

      setAvailableOwners(owners);

      // 4. Determine active owner from storage or default
      const storedOwnerId = await loadActiveOwnerId();
      let ownerId: string;
      let isUserOwner: boolean;

      if (storedOwnerId && owners.some((o) => o.id === storedOwnerId)) {
        // Use stored ownerId if it's valid
        ownerId = storedOwnerId;
        isUserOwner = storedOwnerId === user.id;
      } else {
        // Default to user's own account
        ownerId = user.id;
        isUserOwner = true;
        await saveActiveOwnerId(null); // Clear invalid stored value
      }

      setActiveOwnerIdState(ownerId);
      setIsOwner(isUserOwner);

      // 5. Determine collaboration role if user is not the owner
      if (!isUserOwner) {
        const activeCollab = activeCollabs.find((c) => c.owner_id === ownerId && c.member_id === user.id);
        if (activeCollab) {
          setCollaborationRole(activeCollab.role as 'editor' | 'viewer');
        } else {
          setCollaborationRole(null);
        }
      } else {
        setCollaborationRole(null);
      }

      // 6. Fetch owner profile
      await fetchOwnerProfile(ownerId);
    } catch (err) {
      const error = err as Error;
      console.error('Exception in fetchActiveOwner:', error);
      setError(error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, loadActiveOwnerId, saveActiveOwnerId, fetchOwnerProfile]);

  useEffect(() => {
    fetchActiveOwner();
  }, [fetchActiveOwner]);

  const refresh = useCallback(async () => {
    await fetchActiveOwner();
  }, [fetchActiveOwner]);

  const leaveCollaboration = useCallback(async () => {
    if (!user?.id || !activeOwnerId || isOwner) {
      return { success: false, error: 'Cannot leave - user is the owner' };
    }

    try {
      const { error } = await supabase
        .from('collaborations')
        .delete()
        .eq('owner_id', activeOwnerId)
        .eq('member_id', user.id);

      if (error) {
        console.error('Error leaving collaboration:', error);
        return { success: false, error };
      }

      // Switch to user's own account
      await setActiveOwnerId(user.id);
      await refresh();
      return { success: true };
    } catch (err) {
      const error = err as Error;
      console.error('Exception leaving collaboration:', error);
      return { success: false, error };
    }
  }, [user?.id, activeOwnerId, isOwner, setActiveOwnerId, refresh]);

  // Build selfProfile from current profile data
  const selfProfile: OwnerProfile | null = selfProfileData
    ? {
        ...selfProfileData,
        username: (selfProfileData as any).username || (selfProfileData as any).profile_name || '',
      }
    : null;

  // activeOwnerProfile is the profile of the currently selected owner
  const activeOwnerProfile = ownerProfile;

  // Determine if current user is a viewer
  const isViewer = !isOwner && collaborationRole === 'viewer';

  return {
    activeOwnerId,
    ownerProfile: activeOwnerProfile,
    selfProfile,
    activeOwnerProfile,
    isOwner,
    isViewer,
    collaborationRole,
    collaborations,
    availableOwners,
    loading,
    error,
    refresh,
    leaveCollaboration,
    setActiveOwnerId,
  };
}
