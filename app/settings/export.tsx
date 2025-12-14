/**
 * Export Data Screen
 * Export items to PDF
 */

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
  Appbar,
  Card,
  Button,
  Text,
  RadioButton,
  Snackbar,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useProfile } from '@/lib/hooks/useProfile';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import {
  fetchItemsForExport,
  exportAsPDF,
  shareFile,
  type DateRange,
} from '@/lib/export/exportData';

export default function ExportScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);
  const { activeOwnerId, ownerProfile } = useActiveOwner();
  const { profile } = useProfile();
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [exporting, setExporting] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  const handleExport = async () => {
    if (!activeOwnerId) {
      setSnack(t('settings.export.noActiveOwner'));
      return;
    }

    setExporting(true);
    try {
      // Fetch items based on date range
      const items = await fetchItemsForExport(activeOwnerId, dateRange);

      if (items.length === 0) {
        setSnack(t('settings.export.noProductsForRange'));
        setExporting(false);
        return;
      }

      // Export as PDF - use owner profile username if available
      const ownerName = ownerProfile?.username || (ownerProfile as any)?.profile_name || profile?.username || profile?.profile_name || 'Owner';
      const fileUri = await exportAsPDF(items, dateRange, ownerName);

      // Share the file
      await shareFile(fileUri);

      // Show success message
      setSnack(t('settings.export.fileCreatedSuccess'));
    } catch (error: any) {
      console.error('Error exporting data:', error);
      setSnack(
        error.message || t('settings.export.error')
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('settings.exportTitle') || 'ייצוא'} />
      </Appbar.Header>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={[THEME_COLORS.primary, THEME_COLORS.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <Text variant="headlineSmall" style={[styles.heroTitle, rtlText]}>
              {t('settings.exportTitle') || 'ייצוא נתונים'}
            </Text>
            <Text variant="bodyMedium" style={[styles.heroSubtitle, rtlText]}>
              {t('settings.export.description') ||
                'ייצא בקלות את נתוני המלאי שלך לקובץ PDF מעוצב, לשיתוף, גיבוי או דיווח.'}
            </Text>
          </LinearGradient>
        </View>

        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
              {t('settings.export.dateRange') || 'טווח תאריכים'}
            </Text>

            <View style={styles.radioGroup}>
              <RadioButton.Group onValueChange={(value) => setDateRange(value as DateRange)} value={dateRange}>
                <RadioButton.Item
                  label={t('home.all') || 'הכל'}
                  value="all"
                  labelStyle={[rtlText, styles.radioLabel]}
                  style={styles.radioItem}
                />
                <RadioButton.Item
                  label={t('home.today') || 'היום'}
                  value="today"
                  labelStyle={[rtlText, styles.radioLabel]}
                  style={styles.radioItem}
                />
                <RadioButton.Item
                  label={t('home.tomorrow') || 'מחר'}
                  value="tomorrow"
                  labelStyle={[rtlText, styles.radioLabel]}
                  style={styles.radioItem}
                />
                <RadioButton.Item
                  label={t('home.week') || '7 הימים הבאים'}
                  value="week"
                  labelStyle={[rtlText, styles.radioLabel]}
                  style={styles.radioItem}
                />
                <RadioButton.Item
                  label={t('home.expired') || 'פג תוקף'}
                  value="expired"
                  labelStyle={[rtlText, styles.radioLabel]}
                  style={styles.radioItem}
                />
              </RadioButton.Group>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.infoCard}>
          <Card.Content style={styles.cardContent}>
            <Text variant="bodySmall" style={[styles.infoText, rtlText]}>
              {t('settings.export.fieldsInfo') ||
                'הקובץ יכלול: שם מוצר, ברקוד, תאריך תפוגה, קטגוריה'}
            </Text>
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={handleExport}
          loading={exporting}
          disabled={exporting}
          style={styles.exportButton}
          contentStyle={styles.exportButtonContent}
          labelStyle={styles.exportButtonLabel}
          icon="download"
        >
          {t('settings.export.exportButton') || 'ייצא נתונים ל-PDF'}
        </Button>
      </ScrollView>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack(null)}
        duration={4000}
      >
        {snack}
      </Snackbar>
    </View>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 12,
  },
  heroContainer: {
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  heroGradient: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 6,
  },
  heroSubtitle: {
    color: '#E5E7EB',
    lineHeight: 22,
    textAlign: isRTL ? 'right' : 'left',
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  infoCard: {
    marginBottom: 24,
    borderRadius: 16,
    backgroundColor: '#E3F2FD',
    elevation: 0,
  },
  cardContent: {
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    marginBottom: 12,
    fontWeight: '700',
    fontSize: 17,
  },
  radioGroup: {
    marginTop: 4,
  },
  radioItem: {
    paddingVertical: 2,
  },
  radioLabel: {
    fontSize: 15,
  },
  infoText: {
    color: '#0B5394',
    textAlign: isRTL ? 'right' : 'left',
    lineHeight: 20,
  },
  exportButton: {
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  exportButtonContent: {
    paddingVertical: 12,
  },
  exportButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  });
}

