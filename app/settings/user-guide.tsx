/**
 * User Guide Screen
 * Displays comprehensive Hebrew user guide for ExpiryX unique features
 */

import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
  Appbar,
  Card,
  Text,
  List,
  Divider,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME_COLORS } from '@/lib/constants/colors';

export default function UserGuideScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);

  const sections = [
    {
      id: 'scanning',
      title: 'מסך הבית – סריקה וניהול מוצרים',
      icon: 'barcode-scan',
      content: [
        'הפעולה המרכזית באפליקציה היא סריקת ברקוד של מוצר.',
        'לחץ על כפתור "סרוק מוצר" במסך הסריקה.',
        'כוון את המצלמה אל הברקוד של המוצר.',
        'האפליקציה תזהה את הברקוד ותטען אוטומטית את שם המוצר (אם הוא קיים במאגר).',
        'אחרי הסריקה נפתח מסך "הוסף מוצר" עם פרטי המוצר.',
        'תצטרך להזין: תאריך תפוגה (חובה), קטגוריה (אופציונלי).',
        'לחץ על "שמור" כדי להוסיף את המוצר לרשימה.',
      ],
    },
    {
      id: 'manual-add',
      title: 'הוספת מוצר ללא ברקוד',
      icon: 'plus-circle-outline',
      content: [
        'לא לכל המוצרים יש ברקוד. לכן, האפליקציה מאפשרת הוספה ידנית.',
        'במסך הסריקה, לחץ על הכפתור "הוסף ללא ברקוד" בתחתית המסך.',
        'נפתח מסך הוספת מוצר עם השדות: שם המוצר (חובה), תאריך תפוגה (חובה), קטגוריה (אופציונלי).',
        'לאחר מילוי הפרטים, לחץ על "שמור".',
        'המוצר מתווסף לרשימת המוצרים שלך ויופיע בטאב "הכל" או "פג תוקף" בהתאם לתאריך התפוגה.',
      ],
    },
    {
      id: 'product-list',
      title: 'רשימת מוצרים ותאריכי תפוגה',
      icon: 'format-list-bulleted',
      content: [
        'האפליקציה מציגה את המוצרים שלך עם סימונים ויזואליים לפי מצב התפוגה:',
        '🟢 ירוק - מוצר עם זמן ארוך עד התפוגה (מעל יום אחד)',
        '🟠 כתום - מוצר שפג תוקפו מחר (יום אחד לפני)',
        '🔴 אדום - מוצר שפג תוקפו היום או שכבר פג תוקפו',
        'טאב "הכל" - מציג את כל המוצרים הפעילים (שטרם פג תוקפם)',
        'טאב "פג תוקף" - מציג את כל המוצרים שפג תוקפם',
        'תוכל לסנן את המוצרים לפי מספר ימים לפני תפוגה באמצעות כפתור הסינון בטאב "הכל".',
      ],
    },
    {
      id: 'change-date',
      title: 'כפתור "שינוי תאריך" למוצרים דחופים',
      icon: 'calendar-edit',
      content: [
        'זוהי תכונה חשובה המאפשרת לך לעדכן במהירות את תאריך התפוגה של מוצרים דחופים.',
        'הכפתור "שנה תאריך" (אייקון לוח שנה) מופיע אוטומטית עבור:',
        '• מוצרים שפג תוקפם היום',
        '• מוצרים שפג תוקפם מחר',
        '• מוצרים שכבר פג תוקפם',
        'איך להשתמש:',
        '1. במסך רשימת המוצרים, חפש את הכפתור עם אייקון הלוח שנה ליד כפתורי העריכה והמחיקה',
        '2. לחץ על הכפתור',
        '3. נפתח ממשק בחירת תאריך חדש (גלגל בחירה)',
        '4. בחר תאריך חדש',
        '5. לחץ על "עדכן"',
        '6. התאריך מתעדכן אוטומטית והמוצר יועבר לטאב המתאים',
      ],
    },
    {
      id: 'notifications',
      title: 'התראות על מוצרים שעומדים לפוג',
      icon: 'bell',
      content: [
        'האפליקציה שולחת התראות אוטומטיות על מוצרים שקרובים לתפוגה.',
        'הגדרת התראות (פעם ראשונה):',
        '1. עבור להגדרות → התראות',
        '2. הפעל את "התראות Push"',
        '3. תצטרך לאשר את הרשאות ההתראות במכשיר שלך',
        '4. הגדר את "מספר הימים לפני תפוגה" (לדוגמה: 1, 3, או 7 ימים)',
        '5. הגדר את "זמן תזכורת" (לדוגמה: 09:00)',
        '6. לחץ על "שמור"',
        'איך זה עובד:',
        '• המערכת בודקת את המוצרים שלך מדי יום בשעה שהגדרת',
        '• אם יש מוצרים שפג תוקפם תוך מספר הימים שהגדרת, תקבל התראה',
        '• ההתראות נשלחות רק עבור מוצרים שיש להם תאריך תפוגה מוגדר',
        'אם לא מגיעות התראות:',
        '• בדוק שהפעלת את "התראות Push" בהגדרות',
        '• בדוק את הרשאות ההתראות במכשיר (iOS: הגדרות → התראות → ExpiryX, Android: הגדרות → אפליקציות → ExpiryX → התראות)',
        '• ודא שיש לך חיבור לאינטרנט',
        '• ודא שהגדרת מספר ימים לפני תפוגה (לא 0 אלא 1 או יותר)',
      ],
    },
    {
      id: 'settings',
      title: 'מסך ההגדרות',
      icon: 'cog',
      content: [
        'במסך ההגדרות תוכל להתאים את האפליקציה לצרכים שלך.',
        'תכונות ייחודיות:',
        'התראות ואוטומציה:',
        '• שינוי מספר הימים לפני התפוגה לקבלת התראה (0 = באותו יום, 1 = יום לפני, וכו\')',
        '• הגדרת זמן תזכורת יומית (לדוגמה: 09:00)',
        '• הפעלה/כיבוי של התראות Push',
        'התאמות ממשק:',
        '• האפליקציה תומכת ב-RTL (עברית) באופן מלא',
        '• כל הטקסטים והכפתורים מיושרים אוטומטית לעברית',
        '• הצבעים והעיצוב מותאמים לנוחות השימוש',
      ],
    },
    {
      id: 'faq',
      title: 'שאלות נפוצות (FAQ)',
      icon: 'help-circle',
      content: [
        'הסריקה לא עובדת:',
        '• בדוק שהאפליקציה קיבלה הרשאה לשימוש במצלמה',
        '• ודא שיש תאורה מספקת',
        '• נסה לסרוק שוב - לפעמים צריך כמה ניסיונות',
        '• אם הברקוד פגום או מטושטש, השתמש בכפתור "הוסף ללא ברקוד"',
        '',
        'מוצר שנסרק ולא מזהה שם:',
        '• זה תקין! לא כל המוצרים קיימים במאגר',
        '• במסך ההוספה, תוכל להזין את שם המוצר ידנית',
        '• לאחר שמירה, המוצר יישמר במאגר שלך',
        '',
        'התראות לא מופיעות:',
        '• בדוק הרשאות במכשיר (iOS: הגדרות → התראות → ExpiryX, Android: הגדרות → אפליקציות → ExpiryX → התראות)',
        '• בדוק חיבור לאינטרנט',
        '• בדוק את הגדרת ימי התראה בהגדרות → התראות',
        '• ודא שיש לך מוצרים עם תאריך תפוגה',
        '',
        'תאריך לא נשמר אחרי שינוי:',
        '• בדוק שיש לך חיבור לאינטרנט - השינויים נשמרים בענן',
        '• נסה שוב - לפעמים יש עיכוב קצר ברשת',
        '• אם הבעיה נמשכת, סגור ופתח את האפליקציה מחדש',
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="מדריך משתמש" />
      </Appbar.Header>

      <ScrollView style={styles.content}>
        <Card style={styles.introCard}>
          <Card.Content>
            <Text variant="titleLarge" style={[styles.introTitle, rtlText]}>
              ברוכים הבאים ל-ExpiryX
            </Text>
            <Text style={[styles.introText, rtlText]}>
              מדריך זה מסביר את התכונות הייחודיות של האפליקציה לניהול מוצרים ותאריכי תפוגה.
            </Text>
          </Card.Content>
        </Card>

        {sections.map((section, index) => (
          <Card key={section.id} style={styles.sectionCard}>
            <Card.Content>
              <View style={[styles.sectionHeader, rtlText]}>
                <MaterialCommunityIcons
                  name={section.icon as any}
                  size={24}
                  color={THEME_COLORS.primary}
                  style={styles.sectionIcon}
                />
                <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                  {section.title}
                </Text>
              </View>
              <Divider style={styles.divider} />
              {section.content.map((item, itemIndex) => {
                if (item === '') {
                  return <View key={itemIndex} style={styles.spacer} />;
                }
                const isBullet = item.startsWith('•') || item.startsWith('🟢') || item.startsWith('🟠') || item.startsWith('🔴');
                const isNumbered = /^\d+\./.test(item);
                return (
                  <Text
                    key={itemIndex}
                    style={[
                      styles.contentText,
                      rtlText,
                      isBullet && styles.bulletText,
                      isNumbered && styles.numberedText,
                    ]}
                  >
                    {item}
                  </Text>
                );
              })}
            </Card.Content>
          </Card>
        ))}

        <Card style={styles.summaryCard}>
          <Card.Content>
            <Text variant="titleMedium" style={[styles.summaryTitle, rtlText]}>
              סיכום
            </Text>
            <Text style={[styles.summaryText, rtlText]}>
              ExpiryX עוזרת לך לנהל את המוצרים שלך בקלות ובנוחות. התכונות העיקריות:
            </Text>
            <View style={styles.featureList}>
              {[
                '✅ סריקת ברקוד להוספה מהירה',
                '✅ הוספה ידנית למוצרים ללא ברקוד',
                '✅ סימונים ויזואליים לפי מצב התפוגה',
                '✅ שינוי תאריך מהיר למוצרים דחופים',
                '✅ התראות אוטומטיות לפני תפוגה',
                '✅ ממשק עברי מלא (RTL)',
              ].map((feature, index) => (
                <Text key={index} style={[styles.featureText, rtlText]}>
                  {feature}
                </Text>
              ))}
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  introCard: {
    marginBottom: 16,
    backgroundColor: THEME_COLORS.primary,
  },
  introTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 8,
    fontSize: 22,
  },
  introText: {
    color: '#FFFFFF',
    opacity: 0.95,
    lineHeight: 22,
    fontSize: 15,
  },
  sectionCard: {
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: {
    marginEnd: 12,
  },
  sectionTitle: {
    flex: 1,
    fontWeight: '600',
    color: '#212121',
  },
  divider: {
    marginBottom: 12,
    marginTop: 4,
  },
  contentText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#424242',
    marginBottom: 8,
  },
  bulletText: {
    marginStart: 16,
  },
  numberedText: {
    marginStart: 8,
  },
  spacer: {
    height: 12,
  },
  summaryCard: {
    marginBottom: 24,
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: THEME_COLORS.primaryLight,
  },
  summaryTitle: {
    fontWeight: '700',
    marginBottom: 12,
    color: THEME_COLORS.primary,
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#424242',
    marginBottom: 16,
  },
  featureList: {
    gap: 8,
  },
  featureText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#424242',
  },
});

