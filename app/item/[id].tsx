/**
 * Item Details Screen
 * Shows detailed information about an item with edit, delete, and category change options
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  Appbar,
  Text,
  Button,
  Card,
  Chip,
  Divider,
  Portal,
  Dialog,
  List,
  ActivityIndicator,
  Snackbar,
  TextInput,
} from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format, differenceInCalendarDays } from 'date-fns';
import { useLanguage } from '@/context/LanguageContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { getItemById } from '@/lib/supabase/queries/items';
import { deleteItem } from '@/lib/supabase/mutations/items';
import { getCategories, getDefaultCategory, updateProductCategory } from '@/lib/supabase/queries/categories';
import { supabase } from '@/lib/supabase/client';
import { STATUS_COLORS, THEME_COLORS } from '@/lib/constants/colors';
import { getRtlTextStyles, getRtlContainerStyles, getRTLMargin } from '@/lib/utils/rtlStyles';
import { isRTL } from '@/i18n';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import type { Database } from '@/types/database';

type Item = Database['public']['Views']['items_with_details']['Row'];

export default function ItemDetailsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { activeOwnerId, isViewer } = useActiveOwner();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');
  const rtlTextDate = getRtlTextStyles(isRTL, 'date');
  const styles = createStyles(isRTL);
  const params = useLocalSearchParams<{ 
    id: string;
    productName?: string;
    expiryDate?: string;
    status?: string;
    category?: string;
    barcode?: string;
    isPlanLocked?: string;
    productId?: string;
  }>();
  const itemId = params?.id;

  // Initialize with data from route params for instant display
  const [item, setItem] = useState<Item | null>(() => {
    if (params?.productName || params?.expiryDate) {
      // Create item object from route params for instant rendering
      return {
        id: itemId || '',
        product_name: params.productName || null,
        expiry_date: params.expiryDate || '',
        status: (params.status as any) || 'ok',
        product_category: params.category || null,
        barcode_snapshot: params.barcode || null,
        product_barcode: params.barcode || null,
        is_plan_locked: params.isPlanLocked === 'true',
        product_id: params.productId || null,
        // Add other required fields with defaults
        owner_id: '',
        created_at: '',
        updated_at: '',
        note: null,
        location_id: null,
        location_name: null,
        location_order: null,
        product_image_url: null,
      } as Item;
    }
    return null;
  });
  const [loading, setLoading] = useState(false); // Start with false since we have initial data
  const [loadingAdditional, setLoadingAdditional] = useState(false); // For background fetch
  const [deleting, setDeleting] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showAddCategoryDialog, setShowAddCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [changingCategory, setChangingCategory] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  // Track if we have initial data from params
  const hasInitialData = useRef(!!(params?.productName || params?.expiryDate));

  // Background fetch for any additional fields not in route params
  useEffect(() => {
    if (!itemId || !activeOwnerId) return;

    // If we already have item data from params, fetch additional data in background
    // Otherwise, do a full fetch
    const loadItem = async () => {
      try {
        if (hasInitialData.current) {
          // We have initial data, fetch additional fields in background
          setLoadingAdditional(true);
        } else {
          // No initial data, do full fetch (fallback)
          setLoading(true);
        }
        
        const itemData = await getItemById(itemId, activeOwnerId);
        
        // Merge with existing data if we had initial data from params
        if (hasInitialData.current) {
          setItem((prevItem) => {
            if (!prevItem) return itemData;
            return {
              ...prevItem,
              ...itemData,
              // Preserve any fields that might be more up-to-date in params
              product_name: itemData.product_name || prevItem.product_name,
              expiry_date: itemData.expiry_date || prevItem.expiry_date,
              status: itemData.status || prevItem.status,
              product_category: itemData.product_category || prevItem.product_category,
              barcode_snapshot: itemData.barcode_snapshot || prevItem.barcode_snapshot,
              product_barcode: itemData.product_barcode || prevItem.product_barcode,
              is_plan_locked: itemData.is_plan_locked ?? prevItem.is_plan_locked,
              product_id: itemData.product_id || prevItem.product_id,
            };
          });
        } else {
          setItem(itemData);
        }
      } catch (error) {
        console.error('Error loading item:', error);
        // Only show error if we don't have initial data
        if (!hasInitialData.current) {
          Alert.alert(
            t('common.error') || 'שגיאה',
            t('item.loadError') || 'לא ניתן לטעון את המוצר'
          );
          router.back();
        }
      } finally {
        setLoading(false);
        setLoadingAdditional(false);
      }
    };

    loadItem();
  }, [itemId, activeOwnerId]);

  const loadCategories = async () => {
    if (!activeOwnerId) return;

    try {
      const cats = await getCategories(activeOwnerId);
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  useEffect(() => {
    loadCategories();
  }, [activeOwnerId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
        return STATUS_COLORS.ok;
      case 'soon':
        return STATUS_COLORS.soon;
      case 'expired':
        return STATUS_COLORS.expired;
      case 'resolved':
        return STATUS_COLORS.resolved;
      default:
        return '#9E9E9E';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'd MMM yyyy');
    } catch {
      return dateString;
    }
  };

  // Calculate days remaining
  const daysRemaining = useMemo(() => {
    if (!item?.expiry_date) return 0;
    try {
      const expiry = new Date(item.expiry_date);
      expiry.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return differenceInCalendarDays(expiry, today);
    } catch {
      return 0;
    }
  }, [item?.expiry_date]);

  const handleEdit = () => {
    if (!item) return;
    // Pass item data as route params for instant rendering
    router.push({
      pathname: '/add' as any,
      params: {
        itemId: itemId || '',
        // Pass all essential item data for instant display
        productName: item.product_name || '',
        expiryDate: item.expiry_date || '',
        category: item.product_category || '',
        barcode: item.barcode_snapshot || item.product_barcode || '',
        isPlanLocked: item.is_plan_locked ? 'true' : 'false',
        productId: item.product_id || '',
      },
    } as any);
  };

  const handleDelete = async () => {
    if (!item) return;

    Alert.alert(
      t('item.delete') || 'מחק',
      t('item.deleteConfirm') || 'האם אתה בטוח שברצונך למחוק את המוצר הזה?',
      [
        {
          text: t('common.cancel') || 'ביטול',
          style: 'cancel',
        },
        {
          text: t('item.delete') || 'מחק',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await deleteItem(item.id);
              setSnack(t('item.deleted') || 'נמחק בהצלחה');
              setTimeout(() => {
                router.back();
              }, 1000);
            } catch (error: any) {
              Alert.alert(
                t('common.error') || 'שגיאה',
                error?.message || t('item.deleteError') || 'לא ניתן למחוק את המוצר'
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleChangeCategory = async (newCategory: string | null) => {
    if (!item?.product_id || !activeOwnerId) return;

    try {
      setChangingCategory(true);
      await updateProductCategory(item.product_id, newCategory);
      
      // Reload item to get updated category
      const updatedItem = await getItemById(itemId!, activeOwnerId);
      setItem(updatedItem);
      
      setShowCategoryDialog(false);
      setSnack(t('item.categoryUpdated') || 'קטגוריה עודכנה בהצלחה');
    } catch (error: any) {
      Alert.alert(
        t('common.error') || 'שגיאה',
        error?.message || t('item.categoryUpdateError') || 'לא ניתן לעדכן קטגוריה'
      );
    } finally {
      setChangingCategory(false);
    }
  };

  const handleAddCategory = () => {
    setNewCategoryName('');
    setShowAddCategoryDialog(true);
  };

  const handleSaveNewCategory = async () => {
    if (!activeOwnerId || !newCategoryName.trim()) {
      Alert.alert(
        t('common.error') || 'שגיאה',
        t('categories.nameRequired') || 'אנא הזן שם קטגוריה'
      );
      return;
    }

    try {
      setCreatingCategory(true);
      const categoryNameTrimmed = newCategoryName.trim();
      
      // Check if category already exists
      const existingCategories = await getCategories(activeOwnerId);
      if (existingCategories.includes(categoryNameTrimmed)) {
        Alert.alert(
          t('common.error') || 'שגיאה',
          t('categories.alreadyExists') || 'קטגוריה זו כבר קיימת'
        );
        return;
      }
      
      // Create a placeholder product with this category
      const placeholderName = `__CATEGORY_PLACEHOLDER_${categoryNameTrimmed}__`;
      
      const { error: createError } = await supabase
        .from('products')
        .insert({
          owner_id: activeOwnerId,
          name: placeholderName,
          category: categoryNameTrimmed,
          barcode: null,
        } as any);
      
      if (createError) {
        console.error('Error creating category placeholder:', createError);
        throw createError;
      }
      
      // Refresh categories list
      await loadCategories();
      
      setShowAddCategoryDialog(false);
      setNewCategoryName('');
      setSnack(t('categories.categoryCreated') || 'קטגוריה נוצרה בהצלחה');
    } catch (error: any) {
      Alert.alert(
        t('common.error') || 'שגיאה',
        error?.message || t('categories.saveError') || 'לא ניתן לשמור קטגוריה'
      );
    } finally {
      setCreatingCategory(false);
    }
  };

  // Only show full-screen loader if we have no data at all
  if (loading && !item) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title={t('item.details') || 'פרטי מוצר'} />
        </Appbar.Header>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>{t('common.loading') || 'טוען...'}</Text>
        </View>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title={t('item.details') || 'פרטי מוצר'} />
        </Appbar.Header>
        <View style={styles.center}>
          <Text variant="titleLarge">{t('item.notFound') || 'מוצר לא נמצא'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: THEME_COLORS.surfaceVariant }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('item.details') || 'פרטי מוצר'} />
      </Appbar.Header>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Product Header Card */}
        <Card style={styles.headerCard} elevation={0}>
          <Card.Content style={styles.headerCardContent}>
            <View style={styles.headerIconContainer}>
              {item.status === 'expired' ? (
                <View style={[styles.statusIconContainer, { backgroundColor: getStatusColor(item.status) + '15' }]}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
                </View>
              ) : (
                <View style={styles.daysRemainingWrapper}>
                  <View style={[styles.statusIconContainer, { backgroundColor: getStatusColor(item.status) + '15' }]}>
                    <Text style={[styles.daysRemainingText, rtlTextDate, { color: getStatusColor(item.status) }]}>
                      {daysRemaining < 0 ? `-${Math.abs(daysRemaining)}` : daysRemaining}
                    </Text>
                  </View>
                  <Text style={[styles.daysRemainingLabel, rtlText]}>
                    {t('common.days') || 'ימים'}
                  </Text>
                </View>
              )}
            </View>
            <Text variant="headlineMedium" style={[styles.productName, rtlTextCenter]}>
              {item.product_name || 'Unknown Product'}
            </Text>
            <View style={styles.statusChipContainer}>
              <Chip
                mode="flat"
                style={[styles.statusChipHeader, { backgroundColor: getStatusColor(item.status) + '20' }]}
                textStyle={[styles.statusChipText, { color: getStatusColor(item.status) }]}
                compact
              >
                {t(`status.${item.status}`) || item.status}
              </Chip>
            </View>
          </Card.Content>
        </Card>

        {/* Details Card */}
        <Card style={styles.detailsCard} elevation={0}>
          <Card.Content style={styles.detailsCardContent}>
            <Text variant="titleMedium" style={[styles.sectionTitle, rtlText]}>
              {t('item.details') || 'פרטים'}
            </Text>

            <View style={styles.detailRow}>
              <View style={[styles.detailIconContainer, { backgroundColor: THEME_COLORS.primary + '10' }]}>
                <MaterialCommunityIcons name="barcode" size={20} color={THEME_COLORS.primary} />
              </View>
              <View style={styles.detailContent}>
                <Text variant="labelSmall" style={[styles.label, rtlText]}>
                  {t('item.barcode') || 'ברקוד'}
                </Text>
                <Text variant="bodyLarge" style={[styles.value, rtlText]}>
                  {item.barcode_snapshot || item.product_barcode || t('item.noBarcode') || 'אין ברקוד'}
                </Text>
              </View>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={[styles.detailIconContainer, { backgroundColor: '#FF9800' + '10' }]}>
                <MaterialCommunityIcons name="calendar-clock" size={20} color="#FF9800" />
              </View>
              <View style={styles.detailContent}>
                <Text variant="labelSmall" style={[styles.label, rtlText]}>
                  {t('item.expiry') || 'תאריך תפוגה'}
                </Text>
                <Text variant="bodyLarge" style={[styles.value, rtlTextDate]}>
                  {formatDate(item.expiry_date)}
                </Text>
              </View>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={[styles.detailIconContainer, { backgroundColor: '#4CAF50' + '10' }]}>
                <MaterialCommunityIcons name="folder" size={20} color="#4CAF50" />
              </View>
              <View style={styles.detailContent}>
                <Text variant="labelSmall" style={[styles.label, rtlText]}>
                  {t('item.category') || 'קטגוריה'}
                </Text>
                <View style={styles.categoryRow}>
                  <Chip 
                    icon="folder" 
                    style={styles.categoryChip}
                    textStyle={styles.categoryChipText}
                  >
                    {item.product_category || t('categories.uncategorized') || getDefaultCategory()}
                  </Chip>
                  {!isViewer && !item.is_plan_locked && (
                    <Button
                      mode="text"
                      compact
                      onPress={() => setShowCategoryDialog(true)}
                      icon="pencil"
                      textColor={THEME_COLORS.primary}
                      labelStyle={styles.changeCategoryLabel}
                    >
                      {t('item.changeCategory') || 'שנה'}
                    </Button>
                  )}
                </View>
              </View>
            </View>

            {item.status === 'resolved' && item.resolved_reason && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconContainer, { backgroundColor: '#9E9E9E' + '10' }]}>
                    <MaterialCommunityIcons name="check-circle" size={20} color="#9E9E9E" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text variant="labelSmall" style={[styles.label, rtlText]}>
                      {t('item.resolvedReason') || 'סיבה'}
                    </Text>
                    <Text variant="bodyLarge" style={[styles.value, rtlText]}>
                      {t(`resolvedReason.${item.resolved_reason}`) || item.resolved_reason}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {item.note && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <View style={[styles.detailIconContainer, { backgroundColor: '#9C27B0' + '10' }]}>
                    <MaterialCommunityIcons name="note-text" size={20} color="#9C27B0" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text variant="labelSmall" style={[styles.label, rtlText]}>
                      {t('item.note') || 'הערה'}
                    </Text>
                    <Text variant="bodyLarge" style={[styles.value, rtlText]}>
                      {item.note}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Actions */}
        {!isViewer && (
          <View style={styles.actions}>
            {!item.is_plan_locked && (
              <Button
                mode="contained"
                onPress={handleEdit}
                icon="pencil"
                style={styles.editButton}
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonLabel}
                buttonColor={THEME_COLORS.primary}
              >
                {t('common.edit') || 'ערוך'}
              </Button>
            )}
            <Button
              mode="outlined"
              onPress={handleDelete}
              icon="delete-outline"
              loading={deleting}
              disabled={deleting}
              textColor={THEME_COLORS.error}
              style={styles.deleteButton}
              contentStyle={styles.buttonContent}
              labelStyle={styles.deleteButtonLabel}
            >
              {t('common.delete') || 'מחק'}
            </Button>
          </View>
        )}
      </ScrollView>

      <Snackbar visible={!!snack} onDismiss={() => setSnack(null)} duration={3000}>
        {snack || ''}
      </Snackbar>

      <Portal>
        <Dialog 
          visible={showCategoryDialog} 
          onDismiss={() => setShowCategoryDialog(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={[styles.dialogTitle, rtlText]}>
            {t('item.changeCategory') || 'שנה קטגוריה'}
          </Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <List.Section>
              <List.Item
                title={t('categories.defaultCategory') || 'קטגוריה ברירת מחדל'}
                description={t('categories.uncategorized') || getDefaultCategory()}
                {...(isRTL 
                  ? { right: (props: any) => <List.Icon {...props} icon="folder-outline" /> }
                  : { left: (props: any) => <List.Icon {...props} icon="folder-outline" /> }
                )}
                onPress={() => !isViewer && handleChangeCategory(null)}
                style={!item.product_category ? styles.selectedItem : undefined}
                disabled={changingCategory || isViewer}
                titleStyle={[styles.dialogItemTitle, rtlText]}
                descriptionStyle={[styles.dialogItemDescription, rtlText]}
              />
              {categories.map((category) => (
                <List.Item
                  key={category}
                  title={category}
                  {...(isRTL 
                    ? { right: (props: any) => <List.Icon {...props} icon="folder" /> }
                    : { left: (props: any) => <List.Icon {...props} icon="folder" /> }
                  )}
                  onPress={() => !isViewer && handleChangeCategory(category)}
                  style={item.product_category === category ? styles.selectedItem : undefined}
                  disabled={changingCategory || isViewer}
                  titleStyle={[styles.dialogItemTitle, rtlText]}
                />
              ))}
              {categories.length === 0 && (
                <Text variant="bodySmall" style={[styles.emptyCategoriesText, rtlText]}>
                  {t('add.noCategories') || 'אין קטגוריות. המוצר יועבר לקטגוריה ברירת מחדל'}
                </Text>
              )}
            </List.Section>
          </Dialog.Content>
          <Dialog.Actions style={[styles.dialogActions, rtlContainer]}>
            {!isViewer && (
              <Button 
                onPress={handleAddCategory}
                disabled={changingCategory || creatingCategory}
                style={styles.dialogAddCategoryButton}
                labelStyle={styles.dialogAddCategoryLabel}
                icon="plus"
              >
                {t('categories.addCategory') || 'הוסף קטגוריה חדשה'}
              </Button>
            )}
            <Button 
              onPress={() => setShowCategoryDialog(false)} 
              disabled={changingCategory}
              style={styles.dialogCancelButton}
              labelStyle={styles.dialogCancelLabel}
            >
              {t('common.cancel') || 'ביטול'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Add Category Dialog */}
        <Dialog
          visible={showAddCategoryDialog}
          onDismiss={() => {
            setShowAddCategoryDialog(false);
            setNewCategoryName('');
          }}
          style={styles.dialog}
        >
          <Dialog.Title style={[styles.dialogTitle, rtlText]}>
            {t('categories.addCategory') || 'הוסף קטגוריה'}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label={t('categories.categoryName') || 'שם קטגוריה'}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              mode="outlined"
              autoFocus
              style={styles.dialogInput}
              contentStyle={rtlText}
              disabled={creatingCategory}
            />
          </Dialog.Content>
          <Dialog.Actions style={[styles.dialogActions, rtlContainer]}>
            <Button
              onPress={() => {
                setShowAddCategoryDialog(false);
                setNewCategoryName('');
              }}
              disabled={creatingCategory}
              style={styles.dialogCancelButton}
              labelStyle={styles.dialogCancelLabel}
            >
              {t('common.cancel') || 'ביטול'}
            </Button>
            <Button
              mode="contained"
              onPress={handleSaveNewCategory}
              loading={creatingCategory}
              disabled={creatingCategory || !newCategoryName.trim()}
              buttonColor={THEME_COLORS.primary}
              style={styles.dialogSaveButton}
              labelStyle={styles.dialogSaveLabel}
            >
              {t('common.save') || 'שמור'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

function createStyles(isRTL: boolean) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.surfaceVariant,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    color: THEME_COLORS.textSecondary,
  },
  headerCard: {
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerCardContent: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerIconContainer: {
    marginBottom: 12,
  },
  statusIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  daysRemainingWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysRemainingText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  daysRemainingLabel: {
    fontSize: 9,
    fontWeight: '400',
    color: '#666666',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 11,
  },
  productName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 10,
    textAlign: 'center',
  },
  statusChipContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  statusChipHeader: {
    height: 28,
    minWidth: 80,
    borderRadius: 14,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    lineHeight: 16,
  },
  detailsCard: {
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  detailsCardContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  detailRow: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  detailIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  detailContent: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#757575',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  value: {
    fontSize: 15,
    fontWeight: '500',
    color: '#212121',
    lineHeight: 20,
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E0E0',
    marginVertical: 10,
    marginLeft: isRTL ? 0 : 48,
    marginRight: isRTL ? 48 : 0,
  },
  categoryRow: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  categoryChip: {
    height: 32,
    borderRadius: 16,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  changeCategoryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  editButton: {
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: THEME_COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  deleteButton: {
    borderRadius: 12,
    borderColor: THEME_COLORS.error,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME_COLORS.error,
  },
  selectedItem: {
    backgroundColor: THEME_COLORS.primary + '10',
  },
  emptyCategoriesText: {
    padding: 16,
    textAlign: 'center',
    color: THEME_COLORS.textSecondary,
    fontSize: 14,
  },
  dialog: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
  },
  dialogContent: {
    paddingHorizontal: 0,
  },
  dialogItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
  },
  dialogItemDescription: {
    fontSize: 14,
    color: '#757575',
  },
  emptyCategoriesText: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dialogActions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  dialogCancelButton: {
    borderRadius: 12,
  },
  dialogCancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#424242',
  },
  dialogInput: {
    marginTop: 8,
  },
  dialogAddCategoryButton: {
    marginLeft: isRTL ? 0 : 8,
    marginRight: isRTL ? 8 : 0,
  },
  dialogAddCategoryLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  dialogSaveButton: {
    marginLeft: isRTL ? 0 : 8,
    marginRight: isRTL ? 8 : 0,
  },
  dialogSaveLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  });
}

