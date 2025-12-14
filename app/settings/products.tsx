/**
 * Manage Products Settings Screen
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Platform, Alert, TouchableOpacity } from 'react-native';
import {
  Appbar,
  Card,
  Button,
  HelperText,
  Text,
  Switch,
  RadioButton,
  List,
} from 'react-native-paper';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '@/context/LanguageContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { deleteExpiredItemsByRetention } from '@/lib/supabase/mutations/items';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type DatePickerStyle = 'calendar' | 'spinner';

export default function ManageProductsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');
  const styles = createStyles(isRTL);
  const { activeOwnerId } = useActiveOwner();
  const [retentionDays, setRetentionDays] = useState(7);
  const [datePickerStyle, setDatePickerStyle] = useState<DatePickerStyle>('spinner');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ retentionDays?: string }>({});
  const [hasLoadedInitialValues, setHasLoadedInitialValues] = useState(false);
  const previousOwnerIdRef = useRef<string | null>(null);
  const savedRetentionDaysRef = useRef<number | null>(null);
  const hasEverSavedRef = useRef(false);

  // Storage keys for persisting saved values
  const getRetentionDaysStorageKey = () => {
    if (!activeOwnerId) return null;
    return `saved_retention_days_${activeOwnerId}`;
  };

  const getDatePickerStyleStorageKey = () => {
    if (!activeOwnerId) return null;
    return `date_picker_style_${activeOwnerId}`;
  };

  // Load saved values from AsyncStorage on mount
  useEffect(() => {
    const loadSavedValues = async () => {
      if (!activeOwnerId) return;

      try {
        // Load saved retention days
        const retentionKey = getRetentionDaysStorageKey();
        if (retentionKey) {
          const savedRetention = await AsyncStorage.getItem(retentionKey);
          if (savedRetention !== null) {
            const savedValue = parseInt(savedRetention, 10);
            if (!isNaN(savedValue) && savedValue >= 1 && savedValue <= 15) {
              savedRetentionDaysRef.current = savedValue;
              hasEverSavedRef.current = true;
              setRetentionDays(savedValue);
            }
          }
        }

        // Load saved date picker style
        const styleKey = getDatePickerStyleStorageKey();
        if (styleKey) {
          const savedStyle = await AsyncStorage.getItem(styleKey);
          if (savedStyle === 'calendar' || savedStyle === 'spinner') {
            setDatePickerStyle(savedStyle as DatePickerStyle);
          }
        }
      } catch (error) {
        console.error('[ManageProducts] Error loading saved values:', error);
      }

      setHasLoadedInitialValues(true);
      previousOwnerIdRef.current = activeOwnerId;
    };

    if (activeOwnerId && (!hasLoadedInitialValues || previousOwnerIdRef.current !== activeOwnerId)) {
      loadSavedValues();
    }
  }, [activeOwnerId, hasLoadedInitialValues]);

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    // Validate retention days
    if (retentionDays < 1 || retentionDays > 15) {
      newErrors.retentionDays = t('settings.notifications.retentionInvalid') || 'תקופת שמירה חייבת להיות בין 1 ל-15 ימים';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !activeOwnerId) return;

    setSaving(true);
    try {
      // Save settings to AsyncStorage (per owner)
      try {
        // Save retention days
        const retentionKey = getRetentionDaysStorageKey();
        if (retentionKey) {
          await AsyncStorage.setItem(retentionKey, retentionDays.toString());
        }

        // Save date picker style
        const styleKey = getDatePickerStyleStorageKey();
        if (styleKey) {
          await AsyncStorage.setItem(styleKey, datePickerStyle);
        }

        console.log(`[ManageProducts] Saved settings to AsyncStorage for owner ${activeOwnerId}`);
      } catch (storageError) {
        console.error('[ManageProducts] Error saving to AsyncStorage:', storageError);
        throw new Error('Failed to save settings to storage');
      }

      // Mark that we've saved values
      hasEverSavedRef.current = true;
      savedRetentionDaysRef.current = retentionDays;

      // Run auto-delete for expired items based on retention period
      try {
        const deletedCount = await deleteExpiredItemsByRetention(activeOwnerId, retentionDays);
        if (deletedCount > 0) {
          console.log(`[Auto-Delete] Deleted ${deletedCount} expired items after saving settings`);
        }
      } catch (deleteError) {
        console.error('Error running auto-delete after saving settings:', deleteError);
        // Don't block the save operation if auto-delete fails
      }

      // Show success message and navigate back
      Alert.alert(
        t('common.success') || 'הצלחה',
        t('settings.products.saved') || 'ההגדרות נשמרו בהצלחה',
        [{ 
          text: t('common.ok') || 'אישור', 
          onPress: () => router.back()
        }]
      );
    } catch (error: any) {
      console.error('Error saving product settings:', error);
      Alert.alert(
        t('common.error') || 'שגיאה',
        error.message || t('settings.products.saveError') || 'לא ניתן לשמור את ההגדרות'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('settings.products.title') || 'ניהול מוצרים'} />
      </Appbar.Header>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Auto-Delete Expired Products */}
        <Card style={styles.card}>
          <View style={styles.cardContentWrapper}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                  {t('settings.autoDeleteExpired') || 'מחק אוטומטית מוצרים שפג תוקפם'}
                </Text>
              </View>

              <View style={styles.sliderContainer}>
                <View style={styles.sliderHeader}>
                  <Text variant="bodyLarge" style={[styles.sliderLabel, rtlTextCenter]}>
                    {t('settings.notifications.retentionDays') || 'תקופת שמירה (ימים)'}
                  </Text>
                  <View style={[styles.sliderValueContainer, { backgroundColor: '#E3F2FD' }]}>
                    <Text variant="headlineSmall" style={[styles.sliderValue, { color: '#42A5F5' }, rtlText]}>
                      {retentionDays}
                    </Text>
                    <Text variant="bodySmall" style={[styles.sliderValueUnit, { color: '#1976D2' }, rtlText]}>
                      {t('common.days') || 'ימים'}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.sliderWrapper}>
                  <Slider
                    style={styles.slider}
                    minimumValue={1}
                    maximumValue={15}
                    step={1}
                    value={retentionDays}
                    onValueChange={(value) => {
                      const num = Math.round(value);
                      setRetentionDays(num);
                    }}
                    minimumTrackTintColor="#42A5F5"
                    maximumTrackTintColor="#E3F2FD"
                    thumbTintColor="#42A5F5"
                  />
                </View>
                
                <View style={styles.sliderMinMaxRow}>
                  <Text variant="labelSmall" style={[styles.sliderMinMax, { color: '#90CAF9' }, rtlText]}>
                    1
                  </Text>
                  <Text variant="labelSmall" style={[styles.sliderMinMax, { color: '#90CAF9' }, rtlText]}>
                    15
                  </Text>
                </View>
              </View>
              
              {errors.retentionDays && (
                <HelperText type="error" visible={!!errors.retentionDays} style={[rtlText, styles.errorText]}>
                  {errors.retentionDays}
                </HelperText>
              )}
              <HelperText type="info" style={[rtlText, styles.helperText]}>
                {t('settings.notifications.retentionDescription') || 'מוצרים שפג תוקפם יימחקו אוטומטית לאחר מספר הימים שצוין'}
              </HelperText>
            </Card.Content>
          </View>
        </Card>

        {/* Manage Categories */}
        <Card style={styles.card}>
          <View style={styles.cardContentWrapper}>
            <Card.Content style={styles.cardContent}>
              <TouchableOpacity
                onPress={() => router.push('/categories' as any)}
                activeOpacity={0.7}
                style={[styles.categoryButton, rtlContainer]}
              >
                <View style={styles.categoryButtonContent}>
                  <Text variant="titleMedium" style={[styles.categoryButtonTitle, rtlText]}>
                    {t('categories.title') || 'ניהול קטגוריות'}
                  </Text>
                  <Text variant="bodySmall" style={[styles.categoryButtonDescription, rtlText]}>
                    {t('settings.products.manageCategoriesDesc') || 'צור, ערוך ומחק קטגוריות מוצרים'}
                  </Text>
                </View>
                <List.Icon 
                  icon={isRTL ? "chevron-left" : "chevron-right"} 
                  iconColor="#757575"
                  style={styles.categoryButtonIcon}
                />
              </TouchableOpacity>
            </Card.Content>
          </View>
        </Card>

        {/* Quick Delete Products */}
        <Card style={styles.card}>
          <View style={styles.cardContentWrapper}>
            <Card.Content style={styles.cardContent}>
              <TouchableOpacity
                onPress={() => router.push('/settings/quick-delete-products' as any)}
                activeOpacity={0.7}
                style={[styles.categoryButton, rtlContainer]}
              >
                <View style={styles.categoryButtonContent}>
                  <Text variant="titleMedium" style={[styles.categoryButtonTitle, rtlText]}>
                    {t('settings.products.quickDelete') || 'מחיקת מוצרים מהירה'}
                  </Text>
                  <Text variant="bodySmall" style={[styles.categoryButtonDescription, rtlText]}>
                    {t('settings.products.quickDeleteDesc') || 'בחר במהירות מוצרים למחיקה לפי קטגוריות'}
                  </Text>
                </View>
                <List.Icon 
                  icon={isRTL ? "chevron-left" : "chevron-right"} 
                  iconColor="#757575"
                  style={styles.categoryButtonIcon}
                />
              </TouchableOpacity>
            </Card.Content>
          </View>
        </Card>

        {/* Date Picker Style */}
        <Card style={styles.card}>
          <View style={styles.cardContentWrapper}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                  {t('settings.products.datePickerStyle') || 'סגנון בחירת תאריך'}
                </Text>
              </View>

              <HelperText type="info" style={[rtlText, styles.helperText, { marginBottom: 16 }]}>
                {t('settings.products.datePickerStyleDesc') || 'בחר כיצד תרצה לבחור תאריכים באפליקציה'}
              </HelperText>

              <RadioButton.Group
                onValueChange={(value) => setDatePickerStyle(value as DatePickerStyle)}
                value={datePickerStyle}
              >
                <TouchableOpacity
                  style={[styles.radioOption, rtlContainer]}
                  onPress={() => setDatePickerStyle('calendar')}
                  activeOpacity={0.7}
                >
                  <RadioButton value="calendar" />
                  <MaterialCommunityIcons 
                    name="calendar-month" 
                    size={24} 
                    color={datePickerStyle === 'calendar' ? THEME_COLORS.primary : '#757575'} 
                    style={styles.radioIcon}
                  />
                  <View style={styles.radioContent}>
                    <Text variant="bodyLarge" style={[rtlText, styles.radioLabel]}>
                      {t('settings.products.datePickerCalendar') || 'לוח שנה'}
                    </Text>
                    <Text variant="bodySmall" style={[rtlText, styles.radioDescription]}>
                      {t('settings.products.datePickerCalendarDesc') || 'בחירת תאריך מלוח שנה גרפי'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.radioOption, rtlContainer]}
                  onPress={() => setDatePickerStyle('spinner')}
                  activeOpacity={0.7}
                >
                  <RadioButton value="spinner" />
                  <MaterialCommunityIcons 
                    name="rotate-3d" 
                    size={24} 
                    color={datePickerStyle === 'spinner' ? THEME_COLORS.primary : '#757575'} 
                    style={styles.radioIcon}
                  />
                  <View style={styles.radioContent}>
                    <Text variant="bodyLarge" style={[rtlText, styles.radioLabel]}>
                      {t('settings.products.datePickerSpinner') || 'גלגל בחירה'}
                    </Text>
                    <Text variant="bodySmall" style={[rtlText, styles.radioDescription]}>
                      {t('settings.products.datePickerSpinnerDesc') || 'בחירת תאריך מגלגל בחירה (iOS/Android)'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </RadioButton.Group>
            </Card.Content>
          </View>
        </Card>

        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={() => router.back()}
            style={styles.cancelButton}
            contentStyle={styles.buttonContent}
            labelStyle={styles.cancelButtonLabel}
          >
            {t('common.cancel') || 'ביטול'}
          </Button>
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.saveButton}
            contentStyle={styles.buttonContent}
            labelStyle={styles.saveButtonLabel}
            buttonColor="#42A5F5"
          >
            {t('common.save') || 'שמור'}
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardContentWrapper: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  cardContent: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: '#212121',
    letterSpacing: 0.3,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E0E0',
    marginVertical: 12,
  },
  helperText: {
    color: '#757575',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 13,
  },
  actions: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 12,
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 12,
    borderColor: '#E0E0E0',
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#42A5F5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  cancelButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#757575',
  },
  saveButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sliderContainer: {
    marginTop: 4,
    marginBottom: 8,
  },
  sliderHeader: {
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  sliderLabel: {
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
    fontSize: 14,
    color: '#424242',
  },
  sliderValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 3,
    minWidth: 70,
  },
  sliderValue: {
    fontWeight: '700',
    lineHeight: 24,
    fontSize: 22,
  },
  sliderValueUnit: {
    fontWeight: '500',
    fontSize: 11,
    ...(isRTL ? { marginRight: 2 } : { marginLeft: 2 }),
  },
  sliderWrapper: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  slider: {
    width: '100%',
    height: 36,
  },
  sliderMinMaxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 4,
  },
  sliderMinMax: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  radioOption: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  radioIcon: {
    marginLeft: isRTL ? 0 : 8,
    marginRight: isRTL ? 8 : 0,
    marginTop: 2,
  },
  radioContent: {
    flex: 1,
    marginLeft: isRTL ? 0 : 8,
    marginRight: isRTL ? 8 : 0,
  },
  radioLabel: {
    fontWeight: '600',
    fontSize: 16,
    color: '#212121',
    marginBottom: 4,
  },
  radioDescription: {
    color: '#757575',
    fontSize: 13,
    lineHeight: 18,
  },
  categoryButton: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  categoryButtonContent: {
    flex: 1,
    minWidth: 0,
  },
  categoryButtonTitle: {
    fontWeight: '600',
    fontSize: 16,
    color: '#212121',
    marginBottom: 4,
  },
  categoryButtonDescription: {
    color: '#757575',
    fontSize: 13,
    lineHeight: 18,
  },
  categoryButtonIcon: {
    margin: 0,
    marginLeft: isRTL ? 0 : 8,
    marginRight: isRTL ? 8 : 0,
  },
  });
}

