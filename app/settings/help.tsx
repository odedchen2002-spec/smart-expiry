/**
 * Help & Support Screen
 */

import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  Appbar,
  Card,
  Text,
  useTheme
} from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { handleContactSupport } from '@/lib/utils/support';

export default function HelpScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);

  const handleSendFeedback = () => {
    router.push('/settings/feedback' as any);
  };

  const appVersion = '1.0.0';

  const menuItems = [
    {
      id: 'tutorial',
      title: t('settings.quickTutorial') || 'מדריך מהיר',
      description: t('settings.quickTutorialDesc') || 'הדרכה מפורטת לשימוש באפליקציה',
      icon: 'school-outline',
      iconColor: THEME_COLORS.primary,
      onPress: () => router.push('/settings/guide' as any),
    },
    {
      id: 'support',
      title: t('settings.contactSupport') || 'צור קשר עם תמיכה',
      description: t('settings.contactSupportDesc') || 'נשמח לעזור בכל שאלה או בעיה',
      icon: 'help-circle-outline',
      iconColor: '#4CAF50',
      onPress: handleContactSupport,
    },
    {
      id: 'feedback',
      title: t('settings.sendFeedback') || 'שלח משוב',
      description: t('settings.help.feedbackDescription') || 'שתף אותנו במחשבותיך ושיפור האפליקציה',
      icon: 'message-text-outline',
      iconColor: '#FF9800',
      onPress: handleSendFeedback,
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={[]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('settings.helpSupport') || 'עזרה ותמיכה'} />
      </Appbar.Header>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <LinearGradient
            colors={[THEME_COLORS.primary + '15', THEME_COLORS.primary + '05']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroIconContainer}>
              <MaterialCommunityIcons 
                name="help-circle" 
                size={64} 
                color={THEME_COLORS.primary} 
              />
            </View>
            <Text variant="headlineSmall" style={[styles.heroTitle, rtlText]}>
              {t('settings.helpSupport') || 'עזרה ותמיכה'}
            </Text>
            <Text variant="bodyMedium" style={[styles.heroSubtitle, rtlText]}>
              {t('settings.help.heroSubtitle') || 'אנחנו כאן כדי לעזור לך'}
            </Text>
          </LinearGradient>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.menuItem,
                { backgroundColor: theme.colors.surface },
                index === menuItems.length - 1 && styles.menuItemLast,
              ]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemContent, rtlContainer]}>
                <View style={[styles.menuIconContainer, { backgroundColor: item.iconColor + '15' }]}>
                  <MaterialCommunityIcons 
                    name={item.icon as any} 
                    size={24} 
                    color={item.iconColor} 
                  />
                </View>
                <View style={styles.menuTextContainer}>
                  <Text variant="titleMedium" style={[styles.menuItemTitle, rtlText]}>
                    {item.title}
                  </Text>
                  <Text variant="bodySmall" style={[styles.menuItemDescription, rtlText]}>
                    {item.description}
                  </Text>
                </View>
                <MaterialCommunityIcons 
                  name="chevron-left" 
                  size={24} 
                  color={theme.colors.onSurfaceVariant} 
                  style={styles.chevronIcon}
                />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Version Info Card */}
        <Card style={[styles.versionCard, { backgroundColor: theme.colors.surface }]} mode="outlined">
          <Card.Content style={styles.versionCardContent}>
            <View style={[styles.versionHeader, rtlContainer]}>
              <MaterialCommunityIcons 
                name="information-outline" 
                size={20} 
                color={theme.colors.onSurfaceVariant} 
              />
              <Text variant="titleSmall" style={[styles.versionTitle, rtlText]}>
                {t('settings.versionInfo') || 'מידע על גרסה'}
              </Text>
            </View>
            <View style={styles.versionInfo}>
              <View style={[styles.versionRow, rtlContainer]}>
                <Text variant="bodyMedium" style={[styles.versionLabel, rtlText]}>
                  {t('settings.help.appVersion') || 'גרסת אפליקציה'}
                </Text>
                <Text variant="bodyMedium" style={[styles.versionValue, rtlText]}>
                  {appVersion}
                </Text>
              </View>
              <View style={[styles.versionRow, rtlContainer]}>
                <Text variant="bodyMedium" style={[styles.versionLabel, rtlText]}>
                  {t('settings.help.buildNumber') || 'מספר בנייה'}
                </Text>
                <Text variant="bodyMedium" style={[styles.versionValue, rtlText]}>
                  1.0.0
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  heroSection: {
    marginBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  heroGradient: {
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
  },
  heroIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  heroTitle: {
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: '#6B7280',
    textAlign: 'center',
    opacity: 0.8,
  },
  menuSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  menuItem: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  menuItemLast: {
    marginBottom: 0,
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  menuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuTextContainer: {
    flex: 1,
    gap: 4,
  },
  menuItemTitle: {
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  menuItemDescription: {
    color: '#6B7280',
    lineHeight: 20,
  },
  chevronIcon: {
    opacity: 0.5,
    flexShrink: 0,
  },
  versionCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderColor: '#E5E7EB',
  },
  versionCardContent: {
    padding: 20,
  },
  versionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  versionTitle: {
    fontWeight: '600',
    color: '#1A1A1A',
  },
  versionInfo: {
    gap: 12,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  versionLabel: {
    color: '#6B7280',
    fontWeight: '500',
  },
  versionValue: {
    color: '#1A1A1A',
    fontWeight: '600',
  },
});

