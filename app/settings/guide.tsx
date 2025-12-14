/**
 * Guide Screen
 * Comprehensive user guide for the application
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Appbar, Card, Text, List, Divider } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GUIDE_SEEN_KEY = (userId: string) => `guide_seen_${userId}`;

export default function GuideScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);
  const { user } = useAuth();
  const params = useLocalSearchParams<{ firstTime?: string }>();
  const isFirstTime = params?.firstTime === 'true';

  // Mark guide as seen when component mounts (if first time)
  useEffect(() => {
    const markGuideAsSeen = async () => {
      if (isFirstTime && user?.id) {
        try {
          await AsyncStorage.setItem(GUIDE_SEEN_KEY(user.id), 'true');
        } catch (error) {
          console.error('Error marking guide as seen:', error);
        }
      }
    };

    markGuideAsSeen();
  }, [isFirstTime, user?.id]);

  const handleBack = () => {
    // If first time, navigate to main app after viewing guide
    if (isFirstTime) {
      router.replace('/(tabs)/scanner' as any);
    } else {
      router.back();
    }
  };

  const sections = [
    {
      title: t('settings.guide.gettingStarted') || 'התחלה מהירה',
      icon: 'rocket-launch',
      color: THEME_COLORS.primary,
      items: [
        {
          icon: 'barcode-scan',
          title: t('settings.guide.scanTitle') || 'סריקת ברקוד',
          description: t('settings.guide.scanDesc') || 'לחץ על כפתור הסריקה במסך הראשי, הנח את המצלמה על הברקוד והמוצר יתווסף אוטומטית.',
        },
        {
          icon: 'keyboard-outline',
          title: t('settings.guide.manualTitle') || 'הוספה ידנית',
          description: t('settings.guide.manualDesc') || 'לחץ על "הוסף מוצר ללא ברקוד" כדי להזין פרטי מוצר באופן ידני.',
        },
        {
          icon: 'calendar-clock',
          title: t('settings.guide.dateTitle') || 'בחירת תאריך תפוגה',
          description: t('settings.guide.dateDesc') || 'לאחר סריקה או הזנה ידנית, בחר תאריך תפוגה באמצעות גלגל התאריכים.',
        },
      ],
    },
    {
      title: t('settings.guide.organization') || 'ארגון וניהול',
      icon: 'folder-multiple',
      color: '#4CAF50',
      items: [
        {
          icon: 'tag-multiple',
          title: t('settings.guide.categoriesTitle') || 'קטגוריות',
          description: t('settings.guide.categoriesDesc') || 'צור קטגוריות כדי לארגן את המוצרים שלך. לחץ על "קטגוריות" בתפריט ההגדרות.',
        },
        {
          icon: 'format-list-bulleted',
          title: t('settings.guide.listsTitle') || 'רשימות מוצרים',
          description: t('settings.guide.listsDesc') || 'עיין בכל המוצרים או רק במוצרים שפג תוקפם בלשוניות "הכל" ו"פג תוקף".',
        },
      ],
    },
    {
      title: t('settings.guide.notifications') || 'התראות ואוטומציה',
      icon: 'bell-ring',
      color: '#FF9800',
      items: [
        {
          icon: 'bell-outline',
          title: t('settings.guide.notificationsTitle') || 'התראות Push',
          description: t('settings.guide.notificationsDesc') || 'הפעל התראות כדי לקבל תזכורות יומיות לפני שמוצרים עומדים לפוג.',
        },
        {
          icon: 'calendar-alert',
          title: t('settings.guide.reminderTitle') || 'תזכורות מותאמות',
          description: t('settings.guide.reminderDesc') || 'הגדר כמה ימים מראש לקבל התראה. ניתן לבחור בין 0-30 ימים.',
        },
        {
          icon: 'delete-sweep',
          title: t('settings.guide.autoDeleteTitle') || 'מחיקה אוטומטית',
          description: t('settings.guide.autoDeleteDesc') || 'הגדר מחיקה אוטומטית של מוצרים שפג תוקפם לאחר מספר ימים (1-15 ימים).',
        },
      ],
    },
    {
      title: t('settings.guide.export') || 'ייצוא נתונים',
      icon: 'download',
      color: '#9C27B0',
      items: [
        {
          icon: 'file-excel',
          title: t('settings.guide.csvTitle') || 'ייצוא CSV',
          description: t('settings.guide.csvDesc') || 'ייצא את כל המוצרים שלך לקובץ CSV לשימוש באקסל או גיליונות אלקטרוניים אחרים.',
        },
        {
          icon: 'file-pdf-box',
          title: t('settings.guide.pdfTitle') || 'ייצוא PDF',
          description: t('settings.guide.pdfDesc') || 'צור דוח PDF מקצועי של כל המוצרים שלך עם תאריכי תפוגה וקטגוריות.',
        },
      ],
    },
    {
      title: t('settings.guide.tips') || 'טיפים וטריקים',
      icon: 'lightbulb-on',
      color: '#F44336',
      items: [
        {
          icon: 'refresh',
          title: t('settings.guide.refreshTitle') || 'רענון נתונים',
          description: t('settings.guide.refreshDesc') || 'משוך מטה ברשימת המוצרים כדי לרענן את הנתונים מהשרת.',
        },
        {
          icon: 'magnify',
          title: t('settings.guide.searchTitle') || 'חיפוש מוצרים',
          description: t('settings.guide.searchDesc') || 'השתמש בשדה החיפוש כדי למצוא במהירות מוצרים ספציפיים ברשימה.',
        },
        {
          icon: 'account-circle',
          title: t('settings.guide.profileTitle') || 'ניהול פרופיל',
          description: t('settings.guide.profileDesc') || 'עדכן את פרטי העסק שלך, צפה במנוי שלך, וצור קשר עם תמיכה מהמסך "הגדרות".',
        },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: THEME_COLORS.surfaceVariant }}>
        <Appbar.BackAction onPress={handleBack} />
        <Appbar.Content title={t('settings.guide.title') || 'מדריך שימוש'} />
      </Appbar.Header>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Card */}
        <Card style={styles.welcomeCard} elevation={0}>
          <Card.Content style={styles.welcomeContent}>
            <View style={styles.welcomeIconContainer}>
              <MaterialCommunityIcons 
                name="book-open-variant" 
                size={48} 
                color={THEME_COLORS.primary} 
              />
            </View>
            <Text variant="titleLarge" style={[styles.welcomeTitle, getRtlTextStyles(isRTL, 'center')]}>
              {t('settings.guide.welcome') || 'ברוכים הבאים למדריך השימוש'}
            </Text>
            <Text variant="bodyMedium" style={[styles.welcomeText, getRtlTextStyles(isRTL, 'center')]}>
              {t('settings.guide.intro') ||
                'למד כיצד להשתמש באפליקציה בצורה יעילה כדי לנהל את המוצרים שלך ולמנוע בזבוז.'}
            </Text>
          </Card.Content>
        </Card>

        {/* Sections */}
        {sections.map((section, sectionIndex) => (
          <Card key={sectionIndex} style={styles.sectionCard} elevation={0}>
            <Card.Content style={styles.sectionCardContent}>
              <View style={[styles.sectionHeader, getRtlContainerStyles(isRTL)]}>
                <View style={[styles.sectionIconContainer, { backgroundColor: section.color + '20' }]}>
                  <MaterialCommunityIcons 
                    name={section.icon as any} 
                    size={24} 
                    color={section.color} 
                  />
                </View>
                <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                  {section.title}
                </Text>
              </View>

              <View style={styles.sectionItems}>
                {section.items.map((item, itemIndex) => (
                  <View key={itemIndex}>
                    <View style={[styles.itemRow, getRtlContainerStyles(isRTL)]}>
                      <View style={[styles.itemIconContainer, { backgroundColor: section.color + '15' }]}>
                        <MaterialCommunityIcons 
                          name={item.icon as any} 
                          size={20} 
                          color={section.color} 
                        />
                      </View>
                      <View style={styles.itemContent}>
                        <Text variant="titleSmall" style={[styles.itemTitle, rtlText]}>
                          {item.title}
                        </Text>
                        <Text variant="bodySmall" style={[styles.itemDescription, rtlText]}>
                          {item.description}
                        </Text>
                      </View>
                    </View>
                    {itemIndex < section.items.length - 1 && (
                      <View style={styles.itemDivider} />
                    )}
                  </View>
                ))}
              </View>
            </Card.Content>
          </Card>
        ))}

        {/* Footer */}
        <Card style={styles.footerCard} elevation={0}>
          <Card.Content style={styles.footerContent}>
            <MaterialCommunityIcons 
              name="help-circle-outline" 
              size={32} 
              color={THEME_COLORS.textSecondary} 
            />
            <Text variant="bodyMedium" style={[styles.footerText, getRtlTextStyles(isRTL, 'center')]}>
              {t('settings.guide.needHelp') || 'צריך עזרה נוספת?'}
            </Text>
            <Text variant="bodySmall" style={[styles.footerSubtext, getRtlTextStyles(isRTL, 'center')]}>
              {t('settings.guide.contactSupport') || 'צור קשר עם התמיכה מהמסך "הגדרות" > "עזרה ותמיכה"'}
            </Text>
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.surfaceVariant,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  welcomeCard: {
    marginBottom: 20,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  welcomeContent: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  welcomeIconContainer: {
    marginBottom: 16,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: THEME_COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
    textAlign: 'center',
  },
  welcomeText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#757575',
    textAlign: 'center',
  },
  sectionCard: {
    marginBottom: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  sectionCardContent: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    marginBottom: 20,
    alignItems: 'center',
    gap: 12,
  },
  sectionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    letterSpacing: 0.3,
  },
  sectionItems: {
    gap: 0,
  },
  itemRow: {
    paddingVertical: 12,
    alignItems: 'flex-start',
    gap: 14,
  },
  itemIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 6,
  },
  itemDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#757575',
  },
  itemDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E0E0',
    marginLeft: isRTL ? 0 : 50,
    marginRight: isRTL ? 50 : 0,
    marginVertical: 8,
  },
  footerCard: {
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: '#E3F2FD',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  footerContent: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME_COLORS.primary,
    textAlign: 'center',
  },
  footerSubtext: {
    fontSize: 14,
    lineHeight: 20,
    color: '#757575',
    textAlign: 'center',
  },
  });
}
