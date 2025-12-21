/**
 * Privacy Policy Screen
 */

import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Appbar, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { useLanguage } from '@/context/LanguageContext';

export default function PrivacyScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('info.privacy.title')} />
      </Appbar.Header>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <Text variant="headlineSmall" style={[styles.title, rtlText]}>
          {t('info.privacy.heading')}
        </Text>

        <Text style={[styles.updated, rtlText]}>
          {t('info.privacy.updated')}
        </Text>

        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.intro')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.intro2')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.intro3')}
        </Text>

        {/* Section 1 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section1Title')}
        </Text>
        
        <Text variant="titleSmall" style={[styles.subsectionTitle, rtlText]}>
          {t('info.privacy.section1Subtitle')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section1Body1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet3')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet4')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet5')}
        </Text>

        <Text variant="titleSmall" style={[styles.subsectionTitle, rtlText]}>
          {t('info.privacy.section1Subtitle2')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section1Body2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet6')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet7')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet8')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet9')}
        </Text>

        {/* Section 2 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section2Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section2Body1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section2Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section2Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section2Bullet3')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section2Bullet4')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section2Bullet5')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section2Bullet6')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section2Bullet7')}
        </Text>

        {/* Section 3 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section3Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section3Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section3Body2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section3Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section3Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section3Bullet3')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section3Body3')}
        </Text>

        {/* Section 4 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section4Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section4Body1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section4Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section4Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section4Bullet3')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section4Body2')}
        </Text>

        {/* Section 5 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section5Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section5Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section5Body2')}
        </Text>

        {/* Section 6 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section6Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section6Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section6Body2')}
        </Text>

        {/* Section 7 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section7Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section7Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section7Body2')}
        </Text>

        {/* Section 8 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section8Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section8Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section8Body2')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section8Body3')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section8Body4')}
        </Text>

        {/* Section 9 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section9Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section9Body1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section9Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section9Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section9Bullet3')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section9Bullet4')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section9Body2')}
        </Text>

        {/* Section 10 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section10Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section10Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section10Body2')}
        </Text>

        {/* Section 11 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section11Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section11Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section11Body2')}
        </Text>
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
    updated: {
      fontSize: 14,
      color: '#757575',
      marginBottom: 24,
      textAlign: isRTL ? 'right' : 'left',
    },
    sectionTitle: {
      fontWeight: '600',
      marginTop: 24,
      marginBottom: 12,
      textAlign: isRTL ? 'right' : 'left',
    },
    subsectionTitle: {
      fontWeight: '600',
      marginTop: 16,
      marginBottom: 8,
      textAlign: isRTL ? 'right' : 'left',
      color: '#424242',
    },
    paragraph: {
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 12,
      textAlign: isRTL ? 'right' : 'left',
      color: '#212121',
    },
    bullet: {
      marginStart: 16,
    },
  });
}
