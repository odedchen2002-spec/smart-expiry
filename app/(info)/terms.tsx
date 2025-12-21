/**
 * Terms of Use Screen
 */

import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Appbar, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { useLanguage } from '@/context/LanguageContext';

export default function TermsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('info.terms.title')} />
      </Appbar.Header>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <Text variant="headlineSmall" style={[styles.title, rtlText]}>
          {t('info.terms.heading')}
        </Text>

        <Text style={[styles.updated, rtlText]}>
          {t('info.terms.updated')}
        </Text>

        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.intro')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.intro2')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.intro3')}
        </Text>

        {/* Section 1 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section1Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section1Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section1Body2')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section1Body3')}
        </Text>

        {/* Section 2 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section2Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section2Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section2Body2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section2Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section2Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section2Bullet3')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section2Body3')}
        </Text>

        {/* Section 3 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section3Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section3Body1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section3Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section3Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section3Bullet3')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section3Body2')}
        </Text>

        {/* Section 4 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section4Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section4Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section4Body2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section4Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section4Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section4Bullet3')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section4Body3')}
        </Text>

        {/* Section 5 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section5Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section5Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section5Body2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section5Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section5Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section5Bullet3')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section5Body3')}
        </Text>

        {/* Section 6 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section6Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section6Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section6Body2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section6Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section6Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section6Bullet3')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section6Body3')}
        </Text>

        {/* Section 7 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section7Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section7Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section7Body2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section7Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section7Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section7Bullet3')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section7Body3')}
        </Text>

        {/* Section 8 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section8Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section8Body1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section8Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section8Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section8Bullet3')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section8Body2')}
        </Text>

        {/* Section 9 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section9Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section9Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section9Body2')}
        </Text>

        {/* Section 10 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section10Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section10Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section10Body2')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section10Body3')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section10Body4')}
        </Text>

        {/* Section 11 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section11Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section11Body1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section11Bullet1')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section11Bullet2')}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section11Bullet3')}
        </Text>

        {/* Section 12 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section12Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section12Body1')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section12Body2')}
        </Text>

        {/* Section 13 */}
        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section13Title')}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section13Body1')}
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
