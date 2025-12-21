/**
 * Privacy Policy Summary Screen
 */

import { useLanguage } from '@/context/LanguageContext';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Text } from 'react-native-paper';

export default function PrivacySummaryScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('info.privacySummary.title')} />
      </Appbar.Header>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <Text variant="headlineSmall" style={[styles.title, rtlText]}>
          {t('info.privacySummary.title')}
        </Text>

        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacySummary.disclaimer1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacySummary.disclaimer2')}
        </Text>

        {/* What information we collect */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacySummary.collectedTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.collectedBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.collectedBullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.collectedBullet3')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.collectedBullet4')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.collectedBullet5')}
        </Text>

        {/* How we use the information */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacySummary.purposesTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.purposesBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.purposesBullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.purposesBullet3')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.purposesBullet4')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.purposesBullet5')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.purposesBullet6')}
        </Text>

        {/* Sharing of information */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacySummary.sharingTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.sharingBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.sharingBullet2')}
        </Text>

        {/* User responsibility */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacySummary.responsibilityTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.responsibilityBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.responsibilityBullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.responsibilityBullet3')}
        </Text>

        {/* Information security */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacySummary.securityTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.securityBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.securityBullet2')}
        </Text>

        {/* Children and minors */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacySummary.childrenTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.childrenBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.childrenBullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.childrenBullet3')}
        </Text>

        {/* User rights */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacySummary.rightsTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.rightsBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.rightsBullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacySummary.rightsBullet3')}
        </Text>
        <Button
          mode="text"
          onPress={() => Linking.openURL(t('info.privacySummary.linkUrl') as string)}
          style={{ marginTop: 12 }}
          labelStyle={[styles.linkButtonLabel, rtlText]}
        >
          {t('info.privacySummary.linkLabel')}
        </Button>
      </ScrollView>
    </View>
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
    scrollContent: {
      padding: 20,
    },
    title: {
      fontWeight: '700',
      marginBottom: 8,
      textAlign: isRTL ? 'right' : 'left',
    },
    sectionTitle: {
      fontWeight: '600',
      marginTop: 24,
      marginBottom: 12,
      textAlign: isRTL ? 'right' : 'left',
    },
    paragraph: {
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 8,
      textAlign: isRTL ? 'right' : 'left',
      color: '#212121',
    },
    bullet: {
      marginStart: 16,
    },
    linkButtonLabel: {
      fontSize: 14,
      color: '#1976D2',
      textDecorationLine: 'underline',
    },
  });
}
