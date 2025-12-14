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
          {t('info.terms.heading') || 'תנאי שימוש – ExpiryX'}
        </Text>

        <Text style={[styles.updated, rtlText]}>
          {t('info.terms.updated') || 'עודכן: 2025'}
        </Text>

        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.intro1') || 'ברוך הבא לאפליקציית ExpiryX ("האפליקציה").'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.intro2') ||
            'השימוש באפליקציה מהווה הסכמה לכל התנאים המפורטים במסמך זה. אם אינך מסכים – אל תשתמש באפליקציה.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section1Title') || '1. מטרת האפליקציה'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section1Body1') ||
            'האפליקציה מאפשרת ניהול מוצרים ותאריכי תפוגה, קבלת התראות, והזנת מוצרים ידנית או באמצעות סריקת ברקוד.'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section1Body2') ||
            'האפליקציה אינה מהווה תחליף לבדיקת תאריכי תפוגה בפועל, ולא נושאת באחריות לדיוק מלא של הנתונים.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section2Title') || '2. אחריות המשתמש'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section2BodyIntro') || 'המשתמש מאשר כי:'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section2Bullet1') || 'האחריות על בדיקת תאריכי התפוגה בפועל היא עליו בלבד.'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section2Bullet2') ||
            'ייתכנו טעויות, עיכובים או אי-דיוקים בתצוגת התוקף או בהתראות.'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section2Bullet3') ||
            'האפליקציה לא אחראית לנזק ישיר או עקיף הנגרם משימוש בנתונים.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section3Title') || '3. הרשאות'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section3BodyIntro') || 'האפליקציה עשויה לבקש:'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section3Bullet1') || 'הרשאת מצלמה (לסריקה)'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section3Bullet2') || 'הרשאת התראות'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section3Bullet3') || "הרשאות נוספות בהתאם לפיצ'רים עתידיים"}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section3Body2') || 'סירוב להרשאות עלול להגביל חלק מהשירותים.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section4Title') || '4. תוכן משתמש'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section4Body1') || 'כל מידע שהמשתמש מזין נשמר בענן Supabase.'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section4Body2') ||
            'המשתמש אחראי שלא להזין תוכן מטעה, פוגעני או בלתי חוקי.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section5Title') || '5. איסור שימוש אסור'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section5BodyIntro') || 'אסור למשתמש:'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section5Bullet1') || 'לשנות, להעתיק, לשכפל או להפיץ את האפליקציה ללא רשות.'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section5Bullet2') || 'לנסות לגשת לקוד המקור, למסד הנתונים או לשרתים.'}
        </Text>
        <Text style={[styles.paragraph, styles.bullet, rtlText]}>
          • {t('info.terms.section5Bullet3') || 'להשתמש באפליקציה לצרכים זדוניים.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section6Title') || '6. הפסקת שימוש'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section6Body1') ||
            'במקרים של שימוש אסור או חריגה מהתנאים – המפתח רשאי לחסום גישה או למחוק חשבון.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section7Title') || '7. שינוי תנאים'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section7Body1') || 'התנאים עשויים להתעדכן מעת לעת.'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section7Body2') ||
            'המשך שימוש מהווה הסכמה לתנאים המעודכנים.'}
        </Text>

        <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
          {t('info.terms.section8Title') || '8. יצירת קשר'}
        </Text>
        <Text style={[styles.paragraph, rtlText]}>
          {t('info.terms.section8Body1') ||
            'לשאלות ניתן לפנות לכתובת האימייל המופיעה באפליקציה.'}
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

