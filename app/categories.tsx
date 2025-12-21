/**
 * Categories Management Screen
 * Allows users to create, edit, and manage product categories
 */

import { useLanguage } from '@/context/LanguageContext';
import { useCategories } from '@/context/CategoriesContext';
import { isRTL } from '@/i18n';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { supabase } from '@/lib/supabase/client';
import {
  deleteCategory,
  getCategories,
  getDefaultCategory,
  renameCategory,
} from '@/lib/supabase/queries/categories';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { Category } from '@/lib/cache/categoriesCache';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useCallback } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View, InteractionManager } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  Dialog,
  FAB,
  IconButton,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';

export default function CategoriesScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const { activeOwnerId, isViewer } = useActiveOwner();
  const {
    categories,
    productCounts,
    loading,
    refresh,
    addCategoryOptimistic,
    updateCategoryOptimistic,
    deleteCategoryOptimistic,
  } = useCategories();
  const [dialogVisible, setDialogVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  const defaultCategory = getDefaultCategory();

  const handleAddCategory = () => {
    setEditingCategory(null);
    setCategoryName('');
    setDialogVisible(true);
  };

  const handleEditCategory = (category: string) => {
    setEditingCategory(category);
    setCategoryName(category);
    setDialogVisible(true);
  };

  const handleSaveCategory = async () => {
    if (!activeOwnerId || !categoryName.trim()) {
      Alert.alert(
        t('common.error') || 'שגיאה',
        t('categories.nameRequired') || 'אנא הזן שם קטגוריה'
      );
      return;
    }

    try {
      const trimmedName = categoryName.trim();

      if (editingCategory) {
        if (editingCategory !== trimmedName) {
          // Optimistically update via context (immediate UI update)
          updateCategoryOptimistic(editingCategory, trimmedName);

          // Persist to Supabase
          await renameCategory(activeOwnerId, editingCategory, trimmedName);
          
          // Refresh after interactions complete (non-blocking)
          InteractionManager.runAfterInteractions(() => {
            refresh(true).catch((err) => {
              console.error('Error refreshing after category update:', err);
            });
          });
        }
      } else {
        // Create new category by creating a placeholder product with this category
        const categoryNameTrimmed = trimmedName;
        
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
        
        const { data: createdProduct, error: createError } = await supabase
          .from('products')
          .insert({
            owner_id: activeOwnerId,
            name: placeholderName,
            category: categoryNameTrimmed,
            barcode: null,
          } as any)
          .select()
          .single();
        
        if (createError) {
          console.error('Error creating category placeholder:', createError);
          throw createError;
        }
        
        // Optimistically add via context (immediate UI update)
        addCategoryOptimistic(categoryNameTrimmed);
        
        // Refresh after interactions complete (non-blocking)
        InteractionManager.runAfterInteractions(() => {
          refresh(true).catch((err) => {
            console.error('Error refreshing after category add:', err);
          });
        });
      }
      setDialogVisible(false);
    } catch (error: any) {
      Alert.alert(
        t('common.error') || 'שגיאה',
        error?.message || t('categories.saveError') || 'לא ניתן לשמור קטגוריה'
      );
      // Revert optimistic update on error - defer to avoid blocking
      InteractionManager.runAfterInteractions(() => {
        refresh(true).catch((err) => {
          console.error('Error refreshing after category save error:', err);
        });
      });
    }
  };

  const handleDeleteCategory = (category: string) => {
    setCategoryToDelete(category);
    setDeleteDialogVisible(true);
  };

  const confirmDeleteCategory = async () => {
    if (!activeOwnerId || !categoryToDelete) return;

    try {
      const categoryToRemove = categoryToDelete;

      // Optimistically update via context
      deleteCategoryOptimistic(categoryToRemove);

      await deleteCategory(activeOwnerId, categoryToRemove);
      setDeleteDialogVisible(false);
      setCategoryToDelete(null);
      
      // Refresh after interactions complete (non-blocking)
      InteractionManager.runAfterInteractions(() => {
        refresh(true).catch((err) => {
          console.error('Error refreshing after category delete:', err);
        });
      });
    } catch (error: any) {
      Alert.alert(
        t('common.error') || 'שגיאה',
        error?.message || t('categories.deleteError') || 'לא ניתן למחוק קטגוריה'
      );
      // Revert optimistic update on error - defer to avoid blocking
      InteractionManager.runAfterInteractions(() => {
        refresh(true).catch((err) => {
          console.error('Error refreshing after category delete error:', err);
        });
      });
    }
  };

  const handleViewCategory = (category: string) => {
    router.push({
      pathname: '/category/[category]',
      params: { category },
    } as any);
  };

  // Handle back navigation: navigate immediately, defer any heavy operations
  const handleBack = useCallback(() => {
    // Navigate immediately - no await, no blocking operations
    router.back();
    
    // If we need to refresh the main screen, do it after navigation completes
    // The main screen will use the optimistic updates from context, so no refresh needed here
    // But if needed in the future, use InteractionManager.runAfterInteractions:
    // InteractionManager.runAfterInteractions(() => {
    //   // Any heavy operations here
    // });
  }, [router]);

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: THEME_COLORS.surface }}>
        <Appbar.BackAction onPress={handleBack} iconColor={THEME_COLORS.text} />
        <Appbar.Content title={t('categories.title') || 'ניהול קטגוריות'} />
      </Appbar.Header>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Default Category Card */}
        <Card style={styles.defaultCategoryCard} mode="outlined">
          <Card.Content style={styles.defaultCategoryContent}>
            <View style={[styles.defaultCategoryHeader, rtlContainer]}>
              <View style={styles.defaultCategoryIconContainer}>
                <IconButton
                  icon="folder-star"
                  size={26}
                  iconColor={THEME_COLORS.primary}
                  style={styles.defaultCategoryIcon}
                />
              </View>
              <View style={styles.defaultCategoryInfo}>
                <Text variant="titleMedium" style={[styles.defaultCategoryTitle, rtlText]}>
                  {t('categories.defaultCategory') || 'קטגוריה ברירת מחדל'}
                </Text>
                <Chip 
                  style={styles.defaultCategoryChip} 
                  textStyle={styles.defaultCategoryChipText}
                  mode="flat"
                >
                  {t('categories.uncategorized') || defaultCategory}
                </Chip>
              </View>
            </View>
            <Text variant="bodySmall" style={styles.helpText}>
              {t('categories.defaultHelp') || 'מוצרים ללא קטגוריה יופיעו תחת קטגוריה זו'}
            </Text>
          </Card.Content>
        </Card>

        {/* Custom Categories Section */}
        <View style={styles.customSection}>
          <View style={styles.sectionHeader}>
            <Text variant="titleLarge" style={[styles.sectionTitle, rtlText]}>
              {t('categories.customCategories') || 'קטגוריות מותאמות אישית'}
            </Text>
            {loading && categories.length > 0 && (
              <ActivityIndicator 
                size="small" 
                color={THEME_COLORS.primary} 
                style={[styles.loadingIndicator, isRTL ? styles.loadingIndicatorRTL : styles.loadingIndicatorLTR]}
              />
            )}
          </View>

          {categories.length === 0 ? (
            !loading ? (
              <Card style={styles.emptyCard} mode="outlined">
                <Card.Content style={styles.emptyCardContent}>
                  <IconButton
                    icon="folder-plus-outline"
                    size={48}
                    iconColor="#9E9E9E"
                    style={styles.emptyIcon}
                  />
                  <Text variant="titleMedium" style={[styles.emptyTitle, rtlText]}>
                    {t('categories.noCategories') || 'אין קטגוריות'}
                  </Text>
                  <Text variant="bodyMedium" style={[styles.emptySubtitle, rtlText]}>
                    {t('categories.createFirst') || 'צור קטגוריה חדשה כדי להתחיל'}
                  </Text>
                </Card.Content>
              </Card>
            ) : (
              // Initial load with no data yet – keep very light, no full-screen loader
              <View />
            )
          ) : (
            <View style={styles.categoriesGrid}>
              {categories.map((category) => (
                <Card
                  key={category}
                  style={styles.categoryCard}
                  mode="outlined"
                  onPress={() => handleViewCategory(category)}
                >
                  <Card.Content style={styles.categoryCardContent}>
                    <View style={[styles.categoryHeader, rtlContainer]}>
                      <View style={styles.categoryIconContainer}>
                        <IconButton
                          icon="folder"
                          size={26}
                          iconColor={THEME_COLORS.primary}
                          style={styles.categoryIcon}
                        />
                      </View>
                      <View style={styles.categoryInfo}>
                        <View style={[styles.categoryNameRow, rtlContainer]}>
                          <Text 
                            variant="titleMedium" 
                            style={[styles.categoryName, rtlText]}
                            numberOfLines={1}
                          >
                            {category}
                          </Text>
                          <View style={[styles.categoryActions, rtlContainer]}>
                            <IconButton
                              icon="pencil"
                              size={22}
                              iconColor="#666"
                              onPress={(e) => {
                                e.stopPropagation();
                                handleEditCategory(category);
                              }}
                              style={styles.actionButton}
                            />
                            <IconButton
                              icon="delete"
                              size={22}
                              iconColor="#E57373"
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDeleteCategory(category);
                              }}
                              style={styles.actionButton}
                            />
                          </View>
                        </View>
                        <Text variant="bodySmall" style={[styles.categoryCount, rtlText]}>
                          {productCounts[category] || 0} {t('categories.products') || 'מוצרים'}
                        </Text>
                      </View>
                    </View>
                  </Card.Content>
                </Card>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {!isViewer && (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={handleAddCategory}
          label={t('categories.add') || 'הוסף קטגוריה'}
          color="#FFFFFF"
        />
      )}

      <Portal>
        <Dialog 
          visible={dialogVisible} 
          onDismiss={() => setDialogVisible(false)}
          style={styles.dialog}
          contentStyle={styles.dialogContentStyle}
        >
          <View style={styles.dialogHeader}>
            <View style={styles.dialogIconContainer}>
              <MaterialCommunityIcons
                name={editingCategory ? "pencil" : "folder-plus"}
                size={20}
                color={THEME_COLORS.primary}
              />
            </View>
            <Text style={[styles.dialogTitle, rtlText]}>
              {editingCategory
                ? t('categories.editCategory') || 'ערוך קטגוריה'
                : t('categories.addCategory') || 'הוסף קטגוריה'}
            </Text>
          </View>
          <Dialog.Content style={styles.dialogContentWrapper}>
            <TextInput
              label={t('categories.categoryName') || 'שם קטגוריה'}
              value={categoryName}
              onChangeText={setCategoryName}
              mode="outlined"
              autoFocus
              style={styles.dialogInput}
              contentStyle={rtlText}
              outlineColor="#E0E0E0"
              activeOutlineColor={THEME_COLORS.primary}
            />
          </Dialog.Content>
          <Dialog.Actions style={[styles.dialogActions, rtlContainer]}>
            <Button 
              onPress={() => setDialogVisible(false)}
              style={styles.dialogCancelButton}
              labelStyle={styles.dialogCancelLabel}
              textColor="#757575"
            >
              {t('common.cancel') || 'ביטול'}
            </Button>
            <Button 
              mode="contained" 
              onPress={handleSaveCategory}
              style={styles.dialogSaveButton}
              labelStyle={styles.dialogSaveLabel}
              buttonColor={THEME_COLORS.primary}
              contentStyle={styles.dialogButtonContent}
            >
              {t('common.save') || 'שמור'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog 
          visible={deleteDialogVisible} 
          onDismiss={() => setDeleteDialogVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={rtlText}>
            {t('categories.deleteCategory') || 'מחק קטגוריה'}
          </Dialog.Title>
          <Dialog.Content>
            <View style={styles.deleteDialogIcon}>
              <IconButton
                icon="alert-circle"
                size={48}
                iconColor="#B00020"
              />
            </View>
            <Text variant="bodyLarge" style={[styles.deleteConfirmText, rtlText]}>
              {t('categories.deleteConfirm') || 'האם אתה בטוח שברצונך למחוק את הקטגוריה?'}
            </Text>
            <Text style={[styles.warningText, rtlText]}>
              {t('categories.deleteWarning') || 'כל המוצרים בקטגוריה זו יועברו לקטגוריה ברירת מחדל'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions style={rtlContainer}>
            <Button onPress={() => setDeleteDialogVisible(false)}>
              {t('common.cancel') || 'ביטול'}
            </Button>
            <Button 
              mode="contained" 
              onPress={confirmDeleteCategory} 
              buttonColor="#B00020"
            >
              {t('common.delete') || 'מחק'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  // Default Category Card
  defaultCategoryCard: {
    marginBottom: 24,
    borderRadius: 16,
    backgroundColor: `${THEME_COLORS.primary}08`,
    borderColor: `${THEME_COLORS.primary}20`,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: THEME_COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  defaultCategoryContent: {
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  defaultCategoryHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 14,
  },
  defaultCategoryIconContainer: {
    marginBottom: 12,
  },
  defaultCategoryIcon: {
    margin: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: 44,
    height: 44,
  },
  defaultCategoryInfo: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  defaultCategoryTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: THEME_COLORS.primary,
    marginBottom: 10,
    letterSpacing: 0.1,
  },
  defaultCategoryChip: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: `${THEME_COLORS.primary}30`,
  },
  defaultCategoryChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME_COLORS.primary,
  },
  helpText: {
    fontSize: 13,
    color: '#424242',
    opacity: 0.75,
    lineHeight: 20,
    marginTop: 4,
    textAlign: 'center',
  },
  // Custom Categories Section
  customSection: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
    textAlign: 'center',
  },
  loadingIndicator: {
    position: 'absolute',
  },
  loadingIndicatorLTR: {
    right: 0,
  },
  loadingIndicatorRTL: {
    left: 0,
  },
  categoriesGrid: {
    gap: 14,
  },
  categoryCard: {
    marginBottom: 0,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0F0F0',
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
  categoryCardContent: {
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  categoryIconContainer: {
    ...(isRTL ? { marginLeft: 14 } : { marginRight: 14 }),
  },
  categoryIcon: {
    margin: 0,
    backgroundColor: `${THEME_COLORS.primary}15`,
    borderRadius: 12,
    width: 44,
    height: 44,
  },
  categoryInfo: {
    flex: 1,
    minWidth: 0,
  },
  categoryNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  categoryName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#212121',
    letterSpacing: 0.1,
    flex: 1,
    minWidth: 0,
  },
  categoryCount: {
    fontSize: 14,
    color: '#757575',
    fontWeight: '400',
  },
  categoryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  actionButton: {
    margin: 0,
    width: 36,
    height: 36,
  },
  // Loading State
  loadingContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: '#757575',
  },
  // Empty State
  emptyCard: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 0,
  },
  emptyCardContent: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    margin: 0,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    lineHeight: 20,
  },
  // FAB
  fab: {
    position: 'absolute',
    margin: 16,
    ...(isRTL ? { left: 0 } : { right: 0 }),
    bottom: 0,
    backgroundColor: '#42A5F5',
  },
  // Dialogs
  dialog: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  dialogContentStyle: {
    backgroundColor: '#FFFFFF',
    padding: 0,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  dialogHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  dialogIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${THEME_COLORS.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  dialogContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dialogInput: {
    marginTop: 0,
    backgroundColor: '#FFFFFF',
  },
  dialogActions: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 10,
  },
  dialogCancelButton: {
    borderRadius: 12,
    minWidth: 100,
  },
  dialogCancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 4,
  },
  dialogSaveButton: {
    borderRadius: 12,
    minWidth: 100,
  },
  dialogSaveLabel: {
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 4,
  },
  dialogButtonContent: {
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  deleteDialogIcon: {
    alignItems: 'center',
    marginBottom: 16,
  },
  deleteConfirmText: {
    fontSize: 16,
    color: '#212121',
    marginBottom: 12,
    textAlign: 'center',
  },
  warningText: {
    fontSize: 13,
    color: '#B00020',
    lineHeight: 18,
    textAlign: 'center',
  },
});

