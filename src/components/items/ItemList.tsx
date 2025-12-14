/**
 * Item List Component
 * Displays a list of items grouped by category with loading and empty states
 */

import React, { useMemo, useState } from 'react';
import { View, StyleSheet, SectionList, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, ActivityIndicator, Divider, IconButton } from 'react-native-paper';
import { ItemCard } from './ItemCard';
import { useLanguage } from '@/context/LanguageContext';
import { groupItemsByCategory } from '@/lib/utils/groupByCategory';
import { getDefaultCategory } from '@/lib/supabase/queries/categories';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import type { Database } from '@/types/database';

type Item = Database['public']['Views']['items_with_details']['Row'];

type SortDirection = 'asc' | 'desc';

interface ItemListProps {
  items: Item[];
  loading?: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  searchQuery?: string; // Optional: if provided, shows "no results" instead of "empty"
  emptyMessage?: string; // Optional: custom empty message
  sortDirection?: SortDirection;
}

export function ItemList({
  items,
  loading = false,
  error = null,
  onRefresh,
  refreshing = false,
  searchQuery,
  emptyMessage,
  sortDirection = 'asc',
}: ItemListProps) {
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Group items by category
  const sections = useMemo(() => {
    return groupItemsByCategory(items, { sortDirection });
  }, [items, sortDirection]);

  const toggleCategory = (categoryTitle: string) => {
    setCollapsedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryTitle)) {
        newSet.delete(categoryTitle);
      } else {
        newSet.add(categoryTitle);
      }
      return newSet;
    });
  };

  if (loading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium" style={styles.errorText}>
          {t('common.error')}
        </Text>
        <Text variant="bodyMedium">{error.message}</Text>
      </View>
    );
  }

  if (items.length === 0) {
    const message = searchQuery 
      ? (t('search.noResults') || 'No results found')
      : (loading ? (t('common.loading') || 'Loading...') : (emptyMessage || t('home.empty') || 'No items found'));
    
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={styles.emptyText}>
          {message}
        </Text>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      renderItem={({ item, section }) => {
        // Don't render items if category is collapsed
        if (collapsedCategories.has(section.title)) {
          return null;
        }
        return <ItemCard item={item} onRefresh={onRefresh} />;
      }}
      renderSectionHeader={({ section }) => {
        const isCollapsed = collapsedCategories.has(section.title);
        const defaultCategory = getDefaultCategory();
        const displayTitle =
          section.title === defaultCategory
            ? t('categories.uncategorized') || defaultCategory
            : section.title;
        return (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => toggleCategory(section.title)}
            style={styles.sectionHeader}
          >
            <View style={[styles.sectionHeaderContent, rtlContainer]}>
              <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                {displayTitle}
              </Text>
              <IconButton
                icon={isCollapsed ? (isRTL ? 'chevron-left' : 'chevron-right') : 'chevron-down'}
                size={20}
                iconColor="#757575"
                style={styles.arrowIcon}
              />
            </View>
            <Divider style={styles.sectionDivider} />
          </TouchableOpacity>
        );
      }}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
      stickySectionHeadersEnabled={false}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={10}
      removeClippedSubviews={true}
      updateCellsBatchingPeriod={50}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: 4,
    paddingBottom: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
  },
  errorText: {
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.7,
  },
  sectionHeader: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 15,
    color: '#424242',
    letterSpacing: 0.3,
    flex: 1,
  },
  arrowIcon: {
    margin: 0,
    width: 32,
    height: 32,
  },
  sectionDivider: {
    display: 'none',
  },
});

