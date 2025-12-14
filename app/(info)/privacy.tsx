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
          {t('info.privacy.heading') || 'מדיניות פרטיות – ExpiryX'}
        </Text>

        <Text style={[styles.updated, rtlText]}>
          {t('info.privacy.updated') || 'עודכן: 2025'}
        </Text>

        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.intro') ||
            'מדיניות פרטיות זו מסבירה איזה מידע נאסף באפליקציה וכיצד הוא משמש.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section1Title') || '1. מידע שנאסף'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section1BodyIntro') || 'האפליקציה עשויה לאסוף:'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet1') || 'כתובת אימייל'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet2') || 'פרטי מוצרים ותאריכי תפוגה'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet3') || 'מזהה מכשיר להתראות (Push Token)'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section1Bullet4') ||
            'מידע טכני בסיסי (גרסת מערכת, סוג מכשיר, לוגים)'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section1Body2') ||
            'אין איסוף מיקום, אנשי קשר או מידע בלתי רלוונטי.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section2Title') || '2. שימוש במידע'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section2BodyIntro') || 'המידע משמש ל:'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section2Bullet1') || 'שמירה וניהול של רשימת המוצרים'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section2Bullet2') || 'שליחת התראות'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section2Bullet3') || 'שיפור חוויית המשתמש'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section2Bullet4') || 'אבטחה ותחזוקת מערכת'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section3Title') || '3. העברת מידע לצד שלישי'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section3BodyIntro') ||
            'המידע עשוי להישמר או לעבור דרך שירותים חיצוניים מאובטחים:'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section3Bullet1') || 'Supabase – אחסון ואימות משתמשים'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section3Bullet2') || 'Expo / Firebase – לטובת התראות Push'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section3Body2') ||
            'לא מתבצע מכירה של מידע לצדדים שלישיים.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section4Title') || '4. אבטחת מידע'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section4Body1') ||
            'הנתונים נשמרים באמצעי אבטחה סבירים הכוללים הצפנה ותקני אבטחה מקובלים.'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section4Body2') ||
            'אין אפשרות להבטיח אבטחה מלאה לחלוטין.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section5Title') || '5. זכויות המשתמש'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section5BodyIntro') || 'המשתמש רשאי:'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section5Bullet1') || 'למחוק את הנתונים שלו'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section5Bullet2') || 'לעדכן מידע'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.privacy.section5Bullet3') ||
            'לבקש עותק מהמידע שנשמר עליו'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section6Title') || '6. ילדים'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section6Body1') ||
            'האפליקציה אינה מיועדת לילדים מתחת לגיל 13 ואינה אוספת מידע ביודעין מקטינים.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.privacy.section7Title') || '7. יצירת קשר'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.privacy.section7Body1') ||
            'לשאלות בנוגע לפרטיות ניתן לפנות לכתובת האימייל המופיעה באפליקציה.'}
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

