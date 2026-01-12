/**
 * Language Context
 * Manages app language and RTL support
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert, Platform, DevSettings } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLocale, t } from '@/i18n';
import { applyLayoutDirection } from '@/i18n/rtl';
import type { Locale } from '@/i18n/types';
import { savePreferredLanguage } from '@/lib/supabase/queries/userPreferences';
import { supabase } from '@/lib/supabase/client';

// This key must match LANGUAGE_KEY in index.js (app entry point)
const LANGUAGE_KEY = 'app_language';

interface LanguageContextType {
  locale: Locale;
  /** Alias for `locale` - for backward compatibility */
  currentLocale: Locale;
  isRTL: boolean;
  setLanguage: (nextLocale: Locale) => void;
  t: (key: string, params?: Record<string, any>) => string;
  languageReady: boolean;
  hasLanguageChoice: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('he');
  const [languageReady, setLanguageReady] = useState(false);
  const [hasLanguageChoice, setHasLanguageChoice] = useState(false);
  const isRTL = locale === 'he';

  // Sync language to Supabase for push notifications
  async function syncLanguageToSupabase(language: Locale) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await savePreferredLanguage(user.id, language);
        console.log('[LanguageContext] Synced language to Supabase:', language);
      }
    } catch (error) {
      // Silent fail - not critical
      console.warn('[LanguageContext] Failed to sync language to Supabase:', error);
    }
  }

  function applyLanguage(nextLocale: Locale, showReloadHint: boolean) {
    setLocaleState(nextLocale);
    setLocale(nextLocale);

    // Calculate RTL/LTR direction
    // Hebrew (he) → RTL (true), English (en) → LTR (false)
    // Note: isRTL is derived from locale state and used in styles only.
    // We no longer use I18nManager - root layout is always LTR.
    const nextIsRTL = nextLocale === 'he';
    console.log('[LanguageContext] Applying language:', nextLocale, 'isRTL:', nextIsRTL);
    // applyLayoutDirection(nextIsRTL); // no-op now, we control direction via styles only

    // Save to AsyncStorage
    AsyncStorage.setItem(LANGUAGE_KEY, nextLocale).catch((error) => {
      console.error('Error saving language to storage:', error);
    });

    // Sync to Supabase (async, fire-and-forget)
    syncLanguageToSupabase(nextLocale);

    if (showReloadHint) {
      // Show alert that app will restart
      Alert.alert(
        t('common.languageChanged.title'),
        t('common.languageChanged.message'),
        [
          {
            text: t('common.ok'),
            onPress: () => {
              // Reload the app so the new language and RTL/LTR direction are applied
              // The entry.tsx file will read the new language from AsyncStorage on next launch
              if (__DEV__ && Platform.OS !== 'web' && DevSettings.reload) {
                DevSettings.reload();
              } else {
                // In production, you can use expo-updates: Updates.reloadAsync()
                console.warn('[LanguageContext] App reload required for language change. Please restart the app.');
              }
            },
            style: 'default',
          },
        ]
      );
    }
  }

  // Load saved language on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_KEY);

        if (stored === 'he' || stored === 'en') {
          // User has previously chosen a language
          applyLanguage(stored as Locale, false);
          setHasLanguageChoice(true);
        } else {
          // No stored choice yet – keep default locale but mark as not chosen
          applyLanguage('he', false);
          setHasLanguageChoice(false);
        }
      } catch (error) {
        console.error('Error loading language from storage:', error);
        // Default to Hebrew on error and treat as no explicit choice
        applyLanguage('he', false);
        setHasLanguageChoice(false);
      } finally {
        setLanguageReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setLanguage(nextLocale: Locale) {
    // Even if the locale is the same, we still want to record that
    // the user has explicitly made a choice (first-run onboarding).
    if (nextLocale !== locale) {
      // If user has already chosen a language (not first time), show confirmation
      if (hasLanguageChoice) {
        Alert.alert(
          t('common.confirm') || 'אישור',
          t('settings.language.confirmChange') || 'האם אתה בטוח שברצונך לשנות את השפה? האפליקציה תתחיל מחדש.',
          [
            {
              text: t('common.cancel') || 'ביטול',
              style: 'cancel',
            },
            {
              text: t('common.confirm') || 'אישור',
              onPress: () => {
                applyLanguage(nextLocale, true);
              },
            },
          ]
        );
      } else {
        // First time choosing language - no confirmation needed
        applyLanguage(nextLocale, true);
      }
    } else {
      // Persist the same value so LANGUAGE_KEY is definitely set
      AsyncStorage.setItem(LANGUAGE_KEY, nextLocale).catch((error) => {
        console.error('Error saving language to storage:', error);
      });
    }

    setHasLanguageChoice(true);
  }

  const value: LanguageContextType = {
    locale,
    currentLocale: locale, // Alias for backward compatibility
    isRTL,
    setLanguage,
    t,
    languageReady,
    hasLanguageChoice,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

