import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, SectionList, TouchableOpacity } from 'react-native';
import { Appbar, Card, Text, IconButton, Snackbar, Divider } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useLanguage } from '@/context/LanguageContext';
import {
  getDefaultCategory,
  getProductsNotInCategory,
  updateProductCategory,
} from '@/lib/supabase/queries/categories';
import { SearchBar } from '@/components/search/SearchBar';
import type { Database } from '@/types/database';
import { getRtlTextStyles, getRtlContainerStyles } from '@/lib/utils/rtlStyles';

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
  const params = useLocalSearchParams<{ category?: string }>();

  const defaultCategory = getDefaultCategory();
  const categoryParam = Array.isArray(params?.category)
    ? params.category[0]
    : params?.category;
  const categoryName = categoryParam || defaultCategory;
  const supabaseCategory = categoryName === defaultCategory ? null : categoryName;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingIds, setAddingIds] = useState<Record<string, boolean>>({});
  const [snack, setSnack] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadProducts = useCallback(async () => {
    if (!activeOwnerId) return;
    setLoading(true);
    const available = await getProductsNotInCategory(activeOwnerId, supabaseCategory);
    setProducts(available);
    setLoading(false);
  }, [activeOwnerId, supabaseCategory]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleAddProduct = async (product: Product) => {
    if (!activeOwnerId) return;
    setAddingIds((prev) => ({ ...prev, [product.id]: true }));
    setProducts((prev) => prev.filter((p) => p.id !== product.id));

    try {
      await updateProductCategory(product.id, supabaseCategory);
      setSnack(t('categories.productAdded') || 'הפריט נוסף לקטגוריה');
    } catch (error) {
      console.error('Failed to add product to category:', error);
      setProducts((prev) => [product, ...prev]);
      setSnack(t('categories.productAddError') || 'נכשל בהוספת הפריט');
    } finally {
      setAddingIds((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    }
  };

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) {
      return products;
    }

    const query = searchQuery.toLowerCase().trim();
    return products.filter((product) => {
      // Search in product name
      const productName = product.name?.toLowerCase() || '';
      if (productName.includes(query)) return true;

      // Search in product barcode
      const productBarcode = product.barcode?.toLowerCase() || '';
      if (productBarcode.includes(query)) return true;

      return false;
    });
  }, [products, searchQuery]);

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

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
              {section.title === defaultCategory 
                ? t('categories.uncategorized') || defaultCategory
                : section.title}
            </Text>
            <Divider style={styles.sectionDivider} />
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.emptyText, rtlText]}>
            {loading
              ? t('common.loading') || 'טוען...'
              : searchQuery.trim()
              ? t('search.noResults') || 'לא נמצאו תוצאות'
              : t('categories.noAvailableProducts') || 'אין מוצרים זמינים להוספה'}
          </Text>
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
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#9E9E9E',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: '#F8F9FA',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  sectionDivider: {
    backgroundColor: '#E0E0E0',
    height: 1,
  },
});

