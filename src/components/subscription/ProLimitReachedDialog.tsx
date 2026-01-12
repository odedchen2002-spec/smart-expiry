/**
 * ProLimitReachedDialog - Shows once when Pro user reaches 2000 items limit
 * Beautiful and professional dialog with upgrade option
 */

import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, View, Animated, Dimensions } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DIALOG_WIDTH = Math.min(SCREEN_WIDTH * 0.9, 400);

interface ProLimitReachedDialogProps {
  visible: boolean;
  onDismiss: () => void;
  ownerId: string;
}

// Updated key to v2 to show dialog for users who already passed 2000 items
const PRO_LIMIT_DIALOG_KEY = 'pro_limit_dialog_shown_v2_';

export function ProLimitReachedDialog({ visible, onDismiss, ownerId }: ProLimitReachedDialogProps) {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const [shouldShow, setShouldShow] = useState(false);
  const scaleAnim = React.useRef(new Animated.Value(0.8)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  // Check if dialog was already shown for this owner
  useEffect(() => {
    const checkIfShown = async () => {
      if (!visible || !ownerId) return;
      
      try {
        const key = PRO_LIMIT_DIALOG_KEY + ownerId;
        const wasShown = await AsyncStorage.getItem(key);
        
        if (!wasShown) {
          setShouldShow(true);
          // Mark as shown
          await AsyncStorage.setItem(key, 'true');
        } else {
          // Already shown, dismiss immediately
          onDismiss();
        }
      } catch (error) {
        console.error('Error checking pro limit dialog state:', error);
        // On error, show dialog to be safe
        setShouldShow(true);
      }
    };

    checkIfShown();
  }, [visible, ownerId]);

  // Animate in when dialog appears
  useEffect(() => {
    if (shouldShow && visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [shouldShow, visible]);

  const handleUpgrade = () => {
    onDismiss();
    router.push('/(paywall)/subscribe');
  };

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  if (!shouldShow || !visible) {
    return null;
  }

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={handleDismiss}
      animationType="none"
    >
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.dialogContainer,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Header with gradient */}
          <LinearGradient
            colors={['#FF6B35', '#F7931E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="crown-circle"
                size={64}
                color="#FFF"
              />
            </View>
          </LinearGradient>

          {/* Content */}
          <View style={styles.content}>
            <Text variant="headlineSmall" style={[styles.title, isRTL && styles.rtlText]}>
              {t('proLimit.title') || 'הגעת למגבלת תוכנית Pro'}
            </Text>

            <Text variant="bodyLarge" style={[styles.description, isRTL && styles.rtlText]}>
              {t('proLimit.description') || 'כל הכבוד! הגעת ל-2,000 מוצרים בתוכנית Pro.'}
            </Text>

            <View style={styles.featuresContainer}>
              <View style={[styles.featureRow, isRTL && styles.rtlRow]}>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={24}
                  color="#4CAF50"
                  style={[styles.featureIcon, isRTL && styles.rtlIcon]}
                />
                <Text variant="bodyMedium" style={[styles.featureText, isRTL && styles.rtlText]}>
                  {t('proLimit.currentPlan') || 'תוכנית Pro: 2,000 מוצרים'}
                </Text>
              </View>

              <View style={[styles.featureRow, isRTL && styles.rtlRow]}>
                <MaterialCommunityIcons
                  name="arrow-up-circle"
                  size={24}
                  color="#FF6B35"
                  style={[styles.featureIcon, isRTL && styles.rtlIcon]}
                />
                <Text variant="bodyMedium" style={[styles.featureText, isRTL && styles.rtlText]}>
                  {t('proLimit.upgradeTo') || 'שדרג ל-Pro Plus: מוצרים ללא הגבלה'}
                </Text>
              </View>
            </View>

            <View style={styles.infoBox}>
              <MaterialCommunityIcons
                name="information"
                size={20}
                color="#1976D2"
                style={[styles.infoIcon, isRTL && styles.rtlIcon]}
              />
              <Text variant="bodySmall" style={[styles.infoText, isRTL && styles.rtlText]}>
                {t('proLimit.note') || 
                  'מוצרים חדשים מעל 2,000 יהיו נעולים עד לשדרוג או מחיקת מוצרים קיימים.'}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={handleDismiss}
              style={styles.laterButton}
              contentStyle={styles.buttonContent}
              labelStyle={styles.laterButtonLabel}
            >
              {t('common.later') || 'אולי מאוחר יותר'}
            </Button>
            <Button
              mode="contained"
              onPress={handleUpgrade}
              style={styles.upgradeButton}
              contentStyle={styles.buttonContent}
              labelStyle={styles.upgradeButtonLabel}
              buttonColor="#FF6B35"
              icon="crown"
            >
              {t('common.upgrade') || 'שדרוג'}
            </Button>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogContainer: {
    width: DIALOG_WIDTH,
    backgroundColor: '#FFF',
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  header: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 24,
  },
  title: {
    fontWeight: '700',
    color: '#212121',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    color: '#616161',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  featuresContainer: {
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  featureIcon: {
    marginRight: 12,
  },
  rtlIcon: {
    marginRight: 0,
    marginLeft: 12,
  },
  featureText: {
    flex: 1,
    color: '#424242',
    fontSize: 15,
  },
  rtlText: {
    textAlign: 'right',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
  },
  infoIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    color: '#1565C0',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#F5F5F5',
  },
  laterButton: {
    flex: 1,
    borderRadius: 12,
    borderColor: '#E0E0E0',
    borderWidth: 1.5,
  },
  upgradeButton: {
    flex: 1,
    borderRadius: 12,
    elevation: 0,
  },
  buttonContent: {
    height: 48,
  },
  laterButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#757575',
  },
  upgradeButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
});
