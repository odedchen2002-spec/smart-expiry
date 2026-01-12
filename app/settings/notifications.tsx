/**
 * Notifications & Automation Settings Screen
 */

import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { saveExpoPushToken } from '@/lib/notifications/pushNotifications';
import { createNotificationHistory } from '@/lib/supabase/queries/notifications';
import { getNotificationSettingsFromPreferences, saveNotificationSettingsToPreferences } from '@/lib/supabase/queries/userPreferences';
import { useSupabaseClient } from '@/lib/supabase/useSupabaseClient';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  HelperText,
  Switch,
  Text,
  useTheme
} from 'react-native-paper';

export default function NotificationsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');
  const styles = createStyles(isRTL);
  const supabase = useSupabaseClient();
  const { activeOwnerId } = useActiveOwner();
  const { user } = useAuth();
  const theme = useTheme();
  const [notificationTime, setNotificationTime] = useState('09:00');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerValue, setTimePickerValue] = useState(new Date());
  const [daysBefore, setDaysBefore] = useState<number>(1);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{
    notificationTime?: string;
    daysBefore?: string;
  }>({});

  // Helper function to parse time string to Date
  const parseTimeToDate = (timeString: string): Date => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours || 9, minutes || 0, 0, 0);
    return date;
  };

  // Helper function to format Date to time string
  const formatDateToTime = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const [hasLoadedInitialValues, setHasLoadedInitialValues] = useState(false);
  const previousOwnerIdRef = useRef<string | null>(null);
  const savedDaysBeforeRef = useRef<number | null>(null);
  const hasEverSavedRef = useRef(false);
  
  // Storage keys for persisting saved values
  const getDaysBeforeStorageKey = () => {
    if (!activeOwnerId) return null;
    return `saved_days_before_${activeOwnerId}`;
  };
  
  
  const getPushEnabledStorageKey = () => {
    if (!activeOwnerId) return null;
    return `saved_push_enabled_${activeOwnerId}`;
  };
  
  // Load saved values from AsyncStorage on mount
  useEffect(() => {
    const loadSavedValues = async () => {
      if (!activeOwnerId) return;
      
      try {
        // Load saved days before
        const daysBeforeKey = getDaysBeforeStorageKey();
        if (daysBeforeKey) {
          const savedDaysBefore = await AsyncStorage.getItem(daysBeforeKey);
          if (savedDaysBefore !== null) {
            const savedValue = parseInt(savedDaysBefore, 10);
            if (!isNaN(savedValue) && savedValue >= 0 && savedValue <= 365) {
              savedDaysBeforeRef.current = savedValue;
              hasEverSavedRef.current = true;
              setDaysBefore(savedValue);
              console.log(`[Notifications] Loaded saved notification_days_before from storage: ${savedValue}`);
            }
          }
        }
      } catch (error) {
        console.error('[Notifications] Error loading saved values:', error);
      }
    };
    
    if (activeOwnerId) {
      loadSavedValues();
    }
  }, [activeOwnerId]);

  // Reload values when screen is focused (user comes back to this screen)
  useFocusEffect(
    React.useCallback(() => {
      // Never reset if we've ever saved a value - always use the saved value
      if (activeOwnerId && !hasEverSavedRef.current) {
        setHasLoadedInitialValues(false);
      }
    }, [activeOwnerId])
  );

  useEffect(() => {
    if (!activeOwnerId) return;

    const loadSettings = async () => {
      try {
        // Load from user_preferences (single source of truth)
        if (!user?.id) {
          setHasLoadedInitialValues(true);
          return;
        }

        const settings = await getNotificationSettingsFromPreferences(user.id);
        
        if (settings) {
          // Load from user_preferences
          setDaysBefore(settings.notification_days_before);
          setPushEnabled(settings.expiry_notify_enabled);
          
          // Reconstruct time picker from hour + minute
          const timeStr = `${settings.notification_hour.toString().padStart(2, '0')}:${settings.notification_minute.toString().padStart(2, '0')}`;
          setNotificationTime(timeStr);
          setTimePickerValue(parseTimeToDate(timeStr));
          
          savedDaysBeforeRef.current = settings.notification_days_before;
          hasEverSavedRef.current = true;
          
          if (__DEV__) {
            console.log('[Notifications] Loaded settings from user_preferences');
          }
        } else {
          // Fallback to AsyncStorage if no Supabase settings exist
          const daysBeforeKey = getDaysBeforeStorageKey();
          if (daysBeforeKey) {
            const savedDaysBefore = await AsyncStorage.getItem(daysBeforeKey);
            if (savedDaysBefore !== null) {
              const savedValue = parseInt(savedDaysBefore, 10);
              if (!isNaN(savedValue) && savedValue >= 0 && savedValue <= 365) {
                savedDaysBeforeRef.current = savedValue;
                hasEverSavedRef.current = true;
                setDaysBefore(savedValue);
              }
            }
          }
          
          // No fallback for time - user must set it in user_preferences
          
          const pushKey = getPushEnabledStorageKey();
          if (pushKey) {
            const savedPush = await AsyncStorage.getItem(pushKey);
            if (savedPush !== null) {
              setPushEnabled(savedPush === 'true');
            }
          }
          
          console.log('[Notifications] Loaded settings from AsyncStorage (fallback)');
        }
      } catch (error) {
        console.error('[Notifications] Error loading settings:', error);
      }
      
      setHasLoadedInitialValues(true);
      previousOwnerIdRef.current = activeOwnerId;
    };

    // Only load if we haven't loaded yet or owner changed
    if (!hasLoadedInitialValues || previousOwnerIdRef.current !== activeOwnerId) {
      loadSettings();
    }
  }, [activeOwnerId, hasLoadedInitialValues]);

  useEffect(() => {
    // Check notification permissions on mount (but don't request - that's done on app startup)
    // Only update if we haven't loaded from user_preferences yet
    const checkPermissions = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        // Only update pushEnabled if we haven't loaded from user_preferences yet
        // This prevents overwriting the saved preference
        if (!hasLoadedInitialValues) {
          setPushEnabled(status === 'granted');
        }
      } catch (error) {
        console.error('[Notifications] Error checking permissions:', error);
      }
    };
    checkPermissions();
  }, [hasLoadedInitialValues]);

  // Round time to nearest 15-minute interval (00, 15, 30, 45)
  const roundToQuarterHour = (date: Date): Date => {
    const d = new Date(date);
    const m = d.getMinutes();
    const rounded = Math.round(m / 15) * 15; // 0, 15, 30, 45, or 60
    if (rounded === 60) {
      d.setHours(d.getHours() + 1);
      d.setMinutes(0);
    } else {
      d.setMinutes(rounded);
    }
    d.setSeconds(0);
    d.setMilliseconds(0);
    return d;
  };

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    // Round to nearest 15 minutes (Android doesn't support minuteInterval)
    const roundedDate = selectedDate ? roundToQuarterHour(selectedDate) : undefined;

    if (Platform.OS === 'android') {
      setShowTimePicker(false);
      if (event.type === 'set' && roundedDate) {
        const timeString = formatDateToTime(roundedDate);
        setNotificationTime(timeString);
        setTimePickerValue(roundedDate);
      }
    } else {
      // iOS - minuteInterval=15 handles this, but we round anyway for safety
      if (roundedDate) {
        const timeString = formatDateToTime(roundedDate);
        setNotificationTime(timeString);
        setTimePickerValue(roundedDate);
      }
      if (event.type === 'dismissed') {
        setShowTimePicker(false);
      }
    }
  };

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    // Validate time format (HH:mm) - should always be valid with picker, but keep for safety
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!notificationTime || !timeRegex.test(notificationTime)) {
      newErrors.notificationTime = t('settings.notifications.timeInvalid') || 'פורמט זמן לא תקין (HH:mm)';
    }

    // Validate days before
    if (daysBefore < 0 || daysBefore > 365 || !Number.isInteger(daysBefore)) {
      newErrors.daysBefore = t('settings.notifications.daysBeforeInvalid') || 'מספר הימים חייב להיות בין 0 ל-365';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTestNotificationPress = async () => {
    console.log('[Notifications] Test notification button pressed');
    
    try {
      // Make sure we have permission before sending
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert(
          t('settings.notifications.permissionRequired') || 'התראות חסומות',
          t('settings.notifications.permissionMessage') || 'כדי לבחון התראות, אפשר את ההתראות בהגדרות המכשיר.'
        );
        return;
      }

      const testTitle = t('settings.notifications.testNotificationTitle') || 'התראה לדוגמה';
      const testBody = t('settings.notifications.testNotificationBody') || 'כך תראה התראה מהאפליקציה (זו רק בדיקה).';

      // Fire a local notification immediately
      await Notifications.scheduleNotificationAsync({
        content: {
          title: testTitle,
          body: testBody,
          data: { type: 'test_notification' },
        },
        trigger: null, // null = fire immediately
      });

      // Save to notification history
      if (user?.id && activeOwnerId) {
        try {
          await createNotificationHistory(
            user.id,
            activeOwnerId,
            testTitle,
            testBody,
            'test_notification',
            { type: 'test_notification' }
          );
          console.log('[Notifications] Test notification saved to history');
        } catch (historyError) {
          console.warn('[Notifications] Failed to save test notification to history:', historyError);
          // Don't fail the whole operation if history save fails
        }
      }

      console.log('[Notifications] Test notification scheduled');
    } catch (error) {
      console.error('[Notifications] Failed to send test notification', error);
      Alert.alert(
        t('common.error') || 'שגיאה',
        t('settings.notifications.testNotificationError') || 'לא הצלחנו לשלוח התראה לדוגמה. נסה שוב או בדוק את הגדרות ההתראות במכשיר.'
      );
    }
  };

  const handleSave = async () => {
    if (!validate() || !activeOwnerId) return;

    setSaving(true);
    
    // Push token to save to user_preferences (needed by Edge Function)
    let pushTokenForPrefs: string | undefined;
    
    try {
      // If push is enabled, verify permissions and refresh token if needed
      if (pushEnabled && user) {
        // Check permissions (but don't request - that's done on app startup)
        const { status } = await Notifications.getPermissionsAsync();
        
        if (status !== 'granted') {
          Alert.alert(
            t('settings.notifications.permissionRequired') || 'הרשאה נדרשת',
            t('settings.notifications.permissionMessage') || 'יש להפעיל התראות בהגדרות המכשיר'
          );
          setSaving(false);
          return;
        }

        // Get Expo push token (refresh it in case it changed)
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;

        console.log('[Debug] projectId (settings):', projectId);

        if (!projectId) {
          console.error('[Debug] Missing projectId in Constants.expoConfig.extra.eas.projectId');
          setSaving(false);
          return;
        }

        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

        console.log('[Debug] tokenData (settings):', tokenData);
        console.log('[Notifications] Got Expo push token (settings screen)', tokenData.data);

        const expoPushToken = tokenData.data;

        if (user?.id && expoPushToken) {
          try {
            await saveExpoPushToken({
              supabase,
              userId: user.id,
              businessId: activeOwnerId ?? null,
              expoPushToken,
              platform: Platform.OS,
            });
          } catch (dbError: any) {
            console.warn('[Notifications] Database error saving token (non-critical):', dbError?.message || dbError);
          }
        }

        // Store for user_preferences below
        pushTokenForPrefs = expoPushToken;
      }

      // Save settings to user_preferences (single source of truth)
      if (!user?.id) {
        throw new Error('User ID is required to save settings');
      }

      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const [hours, minutes] = notificationTime.split(':').map(Number);
        
        // Always log what we're about to save (for debugging)
        console.log('[Notifications] About to save settings:', {
          userId: user.id,
          notificationTime,
          parsedHours: hours,
          parsedMinutes: minutes,
          daysBefore,
          pushEnabled,
          timezone,
          hasPushToken: !!pushTokenForPrefs,
        });
        
        // Validate hour and minute
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          throw new Error('Invalid time format');
        }

        // Save settings to user_preferences (includes notification_time and push_token)
        const savedPrefs = await saveNotificationSettingsToPreferences(user.id, {
          expiry_notify_enabled: pushEnabled,
          notification_days_before: daysBefore,
          notification_hour: hours,
          notification_minute: minutes,
          timezone: timezone,
          push_token: pushTokenForPrefs, // Include push token for Edge Function
        });
        
        // Always log success with saved values
        console.log('[Notifications] Successfully saved settings:', {
          userId: user.id,
          notification_hour: hours,
          notification_minute: minutes,
          notification_days_before: daysBefore,
          hasPushToken: !!pushTokenForPrefs,
        });
      } catch (settingsError: any) {
        console.error('[Notifications] Error saving settings to user_preferences:', settingsError);
        throw new Error('Failed to save notification settings');
      }

      // Also save to AsyncStorage for faster UI display (optional cache)
      try {
        const daysBeforeKey = getDaysBeforeStorageKey();
        if (daysBeforeKey) {
          await AsyncStorage.setItem(daysBeforeKey, daysBefore.toString());
        }
        
        // No longer saving notification_time to AsyncStorage - only in user_preferences
        
        const pushKey = getPushEnabledStorageKey();
        if (pushKey) {
          await AsyncStorage.setItem(pushKey, pushEnabled ? 'true' : 'false');
        }
      } catch (storageError) {
        console.warn('[Notifications] Error saving to AsyncStorage (non-critical):', storageError);
      }
      
      // Mark that we've saved values
      hasEverSavedRef.current = true;
      savedDaysBeforeRef.current = daysBefore;

      // Show success message
      Alert.alert(
        t('common.success') || 'הצלחה',
        t('settings.notifications.saved') || 'ההגדרות נשמרו בהצלחה. נשלח לך תזכורת יומית כשמוצרים מתקרבים לתוקף.',
        [{ 
          text: t('common.ok') || 'אישור', 
          onPress: () => {
            router.back();
          }
        }]
      );
    } catch (error: any) {
      console.error('Error saving notification settings:', error);
      Alert.alert(
        t('common.error') || 'שגיאה',
        error.message || t('settings.notifications.saveError') || 'לא ניתן לשמור את ההגדרות'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#F5F5F5' }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('settings.notificationsAutomation') || 'התראות ואוטומציה'} />
      </Appbar.Header>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.card}>
          <View style={styles.cardContentWrapper}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                  {t('settings.notifications.dailyReminder') || 'תזכורת יומית'}
                </Text>
              </View>

              <View style={styles.timePickerContainer}>
                <Button
                  mode="outlined"
                  onPress={() => setShowTimePicker(true)}
                  style={styles.timeButton}
                  contentStyle={styles.timeButtonContent}
                  labelStyle={styles.timeButtonLabel}
                  icon="clock-outline"
                >
                  {notificationTime}
                </Button>
              </View>
              {errors.notificationTime && (
                <HelperText type="error" visible={!!errors.notificationTime} style={[rtlText, styles.errorText]}>
                  {errors.notificationTime}
                </HelperText>
              )}
              <HelperText type="info" style={[rtlText, styles.helperText]}>
                {t('settings.notifications.timeFormat') || 'בחר שעה (ברבעי שעה: 00, 15, 30, 45)'}
              </HelperText>
              
              {showTimePicker && (
              <>
                <DateTimePicker
                  value={timePickerValue}
                  mode="time"
                  is24Hour={true}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minuteInterval={15}
                  onChange={handleTimeChange}
                  locale="he_IL"
                  style={Platform.OS === 'ios' ? styles.iosPicker : undefined}
                />
                {Platform.OS === 'ios' && (
                  <View style={styles.iosPickerActions}>
                    <Button onPress={() => setShowTimePicker(false)}>
                      {t('common.cancel') || 'ביטול'}
                    </Button>
                    <Button
                      mode="contained"
                      onPress={() => {
                        const timeString = formatDateToTime(timePickerValue);
                        setNotificationTime(timeString);
                        setShowTimePicker(false);
                      }}
                    >
                      {t('common.ok') || 'אישור'}
                    </Button>
                  </View>
                )}
              </>
              )}

              <View style={styles.divider} />

              <View style={styles.sliderContainer}>
                <View style={styles.sliderHeader}>
                  <Text variant="bodyLarge" style={[styles.sliderLabel, rtlTextCenter]}>
                    {t('settings.notifications.daysBefore') || 'מספר ימים לפני תפוגה'}
                  </Text>
                  <View style={[styles.sliderValueContainer, { backgroundColor: '#E3F2FD' }]}>
                    <Text variant="headlineSmall" style={[styles.sliderValue, { color: '#42A5F5' }, rtlText]}>
                      {daysBefore}
                    </Text>
                    <Text variant="bodySmall" style={[styles.sliderValueUnit, { color: '#1976D2' }, rtlText]}>
                      {t('common.days') || 'ימים'}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.sliderWrapper}>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={30}
                    step={1}
                    value={daysBefore}
                    onValueChange={(value) => {
                      const num = Math.round(value);
                      setDaysBefore(num);
                      console.log(`[Notifications] User slid days before to: ${num} (saved value: ${savedDaysBeforeRef.current})`);
                    }}
                    minimumTrackTintColor="#42A5F5"
                    maximumTrackTintColor="#E3F2FD"
                    thumbTintColor="#42A5F5"
                  />
                </View>
                
                <View style={styles.sliderMinMaxRow}>
                  <Text variant="labelSmall" style={[styles.sliderMinMax, { color: '#90CAF9' }, rtlText]}>
                    0
                  </Text>
                  <Text variant="labelSmall" style={[styles.sliderMinMax, { color: '#90CAF9' }, rtlText]}>
                    30
                  </Text>
                </View>
              </View>
              
              {errors.daysBefore && (
                <HelperText type="error" visible={!!errors.daysBefore} style={[rtlText, styles.errorText]}>
                  {errors.daysBefore}
                </HelperText>
              )}
              <HelperText type="info" style={[rtlText, styles.helperText]}>
                {t('settings.notifications.daysBeforeDesc') || 'מספר הימים לפני תפוגה לקבלת התראה (0 = באותו יום)'}
              </HelperText>
            </Card.Content>
          </View>
        </Card>

        <Card style={styles.card}>
          <View style={styles.cardContentWrapper}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.switchRow}>
                <View style={styles.switchContent}>
                  <Text variant="titleMedium" style={[styles.switchTitle, rtlText]}>
                    {t('settings.notifications.pushNotifications') || 'התראות Push'}
                  </Text>
                  <HelperText type="info" style={[rtlText, styles.helperText]}>
                    {t('settings.notifications.pushDescription') || 'קבל התראות על מוצרים שפג תוקפם'}
                  </HelperText>
                </View>
                <Switch 
                  value={pushEnabled} 
                  onValueChange={setPushEnabled}
                  color="#42A5F5"
                />
              </View>

              <View style={styles.divider} />

              <Button
                mode="outlined"
                onPress={handleTestNotificationPress}
                style={styles.testButton}
                contentStyle={styles.testButtonContent}
                labelStyle={styles.testButtonLabel}
                icon="bell-outline"
              >
                {t('settings.notifications.testNotifications') || 'בחן התראות'}
              </Button>
              <HelperText type="info" style={[rtlText, styles.helperText]}>
                {t('settings.notifications.testDescription') || 'שלח התראה לדוגמה כדי לראות איך התראות יראו במכשיר שלך'}
              </HelperText>
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
  timePickerContainer: {
    marginBottom: 6,
  },
  timeButton: {
    borderRadius: 10,
    borderColor: '#42A5F5',
    borderWidth: 1.5,
  },
  timeButtonContent: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  timeButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#42A5F5',
  },
  switchRow: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  switchContent: {
    flex: 1,
    ...(isRTL ? { marginLeft: 12 } : { marginRight: 12 }),
  },
  switchTitle: {
    fontWeight: '600',
    fontSize: 16,
    color: '#212121',
    marginBottom: 2,
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
    flexDirection: 'row',
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
  iosPicker: {
    width: '100%',
    height: 200,
  },
  iosPickerActions: {
    flexDirection: 'row',
    justifyContent: isRTL ? 'flex-start' : 'flex-end',
    marginTop: 8,
    marginStart: 8,
  },
  daysInput: {
    marginTop: 16,
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
  testButton: {
    borderRadius: 10,
    borderColor: '#42A5F5',
    borderWidth: 1.5,
    marginTop: 4,
  },
  testButtonContent: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  testButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#42A5F5',
  },
  });
}

