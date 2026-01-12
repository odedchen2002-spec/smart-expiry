/**
 * Guide Screen - User Guide
 * Updated: Compact, value-focused, no categories
 */

import React from 'react';
import { View, StyleSheet, ScrollView, Platform, TouchableOpacity } from 'react-native';
import { Appbar, Card, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// Checklist item component for quick start
interface ChecklistItemProps {
  number: number;
  text: string;
  icon: string;
  color: string;
  isRTL: boolean;
}

function ChecklistItem({ number, text, icon, color, isRTL }: ChecklistItemProps) {
  return (
    <View style={[checklistStyles.row, isRTL && checklistStyles.rowRTL]}>
      <View style={[checklistStyles.numberCircle, { backgroundColor: color + '20' }]}>
        <Text style={[checklistStyles.number, { color }]}>{number}</Text>
      </View>
      <View style={[checklistStyles.iconContainer, { backgroundColor: color + '15' }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[checklistStyles.text, isRTL && checklistStyles.textRTL]}>{text}</Text>
    </View>
  );
}

const checklistStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
  numberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  number: {
    fontSize: 14,
    fontWeight: '700',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  textRTL: {
    textAlign: 'right',
  },
});

export default function GuideScreen() {
  const router = useRouter();
  const { t, isRTL, locale } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);
  const rtlContainer = getRtlContainerStyles(isRTL);
  const styles = createStyles(isRTL);
  const isEnglish = locale === 'en';

  const handleBack = () => {
    router.back();
  };

  const handleStartAdding = () => {
    router.push('/(tabs)/scanner' as any);
  };

  // Localized content
  const content = {
    title: isEnglish ? 'User Guide' : 'מדריך שימוש',
    welcome: isEnglish ? 'Welcome 👋' : 'ברוכים הבאים 👋',
    welcomeSubtitle: isEnglish 
      ? 'In 3 steps you\'ll manage product expiry like a pro'
      : 'ב־3 צעדים תתחיל לנהל תוקף מוצרים כמו מקצוען',
    welcomeTagline: isEnglish
      ? 'Add products, get alerts, and avoid waste.'
      : 'הוסף מוצרים, קבל התראות, וחסוך זריקות מיותרות.',
    quickStart: isEnglish ? '🚀 Quick Start' : '🚀 התחלה מהירה',
    step1: isEnglish ? 'Scan product (or add manually)' : 'סרוק מוצר (או הוסף ידנית)',
    step2: isEnglish ? 'Choose expiry date' : 'בחר תאריך תפוגה',
    step3: isEnglish ? 'Get notified before expiry' : 'קבל התראה לפני שפג התוקף',
    notifications: isEnglish ? '🔔 Notifications & Automation' : '🔔 התראות ואוטומציה',
    pushNotifications: isEnglish ? 'Push Notifications' : 'התראות Push',
    pushDesc: isEnglish ? 'Daily reminders before products expire' : 'תזכורות יומיות לפני שמוצרים פגים',
    pushTip: isEnglish 
      ? '💡 Recommended - so you never forget a product.'
      : '💡 מומלץ להפעיל – כך לא תשכח אף מוצר.',
    customReminders: isEnglish ? 'Custom Reminders' : 'תזכורות מותאמות',
    customDesc: isEnglish ? 'Set how many days in advance to get notified' : 'הגדר כמה ימים מראש לקבל התראה',
    autoDelete: isEnglish ? 'Auto Delete' : 'מחיקה אוטומטית',
    autoDeleteDesc: isEnglish ? 'Expired products are deleted automatically' : 'מוצרים שפג תוקפם נמחקים אוטומטית',
    autoDeleteTip: isEnglish
      ? '💡 Keeps your list clean without manual work.'
      : '💡 שומר על רשימה נקייה בלי עבודה ידנית.',
    productManagement: isEnglish ? '📦 Product Management' : '📦 ניהול מוצרים',
    productLists: isEnglish ? 'Product Lists' : 'רשימות מוצרים',
    productListsDesc: isEnglish ? 'View all products or only expiring ones' : 'צפה בכל המוצרים או רק בפגי תוקף',
    visualMarkers: isEnglish ? 'Visual Markers' : 'סימונים ויזואליים',
    visualMarkersDesc: isEnglish 
      ? '🟢 OK  •  🟠 Tomorrow  •  🔴 Today or Expired'
      : '🟢 בסדר  •  🟠 מחר  •  🔴 היום או פג',
    dataExport: isEnglish ? '📤 Data Export' : '📤 ייצוא נתונים',
    advanced: isEnglish ? 'Advanced' : 'מתקדם',
    csvExport: isEnglish ? 'CSV Export' : 'ייצוא CSV',
    csvDesc: isEnglish ? 'For use in Excel or spreadsheets' : 'לשימוש באקסל או גיליונות',
    pdfExport: isEnglish ? 'PDF Export' : 'ייצוא PDF',
    pdfDesc: isEnglish ? 'Professional report with all products' : 'דוח מקצועי עם כל המוצרים',
    exportNote: isEnglish 
      ? 'For audits, accountants, or supplier work.'
      : 'מיועד לבקרה, רואי חשבון או עבודה מול ספקים.',
    tipsAndTricks: isEnglish ? '💡 Tips & Tricks' : '💡 טיפים וטריקים',
    tip1: isEnglish ? 'Scan multiple products in a row' : 'סרוק כמה מוצרים ברצף',
    tip1Suffix: isEnglish ? ' - saves time' : ' – חוסך זמן',
    tip2: isEnglish ? 'Check "Expiring This Week"' : 'בדוק "פג השבוע"',
    tip2Suffix: isEnglish ? ' every morning' : ' כל בוקר',
    tip3: isEnglish ? 'Set early alerts' : 'הגדר התראות מוקדמות',
    tip3Suffix: isEnglish ? ' for sensitive products' : ' למוצרים רגישים',
    startAdding: isEnglish ? '👉 Start adding products' : '👉 התחל להוסיף מוצרים',
    questions: isEnglish ? 'Questions? Contact us' : 'שאלות? צור קשר',
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: THEME_COLORS.surfaceVariant }}>
        <Appbar.BackAction onPress={handleBack} />
        <Appbar.Content title={content.title} />
      </Appbar.Header>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Card - Updated copy */}
        <Card style={styles.welcomeCard} elevation={0}>
          <Card.Content style={styles.welcomeContent}>
            <Text style={[styles.welcomeTitle, rtlText]}>
              {content.welcome}
            </Text>
            <Text style={[styles.welcomeSubtitle, rtlText]}>
              {content.welcomeSubtitle}
            </Text>
            <Text style={[styles.welcomeTagline, rtlText]}>
              {content.welcomeTagline}
            </Text>
          </Card.Content>
        </Card>

        {/* 1. Quick Start - Visual Checklist */}
        <Card style={styles.sectionCard} elevation={0}>
          <Card.Content style={styles.sectionCardContent}>
            <View style={[styles.sectionHeader, rtlContainer]}>
              <View style={[styles.sectionIconContainer, { backgroundColor: THEME_COLORS.primary + '20' }]}>
                <MaterialCommunityIcons 
                  name="rocket-launch" 
                  size={22} 
                  color={THEME_COLORS.primary} 
                />
              </View>
              <Text style={[styles.sectionTitle, rtlText]}>
                {content.quickStart}
              </Text>
            </View>

            <View style={styles.checklistContainer}>
              <ChecklistItem 
                number={1}
                icon="barcode-scan"
                text={content.step1}
                color={THEME_COLORS.primary}
                isRTL={isRTL}
              />
              <ChecklistItem 
                number={2}
                icon="calendar"
                text={content.step2}
                color="#F59E0B"
                isRTL={isRTL}
              />
              <ChecklistItem 
                number={3}
                icon="bell-ring"
                text={content.step3}
                color="#22C55E"
                isRTL={isRTL}
              />
            </View>
          </Card.Content>
        </Card>

        {/* 2. Notifications & Automation */}
        <Card style={styles.sectionCard} elevation={0}>
          <Card.Content style={styles.sectionCardContent}>
            <View style={[styles.sectionHeader, rtlContainer]}>
              <View style={[styles.sectionIconContainer, { backgroundColor: '#FF9800' + '20' }]}>
                <MaterialCommunityIcons 
                  name="bell-ring" 
                  size={22} 
                  color="#FF9800" 
                />
              </View>
              <Text style={[styles.sectionTitle, rtlText]}>
                {content.notifications}
              </Text>
            </View>

            <View style={styles.itemsList}>
              <View style={styles.itemRow}>
                <View style={[styles.itemIconSmall, { backgroundColor: '#FF9800' + '15' }]}>
                  <MaterialCommunityIcons name="bell-outline" size={18} color="#FF9800" />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.itemTitle, rtlText]}>{content.pushNotifications}</Text>
                  <Text style={[styles.itemDesc, rtlText]}>{content.pushDesc}</Text>
                  <Text style={[styles.itemTip, rtlText]}>
                    {content.pushTip}
                  </Text>
                </View>
              </View>

              <View style={styles.itemDivider} />

              <View style={styles.itemRow}>
                <View style={[styles.itemIconSmall, { backgroundColor: '#FF9800' + '15' }]}>
                  <MaterialCommunityIcons name="calendar-alert" size={18} color="#FF9800" />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.itemTitle, rtlText]}>{content.customReminders}</Text>
                  <Text style={[styles.itemDesc, rtlText]}>{content.customDesc}</Text>
                </View>
              </View>

              <View style={styles.itemDivider} />

              <View style={styles.itemRow}>
                <View style={[styles.itemIconSmall, { backgroundColor: '#FF9800' + '15' }]}>
                  <MaterialCommunityIcons name="delete-sweep" size={18} color="#FF9800" />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.itemTitle, rtlText]}>{content.autoDelete}</Text>
                  <Text style={[styles.itemDesc, rtlText]}>{content.autoDeleteDesc}</Text>
                  <Text style={[styles.itemTip, rtlText]}>
                    {content.autoDeleteTip}
                  </Text>
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* 3. Product Management */}
        <Card style={styles.sectionCard} elevation={0}>
          <Card.Content style={styles.sectionCardContent}>
            <View style={[styles.sectionHeader, rtlContainer]}>
              <View style={[styles.sectionIconContainer, { backgroundColor: '#4CAF50' + '20' }]}>
                <MaterialCommunityIcons 
                  name="package-variant" 
                  size={22} 
                  color="#4CAF50" 
                />
              </View>
              <Text style={[styles.sectionTitle, rtlText]}>
                {content.productManagement}
              </Text>
            </View>

            <View style={styles.itemsList}>
              <View style={styles.itemRow}>
                <View style={[styles.itemIconSmall, { backgroundColor: '#4CAF50' + '15' }]}>
                  <MaterialCommunityIcons name="format-list-bulleted" size={18} color="#4CAF50" />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.itemTitle, rtlText]}>{content.productLists}</Text>
                  <Text style={[styles.itemDesc, rtlText]}>
                    {content.productListsDesc}
                  </Text>
                </View>
              </View>

              <View style={styles.itemDivider} />

              <View style={styles.itemRow}>
                <View style={[styles.itemIconSmall, { backgroundColor: '#4CAF50' + '15' }]}>
                  <MaterialCommunityIcons name="palette" size={18} color="#4CAF50" />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.itemTitle, rtlText]}>{content.visualMarkers}</Text>
                  <Text style={[styles.itemDesc, rtlText]}>
                    {content.visualMarkersDesc}
                  </Text>
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* 4. Data Export - Marked as Advanced */}
        <Card style={styles.sectionCard} elevation={0}>
          <Card.Content style={styles.sectionCardContent}>
            <View style={[styles.sectionHeader, rtlContainer]}>
              <View style={[styles.sectionIconContainer, { backgroundColor: '#9C27B0' + '20' }]}>
                <MaterialCommunityIcons 
                  name="download" 
                  size={22} 
                  color="#9C27B0" 
                />
              </View>
              <View style={styles.sectionTitleRow}>
                <Text style={[styles.sectionTitle, rtlText]}>
                  {content.dataExport}
                </Text>
                <View style={styles.advancedBadge}>
                  <Text style={styles.advancedBadgeText}>{content.advanced}</Text>
                </View>
              </View>
            </View>

            <View style={styles.itemsList}>
              <View style={styles.itemRow}>
                <View style={[styles.itemIconSmall, { backgroundColor: '#9C27B0' + '15' }]}>
                  <MaterialCommunityIcons name="file-excel" size={18} color="#9C27B0" />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.itemTitle, rtlText]}>{content.csvExport}</Text>
                  <Text style={[styles.itemDesc, rtlText]}>{content.csvDesc}</Text>
                </View>
              </View>

              <View style={styles.itemDivider} />

              <View style={styles.itemRow}>
                <View style={[styles.itemIconSmall, { backgroundColor: '#9C27B0' + '15' }]}>
                  <MaterialCommunityIcons name="file-pdf-box" size={18} color="#9C27B0" />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.itemTitle, rtlText]}>{content.pdfExport}</Text>
                  <Text style={[styles.itemDesc, rtlText]}>{content.pdfDesc}</Text>
                </View>
              </View>

              <Text style={[styles.contextNote, rtlText]}>
                {content.exportNote}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* 5. Tips & Tricks - Rewritten */}
        <Card style={styles.sectionCard} elevation={0}>
          <Card.Content style={styles.sectionCardContent}>
            <View style={[styles.sectionHeader, rtlContainer]}>
              <View style={[styles.sectionIconContainer, { backgroundColor: '#F44336' + '20' }]}>
                <MaterialCommunityIcons 
                  name="lightbulb-on" 
                  size={22} 
                  color="#F44336" 
                />
              </View>
              <Text style={[styles.sectionTitle, rtlText]}>
                {content.tipsAndTricks}
              </Text>
            </View>

            <View style={styles.tipsList}>
              <Text style={styles.tipText}>
                💡 <Text style={styles.tipBold}>{content.tip1}</Text>{content.tip1Suffix}
              </Text>
              
              <Text style={styles.tipText}>
                💡 <Text style={styles.tipBold}>{content.tip2}</Text>{content.tip2Suffix}
              </Text>
              
              <Text style={styles.tipText}>
                💡 <Text style={styles.tipBold}>{content.tip3}</Text>{content.tip3Suffix}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Bottom CTA */}
        <View style={styles.ctaContainer}>
          <TouchableOpacity onPress={handleStartAdding} activeOpacity={0.9}>
            <LinearGradient
              colors={THEME_COLORS.primaryGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaButton}
            >
              <MaterialCommunityIcons name={isEnglish ? "arrow-right" : "arrow-left"} size={20} color="#FFFFFF" />
              <Text style={styles.ctaButtonText}>
                {content.startAdding}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => router.push('/settings/help' as any)}
            style={styles.secondaryCta}
          >
            <Text style={styles.secondaryCtaText}>
              {content.questions}
            </Text>
          </TouchableOpacity>
        </View>
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
      padding: 16,
      paddingBottom: 32,
    },
    welcomeCard: {
      marginBottom: 16,
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
      paddingVertical: 24,
      paddingHorizontal: 20,
    },
    welcomeTitle: {
      fontSize: 26,
      fontWeight: '700',
      color: '#212121',
      marginBottom: 8,
    },
    welcomeSubtitle: {
      fontSize: 17,
      fontWeight: '600',
      color: THEME_COLORS.primary,
      marginBottom: 8,
      lineHeight: 24,
    },
    welcomeTagline: {
      fontSize: 15,
      color: '#757575',
      lineHeight: 22,
    },
    sectionCard: {
      marginBottom: 12,
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
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    sectionHeader: {
      marginBottom: 14,
      alignItems: 'center',
      gap: 10,
    },
    sectionIconContainer: {
      width: 38,
      height: 38,
      borderRadius: 19,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sectionTitleRow: {
      flex: 1,
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: '#212121',
      letterSpacing: 0.2,
    },
    advancedBadge: {
      backgroundColor: '#9C27B0' + '20',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    advancedBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#9C27B0',
    },
    checklistContainer: {
      gap: 4,
    },
    itemsList: {
      gap: 0,
    },
    itemRow: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 10,
    },
    itemIconSmall: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 2,
    },
    itemTextContainer: {
      flex: 1,
    },
    itemTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: '#212121',
      marginBottom: 3,
    },
    itemDesc: {
      fontSize: 14,
      color: '#757575',
      lineHeight: 20,
    },
    itemTip: {
      fontSize: 13,
      color: '#F59E0B',
      marginTop: 6,
      fontWeight: '500',
    },
    itemDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: '#E0E0E0',
      marginLeft: isRTL ? 0 : 44,
      marginRight: isRTL ? 44 : 0,
      marginVertical: 4,
    },
    contextNote: {
      fontSize: 13,
      color: '#9C27B0',
      marginTop: 12,
      fontStyle: 'italic',
    },
    tipsList: {
      gap: 12,
      alignItems: 'center',
    },
    tipText: {
      fontSize: 15,
      color: '#374151',
      lineHeight: 24,
      textAlign: 'center',
    },
    tipBold: {
      fontWeight: '600',
      color: '#212121',
    },
    ctaContainer: {
      marginTop: 12,
      alignItems: 'center',
      gap: 14,
    },
    ctaButton: {
      flexDirection: isRTL ? 'row' : 'row-reverse',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 14,
      gap: 10,
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
    ctaButtonText: {
      fontSize: 17,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    secondaryCta: {
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    secondaryCtaText: {
      fontSize: 14,
      color: THEME_COLORS.primary,
      fontWeight: '500',
    },
  });
}
