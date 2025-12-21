import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Appbar, Card, Text, FAB, ActivityIndicator, IconButton, Dialog, Portal, Snackbar } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useLanguage } from '@/context/LanguageContext';
import { useCategoryProducts } from '@/context/CategoryProductsContext';
import { useCategories } from '@/context/CategoriesContext';
import { getDefaultCategory, updateProductCategory } from '@/lib/supabase/queries/categories';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { loadCachedCategoryProducts } from '@/lib/cache/categoryProductsCache';
import { supabase } from '@/lib/supabase/client';
import { format } from 'date-fns';
import type { Database } from '@/types/database';
import { THEME_COLORS } from '@/lib/constants/colors';

type Product = Database['public']['Tables']['products']['Row'];

export default function CategoryDetailsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const styles = createStyles(isRTL);
  const { activeOwnerId, isViewer } = useActiveOwner();
  const params = useLocalSearchParams<{ category?: string }>();
  const {
    getCategoryProducts,
    refreshCategoryProducts,
    isRefreshing,
    hasCache,
    removeProductOptimistic,
    addProductOptimistic,
  } = useCategoryProducts();
  const { categories } = useCategories();

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

  // Get products from cache (will trigger lazy loading from persistent cache if needed)
  const products = useMemo(() => getCategoryProducts(supabaseCategory), [getCategoryProducts, supabaseCategory]);
  const hasCachedData = hasCache(supabaseCategory);
  const refreshing = isRefreshing(supabaseCategory);

  // Load on mount: check persistent cache first, then refresh in background if needed
  useEffect(() => {
    if (!activeOwnerId) return;

    const load = async () => {
      // First, check if we have persistent cache
      const persistentCache = await loadCachedCategoryProducts(activeOwnerId, supabaseCategory);
      
      if (persistentCache) {
        // We have persistent cache - load it into memory and refresh if stale
        await refreshCategoryProducts(supabaseCategory, false);
      } else {
        // No persistent cache - check in-memory cache
        if (hasCachedData) {
          // We have in-memory cache - refresh in background if stale
          refreshCategoryProducts(supabaseCategory, false); // Don't await - let it run in background
        } else {
          // No cache at all - fetch from network in background
          refreshCategoryProducts(supabaseCategory, true); // Don't await - let it run in background
        }
      }
    };

    load();
  }, [activeOwnerId, supabaseCategory, refreshCategoryProducts, hasCachedData]);

  const handleRefresh = async () => {
    await refreshCategoryProducts(supabaseCategory, true);
  };

  const [productExpiryDates, setProductExpiryDates] = useState<Record<string, string | null>>({});
  const [moveDialogVisible, setMoveDialogVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [movingProductId, setMovingProductId] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  // Fetch expiry dates for products
  useEffect(() => {
    if (!activeOwnerId || products.length === 0) return;

    const fetchExpiryDates = async () => {
      const productIds = products.map((p) => p.id).filter(Boolean);
      if (productIds.length === 0) return;

      try {
        const { data: items, error } = await supabase
          .from('items')
          .select('product_id, expiry_date')
          .eq('owner_id', activeOwnerId)
          .in('product_id', productIds)
          .neq('status', 'resolved')
          .order('expiry_date', { ascending: true });

        if (error) throw error;

        // Get earliest expiry date for each product
        const datesMap: Record<string, string | null> = {};
        productIds.forEach((id) => {
          const productItems = items?.filter((item) => item.product_id === id) || [];
          if (productItems.length > 0) {
            datesMap[id] = productItems[0].expiry_date;
          } else {
            datesMap[id] = null;
          }
        });

        setProductExpiryDates(datesMap);
      } catch (error) {
        console.error('Error fetching expiry dates:', error);
      }
    };

    fetchExpiryDates();
  }, [activeOwnerId, products]);

  const handleAddProducts = () => {
    router.push({
      pathname: '/category/[category]/add-products',
      params: { category: categoryName },
    } as any);
  };

  const handleMoveClick = (product: Product) => {
    setSelectedProduct(product);
    setMoveDialogVisible(true);
  };

  const handleMoveProduct = async (targetCategory: string | null) => {
    if (!selectedProduct || !activeOwnerId) return;

    const targetCategoryName = targetCategory || getDefaultCategory();
    const targetSupabaseCategory = targetCategoryName === getDefaultCategory() ? null : targetCategoryName;

    // Don't move if already in target category
    if (selectedProduct.category === targetSupabaseCategory) {
      setSnack(t('categories.productAlreadyInCategory') || 'המוצר כבר בקטגוריה זו');
      setMoveDialogVisible(false);
      return;
    }

    setMovingProductId(selectedProduct.id);
    setMoveDialogVisible(false);

    // Optimistic update: remove from current category, add to target category
    removeProductOptimistic(supabaseCategory, selectedProduct.id);
    const updatedProduct = { ...selectedProduct, category: targetSupabaseCategory };
    addProductOptimistic(targetSupabaseCategory, updatedProduct);

    try {
      await updateProductCategory(selectedProduct.id, targetSupabaseCategory);
      setSnack(t('categories.productMoved') || 'המוצר הועבר לקטגוריה');

      // Refresh both categories to ensure consistency
      refreshCategoryProducts(supabaseCategory, true);
      refreshCategoryProducts(targetSupabaseCategory, true);
    } catch (error) {
      console.error('Failed to move product:', error);
      setSnack(t('categories.productMoveError') || 'נכשל בהעברת המוצר');
      // Revert optimistic updates on error
      refreshCategoryProducts(supabaseCategory, true);
      refreshCategoryProducts(targetSupabaseCategory, true);
    } finally {
      setMovingProductId(null);
      setSelectedProduct(null);
    }
  };

  // Get available categories for dialog (exclude current category)
  const availableCategories = useMemo(() => {
    const allCategories = [getDefaultCategory(), ...categories];
    return allCategories.filter((cat) => {
      const catSupabase = cat === getDefaultCategory() ? null : cat;
      return catSupabase !== supabaseCategory;
    });
  }, [categories, supabaseCategory]);


  const formatExpiryDate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      return format(new Date(dateString), 'dd/MM/yyyy');
    } catch {
      return dateString;
    }
  };

  const renderItem = ({ item }: { item: Product }) => {
    const expiryDate = productExpiryDates[item.id];

    return (
      <Card style={styles.card}>
        <Card.Content>
          <View style={[styles.cardContent, rtlContainer]}>
            <View style={styles.cardInfo}>
              <Text variant="titleMedium" style={rtlText}>
                {item.name}
              </Text>
              {item.barcode && (
                <Text variant="bodySmall" style={[rtlText, styles.barcode]}>
                  {item.barcode}
                </Text>
              )}
              {expiryDate && (
                <Text variant="bodySmall" style={[rtlText, styles.expiryDate]}>
                  {formatExpiryDate(expiryDate)}
                </Text>
              )}
            </View>
            {!isViewer && (
              <IconButton
                icon="folder-move"
                size={20}
                iconColor={THEME_COLORS.primary}
                disabled={movingProductId === item.id}
                onPress={() => handleMoveClick(item)}
                style={styles.moveIcon}
              />
            )}
          </View>
        </Card.Content>
      </Card>
    );
  };

  const hasData = products.length > 0;

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={displayCategoryName} />
      </Appbar.Header>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          !hasData && styles.listContentEmpty,
        ]}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {refreshing && !hasData ? (
              <>
                <ActivityIndicator size="small" color={THEME_COLORS.primary} />
                <Text style={[styles.emptyText, rtlText, styles.emptyTextWithSpinner]}>
                  {t('common.loading') || 'טוען...'}
                </Text>
              </>
            ) : (
              <Text style={[styles.emptyText, rtlText]}>
                {t('categories.noProductsInCategory') || 'אין מוצרים בקטגוריה זו'}
              </Text>
            )}
          </View>
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

      <Portal>
        <Dialog
          visible={moveDialogVisible}
          onDismiss={() => setMoveDialogVisible(false)}
          style={styles.dialog}
        >
          <View style={styles.dialogHeader}>
            <Text variant="headlineSmall" style={[styles.dialogTitle, rtlText]}>
              {t('categories.moveProductToCategory') || 'העבר מוצר לקטגוריה'}
            </Text>
            <IconButton
              icon="close"
              size={20}
              iconColor="#757575"
              onPress={() => setMoveDialogVisible(false)}
              style={styles.dialogCloseButton}
            />
          </View>
          
          <Dialog.Content style={styles.dialogContent}>
            <View style={styles.productInfo}>
              <Text variant="titleMedium" style={[styles.productName, rtlText]}>
                {selectedProduct?.name}
              </Text>
            </View>
            
            <View style={styles.categoriesSection}>
              <Text variant="labelLarge" style={[styles.sectionTitle, rtlText]}>
                {t('categories.selectCategory') || 'בחר קטגוריה'}
              </Text>
              
              {availableCategories.length > 0 ? (
                <FlatList
                  data={availableCategories}
                  keyExtractor={(item) => item}
                  style={styles.categoriesList}
                  contentContainerStyle={styles.categoriesListContent}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item: cat }) => {
                    const catDisplayName = cat === getDefaultCategory()
                      ? t('categories.uncategorized') || getDefaultCategory()
                      : cat;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          const catSupabase = cat === getDefaultCategory() ? null : cat;
                          handleMoveProduct(catSupabase);
                        }}
                        style={styles.categoryItem}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.categoryItemContent, isRTL ? styles.categoryItemContentLTR : styles.categoryItemContentRTL]}>
                          <IconButton
                            icon="folder"
                            size={18}
                            iconColor={THEME_COLORS.primary}
                            style={styles.categoryIcon}
                          />
                          <View style={styles.categoryTextContainer}>
                            <Text 
                              style={styles.categoryItemText}
                              numberOfLines={1}
                            >
                              {catDisplayName}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              ) : (
                <View style={styles.noCategoriesContainer}>
                  <Text style={[styles.noCategoriesText, rtlText]}>
                    {t('categories.noOtherCategories') || 'אין קטגוריות אחרות'}
                  </Text>
                </View>
              )}
            </View>
          </Dialog.Content>
        </Dialog>
      </Portal>

      <Snackbar visible={!!snack} onDismiss={() => setSnack(null)} duration={2000}>
        {snack}
      </Snackbar>
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
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
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
  cardContent: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardInfo: {
    flex: 1,
  },
  barcode: {
    color: THEME_COLORS.primary,
    fontWeight: '500',
    marginTop: 1,
  },
  expiryDate: {
    marginTop: 1,
    opacity: 0.7,
    fontSize: 13,
  },
  moveIcon: {
    margin: 0,
    padding: 0,
  },
  dialog: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    width: '85%',
    maxWidth: 500,
    alignSelf: 'center',
    marginHorizontal: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  dialogTitle: {
    flex: 1,
    fontWeight: '600',
    color: '#111827',
  },
  dialogCloseButton: {
    margin: 0,
    padding: 0,
  },
  dialogContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  productInfo: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  productName: {
    color: '#374151',
    fontWeight: '500',
  },
  categoriesSection: {
    marginTop: 4,
  },
  sectionTitle: {
    color: '#6B7280',
    marginBottom: 12,
    fontWeight: '500',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoriesList: {
    maxHeight: 280,
  },
  categoriesListContent: {
    paddingBottom: 4,
  },
  categoryItem: {
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    overflow: 'hidden',
  },
  categoryItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  categoryItemContentLTR: {
    flexDirection: 'row',
  },
  categoryItemContentRTL: {
    flexDirection: 'row-reverse',
  },
  categoryIcon: {
    margin: 0,
    padding: 0,
  },
  categoryTextContainer: {
    flex: 1,
    alignItems: isRTL ? 'flex-end' : 'flex-start',
    marginStart: isRTL ? 12 : 0,
    marginEnd: isRTL ? 0 : 12,
  },
  categoryItemText: {
    fontSize: 15,
    color: '#000000',
    fontWeight: '500',
    includeFontPadding: false,
    textAlign: isRTL ? 'right' : 'left',
  },
  noCategoriesContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  noCategoriesText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 14,
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
  });
}


