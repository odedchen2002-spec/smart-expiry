/**
 * Send Feedback Screen
 */

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  Appbar,
  Card,
  TextInput,
  Button,
  HelperText,
  Text,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';
import * as MailComposer from 'expo-mail-composer';

export default function FeedbackScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);
  const { user } = useAuth();
  const [feedback, setFeedback] = useState('');
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<{ feedback?: string }>({});
  const SUPPORT_EMAIL = 'expiryx5@gmail.com';

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!feedback || feedback.trim().length < 10) {
      newErrors.feedback = t('settings.feedback.minLength') || 'המשוב חייב להכיל לפחות 10 תווים';
    }

    if (feedback.length > 1000) {
      newErrors.feedback = t('settings.feedback.maxLength') || 'המשוב לא יכול להכיל יותר מ-1000 תווים';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const sendSupportEmail = async (message: string) => {
    try {
      const isAvailable = await MailComposer.isAvailableAsync();
      const subject =
        t('settings.feedback.emailSubject') ||
        `New feedback from ${user?.email || 'Expiry App user'}`;
      const body = `${message}\n\nUser: ${user?.email || 'anonymous'}`;

      if (isAvailable) {
        await MailComposer.composeAsync({
          recipients: [SUPPORT_EMAIL],
          subject,
          body,
        });
      } else {
        Alert.alert(
          t('settings.feedback.emailUnavailable') || 'Email app not available',
          `${t('settings.help.contactEmail') || 'Contact us at'}: ${SUPPORT_EMAIL}`
        );
      }
    } catch (error) {
      console.warn('Mail composer error:', error);
    }
  };

  const handleSend = async () => {
    if (!validate() || !user) return;

    setSending(true);
    try {
      // Save feedback to database
      const { error } = await supabase
        .from('support_feedback')
        .insert({
          user_id: user.id,
          message: feedback.trim(),
        });

      if (error) {
        throw error;
      }

      await sendSupportEmail(feedback.trim());

      Alert.alert(
        t('common.success') || 'הצלחה',
        t('settings.feedback.sent') || 'תודה על המשוב! נשמח לשמוע ממך.',
        [{ text: t('common.ok') || 'אישור', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Error sending feedback:', error);
      Alert.alert(
        t('common.error') || 'שגיאה',
        error.message || t('settings.feedback.error') || 'לא ניתן לשלוח את המשוב'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('settings.sendFeedback') || 'שלח משוב'} />
      </Appbar.Header>

      <ScrollView style={styles.content}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="bodyMedium" style={[styles.description, rtlText]}>
              {t('settings.feedback.description') || 'אנא שתף אותנו במחשבותיך, הצעות לשיפור, או דיווח על בעיות.'}
            </Text>

            <TextInput
              label={t('settings.feedback.feedbackLabel') || 'משוב'}
              value={feedback}
              onChangeText={setFeedback}
              mode="outlined"
              multiline
              numberOfLines={8}
              style={[styles.input, rtlText]}
              error={!!errors.feedback}
              placeholder={t('settings.feedback.placeholder') || 'כתוב את המשוב שלך כאן...'}
            />
            {errors.feedback && (
              <HelperText type="error" visible={!!errors.feedback} style={rtlText}>
                {errors.feedback}
              </HelperText>
            )}
            <HelperText type="info" style={rtlText}>
              {feedback.length}/1000 {t('settings.feedback.characters') || 'תווים'}
            </HelperText>
          </Card.Content>
        </Card>

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
            onPress={handleSend}
            loading={sending}
            disabled={sending || !feedback.trim()}
            style={styles.button}
          >
            {t('settings.feedback.send') || 'שלח'}
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
  description: {
    marginBottom: 16,
    opacity: 0.7,
  },
  input: {
    marginBottom: 4,
    minHeight: 150,
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

