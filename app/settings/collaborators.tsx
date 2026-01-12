import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { inviteCollaborator, removeCollaborator, updateCollaboratorRole } from '@/lib/supabase/mutations/collaborations';
import { getCollaborationsByOwner, type CollaborationWithMember } from '@/lib/supabase/queries/collaborations';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Card, Chip, IconButton, Text, TextInput } from 'react-native-paper';


export default function CollaboratorsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);
  const { activeOwnerId, isOwner, ownerProfile, loading: ownerLoading } = useActiveOwner();

  const [collaborators, setCollaborators] = useState<CollaborationWithMember[]>([]);
  const [loading, setLoading] = useState(false); // Show page immediately, load data in background
  const [refreshing, setRefreshing] = useState(false); // For pull-to-refresh
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [submitting, setSubmitting] = useState(false);

  const fetchCollaborators = useCallback(async (isRefreshing = false) => {
    if (!activeOwnerId || !isOwner) {
      setCollaborators([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      // Set appropriate loading state
      if (isRefreshing) {
        setRefreshing(true);
      }
      
      const data = await getCollaborationsByOwner(activeOwnerId);
      setCollaborators(data);
    } catch (error) {
      console.error('Failed to load collaborators:', error);
      Alert.alert(
        t('common.error') || 'שגיאה',
        t('collaborators.loadError') || 'לא ניתן לטעון את רשימת המשתפים. נסה שוב מאוחר יותר.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeOwnerId, isOwner, t]);

  useFocusEffect(
    useCallback(() => {
      fetchCollaborators(false);
    }, [fetchCollaborators])
  );

  const handleRefresh = useCallback(() => {
    fetchCollaborators(true);
  }, [fetchCollaborators]);

  useEffect(() => {
    if (!ownerLoading && !isOwner) {
      Alert.alert(
        t('collaborators.notOwnerTitle') || 'אין לך הרשאה',
        t('collaborators.notOwnerDesc') || 'רק הבעלים של החשבון יכולים לנהל משתפי פעולה.',
        [{ text: t('common.ok') || 'אישור', onPress: () => router.back() }]
      );
    }
  }, [ownerLoading, isOwner, router, t]);

  const handleRemove = (memberId: string, displayName: string) => {
    Alert.alert(
      t('collaborators.removeTitle') || 'הסרת משתף פעולה',
      (t('collaborators.removeMessage') || 'האם להסיר את {{name}} מהרשימה?').replace('{{name}}', displayName),
      [
        { text: t('common.cancel') || 'ביטול', style: 'cancel' },
        {
          text: t('common.delete') || 'מחק',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!activeOwnerId) return;
              await removeCollaborator(activeOwnerId, memberId);
              fetchCollaborators(false);
            } catch (error) {
              console.error('Error removing collaborator:', error);
              Alert.alert(
                t('common.error') || 'שגיאה',
                t('collaborators.removeError') || 'לא ניתן להסיר את המשתף'
              );
            }
          },
        },
      ]
    );
  };

  const handleChangeRole = (memberId: string, displayName: string, currentRole: 'editor' | 'viewer') => {
    const newRole = currentRole === 'editor' ? 'viewer' : 'editor';
    const newRoleLabel = newRole === 'editor'
      ? (t('collaborators.roleEditor') || 'עורך')
      : (t('collaborators.roleViewer') || 'צופה');

    Alert.alert(
      t('collaborators.changeRoleTitle') || 'שינוי הרשאות',
      (t('collaborators.changeRoleMessage') || 'האם לשנות את ההרשאות של {{name}} ל{{role}}?')
        .replace('{{name}}', displayName)
        .replace('{{role}}', newRoleLabel),
      [
        { text: t('common.cancel') || 'ביטול', style: 'cancel' },
        {
          text: t('common.confirm') || 'אישור',
          onPress: async () => {
            try {
              if (!activeOwnerId) return;
              await updateCollaboratorRole(activeOwnerId, memberId, newRole);
              fetchCollaborators(false);
              Alert.alert(
                t('common.success') || 'בוצע',
                t('collaborators.roleChanged') || 'ההרשאות עודכנו בהצלחה'
              );
            } catch (error) {
              console.error('Error changing role:', error);
              Alert.alert(
                t('common.error') || 'שגיאה',
                t('collaborators.changeRoleError') || 'לא ניתן לשנות את ההרשאות'
              );
            }
          },
        },
      ]
    );
  };

  const handleInvite = async () => {
    setSubmitting(true);
    const result = await inviteCollaborator(inviteEmail, inviteRole);

    switch (result.type) {
      case 'success':
        setInviteEmail('');
        setInviteRole('viewer');
        fetchCollaborators(false);
        Alert.alert(t('common.success') || 'בוצע', t('collaborators.inviteSuccess') || 'ההזמנה נשלחה בהצלחה');
        break;
      case 'not_found':
        Alert.alert(t('common.error') || 'שגיאה', t('collaborators.notFound') || 'לא נמצא משתמש עם כתובת האימייל הזו');
        break;
      case 'self':
        Alert.alert(t('common.error') || 'שגיאה', t('collaborators.selfInvite') || 'לא ניתן להוסיף את עצמך כמשתף פעולה');
        break;
      case 'error':
      default:
        console.error('handleInvite error', result.error);
        Alert.alert(t('common.error') || 'שגיאה', t('collaborators.inviteError') || 'לא ניתן להוסיף את המשתף');
        break;
    }

    setSubmitting(false);
  };

  const renderCollaborator = (entry: CollaborationWithMember) => {
    const name =
      entry.memberProfile?.profile_name ||
      entry.memberProfile?.email ||
      entry.collaboration.member_id;

    const getStatusLabel = (status: string) => {
      switch (status) {
        case 'active':
          return t('collaborators.statusActive') || 'Active';
        case 'pending':
          return t('collaborators.statusPending') || 'Pending';
        case 'revoked':
          return t('collaborators.statusRevoked') || 'Revoked';
        case 'inactive':
          return t('collaborators.statusInactive') || 'Inactive';
        default:
          return t('collaborators.statusUnknown') || 'Unknown';
      }
    };
    const statusLabel = getStatusLabel(entry.collaboration.status || '');

    const roleLabel =
      entry.collaboration.role === 'editor'
        ? t('collaborators.roleEditor') || 'עורך'
        : t('collaborators.roleViewer') || 'צופה';

    const isActive = entry.collaboration.status === 'active';
    const isPending = entry.collaboration.status === 'pending';

    return (
      <Card key={`${entry.collaboration.owner_id}-${entry.collaboration.member_id}`} style={styles.collaboratorCard}>
        <Card.Content style={styles.collaboratorCardContent}>
          <View style={[styles.collaboratorRow, rtlContainer]}>
            <View style={styles.collaboratorIconContainer}>
              <MaterialCommunityIcons
                name={entry.collaboration.role === 'editor' ? 'account-edit' : 'account-eye'}
                size={24}
                color={THEME_COLORS.primary}
              />
            </View>
            <View style={styles.collaboratorInfo}>
              <Text variant="titleMedium" style={[styles.collaboratorName, rtlText]}>
                {name}
              </Text>
              <View style={[styles.collaboratorMeta, rtlContainer]}>
                <TouchableOpacity
                  onPress={() => handleChangeRole(
                    entry.collaboration.member_id,
                    name,
                    entry.collaboration.role as 'editor' | 'viewer'
                  )}
                  activeOpacity={0.7}
                  style={styles.roleChipTouchable}
                >
                  <Chip
                    mode="flat"
                    compact
                    style={[
                      styles.roleChip,
                      entry.collaboration.role === 'editor' ? styles.roleChipEditor : styles.roleChipViewer
                    ]}
                    textStyle={styles.roleChipText}
                    icon={() => (
                      <MaterialCommunityIcons
                        name="swap-horizontal"
                        size={14}
                        color={THEME_COLORS.primary}
                      />
                    )}
                  >
                    {roleLabel}
                  </Chip>
                </TouchableOpacity>
                <Chip
                  mode="flat"
                  compact
                  style={[
                    styles.statusChip,
                    isActive ? styles.statusChipActive : isPending ? styles.statusChipPending : styles.statusChipInactive
                  ]}
                  textStyle={[
                    styles.statusChipText,
                    isActive ? styles.statusChipActiveText : isPending ? styles.statusChipPendingText : styles.statusChipInactiveText
                  ]}
                >
                  {statusLabel}
                </Chip>
              </View>
            </View>
            <IconButton
              icon="delete-outline"
              iconColor="#F44336"
              size={22}
              onPress={() => handleRemove(entry.collaboration.member_id, name)}
              style={styles.deleteButton}
            />
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#F5F5F5' }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('collaborators.title') || 'ניהול משתפי פעולה'} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[THEME_COLORS.primary]}
            tintColor={THEME_COLORS.primary}
          />
        }
      >
        {/* Current Collaborators Section */}
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
              <View style={styles.sectionHeaderText}>
                <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                  {t('collaborators.currentCollaborators') || 'משתפי פעולה נוכחיים'}
                </Text>
                <Text variant="bodySmall" style={[styles.sectionSubtitle, rtlText]}>
                  {ownerProfile?.username || ownerProfile?.profile_name || ''}
                </Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={THEME_COLORS.primary} />
              </View>
            ) : collaborators.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons
                  name="account-plus-outline"
                  size={48}
                  color="#9E9E9E"
                />
                <Text variant="bodyMedium" style={[styles.emptyStateText, rtlText]}>
                  {t('collaborators.emptyState') || 'עדיין לא הוספת משתפי פעולה.'}
                </Text>
              </View>
            ) : (
              <View style={styles.collaboratorsList}>
                {collaborators.map(renderCollaborator)}
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Invite New Collaborator Section */}
        <Card style={styles.sectionCard}>
          <Card.Content style={styles.sectionCardContent}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconContainer}>
                <MaterialCommunityIcons
                  name="account-plus"
                  size={24}
                  color={THEME_COLORS.primary}
                />
              </View>
              <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                {t('collaborators.inviteTitle') || 'הוסף משתף פעולה חדש'}
              </Text>
            </View>

            <TextInput
              label={t('collaborators.emailLabel') || 'אימייל'}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              mode="outlined"
              style={styles.input}
              contentStyle={rtlText}
              outlineColor="#E0E0E0"
              activeOutlineColor={THEME_COLORS.primary}
            />

            <Text variant="bodyMedium" style={[styles.roleLabel, rtlText]}>
              {t('collaborators.roleLabel') || 'הרשאות'}
            </Text>

            <View style={[styles.roleChipsContainer, rtlContainer]}>
              <TouchableOpacity
                onPress={() => setInviteRole('editor')}
                activeOpacity={0.7}
                style={[
                  styles.roleOption,
                  inviteRole === 'editor' && styles.roleOptionSelected
                ]}
              >
                <View style={[styles.roleOptionContent, rtlContainer]}>
                  <MaterialCommunityIcons
                    name="pencil"
                    size={20}
                    color={inviteRole === 'editor' ? THEME_COLORS.primary : '#757575'}
                  />
                  <View style={styles.roleOptionTextContainer}>
                    <Text
                      style={[
                        styles.roleOptionText,
                        rtlText,
                        inviteRole === 'editor' && styles.roleOptionTextSelected
                      ]}
                    >
                      {t('collaborators.roleEditor') || 'עורך'}
                    </Text>
                    <Text
                      style={[
                        styles.roleOptionDescription,
                        rtlText,
                        inviteRole === 'editor' && styles.roleOptionDescriptionSelected
                      ]}
                    >
                      {t('collaborators.roleEditorDesc') || 'יכול לערוך ולמחוק'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setInviteRole('viewer')}
                activeOpacity={0.7}
                style={[
                  styles.roleOption,
                  inviteRole === 'viewer' && styles.roleOptionSelected
                ]}
              >
                <View style={[styles.roleOptionContent, rtlContainer]}>
                  <MaterialCommunityIcons
                    name="eye"
                    size={20}
                    color={inviteRole === 'viewer' ? THEME_COLORS.primary : '#757575'}
                  />
                  <View style={styles.roleOptionTextContainer}>
                    <Text
                      style={[
                        styles.roleOptionText,
                        rtlText,
                        inviteRole === 'viewer' && styles.roleOptionTextSelected
                      ]}
                    >
                      {t('collaborators.roleViewer') || 'צופה'}
                    </Text>
                    <Text
                      style={[
                        styles.roleOptionDescription,
                        rtlText,
                        inviteRole === 'viewer' && styles.roleOptionDescriptionSelected
                      ]}
                    >
                      {t('collaborators.roleViewerDesc') || 'צפייה בלבד'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            <Button
              mode="contained"
              onPress={handleInvite}
              loading={submitting}
              disabled={!inviteEmail.trim() || submitting}
              style={styles.inviteButton}
              contentStyle={styles.inviteButtonContent}
              labelStyle={styles.inviteButtonLabel}
              buttonColor={THEME_COLORS.primary}
              icon="send"
            >
              {t('collaborators.sendInvite') || 'שלח הזמנה'}
            </Button>
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
    sectionHeaderText: {
      flex: 1,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#212121',
      letterSpacing: 0.2,
      marginBottom: 4,
    },
    sectionSubtitle: {
      fontSize: 14,
      color: '#757575',
      fontWeight: '400',
    },
    collaboratorsList: {
      gap: 12,
    },
    collaboratorCard: {
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
    collaboratorCardContent: {
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    collaboratorRow: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 12,
    },
    collaboratorIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${THEME_COLORS.primary}15`,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    collaboratorInfo: {
      flex: 1,
      minWidth: 0,
    },
    collaboratorName: {
      fontSize: 16,
      fontWeight: '600',
      color: '#212121',
      marginBottom: 8,
    },
    collaboratorMeta: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    roleChipTouchable: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    roleChip: {
      height: 24,
      paddingHorizontal: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    roleChipEditor: {
      backgroundColor: `${THEME_COLORS.primary}20`,
    },
    roleChipViewer: {
      backgroundColor: '#E3F2FD',
    },
    roleChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: THEME_COLORS.primary,
      textAlign: 'center',
      textAlignVertical: 'center',
      includeFontPadding: false,
      lineHeight: 22,
      paddingTop: 0,
      paddingBottom: 0,
      marginTop: 0,
    },
    statusChip: {
      height: 24,
      paddingHorizontal: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    statusChipActive: {
      backgroundColor: '#E8F5E9',
    },
    statusChipPending: {
      backgroundColor: '#FFF3E0',
    },
    statusChipInactive: {
      backgroundColor: '#F5F5F5',
    },
    statusChipText: {
      fontSize: 12,
      fontWeight: '500',
      textAlign: 'center',
      textAlignVertical: 'center',
      includeFontPadding: false,
      lineHeight: 20,
      paddingTop: 0,
      paddingBottom: 0,
      marginTop: 0,
    },
    statusChipActiveText: {
      color: '#2E7D32',
    },
    statusChipPendingText: {
      color: '#F57C00',
    },
    statusChipInactiveText: {
      color: '#757575',
    },
    deleteButton: {
      margin: 0,
      width: 40,
      height: 40,
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
    input: {
      marginBottom: 20,
      backgroundColor: '#FAFAFA',
    },
    roleLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: '#212121',
      marginBottom: 12,
    },
    roleChipsContainer: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      gap: 12,
      marginBottom: 20,
    },
    roleOption: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: '#E0E0E0',
      backgroundColor: '#FAFAFA',
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    roleOptionSelected: {
      borderColor: THEME_COLORS.primary,
      backgroundColor: `${THEME_COLORS.primary}08`,
    },
    roleOptionContent: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 10,
    },
    roleOptionTextContainer: {
      flex: 1,
      minWidth: 0,
    },
    roleOptionText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#212121',
      marginBottom: 2,
    },
    roleOptionTextSelected: {
      color: THEME_COLORS.primary,
    },
    roleOptionDescription: {
      fontSize: 12,
      fontWeight: '400',
      color: '#757575',
    },
    roleOptionDescriptionSelected: {
      color: THEME_COLORS.primary,
      opacity: 0.8,
    },
    inviteButton: {
      borderRadius: 12,
      marginTop: 4,
      ...Platform.select({
        ios: {
          shadowColor: THEME_COLORS.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
        },
        android: {
          elevation: 2,
        },
      }),
    },
    inviteButtonContent: {
      paddingVertical: 6,
    },
    inviteButtonLabel: {
      fontSize: 15,
      fontWeight: '600',
    },
    center: {
      paddingVertical: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

