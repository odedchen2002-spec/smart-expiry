import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { acceptInvitation, declineInvitation } from '@/lib/supabase/mutations/collaborations';
import {
  getActiveCollaborations,
  getPendingInvitations,
  type CollaborationWithOwner,
} from '@/lib/supabase/queries/collaborations';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  Text
} from 'react-native-paper';

// ROLE_LABELS will use translations from the component

export default function SharedWithMeScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);
  const { user } = useAuth();
  const { activeOwnerId, setActiveOwnerId, availableOwners, refresh: refreshOwner } = useActiveOwner();

  const [pendingInvitations, setPendingInvitations] = useState<CollaborationWithOwner[]>([]);
  const [activeCollaborations, setActiveCollaborations] = useState<CollaborationWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setPendingInvitations([]);
      setActiveCollaborations([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [pending, active] = await Promise.all([
        getPendingInvitations(user.id),
        getActiveCollaborations(user.id),
      ]);
      setPendingInvitations(pending);
      setActiveCollaborations(active);
    } catch (error) {
      console.error('Failed to load invitations/collaborations:', error);
      Alert.alert(
        t('common.error') || 'שגיאה',
        t('sharedWithMe.loadError') || 'לא ניתן לטעון את הנתונים. נסה שוב מאוחר יותר.'
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id, t]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const handleAccept = async (invitation: CollaborationWithOwner) => {
    if (!user?.id) return;

    const key = `accept-${invitation.collaboration.owner_id}`;
    setProcessing(key);

    try {
      await acceptInvitation(invitation.collaboration.owner_id, user.id);
      await fetchData();
      await refreshOwner();
      Alert.alert(
        t('common.success') || 'הצלחה',
        t('sharedWithMe.invitationAccepted') || 'ההזמנה אושרה בהצלחה!'
      );
    } catch (error) {
      console.error('Error accepting invitation:', error);
      Alert.alert(
        t('common.error') || 'שגיאה',
        t('sharedWithMe.acceptError') || 'לא ניתן לאשר את ההזמנה.'
      );
    } finally {
      setProcessing(null);
    }
  };

  const handleDecline = async (invitation: CollaborationWithOwner) => {
    if (!user?.id) return;

    Alert.alert(
      t('sharedWithMe.declineTitle') || 'דחיית הזמנה',
      t('sharedWithMe.declineMessage') || 'האם אתה בטוח שברצונך לדחות את ההזמנה?',
      [
        { text: t('common.cancel') || 'ביטול', style: 'cancel' },
        {
          text: t('sharedWithMe.decline') || 'דחה',
          style: 'destructive',
          onPress: async () => {
            const key = `decline-${invitation.collaboration.owner_id}`;
            setProcessing(key);

            try {
              await declineInvitation(invitation.collaboration.owner_id, user.id);
              await fetchData();
              Alert.alert(
                t('common.success') || 'הצלחה',
                t('sharedWithMe.invitationDeclined') || 'ההזמנה נדחתה.'
              );
            } catch (error) {
              console.error('Error declining invitation:', error);
              Alert.alert(
                t('common.error') || 'שגיאה',
                t('sharedWithMe.declineError') || 'לא ניתן לדחות את ההזמנה.'
              );
            } finally {
              setProcessing(null);
            }
          },
        },
      ]
    );
  };

  const handleSwitchOwner = async (ownerId: string) => {
    if (ownerId === activeOwnerId) return;

    try {
      await setActiveOwnerId(ownerId);
      await refreshOwner();

      // Show message that app needs to refresh
      Alert.alert(
        t('common.success') || 'הצלחה',
        t('sharedWithMe.needsRefresh') || 'עברת לחשבון אחר. האפליקציה תתרענן כדי לטעון את הנתונים החדשים.',
        [
          {
            text: t('common.ok') || 'אישור',
            onPress: () => {
              // Reload the app by navigating to root and forcing refresh
              router.replace('/');
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error switching owner:', error);
      Alert.alert(
        t('common.error') || 'שגיאה',
        t('sharedWithMe.switchError') || 'לא ניתן לעבור לבעלים הזה.'
      );
    }
  };

  const renderInvitation = (invitation: CollaborationWithOwner) => {
    const ownerName =
      invitation.ownerProfile?.username ||
      invitation.ownerProfile?.profile_name ||
      invitation.ownerProfile?.email ||
      'Unknown';

    const roleLabel =
      invitation.collaboration.role === 'editor'
        ? t('collaborators.roleEditor') || 'עורך'
        : t('collaborators.roleViewer') || 'צופה';

    const statusLabel = t('sharedWithMe.pending') || 'ממתין';

    return (
      <Card key={`inv-${invitation.collaboration.owner_id}`} style={styles.invitationCard}>
        <Card.Content style={styles.invitationCardContent}>
          <View style={[styles.invitationHeader, rtlContainer]}>
            <View style={styles.invitationIconContainer}>
              <MaterialCommunityIcons
                name="account-plus"
                size={24}
                color={THEME_COLORS.primary}
              />
            </View>
            <View style={styles.invitationInfo}>
              <Text variant="titleMedium" style={[styles.invitationName, rtlText]}>
                {ownerName}
              </Text>
              <View style={[styles.invitationMeta, rtlContainer]}>
                <Chip
                  mode="flat"
                  compact
                  style={[
                    styles.invitationRoleChip,
                    invitation.collaboration.role === 'editor' ? styles.roleChipEditor : styles.roleChipViewer
                  ]}
                  textStyle={styles.invitationRoleChipText}
                >
                  {roleLabel}
                </Chip>
                <Chip
                  mode="flat"
                  compact
                  style={[styles.invitationStatusChip, styles.statusChipPending]}
                  textStyle={[styles.invitationStatusChipText, styles.statusChipPendingText]}
                >
                  {statusLabel}
                </Chip>
              </View>
            </View>
          </View>
          <View style={[styles.invitationActions, rtlContainer]}>
            <Button
              mode="outlined"
              onPress={() => handleDecline(invitation)}
              disabled={processing !== null}
              style={styles.invitationActionButton}
              contentStyle={styles.invitationActionButtonContent}
              labelStyle={styles.invitationActionButtonLabel}
              textColor="#757575"
            >
              {t('sharedWithMe.decline') || 'דחה'}
            </Button>
            <Button
              mode="contained"
              onPress={() => handleAccept(invitation)}
              loading={processing === `accept-${invitation.collaboration.owner_id}`}
              disabled={processing !== null}
              style={styles.invitationActionButton}
              contentStyle={styles.invitationActionButtonContent}
              labelStyle={styles.invitationActionButtonLabel}
              buttonColor={THEME_COLORS.primary}
            >
              {t('sharedWithMe.accept') || 'אשר'}
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  };

  const renderActiveCollaboration = (collab: CollaborationWithOwner) => {
    const ownerName =
      collab.ownerProfile?.username ||
      collab.ownerProfile?.profile_name ||
      collab.ownerProfile?.email ||
      'Unknown';

    const roleLabel =
      collab.collaboration.role === 'editor'
        ? t('collaborators.roleEditor') || 'עורך'
        : t('collaborators.roleViewer') || 'צופה';
    const isActive = collab.collaboration.owner_id === activeOwnerId;

    return (
      <Card key={`active-${collab.collaboration.owner_id}`} style={[
        styles.collaborationCard,
        isActive && styles.activeCollaborationCard
      ]}>
        <Card.Content style={styles.collaborationCardContent}>
          <View style={[styles.collaborationRow, rtlContainer]}>
            <View style={styles.collaborationIconContainer}>
              <MaterialCommunityIcons
                name={collab.collaboration.role === 'editor' ? 'account-edit' : 'account-eye'}
                size={24}
                color={THEME_COLORS.primary}
              />
            </View>
            <View style={styles.collaborationInfo}>
              <Text variant="titleMedium" style={[styles.collaborationName, rtlText]}>
                {ownerName}
              </Text>
              <View style={[styles.collaborationMeta, rtlContainer]}>
                <Chip
                  mode="flat"
                  compact
                  style={[
                    styles.collaborationRoleChip,
                    collab.collaboration.role === 'editor' ? styles.roleChipEditor : styles.roleChipViewer
                  ]}
                  textStyle={styles.collaborationRoleChipText}
                >
                  {roleLabel}
                </Chip>
                {isActive && (
                  <Chip
                    mode="flat"
                    compact
                    style={styles.activeChip}
                    textStyle={styles.activeChipText}
                  >
                    {t('sharedWithMe.active') || 'פעיל'}
                  </Chip>
                )}
              </View>
            </View>
            {!isActive && (
              <Button
                mode="outlined"
                compact
                onPress={() => handleSwitchOwner(collab.collaboration.owner_id)}
                disabled={processing !== null}
                style={styles.switchButton}
                contentStyle={styles.switchButtonContent}
                labelStyle={styles.switchButtonLabel}
                textColor={THEME_COLORS.primary}
              >
                {t('sharedWithMe.switch') || 'עבור'}
              </Button>
            )}
          </View>
        </Card.Content>
      </Card>
    );
  };

  const renderMyAccount = () => {
    const myOwner = availableOwners.find((o) => o.isSelf);
    if (!myOwner) return null;

    const isActive = activeOwnerId === myOwner.id;
    const displayName = myOwner.profile.username || myOwner.profile.profile_name || user?.email || 'החשבון שלי';

    return (
      <Card style={[
        styles.collaborationCard,
        isActive && styles.activeCollaborationCard
      ]}>
        <Card.Content style={styles.collaborationCardContent}>
          <View style={[styles.collaborationRow, rtlContainer]}>
            <View style={styles.collaborationIconContainer}>
              <MaterialCommunityIcons
                name="account"
                size={24}
                color={THEME_COLORS.primary}
              />
            </View>
            <View style={styles.collaborationInfo}>
              <Text variant="titleMedium" style={[styles.collaborationName, rtlText]}>
                {displayName}
              </Text>
              <View style={[styles.collaborationMeta, rtlContainer]}>
                <Text variant="bodySmall" style={[styles.myAccountLabel, rtlText]}>
                  {t('sharedWithMe.myAccount') || 'החשבון שלי'}
                </Text>
                {isActive && (
                  <Chip
                    mode="flat"
                    compact
                    style={styles.activeChip}
                    textStyle={styles.activeChipText}
                  >
                    {t('sharedWithMe.active') || 'פעיל'}
                  </Chip>
                )}
              </View>
            </View>
            {!isActive && (
              <Button
                mode="outlined"
                compact
                onPress={() => handleSwitchOwner(myOwner.id)}
                disabled={processing !== null}
                style={styles.switchButton}
                contentStyle={styles.switchButtonContent}
                labelStyle={styles.switchButtonLabel}
                textColor={THEME_COLORS.primary}
              >
                {t('sharedWithMe.switch') || 'עבור'}
              </Button>
            )}
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#F5F5F5' }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('sharedWithMe.title') || 'שיתופים אליי'} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Pending Invitations Section */}
        <Card style={styles.sectionCard}>
          <Card.Content style={styles.sectionCardContent}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconContainer}>
                <MaterialCommunityIcons
                  name="bell-outline"
                  size={24}
                  color={THEME_COLORS.primary}
                />
              </View>
              <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                {t('sharedWithMe.pendingInvitations') || 'הזמנות ממתינות'}
              </Text>
            </View>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={THEME_COLORS.primary} />
              </View>
            ) : pendingInvitations.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons
                  name="bell-off-outline"
                  size={48}
                  color="#9E9E9E"
                />
                <Text variant="bodyMedium" style={[styles.emptyStateText, rtlText]}>
                  {t('sharedWithMe.noPendingInvitations') || 'אין הזמנות ממתינות.'}
                </Text>
              </View>
            ) : (
              <View style={styles.invitationsList}>
                {pendingInvitations.map(renderInvitation)}
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Active Collaborations Section */}
        <Card style={styles.sectionCard}>
          <Card.Content style={styles.sectionCardContent}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconContainer}>
                <MaterialCommunityIcons
                  name="account-group"
                  size={24}
                  color={THEME_COLORS.primary}
                />
              </View>
              <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                {t('sharedWithMe.activeCollaborations') || 'שיתופים פעילים'}
              </Text>
            </View>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={THEME_COLORS.primary} />
              </View>
            ) : (
              <View style={styles.collaborationsList}>
                {renderMyAccount()}
                {activeCollaborations.map(renderActiveCollaboration)}
                {activeCollaborations.length === 0 && !availableOwners.find((o) => o.isSelf) && (
                  <View style={styles.emptyState}>
                    <MaterialCommunityIcons
                      name="account-group-outline"
                      size={48}
                      color="#9E9E9E"
                    />
                    <Text variant="bodyMedium" style={[styles.emptyStateText, rtlText]}>
                      {t('sharedWithMe.noActiveCollaborations') || 'אין שיתופים פעילים.'}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#F8F9FA',
    },
    content: {
      padding: 16,
      paddingBottom: 24,
    },
    sectionCard: {
      marginBottom: 16,
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        android: {
          elevation: 2,
        },
      }),
    },
    sectionCardContent: {
      paddingVertical: 20,
      paddingHorizontal: 20,
    },
    sectionHeader: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      marginBottom: 20,
      gap: 12,
    },
    sectionIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${THEME_COLORS.primary}15`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#212121',
      letterSpacing: 0.2,
    },
    invitationsList: {
      gap: 12,
    },
    invitationCard: {
      borderRadius: 12,
      backgroundColor: '#FAFAFA',
      borderWidth: 1,
      borderColor: '#F0F0F0',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        },
        android: {
          elevation: 1,
        },
      }),
    },
    invitationCardContent: {
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    invitationHeader: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      marginBottom: 16,
      gap: 12,
    },
    invitationIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${THEME_COLORS.primary}15`,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    invitationInfo: {
      flex: 1,
      minWidth: 0,
    },
    invitationName: {
      fontSize: 16,
      fontWeight: '600',
      color: '#212121',
      marginBottom: 8,
    },
    invitationMeta: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    invitationRoleChip: {
      height: 24,
      paddingHorizontal: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    invitationRoleChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: THEME_COLORS.primary,
      textAlign: 'center',
      textAlignVertical: 'center',
      includeFontPadding: false,
      lineHeight: 23,
      paddingVertical: 0,
      marginTop: -1,
    },
    invitationStatusChip: {
      height: 24,
      paddingHorizontal: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    invitationStatusChipText: {
      fontSize: 12,
      fontWeight: '500',
      textAlign: 'center',
      textAlignVertical: 'center',
      includeFontPadding: false,
      lineHeight: 23,
      paddingVertical: 0,
      marginTop: -1,
    },
    statusChipPending: {
      backgroundColor: '#FFF3E0',
    },
    statusChipPendingText: {
      color: '#F57C00',
    },
    roleChipEditor: {
      backgroundColor: `${THEME_COLORS.primary}20`,
    },
    roleChipViewer: {
      backgroundColor: '#E3F2FD',
    },
    invitationActions: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      gap: 10,
    },
    invitationActionButton: {
      flex: 1,
      borderRadius: 10,
    },
    invitationActionButtonContent: {
      paddingVertical: 4,
    },
    invitationActionButtonLabel: {
      fontSize: 14,
      fontWeight: '600',
    },
    collaborationsList: {
      gap: 12,
    },
    collaborationCard: {
      borderRadius: 12,
      backgroundColor: '#FAFAFA',
      borderWidth: 1,
      borderColor: '#F0F0F0',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        },
        android: {
          elevation: 1,
        },
      }),
    },
    activeCollaborationCard: {
      backgroundColor: `${THEME_COLORS.primary}08`,
      borderColor: THEME_COLORS.primary,
      borderWidth: 2,
    },
    collaborationCardContent: {
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    collaborationRow: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 12,
    },
    collaborationIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${THEME_COLORS.primary}15`,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    collaborationInfo: {
      flex: 1,
      minWidth: 0,
    },
    collaborationName: {
      fontSize: 16,
      fontWeight: '600',
      color: '#212121',
      marginBottom: 8,
    },
    collaborationMeta: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    collaborationRoleChip: {
      height: 24,
      paddingHorizontal: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    collaborationRoleChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: THEME_COLORS.primary,
      textAlign: 'center',
      textAlignVertical: 'center',
      includeFontPadding: false,
      lineHeight: 20,
      paddingTop: 0,
      paddingBottom: 0,
      marginTop: 0,
    },
    myAccountLabel: {
      fontSize: 13,
      color: '#757575',
      fontWeight: '400',
    },
    activeChip: {
      height: 24,
      paddingHorizontal: 8,
      backgroundColor: '#E8F5E9',
      justifyContent: 'center',
      alignItems: 'center',
    },
    activeChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#2E7D32',
      textAlign: 'center',
      textAlignVertical: 'center',
      includeFontPadding: false,
      lineHeight: 20,
      paddingTop: 0,
      paddingBottom: 0,
      marginTop: 0,
    },
    switchButton: {
      borderRadius: 10,
      flexShrink: 0,
    },
    switchButtonContent: {
      paddingVertical: 4,
      paddingHorizontal: 12,
    },
    switchButtonLabel: {
      fontSize: 13,
      fontWeight: '600',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      paddingHorizontal: 20,
    },
    emptyStateText: {
      marginTop: 16,
      color: '#757575',
      textAlign: 'center',
      fontSize: 14,
    },
    center: {
      paddingVertical: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

