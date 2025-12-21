import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, SectionList, TouchableOpacity } from 'react-native';
import { Appbar, Card, Text, IconButton, Snackbar, Divider, ActivityIndicator } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useLanguage } from '@/context/LanguageContext';
import { useCategoryProducts } from '@/context/CategoryProductsContext';
import { useDebounce } from '@/lib/hooks/useDebounce';
import {
  getDefaultCategory,
  updateProductCategory,
} from '@/lib/supabase/queries/categories';
import { SearchBar } from '@/components/search/SearchBar';
import type { Database } from '@/types/database';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';

type Product = Database['public']['Tables']['products']['Row'];

interface CategorySection {
  title: string;
  data: Product[];
}

export default function AddProductsToCategoryScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const { activeOwnerId } = useActiveOwner();
  const {
    getProductsNotInCategory: getProductsNotInCategoryCache,
    refreshProductsNotInCategory,
    addProductOptimistic,
    removeProductFromNotInCategory,
    isRefreshingNotInCategory,
    hasNotInCategoryCache,
  } = useCategoryProducts();
  const params = useLocalSearchParams<{ category?: string }>();

  const defaultCategory = getDefaultCategory();
  const categoryParam = Array.isArray(params?.category)
    ? params.category[0]
    : params?.category;
  const categoryName = categoryParam || defaultCategory;
  const supabaseCategory = categoryName === defaultCategory ? null : categoryName;

  const [addingIds, setAddingIds] = useState<Record<string, boolean>>({});
  const [snack, setSnack] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Get products from cache
  const products = useMemo(() => getProductsNotInCategoryCache(supabaseCategory), [getProductsNotInCategoryCache, supabaseCategory]);
  const hasCachedData = hasNotInCategoryCache(supabaseCategory);
  const refreshing = isRefreshingNotInCategory(supabaseCategory);

  // Load on mount: show cached data immediately, then refresh in background if stale
  useEffect(() => {
    if (!activeOwnerId) return;

    const load = async () => {
      // If we have cache, refresh in background if stale
      if (hasCachedData) {
        await refreshProductsNotInCategory(supabaseCategory, false);
      } else {
        // No cache - fetch from network in background
        refreshProductsNotInCategory(supabaseCategory, true); // Don't await - let it run in background
      }
    };

    load();
  }, [activeOwnerId, supabaseCategory, hasCachedData, refreshProductsNotInCategory]);

  const handleAddProduct = async (product: Product) => {
    if (!activeOwnerId) return;
    setAddingIds((prev) => ({ ...prev, [product.id]: true }));

    // Optimistically update: remove from "not in category" list and add to category cache
    removeProductFromNotInCategory(supabaseCategory, product.id);
    const updatedProduct = { ...product, category: supabaseCategory };
    addProductOptimistic(supabaseCategory, updatedProduct);

    try {
      await updateProductCategory(product.id, supabaseCategory);
      setSnack(t('categories.productAdded') || 'הפריט נוסף לקטגוריה');
    } catch (error) {
      console.error('Failed to add product to category:', error);
      setSnack(t('categories.productAddError') || 'נכשל בהוספת הפריט');
      // Revert optimistic updates on error - refresh will fix it
      await refreshProductsNotInCategory(supabaseCategory, true);
    } finally {
      setAddingIds((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    }
  };

  // Filter products locally with debounced search query
  const filteredProducts = useMemo(() => {
    if (!debouncedSearchQuery || !debouncedSearchQuery.trim()) {
      return products;
    }

    const query = debouncedSearchQuery.toLowerCase().trim();
    return products.filter((product) => {
      // Search in product name
      const productName = product.name?.toLowerCase() || '';
      if (productName.includes(query)) return true;

      // Search in product barcode
      const productBarcode = product.barcode?.toLowerCase() || '';
      if (productBarcode.includes(query)) return true;

      return false;
    });
  }, [products, debouncedSearchQuery]);

  const sections = useMemo(() => {
    // Group products by category
    const categoryMap = new Map<string, Product[]>();

    filteredProducts.forEach((product) => {
      const category = product.category || defaultCategory;
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(product);
    });

    // Convert to array of sections and sort categories alphabetically
    const sectionsArray: CategorySection[] = Array.from(categoryMap.entries())
      .map(([title, data]) => ({ title, data }))
      .sort((a, b) => {
        // Put default category first, then sort alphabetically
        if (a.title === defaultCategory) return -1;
        if (b.title === defaultCategory) return 1;
        return a.title.localeCompare(b.title);
      });

    return sectionsArray;
  }, [filteredProducts, defaultCategory]);

  const toggleCategory = (title: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const renderItem = ({ item }: { item: Product }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={[styles.cardRow, rtlContainer]}>
          <View style={styles.info}>
            <Text variant="titleMedium" style={rtlText}>
              {item.name}
            </Text>
            {item.barcode && (
              <Text variant="bodySmall" style={[rtlText, styles.barcode]}>
                {item.barcode}
              </Text>
            )}
          </View>
          <IconButton
            icon="plus"
            onPress={() => handleAddProduct(item)}
            loading={addingIds[item.id]}
            disabled={addingIds[item.id]}
          />
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('categories.addProducts') || 'הוסף מוצרים לקטגוריה'} />
      </Appbar.Header>

      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t('search.placeholder') || 'חפש מוצרים...'}
      />

      {refreshing && filteredProducts.length > 0 && (
        <View style={styles.refreshingIndicator}>
          <ActivityIndicator size="small" color={THEME_COLORS.primary} />
          <Text style={[styles.refreshingText, rtlText]}>
            {t('common.updating') || 'מעדכן...'}
          </Text>
        </View>
      )}

      <SectionList
        sections={sections.map((section) => ({
          ...section,
          data: collapsedCategories.has(section.title) ? [] : section.data,
        }))}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => {
          const isCollapsed = collapsedCategories.has(section.title);
          // Get original data length from sections array
          const originalSection = sections.find((s) => s.title === section.title);
          const itemCount = originalSection?.data.length || 0;
          return (
            <View style={styles.sectionHeader}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => toggleCategory(section.title)}
                style={[styles.sectionHeaderRow, rtlContainer]}
              >
                <View style={styles.sectionHeaderText}>
                  <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
                    {section.title === defaultCategory
                      ? t('categories.uncategorized') || defaultCategory
                      : section.title}
                  </Text>
                  <Text style={[styles.sectionSubtitle, rtlText]}>
                    {itemCount}{' '}
                    {itemCount === 1
                      ? t('common.product') || 'מוצר'
                      : t('common.products') || 'מוצרים'}
                  </Text>
                </View>
                <IconButton
                  icon={isCollapsed ? (isRTL ? 'chevron-left' : 'chevron-right') : 'chevron-down'}
                  size={20}
                  iconColor="#9CA3AF"
                  style={styles.sectionToggleIcon}
                />
              </TouchableOpacity>
              <Divider style={styles.sectionDivider} />
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {refreshing && filteredProducts.length === 0 ? (
              <>
                <ActivityIndicator size="small" color={THEME_COLORS.primary} />
                <Text style={[styles.emptyText, rtlText, styles.emptyTextWithSpinner]}>
                  {t('common.loading') || 'טוען...'}
                </Text>
              </>
            ) : (
              <Text style={[styles.emptyText, rtlText]}>
                {debouncedSearchQuery && debouncedSearchQuery.trim()
                  ? t('search.noResults') || 'לא נמצאו תוצאות'
                  : t('categories.noAvailableProducts') || 'אין מוצרים זמינים להוספה'}
              </Text>
            )}
          </View>
        }
        stickySectionHeadersEnabled={false}
      />

      <Snackbar visible={!!snack} onDismiss={() => setSnack(null)} duration={2000}>
        {snack}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  listContent: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
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
  cardRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  info: {
    flex: 1,
    marginEnd: 12,
  },
  barcode: {
    marginTop: 4,
    opacity: 0.7,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9E9E9E',
    fontSize: 15,
  },
  emptyTextWithSpinner: {
    marginTop: 12,
  },
  sectionHeader: {
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: '#F8F9FA',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  sectionToggleIcon: {
    margin: 0,
  },
  sectionDivider: {
    backgroundColor: '#E0E0E0',
    height: 1,
    marginHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: '#757575',
  },
  refreshingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  refreshingText: {
    marginStart: 8,
    fontSize: 13,
    color: '#757575',
  },
});

