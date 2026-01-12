/**
 * First Product Hints
 * Subtle hints shown after user adds their first product
 * NOT a modal - integrated into the UI
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';

const HINT_DISMISSED_KEY = (userId: string, hintId: string) => `hint_dismissed_${userId}_${hintId}`;

interface HintItem {
  id: string;
  icon: string;
  text: string;
  actionText?: string;
  onAction?: () => void;
}

interface FirstProductHintsProps {
  /** Number of products the user has */
  productCount: number;
  /** Callback when notifications hint action is pressed */
  onNotificationsPress?: () => void;
}

export function FirstProductHints({ productCount, onNotificationsPress }: FirstProductHintsProps) {
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);
  const rtlContainer = getRtlContainerStyles(isRTL);
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(new Set());
  const [opacity] = useState(new Animated.Value(0));

  // Only show hints after first product and up to 5 products
  const shouldShowHints = productCount >= 1 && productCount <= 5;

  const hints: HintItem[] = [
    {
      id: 'notifications',
      icon: 'bell-ring-outline',
      text: 'רוצה לקבל התראות לפני שפג תוקף?',
      actionText: 'הפעל',
      onAction: onNotificationsPress,
    },
    {
      id: 'weekly-check',
      icon: 'calendar-check',
      text: 'בדוק את "פג השבוע" כל בוקר',
    },
  ];

  // Load dismissed hints
  useEffect(() => {
    const loadDismissedHints = async () => {
      if (!user?.id) return;
      
      const dismissed = new Set<string>();
      for (const hint of hints) {
        try {
          const value = await AsyncStorage.getItem(HINT_DISMISSED_KEY(user.id, hint.id));
          if (value === 'true') {
            dismissed.add(hint.id);
          }
        } catch (error) {
          console.error('Error loading hint state:', error);
        }
      }
      setDismissedHints(dismissed);
    };

    loadDismissedHints();
  }, [user?.id]);

  // Animate in
  useEffect(() => {
    if (shouldShowHints) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        delay: 500,
        useNativeDriver: true,
      }).start();
    }
  }, [shouldShowHints]);

  const dismissHint = async (hintId: string) => {
    if (!user?.id) return;
    
    try {
      await AsyncStorage.setItem(HINT_DISMISSED_KEY(user.id, hintId), 'true');
      setDismissedHints((prev) => new Set([...prev, hintId]));
    } catch (error) {
      console.error('Error dismissing hint:', error);
    }
  };

  // Filter to show only non-dismissed hints
  const visibleHints = hints.filter((hint) => !dismissedHints.has(hint.id));

  if (!shouldShowHints || visibleHints.length === 0) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      {visibleHints.map((hint) => (
        <Surface key={hint.id} style={styles.hintCard} elevation={1}>
          <View style={[styles.hintContent, rtlContainer]}>
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name={hint.icon as any}
                size={20}
                color={THEME_COLORS.primary}
              />
            </View>
            <Text style={[styles.hintText, rtlText]} numberOfLines={2}>
              {hint.text}
            </Text>
            {hint.actionText && hint.onAction && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  hint.onAction?.();
                  dismissHint(hint.id);
                }}
              >
                <Text style={styles.actionButtonText}>{hint.actionText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={() => dismissHint(hint.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="close" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </Surface>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  hintCard: {
    borderRadius: 12,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: THEME_COLORS.primary + '20',
  },
  hintContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME_COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  actionButton: {
    backgroundColor: THEME_COLORS.primary,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dismissButton: {
    padding: 4,
  },
});

