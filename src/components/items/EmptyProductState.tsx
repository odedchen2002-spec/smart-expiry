/**
 * Smart Empty State for Product Lists
 * Action-focused UI to get users to add their first product
 */

import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';

interface EmptyProductStateProps {
  /** Custom title - defaults to translated "No products yet" */
  title?: string;
  /** Custom subtitle - defaults to translated "Let's add your first product" */
  subtitle?: string;
  /** Whether this is for search results (shows different message) */
  isSearchResult?: boolean;
  /** Custom search query for display */
  searchQuery?: string;
  /** Hide action buttons (scan/add) */
  hideActions?: boolean;
  /** Whether filters are active (shows filter-specific empty state) */
  isFilteredResult?: boolean;
}

export function EmptyProductState({
  title,
  subtitle,
  isSearchResult = false,
  searchQuery,
  hideActions = false,
  isFilteredResult = false,
}: EmptyProductStateProps) {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);

  const handleScanProduct = () => {
    router.push('/(tabs)/scanner' as any);
  };

  const handleAddManually = () => {
    router.push('/add' as any);
  };

  // For search results with no matches
  if (isSearchResult && searchQuery) {
    return (
      <View style={styles.container}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="magnify" size={48} color="#9CA3AF" />
        </View>
        <Text style={[styles.title, rtlText]}>
          {t('common.noResults')}
        </Text>
        <Text style={[styles.subtitle, rtlText]}>
          {t('common.tryDifferentSearch')}
        </Text>
      </View>
    );
  }

  // For filtered results with no matches (date filter, category filter, etc.)
  if (isFilteredResult) {
    return (
      <View style={styles.container}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="filter-variant-remove" size={48} color="#9CA3AF" />
        </View>
        <Text style={[styles.title, rtlText]}>
          {t('common.noFilterResults')}
        </Text>
        <Text style={[styles.subtitle, rtlText]}>
          {t('common.tryDifferentFilter')}
        </Text>
      </View>
    );
  }

  // Default empty state - action focused
  return (
    <View style={styles.container}>
      {/* Icon */}
      <View style={styles.iconWrapper}>
        <LinearGradient
          colors={[THEME_COLORS.primary + '20', THEME_COLORS.primary + '10']}
          style={styles.iconGradient}
        >
          <MaterialCommunityIcons name="package-variant" size={48} color={THEME_COLORS.primary} />
        </LinearGradient>
      </View>

      {/* Title */}
      <Text style={[styles.title, rtlText]}>
        {title || t('common.noProductsYet')}
      </Text>

      {/* Subtitle */}
      <Text style={[styles.subtitle, rtlText]}>
        {subtitle || (hideActions ? '' : t('common.letsAddFirst'))}
      </Text>

      {/* Action buttons - hidden when hideActions is true */}
      {!hideActions && (
        <>
          {/* Primary CTA - Scan */}
          <TouchableOpacity onPress={handleScanProduct} activeOpacity={0.9} style={styles.primaryButtonWrapper}>
            <LinearGradient
              colors={THEME_COLORS.primaryGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryButton}
            >
              <MaterialCommunityIcons name="barcode-scan" size={22} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>{t('buttons.scanProduct')}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Secondary CTA - Add manually */}
          <TouchableOpacity onPress={handleAddManually} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{t('common.addManually')}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    paddingBottom: 100,
  },
  iconWrapper: {
    marginBottom: 24,
  },
  iconGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  primaryButtonWrapper: {
    width: '100%',
    maxWidth: 280,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
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
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    color: THEME_COLORS.primary,
    fontWeight: '500',
  },
});

