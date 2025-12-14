/**
 * My Profile Screen
 * User profile information and settings
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import {
  Appbar,
  Card,
  TextInput,
  Button,
  HelperText,
  Text,
  Avatar,
  Dialog,
  Portal,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/lib/hooks/useProfile';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { updateProfile, isProfileNameUnique } from '@/lib/supabase/mutations/profiles';
import { deleteUserAccount } from '@/lib/supabase/mutations/auth';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);
  const { user, session, signOut } = useAuth();
  const { profile, loading: profileLoading, refetch } = useProfile();
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const insets = useSafeAreaInsets();
  const [profileName, setProfileName] = useState(profile?.profile_name || '');
  const [contactEmail, setContactEmail] = useState(profile?.email || '');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [errors, setErrors] = useState<{ profileName?: string; contactEmail?: string }>({});
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (profile?.profile_name) {
      setProfileName(profile.profile_name);
    }
    if (profile?.email) {
      setContactEmail(profile.email);
    }
  }, [profile?.profile_name, profile?.email]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!profileName || !profileName.trim()) {
      newErrors.profileName = 'שם משתמש/עסק חובה';
    }

    if (contactEmail && contactEmail.trim() && !validateEmail(contactEmail.trim())) {
      newErrors.contactEmail = 'כתובת אימייל לא תקינה';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !user?.id) return;

    setSaving(true);
    setErrors({});
    
    try {
      const trimmedProfileName = profileName.trim();
      
      // Check if profile name changed and validate uniqueness
      if (trimmedProfileName !== profile?.profile_name) {
        setChecking(true);
        const isUnique = await isProfileNameUnique(trimmedProfileName, user.id);
        
        if (!isUnique) {
          setErrors({
            profileName: 'שם משתמש/עסק כבר קיים. נא בחר שם אחר.',
          });
          setSaving(false);
          setChecking(false);
          return;
        }
      }

      // Prepare update object
      const updates: any = {};
      
      // Update profile name if changed
      if (trimmedProfileName !== profile?.profile_name) {
        updates.profile_name = trimmedProfileName;
      }
      
      // Update contact email (profiles.email) if changed
      const trimmedContactEmail = contactEmail.trim();
      if (trimmedContactEmail !== (profile?.email || '')) {
        updates.email = trimmedContactEmail || null;
      }

      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        try {
          // Check if profile name changed and validate uniqueness
          if (updates.profile_name && updates.profile_name !== profile?.profile_name) {
            setChecking(true);
            const isUnique = await isProfileNameUnique(updates.profile_name, user.id);
            
            if (!isUnique) {
              setErrors({
                profileName: 'שם משתמש/עסק כבר קיים. נא בחר שם אחר.',
              });
              setSaving(false);
              setChecking(false);
              return;
            }
          }

          await updateProfile(user.id, updates);
          // Refetch profile to get updated data
          await refetch();
        } catch (updateError: any) {
          // Handle unique constraint violation
          if (updateError.code === '23505' || 
              updateError.message?.includes('unique') || 
              updateError.message?.includes('duplicate') ||
              updateError.message?.includes('already exists')) {
            setErrors({
              profileName: 'שם משתמש/עסק כבר קיים. נא בחר שם אחר.',
            });
            setSaving(false);
            setChecking(false);
            return;
          }
          throw updateError;
        }
      }

      Alert.alert(
        t('common.success') || 'הצלחה',
        t('settings.profile.updateSuccess') || 'הפרופיל עודכן בהצלחה',
        [{ text: t('common.ok') || 'אישור', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Error updating profile:', error);
      const errorMessage = error.message || '';
      if (errorMessage.includes('already exists') || 
          errorMessage.includes('Profile name already exists') ||
          error.code === '23505') {
        setErrors({
          profileName: 'שם משתמש/עסק כבר קיים. נא בחר שם אחר.',
        });
      } else {
        Alert.alert(
          t('common.error') || 'שגיאה',
          error.message || t('settings.profile.updateError') || 'לא ניתן לעדכן את הפרופיל'
        );
      }
    } finally {
      setSaving(false);
      setChecking(false);
    }
  };

  const handleDeleteAccount = async () => {
    console.log('handleDeleteAccount: Called');
    
    if (!user?.id) {
      console.error('handleDeleteAccount: No user ID');
      Alert.alert(
        t('common.error') || 'שגיאה',
        t('settings.profile.deleteError') || 'לא ניתן למחוק את החשבון'
      );
      return;
    }

    console.log('handleDeleteAccount: Starting deletion for user:', user.id);
    setDeleting(true);
    
    try {
      console.log('handleDeleteAccount: Calling deleteUserAccount...');
      await deleteUserAccount();
      console.log('handleDeleteAccount: Account deleted successfully, signing out...');
      
      // Sign out the user after successful deletion
      await signOut();
      console.log('handleDeleteAccount: Signed out, navigating to login...');
      
      // Show success message
      Alert.alert(
        t('common.success') || 'הצלחה',
        'החשבון הזה נמחק מהמערכת. אם תרצה, תוכל ליצור חשבון חדש.',
        [
          {
            text: t('common.ok') || 'אישור',
            onPress: () => {
              // Navigate to login screen
              router.replace('/(auth)/login' as any);
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('handleDeleteAccount: Delete account failed', error);
      Alert.alert(
        t('common.error') || 'שגיאה',
        error.message || t('settings.profile.deleteError') || 'אירעה שגיאה, failed to delete account'
      );
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  // Check if user can delete account (free plan or free trial, but not active paid subscription)
  const canDeleteAccount = !subscriptionLoading && subscription && 
    !subscription.isPaidActive;

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('settings.myProfile') || 'הפרופיל שלי'} />
      </Appbar.Header>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={[
          styles.scrollContent,
          canDeleteAccount && { paddingBottom: 100 }
        ]}
      >
        <Card style={styles.profileCard} elevation={0}>
          <View style={styles.profileCardWrapper}>
            <LinearGradient
              colors={THEME_COLORS.primaryGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.profileGradient}
            >
              <Card.Content style={styles.profileCardContent}>
              <View style={styles.avatarContainer}>
                <View style={styles.avatarWrapper}>
                  <Avatar.Text
                    size={96}
                    label={user?.email?.charAt(0).toUpperCase() || 'U'}
                    style={styles.avatar}
                    labelStyle={styles.avatarLabel}
                  />
                </View>
                <Text variant="titleLarge" style={[styles.emailText, getRtlTextStyles(isRTL, 'center')]}>
                  {profile?.profile_name || profile?.username || user?.email || 'User'}
                </Text>
                {profile?.email && (
                  <Text variant="bodySmall" style={[styles.contactEmailText, getRtlTextStyles(isRTL, 'center')]}>
                    {profile.email}
                  </Text>
                )}
              </View>
              </Card.Content>
            </LinearGradient>
          </View>
        </Card>

        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
              {t('settings.profile.accountInfo') || 'מידע חשבון'}
            </Text>

            <TextInput
              label={t('auth.profile.contactEmail') || 'אימייל קשר'}
              value={contactEmail}
              onChangeText={(text) => {
                setContactEmail(text);
                if (errors.contactEmail) {
                  setErrors({ ...errors, contactEmail: undefined });
                }
              }}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!profileLoading && !!user?.id}
              style={[styles.input, rtlText]}
              contentStyle={styles.inputContent}
              error={!!errors.contactEmail}
            />
            {errors.contactEmail && (
              <HelperText type="error" visible={!!errors.contactEmail} style={[styles.helperText, rtlText]}>
                {errors.contactEmail}
              </HelperText>
            )}

            <TextInput
              label={t('auth.usernameOrBusiness') || 'שם משתמש/עסק'}
              value={profileName}
              onChangeText={setProfileName}
              mode="outlined"
              editable={!profileLoading && !!user?.id}
              style={[styles.input, rtlText]}
              contentStyle={styles.inputContent}
              error={!!errors.profileName}
              right={
                checking ? (
                  <TextInput.Icon icon="loading" />
                ) : null
              }
            />
            {errors.profileName && (
              <HelperText type="error" visible={!!errors.profileName} style={[styles.helperText, rtlText]}>
                {errors.profileName}
              </HelperText>
            )}
          </Card.Content>
        </Card>

        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={() => router.back()}
            style={styles.actionButton}
            contentStyle={styles.actionButtonContent}
            labelStyle={styles.actionButtonLabel}
          >
            {t('common.cancel') || 'ביטול'}
          </Button>
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving || checking}
            disabled={saving || checking || profileLoading || !user?.id}
            style={styles.actionButton}
            contentStyle={styles.actionButtonContent}
            labelStyle={styles.actionButtonLabel}
            buttonColor={THEME_COLORS.primary}
          >
            {t('common.save') || 'שמור'}
          </Button>
        </View>
      </ScrollView>

      {/* Delete Account Button - Fixed at bottom */}
      {canDeleteAccount && (
        <View style={[styles.deleteAccountContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[rtlContainer, styles.deleteAccountButtonWrapper]}>
            <Button
              mode="outlined"
              onPress={() => setShowDeleteDialog(true)}
              style={styles.deleteAccountButton}
              contentStyle={styles.deleteAccountButtonContent}
              labelStyle={styles.deleteAccountButtonLabel}
              textColor={THEME_COLORS.error}
              buttonColor="transparent"
            >
              {t('settings.profile.deleteAccountButton') || 'מחק חשבון'}
            </Button>
          </View>
        </View>
      )}

      <Portal>
        <Dialog
          visible={showDeleteDialog}
          onDismiss={() => setShowDeleteDialog(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={[rtlText, styles.dialogTitle]}>
            {t('settings.profile.deleteConfirmTitle') || 'מחיקת חשבון'}
          </Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={[rtlText, styles.dialogText]}>
              {t('settings.profile.deleteConfirmMessage') || 'האם אתה בטוח שברצונך למחוק את החשבון? פעולה זו אינה ניתנת לביטול וכל הנתונים יימחקו לצמיתות.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions style={[rtlContainer, styles.dialogActions]}>
            <Button
              onPress={() => setShowDeleteDialog(false)}
              style={styles.dialogCancelButton}
              contentStyle={styles.dialogButtonContent}
              labelStyle={styles.dialogCancelLabel}
            >
              {t('common.cancel') || 'ביטול'}
            </Button>
            <Button
              onPress={handleDeleteAccount}
              loading={deleting}
              disabled={deleting}
              buttonColor={THEME_COLORS.error}
              style={styles.dialogDeleteButton}
              contentStyle={styles.dialogButtonContent}
              labelStyle={styles.dialogDeleteLabel}
            >
              {t('settings.profile.deleteConfirm') || 'מחק'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  profileCard: {
    marginBottom: 20,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  profileCardWrapper: {
    overflow: 'hidden',
    borderRadius: 20,
  },
  profileGradient: {
    borderRadius: 20,
  },
  profileCardContent: {
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  avatarContainer: {
    alignItems: 'center',
  },
  avatarWrapper: {
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  avatar: {
    backgroundColor: '#FFFFFF',
  },
  avatarLabel: {
    fontSize: 36,
    fontWeight: '700',
    color: THEME_COLORS.primary,
  },
  contactEmailText: {
    color: THEME_COLORS.textSecondary,
    marginTop: 4,
    fontSize: 14,
  },
  emailText: {
    fontWeight: '600',
    color: '#FFFFFF',
    fontSize: 18,
    textAlign: 'center',
  },
  card: {
    marginBottom: 20,
    borderRadius: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  cardContent: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    marginBottom: 20,
    fontWeight: '700',
    fontSize: 17,
    color: '#212121',
    letterSpacing: 0.3,
  },
  input: {
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  inputContent: {
    fontSize: 15,
  },
  helperText: {
    fontSize: 13,
    marginTop: 4,
  },
  button: {
    marginTop: 4,
    borderRadius: 12,
    borderColor: THEME_COLORS.primary,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME_COLORS.primary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
  },
  actionButtonContent: {
    paddingVertical: 10,
  },
  actionButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  deleteAccountContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  deleteAccountButtonWrapper: {
    alignItems: isRTL ? 'flex-start' : 'flex-end',
  },
  deleteAccountButton: {
    borderRadius: 10,
    borderColor: THEME_COLORS.error,
  },
  deleteAccountButtonContent: {
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  deleteAccountButtonLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  dialog: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  dialogText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#757575',
    marginBottom: 8,
  },
  dialogActions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    gap: 12,
  },
  dialogCancelButton: {
    flex: 1,
    borderRadius: 12,
    borderColor: '#E0E0E0',
  },
  dialogDeleteButton: {
    flex: 1,
    borderRadius: 12,
    elevation: 2,
    shadowColor: THEME_COLORS.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dialogButtonContent: {
    paddingVertical: 8,
  },
  dialogCancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#424242',
  },
  dialogDeleteLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  });
}

