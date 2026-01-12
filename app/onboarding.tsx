/**
 * New User Onboarding Screen
 * 3-screen value-focused onboarding for first-time users
 * Goal: Get user to "first product added" as fast as possible
 */

import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Platform,
  TouchableOpacity,
  FlatList,
  ViewToken,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ONBOARDING_SEEN_KEY = (userId: string) => `onboarding_seen_${userId}`;

interface OnboardingSlide {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  bullets?: { icon: string; text: string }[];
  isAction?: boolean;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const rtlText = getRtlTextStyles(isRTL);

  const { t } = useLanguage();
  
  const slides: OnboardingSlide[] = [
    {
      id: 'value',
      icon: 'shield-check',
      iconColor: THEME_COLORS.primary,
      title: t('onboarding.slide1.title') || 'ניהול תוקף בלי כאב ראש',
      subtitle: t('onboarding.slide1.subtitle') || 'האפליקציה מזכירה לך לפני שמוצרים נזרקים',
    },
    {
      id: 'how',
      icon: 'timer-sand',
      iconColor: '#F59E0B',
      title: t('onboarding.slide2.title') || 'זה לוקח שניות',
      bullets: [
        { icon: 'barcode-scan', text: t('onboarding.slide2.bullet1') || 'סריקה או הזנה ידנית' },
        { icon: 'calendar', text: t('onboarding.slide2.bullet2') || 'תאריך תפוגה' },
        { icon: 'bell-ring', text: t('onboarding.slide2.bullet3') || 'התראה בזמן' },
      ],
    },
    {
      id: 'action',
      icon: 'rocket-launch',
      iconColor: '#22C55E',
      title: t('onboarding.slide3.title') || 'בוא נתחיל',
      isAction: true,
    },
  ];

  const markOnboardingSeen = async () => {
    if (user?.id) {
      try {
        await AsyncStorage.setItem(ONBOARDING_SEEN_KEY(user.id), 'true');
      } catch (error) {
        console.error('Error marking onboarding as seen:', error);
      }
    }
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      const nextIndex = currentIndex + 1;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setCurrentIndex(nextIndex);
    }
  };

  const handleAddFirstProduct = async () => {
    await markOnboardingSeen();
    router.replace('/(tabs)/scanner' as any);
  };

  const handleSkip = async () => {
    await markOnboardingSeen();
    router.replace('/(tabs)/home' as any);
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const contentHeight = SCREEN_HEIGHT - insets.top - insets.bottom - 100;

  const renderSlide = ({ item, index }: { item: OnboardingSlide; index: number }) => {
    return (
      <View style={[styles.slideContainer, { height: contentHeight }]}>
        {/* Icon */}
        <View style={[styles.iconWrapper, { backgroundColor: item.iconColor + '15' }]}>
          <LinearGradient
            colors={[item.iconColor, item.iconColor + 'DD']}
            style={styles.iconGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <MaterialCommunityIcons
              name={item.icon as any}
              size={48}
              color="#FFFFFF"
            />
          </LinearGradient>
        </View>

        {/* Title */}
        <Text style={[styles.slideTitle, rtlText]}>
          {item.title}
        </Text>

        {/* Subtitle */}
        {item.subtitle && (
          <Text style={[styles.slideSubtitle, rtlText]}>
            {item.subtitle}
          </Text>
        )}

        {/* Bullets */}
        {item.bullets && (
          <View style={styles.bulletList}>
            {item.bullets.map((bullet, bulletIndex) => (
              <View key={bulletIndex} style={[styles.bulletRow, isRTL && styles.bulletRowRTL]}>
                <View style={styles.bulletIcon}>
                  <MaterialCommunityIcons name={bullet.icon as any} size={22} color={THEME_COLORS.primary} />
                </View>
                <Text style={[styles.bulletText, isRTL && styles.bulletTextRTL]}>{bullet.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Action buttons for last slide */}
        {item.isAction && (
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity onPress={handleAddFirstProduct} activeOpacity={0.9}>
              <LinearGradient
                colors={THEME_COLORS.primaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryButton}
              >
                <MaterialCommunityIcons name="plus" size={22} color="#FFFFFF" style={{ marginEnd: 8 }} />
                <Text style={styles.primaryButtonText}>
                  {t('onboarding.addFirstProduct') || 'הוסף מוצר ראשון'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipButtonText}>{t('onboarding.skip') || 'דלג'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Skip button in header */}
      {currentIndex < slides.length - 1 && (
        <TouchableOpacity
          style={[styles.headerSkip, isRTL ? styles.headerSkipRTL : styles.headerSkipLTR]}
          onPress={handleSkip}
        >
          <Text style={styles.headerSkipText}>{t('onboarding.skip') || 'דלג'}</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        bounces={false}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        initialScrollIndex={0}
        style={styles.flatList}
      />

      {/* Pagination dots */}
      <View style={[styles.pagination, { bottom: insets.bottom + 40 }]}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.paginationDot,
              currentIndex === index && styles.paginationDotActive,
            ]}
          />
        ))}
      </View>

      {/* Next button (not on last slide) */}
      {currentIndex < slides.length - 1 && (
        <TouchableOpacity
          style={[styles.nextButton, { bottom: insets.bottom + 30 }]}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={THEME_COLORS.primaryGradient}
            style={styles.nextButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <MaterialCommunityIcons
              name={isRTL ? 'chevron-left' : 'chevron-right'}
              size={28}
              color="#FFFFFF"
            />
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerSkip: {
    position: 'absolute',
    top: 60,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  headerSkipLTR: {
    right: 16,
  },
  headerSkipRTL: {
    left: 16,
  },
  headerSkipText: {
    fontSize: 15,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  flatList: {
    flex: 1,
  },
  slideContainer: {
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  iconGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  slideSubtitle: {
    fontSize: 17,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 16,
  },
  bulletList: {
    gap: 16,
    alignSelf: 'stretch',
    paddingHorizontal: 8,
    marginTop: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#F9FAFB',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  bulletRowRTL: {
    flexDirection: 'row-reverse',
  },
  bulletIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEME_COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bulletText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  bulletTextRTL: {
    textAlign: 'right',
  },
  actionButtonsContainer: {
    marginTop: 40,
    alignItems: 'center',
    gap: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
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
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  skipButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  skipButtonText: {
    fontSize: 15,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    position: 'absolute',
    left: 0,
    right: 0,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  paginationDotActive: {
    width: 24,
    backgroundColor: THEME_COLORS.primary,
  },
  nextButton: {
    position: 'absolute',
    right: 24,
    ...Platform.select({
      ios: {
        shadowColor: THEME_COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  nextButtonGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

