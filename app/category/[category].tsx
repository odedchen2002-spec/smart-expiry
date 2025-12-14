import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Appbar, Card, Text, IconButton, FAB } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useLanguage } from '@/context/LanguageContext';
import {
  getProductsByCategory,
  getDefaultCategory,
} from '@/lib/supabase/queries/categories';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import type { Database } from '@/types/database';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useFocusEffect } from 'expo-router';

type Product = Database['public']['Tables']['products']['Row'];

export default function CategoryDetailsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);
  const { activeOwnerId, isViewer } = useActiveOwner();
  const params = useLocalSearchParams<{ category?: string }>();

  const categoryParam = Array.isArray(params?.category)
    ? params.category[0]
    : params?.category;
  const defaultCategory = getDefaultCategory();
  const categoryName = categoryParam || defaultCategory;
  const supabaseCategory = categoryName === defaultCategory ? null : categoryName;
  const displayCategoryName =
    categoryName === defaultCategory
      ? t('categories.uncategorized') || defaultCategory
      : categoryName;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadProducts = useCallback(async () => {
    if (!activeOwnerId) return;
    setLoading(true);
    const items = await getProductsByCategory(activeOwnerId, supabaseCategory);
    setProducts(items);
    setLoading(false);
  }, [activeOwnerId, categoryName]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [loadProducts])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProducts();
    setRefreshing(false);
  };

  const handleAddProducts = () => {
    router.push({
      pathname: '/category/[category]/add-products',
      params: { category: categoryName },
    } as any);
  };

  const renderItem = ({ item }: { item: Product }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={[styles.cardHeader, rtlContainer]}>
          <Text variant="titleMedium" style={rtlText}>
            {item.name}
          </Text>
          {item.barcode && (
            <Text variant="bodySmall" style={[rtlText, styles.barcode]}>
              {item.barcode}
            </Text>
          )}
        </View>
        {item.category && (
          <Text variant="bodySmall" style={[rtlText, styles.category]}>
            {item.category}
          </Text>
        )}
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={displayCategoryName} />
      </Appbar.Header>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          loading ? (
            <Text style={[styles.emptyText, rtlText]}>
              {t('common.loading') || 'טוען...'}
            </Text>
          ) : (
            <Text style={[styles.emptyText, rtlText]}>
              {t('categories.noProductsInCategory') || 'אין מוצרים בקטגוריה זו'}
            </Text>
          )
        }
      />

      {!isViewer && (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={handleAddProducts}
          label={t('categories.addProducts') || 'הוסף מוצרים'}
        />
      )}
    </View>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    ...(isRTL ? { left: 0 } : { right: 0 }),
    bottom: 0,
    backgroundColor: THEME_COLORS.primary,
  },
  cardHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barcode: {
    color: THEME_COLORS.primary,
    fontWeight: '500',
  },
  category: {
    marginTop: 4,
    opacity: 0.7,
  },
  emptyText: {
    marginTop: 32,
    textAlign: 'center',
    color: '#9E9E9E',
  },
  });
}

