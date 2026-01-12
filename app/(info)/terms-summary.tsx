/**
 * Terms of Use Summary Screen
 */

import { useLanguage } from '@/context/LanguageContext';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Text } from 'react-native-paper';

export default function TermsSummaryScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#F5F5F5' }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('info.termsSummary.title')} />
      </Appbar.Header>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <Text variant="headlineSmall" style={[styles.title, rtlText]}>
          {t('info.termsSummary.title')}
        </Text>

        <Text style={[styles.paragraph, rtlText]}>
          {t('info.termsSummary.disclaimer1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.termsSummary.disclaimer2')}
        </Text>

        {/* Use of the App */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.termsSummary.useTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.useBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.useBullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.useBullet3')}
        </Text>

        {/* User Account */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.termsSummary.accountTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.accountBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.accountBullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.accountBullet3')}
        </Text>

        {/* Data and Content */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.termsSummary.dataTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.dataBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.dataBullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.dataBullet3')}
        </Text>

        {/* AI and Automated Outputs */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.termsSummary.aiTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.aiBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.aiBullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.aiBullet3')}
        </Text>

        {/* Notifications */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.termsSummary.notificationsTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.notificationsBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.notificationsBullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.notificationsBullet3')}
        </Text>

        {/* Payments and Subscriptions */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.termsSummary.paymentsTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.paymentsBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.paymentsBullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.paymentsBullet3')}
        </Text>

        {/* Service Availability */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.termsSummary.serviceTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.serviceBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.serviceBullet2')}
        </Text>

        {/* Liability */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.termsSummary.liabilityTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.liabilityBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.liabilityBullet2')}
        </Text>

        {/* Governing Law */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.termsSummary.lawTitle')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.lawBullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.termsSummary.lawBullet2')}
        </Text>
        <Button
          mode="text"
          onPress={() => Linking.openURL(t('info.termsSummary.linkUrl') as string)}
          style={{ marginTop: 12 }}
          labelStyle={[styles.linkButtonLabel, rtlText]}
        >
          {t('info.termsSummary.linkLabel')}
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
