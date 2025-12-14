/**
 * Auto-Delete Expired Items Settings Screen
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  Appbar,
  Card,
  TextInput,
  Button,
  HelperText,
  Text,
  Switch,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';

export default function AutoDeleteScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);
  const { activeOwnerId } = useActiveOwner();
  const [retentionDays, setRetentionDays] = useState(7);
  const [autoDeleteEnabled, setAutoDeleteEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ retentionDays?: string }>({});

  useEffect(() => {
    const loadSettings = async () => {
      if (!activeOwnerId) return;
      try {
        const key = `retention_days_${activeOwnerId}`;
        const saved = await AsyncStorage.getItem(key);
        if (saved) {
          const value = parseInt(saved, 10);
          if (!isNaN(value) && value > 0) {
            setRetentionDays(value);
            setAutoDeleteEnabled(true);
          }
        }
      } catch (error) {
        console.error('Error loading auto-delete settings:', error);
      }
    };
    loadSettings();
  }, [activeOwnerId]);

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (autoDeleteEnabled && (retentionDays < 1 || retentionDays > 15)) {
      newErrors.retentionDays = t('settings.notifications.retentionInvalid') || 'תקופת שמירה חייבת להיות בין 1 ל-15 ימים';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !activeOwnerId) return;

    setSaving(true);
    try {
      const key = `retention_days_${activeOwnerId}`;
      if (autoDeleteEnabled) {
        await AsyncStorage.setItem(key, retentionDays.toString());
      } else {
        await AsyncStorage.removeItem(key);
      }

      Alert.alert(
        t('common.success') || 'הצלחה',
        t('settings.autoDelete.saved') || 'ההגדרות נשמרו בהצלחה',
        [{ text: t('common.ok') || 'אישור', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Error saving auto-delete settings:', error);
      Alert.alert(
        t('common.error') || 'שגיאה',
        error.message || t('settings.autoDelete.saveError') || 'לא ניתן לשמור את ההגדרות'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('settings.autoDeleteExpired') || 'מחק אוטומטית מוצרים שפג תוקפם'} />
      </Appbar.Header>

      <ScrollView style={styles.content}>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.switchRow}>
              <View style={styles.switchContent}>
                <Text variant="titleSmall" style={rtlText}>
                  {t('settings.autoDelete.enable') || 'הפעל מחיקה אוטומטית'}
                </Text>
                <HelperText type="info" style={rtlText}>
                  {t('settings.autoDelete.description') || 'מוצרים שפג תוקפם יימחקו אוטומטית לאחר תקופת השמירה שצוינה'}
                </HelperText>
              </View>
              <Switch 
                value={autoDeleteEnabled} 
                onValueChange={setAutoDeleteEnabled} 
              />
            </View>
          </Card.Content>
        </Card>

        {autoDeleteEnabled && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall" style={[styles.sectionTitle, rtlText]}>
                {t('settings.autoDelete.retentionPeriod') || 'תקופת שמירה'}
              </Text>

              <TextInput
                label={t('settings.notifications.retentionDays') || 'תקופת שמירה (ימים)'}
                value={retentionDays.toString()}
                onChangeText={(text) => {
                  const num = parseInt(text);
                  if (!isNaN(num)) {
                    setRetentionDays(num);
                  } else if (text === '') {
                    setRetentionDays(0);
                  }
                }}
                error={!!errors.retentionDays}
                style={rtlText}
                mode="outlined"
                keyboardType="numeric"
              />
              {errors.retentionDays && (
                <HelperText type="error" visible={!!errors.retentionDays} style={rtlText}>
                  {errors.retentionDays}
                </HelperText>
              )}
              <HelperText type="info" style={rtlText}>
                {t('settings.autoDelete.retentionDescription') || 'מוצרים שפג תוקפם יישמרו למשך מספר הימים שצוין לפני מחיקה אוטומטית'}
              </HelperText>
            </Card.Content>
          </Card>
        )}

        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={() => router.back()}
            style={styles.button}
          >
            {t('common.cancel') || 'ביטול'}
          </Button>
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.button}
          >
            {t('common.save') || 'שמור'}
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 16,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchContent: {
    flex: 1,
    marginEnd: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 32,
  },
  button: {
    flex: 1,
    marginHorizontal: 8,
  },
});

