/**
 * Settings / Menu Screen
 * Provides access to management, configuration, and support areas
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import {
  Appbar,
  List,
  Avatar,
  Text,
  Card,
  Chip,
  Dialog,
  Portal,
  Button,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useProfile } from '@/lib/hooks/useProfile';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { SUBSCRIPTION_PLANS } from '@/lib/billing';
import { THEME_COLORS } from '@/lib/constants/colors';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';


export default function SettingsScreen() {
  const router = useRouter();
  const { t, locale, setLanguage, isRTL: isRTLContext } = useLanguage();
  const { user, signOut, profile: authProfile } = useAuth();
  const { activeOwnerId, ownerProfile, isOwner, leaveCollaboration, loading: ownerLoading } = useActiveOwner();
  const { profile: profileData, loading: profileLoading } = useProfile();
  // Use profile from useProfile if available (most up-to-date), otherwise use authProfile (already loaded)
  const profile = profileData || authProfile;
  const { subscription, loading: loadingSubscription } = useSubscription();
  const insets = useSafeAreaInsets();
  const rtlContainer = getRtlContainerStyles(isRTLContext);
  const rtlText = getRtlTextStyles(isRTLContext);
  const rtlTextCenter = getRtlTextStyles(isRTLContext, 'center');
  const styles = createStyles(isRTLContext);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  // Get subscription tier from subscription info
  // If trial is active, show as 'free' (trial). Otherwise, use the actual plan ('pro' or 'free')
  const isTrial = subscription?.isTrialActive || false;
  const actualPlan = subscription?.plan || 'free';
  const subscriptionTier: 'free' | 'pro' = isTrial ? 'free' : (actualPlan === 'pro' ? 'pro' : 'free');
  const subscriptionValidUntil = subscription?.subscriptionEndDate || null;

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return t('settings.formatDate.unlimited');
    try {
      const date = new Date(dateStr);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    } catch {
      return t('settings.formatDate.notRelevant');
    }
  };






  const handleLogout = async () => {
    setShowLogoutDialog(true);
  };

  const confirmLogout = async () => {
    setShowLogoutDialog(false);
    try {
      // Call signOut which will clear user state
      await signOut();
      // Immediately navigate to login screen
      // Don't go through root to avoid any loading screens
      router.replace('/(auth)/login' as any);
    } catch (error) {
      console.error('Error during logout:', error);
      // Still navigate to login even if signOut has an error
      router.replace('/(auth)/login' as any);
    }
  };

  const getSubscriptionBadgeColor = (): string => {
    if (isTrial) return '#4CAF50';
    if (subscriptionTier === 'pro') return '#4CAF50';
    return THEME_COLORS.textSecondary;
  };

  const getSubscriptionDescription = (): string => {
    if (isTrial) {
      const daysRemaining = subscription?.trialDaysRemaining || 0;
      return t('settings.subscriptionDescription.trial', { days: daysRemaining });
    }
    if (subscriptionTier === 'pro') {
      return t('settings.subscriptionDescription.pro');
    }
    return t('settings.subscriptionDescription.free');
  };

  const getSubscriptionLabel = (): string => {
    if (isTrial) {
      return t('settings.subscriptionLabel.trial');
    }
    if (subscriptionTier === 'pro') {
      return t('settings.subscriptionLabel.pro');
    }
    return t('settings.subscriptionLabel.free');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: THEME_COLORS.surfaceVariant }]} edges={[]}>
      <Appbar.Header 
        style={{ 
          backgroundColor: THEME_COLORS.surfaceVariant,
        }}
      >
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('settings.title')} />
      </Appbar.Header>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 24) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Account Section */}
        <Card style={styles.sectionCard} mode="outlined">
          <View style={styles.cardContentWrapper}>
            <Card.Content style={styles.accountCardContent}>
            <Text variant="titleMedium" style={[styles.accountSectionTitle, rtlText]}>
              {t('settings.account')}
            </Text>
            
            <View style={styles.accountProfileHeader}>
              <View style={styles.avatarContainer}>
                <Avatar.Text
                  size={64}
                  label={user?.email?.charAt(0).toUpperCase() || 'U'}
                  style={styles.avatar}
                  labelStyle={styles.avatarLabel}
                />
              </View>
              <View style={styles.profileInfo}>
                <Text variant="titleLarge" style={[rtlText, styles.profileName]}>
                  {profile?.full_name || profile?.username || profile?.profile_name || user?.email || 'User'}
                </Text>
                <Text variant="bodySmall" style={[rtlText, styles.profileEmail]}>
                  {profile?.email || user?.email || 'User'}
                </Text>
              </View>
            </View>

            <View style={styles.accountDivider} />

            <TouchableOpacity 
              style={styles.accountSettingRow}
              onPress={() => router.push('/settings/profile' as any)}
              activeOpacity={0.6}
            >
              <View style={styles.settingContent}>
                <Text variant="bodyLarge" style={[rtlText, styles.settingTitle]} numberOfLines={1}>
                  {t('settings.myProfile') || 'הפרופיל שלי'}
                </Text>
                <Text variant="bodySmall" style={[rtlText, styles.settingDescription]} numberOfLines={2}>
                  {t('settings.myProfileDesc') || 'ערוך שם משתמש ופרטי חשבון'}
                </Text>
              </View>
              <List.Icon 
                icon="account-circle-outline" 
                color={THEME_COLORS.text} 
                style={styles.rowIcon}
              />
            </TouchableOpacity>

            {isOwner && (
              <>
                <View style={styles.accountDivider} />
                <TouchableOpacity
                  style={styles.accountSettingRow}
                  onPress={() => router.push('/settings/collaborators' as any)}
                  activeOpacity={0.6}
                >
                  <View style={styles.settingContent}>
                    <Text variant="bodyLarge" style={[rtlText, styles.settingTitle]} numberOfLines={1}>
                      {t('settings.manageCollaborators') || 'ניהול משתפי פעולה'}
                    </Text>
                    <Text variant="bodySmall" style={[rtlText, styles.settingDescription]} numberOfLines={2}>
                      {t('settings.manageCollaboratorsDesc') || 'הזמן משתמשים נוספים לראות או לערוך מוצרים'}
                    </Text>
                  </View>
                  <List.Icon
                    icon="account-multiple-outline"
                    color={THEME_COLORS.text}
                    style={styles.rowIcon}
                  />
                </TouchableOpacity>
              </>
            )}

            <View style={styles.accountDivider} />
            <TouchableOpacity
              style={styles.accountSettingRow}
              onPress={() => router.push('/settings/shared_with_me' as any)}
              activeOpacity={0.6}
            >
              <View style={styles.settingContent}>
                <Text variant="bodyLarge" style={[rtlText, styles.settingTitle]} numberOfLines={1}>
                  {t('settings.sharedWithMe') || 'שיתופים אליי'}
                </Text>
                <Text variant="bodySmall" style={[rtlText, styles.settingDescription]} numberOfLines={2}>
                  {t('settings.sharedWithMeDesc') || 'הזמנות ובעלים שאתה משתף איתם פעולה'}
                </Text>
              </View>
              <List.Icon
                icon="account-switch-outline"
                color={THEME_COLORS.text}
                style={styles.rowIcon}
              />
            </TouchableOpacity>

            <View style={styles.accountDivider} />

            <TouchableOpacity 
              style={styles.accountSettingRow}
              onPress={handleLogout}
              activeOpacity={0.6}
            >
              <View style={styles.settingContent}>
                <Text variant="bodyLarge" style={[rtlText, styles.logoutText]} numberOfLines={1}>
                  {t('settings.logout') || 'התנתק'}
                </Text>
                <Text variant="bodySmall" style={[rtlText, styles.logoutDescription]} numberOfLines={2}>
                  {t('settings.logoutDesc') || 'התנתק מהחשבון הנוכחי'}
                </Text>
              </View>
              <List.Icon 
                icon="logout" 
                color={THEME_COLORS.error} 
                style={styles.rowIcon}
              />
            </TouchableOpacity>
            </Card.Content>
          </View>
        </Card>

        {/* 2. Collaborator Info (if not owner) */}
        {!isOwner && ownerProfile && (
          <Card style={styles.sectionCard} mode="outlined">
            <View style={styles.cardContentWrapper}>
              <Card.Content style={styles.cardContent}>
                <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                  {t('settings.collaboration.title')}
                </Text>
                <Text variant="bodyLarge" style={[rtlText, styles.settingDescription, { marginTop: 8, marginBottom: 16 }]}>
                  {t('settings.collaboration.currentOwner', { name: ownerProfile.username || (ownerProfile as any).profile_name || 'Unknown' })}
                </Text>
                <Button
                  mode="contained"
                  onPress={async () => {
                    const result = await leaveCollaboration();
                    if (result.success) {
                      // Refresh will happen automatically via useActiveOwner
                    } else {
                      // Show error
                      console.error('Error leaving collaboration:', result.error);
                    }
                  }}
                  buttonColor={THEME_COLORS.error}
                  textColor="#FFFFFF"
                  style={{ marginTop: 8 }}
                >
                  {t('settings.collaboration.leaveAccount')}
                </Button>
              </Card.Content>
            </View>
          </Card>
        )}

        {/* 2. Subscription Section (only for owners) */}
        {isOwner && (
        <Card style={styles.sectionCard} mode="outlined">
          <View style={styles.cardContentWrapper}>
            <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
              {t('settings.subscription') || 'מנוי'}
            </Text>

            <TouchableOpacity 
              style={styles.settingRow}
              onPress={() => router.push('/(paywall)/current-plan' as any)}
              activeOpacity={0.6}
            >
              <View style={styles.settingContent}>
                <Text variant="bodyLarge" style={[rtlText, styles.settingTitle]} numberOfLines={1}>
                  {t('settings.currentPlan') || 'תוכנית נוכחית'}
                </Text>
                {!loadingSubscription && getSubscriptionDescription() && (
                  <Text variant="bodySmall" style={[rtlText, styles.settingDescription]} numberOfLines={2}>
                    {getSubscriptionDescription()}
                  </Text>
                )}
              </View>
              <View style={styles.subscriptionBadgeContainer}>
                <Chip 
                  mode="flat"
                  style={[styles.planBadge, { backgroundColor: getSubscriptionBadgeColor() + '20' }]}
                  textStyle={[styles.planBadgeText, { color: getSubscriptionBadgeColor() }]}
                >
                  {loadingSubscription ? t('settings.loading') : getSubscriptionLabel()}
                </Chip>
                <List.Icon 
                  icon={isRTLContext ? "chevron-left" : "chevron-right"} 
                  color={THEME_COLORS.textTertiary}
                  style={styles.chevron}
                />
              </View>
            </TouchableOpacity>

            {(isTrial || (subscriptionTier !== 'free' && subscriptionValidUntil)) && (
              <>
                <View style={styles.divider} />
                <View style={styles.subscriptionDateRow}>
                  <Text variant="bodySmall" style={[rtlText, styles.subscriptionDate]}>
                    {isTrial 
                      ? t('settings.subscriptionDate.trialEnds', { date: formatDate(subscription?.trialEndDate || null) })
                      : t('settings.subscriptionDate.validUntil', { date: formatDate(subscriptionValidUntil) })}
                  </Text>
                </View>
              </>
            )}

            <View style={styles.divider} />

            <TouchableOpacity
              onPress={() => router.push('/(paywall)/subscribe' as any)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={isTrial || subscriptionTier === 'free' 
                  ? [THEME_COLORS.primary, THEME_COLORS.primaryLight]
                  : [THEME_COLORS.primary, THEME_COLORS.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.premiumButton}
              >
                <Text style={styles.premiumButtonText}>
                  {isTrial || subscriptionTier === 'free' 
                    ? t('settings.subscriptionAction.upgrade')
                    : t('settings.subscriptionAction.manage')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            </Card.Content>
          </View>
        </Card>
        )}

        {/* 3. App Preferences Section (only for owners) */}
        {isOwner && (
        <Card style={styles.sectionCard} mode="outlined">
          <View style={styles.cardContentWrapper}>
            <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
              {t('settings.appPreferences') || 'העדפות אפליקציה'}
            </Text>

            <TouchableOpacity 
              style={styles.settingRow}
              onPress={() => router.push('/settings/export' as any)}
              activeOpacity={0.6}
            >
              <View style={styles.settingContent}>
                <Text variant="bodyLarge" style={[rtlText, styles.settingTitle]} numberOfLines={1}>
                  {t('settings.exportTitle') || 'ייצוא נתונים'}
                </Text>
                <Text variant="bodySmall" style={[rtlText, styles.settingDescription]} numberOfLines={2}>
                  {t('settings.exportDescDetailed') || 'ייצוא לקובצי CSV או PDF'}
                </Text>
              </View>
              <List.Icon 
                icon="download-outline" 
                color={THEME_COLORS.text} 
                style={styles.rowIcon}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingContent}>
                <Text variant="bodyLarge" style={[rtlText, styles.settingTitle]} numberOfLines={1}>
                  {t('settings.language.title')}
                </Text>
                <View style={[styles.languageRow, { flexDirection: isRTLContext ? 'row-reverse' : 'row' }]}>
                  <TouchableOpacity
                    style={[
                      styles.languageButton,
                      locale === 'he' && styles.languageButtonActive,
                    ]}
                    onPress={() => setLanguage('he')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.languageButtonText,
                        locale === 'he' && styles.languageButtonTextActive,
                      ]}
                    >
                      {t('settings.language.hebrew')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.languageButton,
                      locale === 'en' && styles.languageButtonActive,
                    ]}
                    onPress={() => setLanguage('en')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.languageButtonText,
                        locale === 'en' && styles.languageButtonTextActive,
                      ]}
                    >
                      {t('settings.language.english')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <List.Icon 
                icon="translate" 
                color={THEME_COLORS.text} 
                style={styles.rowIcon}
              />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity 
              style={styles.settingRow}
              onPress={() => router.push('/settings/products' as any)}
              activeOpacity={0.6}
            >
              <View style={styles.settingContent}>
                <Text variant="bodyLarge" style={[rtlText, styles.settingTitle]} numberOfLines={1}>
                  {t('settings.products.title') || 'ניהול מוצרים'}
                </Text>
                <Text variant="bodySmall" style={[rtlText, styles.settingDescription]} numberOfLines={2}>
                  {t('settings.products.description') || 'מחיקה אוטומטית והעדפות תאריך'}
                </Text>
              </View>
              <List.Icon 
                icon="package-variant" 
                color={THEME_COLORS.text} 
                style={styles.rowIcon}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity 
              style={styles.settingRow}
              onPress={() => router.push('/settings/notifications' as any)}
              activeOpacity={0.6}
            >
              <View style={styles.settingContent}>
                <Text variant="bodyLarge" style={[rtlText, styles.settingTitle]} numberOfLines={1}>
                  {t('settings.notificationsTitle') || 'התראות'}
                </Text>
                <Text variant="bodySmall" style={[rtlText, styles.settingDescription]} numberOfLines={2}>
                  {t('settings.notificationsDescription') || 'נהל התראות Push'}
                </Text>
              </View>
              <List.Icon 
                icon="bell-outline" 
                color={THEME_COLORS.text} 
                style={styles.rowIcon}
              />
            </TouchableOpacity>
            </Card.Content>
          </View>
        </Card>
        )}

        {/* 4. Support Section */}
        <Card style={styles.sectionCard} mode="outlined">
          <View style={styles.cardContentWrapper}>
            <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
              {t('settings.support.title')}
            </Text>

            <TouchableOpacity 
              style={styles.settingRow}
              onPress={() => router.push('/settings/help' as any)}
              activeOpacity={0.6}
            >
              <View style={[styles.settingContent, rtlContainer]}>
                <Text variant="bodyLarge" style={[rtlText, styles.settingTitle]}>
                  {t('settings.contactSupport') || 'צור קשר עם תמיכה'}
                </Text>
              </View>
              <List.Icon 
                icon="help-circle-outline" 
                color={THEME_COLORS.text} 
                style={styles.rowIcon}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity 
              style={styles.settingRow}
              onPress={() => router.push('/settings/guide' as any)}
              activeOpacity={0.6}
            >
              <View style={[styles.settingContent, rtlContainer]}>
                <Text variant="bodyLarge" style={[rtlText, styles.settingTitle]}>
                  {t('settings.guide.title') || 'מדריך שימוש'}
                </Text>
              </View>
              <List.Icon 
                icon="book-open-variant" 
                color={THEME_COLORS.text} 
                style={styles.rowIcon}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Terms of Use – button to summary screen */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/(info)/terms-summary' as any)}
              activeOpacity={0.6}
            >
              <View style={[styles.settingContent, rtlContainer]}>
                <Text variant="bodyLarge" style={[rtlText, styles.settingTitle]}>
                  {t('info.termsSummary.title')}
                </Text>
              </View>
              <List.Icon
                icon="file-document-outline"
                color={THEME_COLORS.text}
                style={styles.rowIcon}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Privacy Policy – button to summary screen */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/(info)/privacy-summary' as any)}
              activeOpacity={0.6}
            >
              <View style={[styles.settingContent, rtlContainer]}>
                <Text variant="bodyLarge" style={[rtlText, styles.settingTitle]}>
                  {t('info.privacySummary.title')}
                </Text>
              </View>
              <List.Icon
                icon="shield-check-outline"
                color={THEME_COLORS.text}
                style={styles.rowIcon}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={[styles.settingContent, rtlContainer]}>
                <View style={rtlContainer}>
                  <Text variant="bodyLarge" style={[rtlText, styles.settingTitle, styles.disabledText]}>
                    {t('settings.versionInfo') || 'אודות האפליקציה'}
                  </Text>
                  <Text variant="bodySmall" style={[rtlText, styles.settingDescription]}>
                    גרסה 1.0.0
                  </Text>
                </View>
              </View>
              <List.Icon 
                icon="information-outline" 
                color={THEME_COLORS.textTertiary} 
                style={styles.rowIcon}
              />
            </View>
            </Card.Content>
          </View>
        </Card>
      </ScrollView>

      <Portal>
        <Dialog
          visible={showLogoutDialog}
          onDismiss={() => setShowLogoutDialog(false)}
          style={styles.dialog}
        >
          <Dialog.Content style={styles.dialogContent}>
            <View style={styles.dialogIconContainer}>
              <View style={styles.dialogIconCircle}>
                <List.Icon
                  icon="logout"
                  color={THEME_COLORS.error}
                />
              </View>
            </View>
            <Text variant="titleLarge" style={[styles.dialogTitle, rtlTextCenter]}>
              {t('settings.logoutConfirm') || 'התנתקות'}
            </Text>
            <Text variant="bodyMedium" style={[styles.dialogText, rtlTextCenter]}>
              {t('settings.logoutConfirmMessage') || 'האם אתה בטוח שברצונך להתנתק?'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions style={[styles.dialogActions, rtlContainer]}>
            <Button
              mode="outlined"
              onPress={() => setShowLogoutDialog(false)}
              style={styles.dialogCancelButton}
              contentStyle={styles.dialogButtonContent}
              labelStyle={styles.dialogCancelLabel}
            >
              {t('common.cancel') || 'ביטול'}
            </Button>
            <Button
              mode="contained"
              onPress={confirmLogout}
              buttonColor={THEME_COLORS.error}
              style={styles.dialogConfirmButton}
              contentStyle={styles.dialogButtonContent}
              labelStyle={styles.dialogConfirmLabel}
            >
              {t('settings.logout') || 'התנתק'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: '5%',
    paddingTop: 16,
    paddingBottom: 24,
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  sectionCard: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardContentWrapper: {
    overflow: 'hidden',
    borderRadius: 16,
  },
  cardContent: {
    paddingVertical: 16,
    paddingHorizontal: '5%',
  },
  accountCardContent: {
    paddingVertical: 12,
    paddingHorizontal: '5%',
  },
  sectionTitle: {
    marginBottom: 16,
    fontWeight: '700',
    fontSize: 17,
    color: '#212121',
    letterSpacing: 0.3,
  },
  accountSectionTitle: {
    marginTop: 4,
    marginBottom: 16,
    fontWeight: '700',
    fontSize: 17,
    color: '#212121',
    letterSpacing: 0.3,
  },
  profileHeader: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 16,
  },
  accountProfileHeader: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 14,
  },
  avatarContainer: {
    flexShrink: 0,
    ...Platform.select({
      ios: {
        shadowColor: THEME_COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  avatar: {
    backgroundColor: THEME_COLORS.primary,
  },
  avatarLabel: {
    fontSize: 28,
    fontWeight: '600',
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  profileName: {
    fontWeight: '700',
    color: THEME_COLORS.text,
    marginBottom: 3,
    fontSize: 18,
  },
  profileEmail: {
    color: THEME_COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '400',
    marginTop: 1,
  },
  logoutDescription: {
    color: THEME_COLORS.textSecondary,
    fontSize: 14,
    marginTop: 3,
    fontWeight: '400',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E0E0',
    marginVertical: 8,
  },
  accountDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E0E0',
    marginVertical: 6,
  },
  settingRow: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    paddingVertical: 10,
    minHeight: 52,
    justifyContent: 'space-between',
    gap: 12,
  },
  accountSettingRow: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    paddingVertical: 8,
    minHeight: 48,
    justifyContent: 'space-between',
    gap: 12,
  },
  settingContent: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    alignItems: isRTL ? 'flex-end' : 'flex-start',
  },
  settingTitle: {
    fontWeight: '500',
    color: THEME_COLORS.text,
    fontSize: 17,
    letterSpacing: 0.1,
  },
  settingDescription: {
    color: THEME_COLORS.textSecondary,
    fontSize: 14,
    marginTop: 3,
    fontWeight: '400',
  },
  rowIcon: {
    margin: 0,
    minWidth: 24,
    minHeight: 24,
    width: 24,
    height: 24,
    flexShrink: 0,
  },
  disabledText: {
    color: THEME_COLORS.textTertiary,
  },
  logoutText: {
    color: THEME_COLORS.error,
    fontWeight: '500',
    fontSize: 17,
  },
  subscriptionBadgeContainer: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: 9,
    flexShrink: 0,
  },
  planBadge: {
    margin: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  planBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    textAlign: 'center',
    includeFontPadding: false,
  },
  subscriptionDateRow: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  subscriptionDate: {
    color: THEME_COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '400',
  },
  chevron: {
    margin: 0,
    minWidth: 20,
    minHeight: 20,
    width: 20,
    height: 20,
    flexShrink: 0,
  },
  premiumButton: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: THEME_COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  premiumButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dialog: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  dialogContent: {
    paddingTop: 24,
    paddingBottom: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  dialogIconContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  dialogIconCircle: {
    minWidth: 64,
    minHeight: 64,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
    textAlign: 'center',
  },
  dialogText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 8,
  },
  dialogActions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    gap: 12,
    flexDirection: isRTL ? 'row-reverse' : 'row',
  },
  dialogCancelButton: {
    flex: 1,
    borderRadius: 12,
    borderColor: '#E0E0E0',
    minWidth: 0,
  },
  dialogConfirmButton: {
    flex: 1,
    borderRadius: 12,
    elevation: 2,
    shadowColor: THEME_COLORS.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    minWidth: 0,
  },
  dialogButtonContent: {
    paddingVertical: 8,
  },
  dialogCancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#424242',
  },
  dialogConfirmLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  legalSummaryContainer: {
    paddingVertical: 6,
  },
  legalSummaryTitle: {
    fontWeight: '600',
    marginBottom: 4,
    color: '#212121',
  },
  legalSummaryText: {
    fontSize: 14,
    lineHeight: 20,
    color: THEME_COLORS.textSecondary,
    marginBottom: 2,
  },
  legalSummaryBullets: {
    marginTop: 4,
    marginBottom: 4,
  },
  legalSummaryBullet: {
    fontSize: 14,
    lineHeight: 20,
    color: THEME_COLORS.textSecondary,
  },
  legalSummaryLinkRow: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  legalSummaryLink: {
    fontSize: 14,
    color: THEME_COLORS.primary,
    fontWeight: '500',
  },
  legalSummaryLinkIcon: {
    marginHorizontal: 4,
    width: 18,
    height: 18,
  },
  languageRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  languageButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageButtonActive: {
    borderColor: THEME_COLORS.primary,
    backgroundColor: THEME_COLORS.primary + '15',
    borderWidth: 2,
  },
  languageButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME_COLORS.textSecondary,
  },
  languageButtonTextActive: {
    color: THEME_COLORS.primary,
    fontWeight: '600',
  },
  });
}
