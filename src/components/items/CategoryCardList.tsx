import { useLanguage } from '@/context/LanguageContext';
import { STATUS_COLORS, THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useDatePickerStyle } from '@/lib/hooks/useDatePickerStyle';
import { deleteItem, updateItem } from '@/lib/supabase/mutations/items';
import { groupItemsByCategory } from '@/lib/utils/groupByCategory';
import { getDefaultCategory } from '@/lib/supabase/queries/categories';
import { getRtlContainerStyles, getRtlTextStyles } from '@/lib/utils/rtlStyles';
import type { Database } from '@/types/database';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { differenceInCalendarDays, format } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { ActivityIndicator, Button, IconButton, Menu, useTheme } from 'react-native-paper';

type Item = Database['public']['Views']['items_with_details']['Row'];

interface CategoryCardListProps {
  items: Item[];
  loading?: boolean;
  error?: Error | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  searchQuery?: string;
  emptyMessage?: string;
  sortDirection?: 'asc' | 'desc';
  showDaysRemaining?: boolean;
}

const getStatusColor = (status?: string | null) => {
  switch (status) {
    case 'ok':
      return '#4CAF50'; // Green = valid
    case 'soon':
      return '#FFC107'; // Yellow = approaching expiration
    case 'expired':
      return '#F44336'; // Red = expired
    case 'resolved':
      return STATUS_COLORS.resolved;
    default:
      return '#9E9E9E';
  }
};

const formatDate = (dateString?: string | null) => {
  if (!dateString) return '—';
  try {
    return format(new Date(dateString), 'd MMM yyyy');
  } catch {
    return dateString;
  }
};

// Animated item row component with press animation
interface AnimatedItemRowProps {
  product: Item;
  isDeleting: boolean;
  showCalendarButton: boolean;
  calculatedStatus: 'ok' | 'soon' | 'expired' | 'resolved';
  isLocked: boolean;
  isViewer: boolean;
  isRTL: boolean;
  rtlContainer: any;
  rtlText: any;
  rtlTextDate: any;
  styles: any;
  onPress: (product: Item) => void;
  onEdit: (product: Item, e: any) => void;
  onDelete: (product: Item, e: any) => void;
  onOpenDatePicker: (product: Item, e: any) => void;
  getStatusColor: (status?: string | null) => string;
  menuVisible: boolean;
  onMenuDismiss: () => void;
  onMenuPress: (e: any) => void;
  t: (key: string) => string | undefined;
  showDaysRemaining?: boolean;
  daysRemaining?: number;
  isFirstInCategory?: boolean;
  menuResetCounter?: Map<string, number>;
}

function AnimatedItemRow({
  product,
  isDeleting,
  showCalendarButton,
  calculatedStatus,
  isLocked,
  isViewer,
  isRTL,
  rtlContainer,
  rtlText,
  rtlTextDate,
  styles,
  onPress,
  onEdit,
  onDelete,
  onOpenDatePicker,
  getStatusColor,
  menuVisible,
  onMenuDismiss,
  onMenuPress,
  t,
  showDaysRemaining = false,
  daysRemaining = 0,
  isFirstInCategory = false,
  menuResetCounter = new Map(),
}: AnimatedItemRowProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [isPressed, setIsPressed] = useState(false);

  const handlePressIn = () => {
    if (isViewer) return;
    setIsPressed(true);
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      tension: 300,
      friction: 20,
    }).start();
  };

  const handlePressOut = () => {
    if (isViewer) return;
    setIsPressed(false);
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 20,
    }).start();
  };

  return (
    <Pressable
      onPress={() => onPress(product)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isViewer}
    >
      <Animated.View
        style={[
          styles.itemRow,
          {
            transform: [{ scale: scaleAnim }],
            backgroundColor: isPressed ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
          },
        ]}
      >
        {/* Status indicator: far left in LTR, far right in RTL */}
        {!isRTL && (
          <View style={[styles.statusIndicatorContainer, styles.statusIndicatorContainerLTR]}>
            {isLocked ? (
              <View style={[styles.statusDotContainer, { backgroundColor: '#F3F4F6' }]}>
                <MaterialCommunityIcons name="lock" size={15} color="#9CA3AF" />
              </View>
            ) : showDaysRemaining && daysRemaining <= 999 ? (
              <View style={styles.daysRemainingWrapper}>
                <View
                  style={[
                    styles.daysRemainingDotContainer,
                    {
                      backgroundColor: getStatusColor(calculatedStatus) + '15',
                    },
                  ]}
                >
                  <Text style={[styles.daysRemainingText, rtlTextDate, { color: getStatusColor(calculatedStatus) }]}>
                    {daysRemaining < 0 ? `-${Math.abs(daysRemaining)}` : daysRemaining}
                  </Text>
                </View>
                {isFirstInCategory && (
                  <Text style={[styles.daysRemainingLabel, rtlText]}>
                    {t('common.days') || 'ימים'}
                  </Text>
                )}
              </View>
            ) : (
              <View
                style={[
                  styles.statusDotContainer,
                  {
                    backgroundColor: getStatusColor(calculatedStatus) + '15',
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: getStatusColor(calculatedStatus) },
                  ]}
                />
              </View>
            )}
          </View>
        )}
        <View style={[styles.rowLeft, rtlContainer]}>
          <View style={[styles.itemTextContainer, !isRTL && styles.itemTextContainerLTR]}>
            <Text style={[styles.itemName, rtlText, !isRTL && styles.itemNameLTR]} numberOfLines={1}>
              {product.product_name || '—'}
            </Text>
            <Text style={[styles.itemDate, !isRTL ? styles.itemDateLTR : rtlTextDate]} numberOfLines={1}>
              {formatDate(product.expiry_date)}
            </Text>
          </View>
          {!isViewer && (
            <View style={[styles.actions, rtlContainer]}>
              {showCalendarButton && !isLocked && (
                <TouchableOpacity
                  activeOpacity={0.5}
                  onPress={(e) => onOpenDatePicker(product, e)}
                  style={styles.actionIconTouchable}
                >
                  <IconButton
                    icon="calendar-edit"
                    iconColor="#4A90E2"
                    size={20}
                    style={styles.actionIcon}
                  />
                </TouchableOpacity>
              )}
              <Menu
                key={`${product.id}-${menuResetCounter.get(product.id) || 0}`}
                visible={menuVisible}
                onDismiss={onMenuDismiss}
                anchor={
                  <TouchableOpacity
                    activeOpacity={0.5}
                    onPress={(e) => {
                      e.stopPropagation();
                      onMenuPress(e);
                    }}
                    style={styles.actionIconTouchable}
                  >
                    <IconButton
                      icon="dots-vertical"
                      iconColor="#6B7280"
                      size={20}
                      style={styles.actionIcon}
                    />
                  </TouchableOpacity>
                }
                contentStyle={[styles.menuContent, { direction: isRTL ? 'ltr' : 'rtl' }]}
              >
                {!isLocked && (
                  <Menu.Item
                    onPress={(e) => {
                      onMenuDismiss();
                      onEdit(product, e);
                    }}
                    title={t('common.edit') || 'ערוך'}
                    leadingIcon="pencil-outline"
                    titleStyle={[styles.menuItemTitle, rtlText]}
                    contentStyle={styles.menuItemContent}
                  />
                )}
                <Menu.Item
                  onPress={(e) => {
                    onMenuDismiss();
                    onDelete(product, e);
                  }}
                  title={t('common.delete') || 'מחק'}
                  leadingIcon="delete-outline"
                  titleStyle={[styles.menuItemTitle, styles.menuItemTitleDelete, rtlText]}
                  contentStyle={styles.menuItemContent}
                />
              </Menu>
            </View>
          )}
        </View>
        {/* Status indicator: far right in RTL mode */}
        {isRTL && (
          <View style={[styles.statusIndicatorContainer, styles.statusIndicatorContainerRTL]}>
            {isLocked ? (
              <View style={[styles.statusDotContainer, { backgroundColor: '#F3F4F6' }]}>
                <MaterialCommunityIcons name="lock" size={15} color="#9CA3AF" />
              </View>
            ) : showDaysRemaining && daysRemaining <= 999 ? (
              <View style={styles.daysRemainingWrapper}>
                <View
                  style={[
                    styles.daysRemainingDotContainer,
                    {
                      backgroundColor: getStatusColor(calculatedStatus) + '15',
                    },
                  ]}
                >
                  <Text style={[styles.daysRemainingText, rtlTextDate, { color: getStatusColor(calculatedStatus) }]}>
                    {daysRemaining < 0 ? `-${Math.abs(daysRemaining)}` : daysRemaining}
                  </Text>
                </View>
                {isFirstInCategory && (
                  <Text style={[styles.daysRemainingLabel, rtlText]}>
                    {t('common.days') || 'ימים'}
                  </Text>
                )}
              </View>
            ) : (
              <View
                style={[
                  styles.statusDotContainer,
                  {
                    backgroundColor: getStatusColor(calculatedStatus) + '15',
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: getStatusColor(calculatedStatus) },
                  ]}
                />
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function CategoryCardList({
  items,
  loading = false,
  error = null,
  refreshing = false,
  onRefresh,
  searchQuery,
  emptyMessage,
  sortDirection = 'asc',
  showDaysRemaining = false,
}: CategoryCardListProps) {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { datePickerStyle } = useDatePickerStyle();
  const { isViewer } = useActiveOwner();
  const theme = useTheme();
  
  const styles = createStyles(isRTL);
  const rtlContainer = getRtlContainerStyles(isRTL);
  const rtlText = getRtlTextStyles(isRTL);
  const rtlTextDate = getRtlTextStyles(isRTL, 'date');
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());
  const [datePickerItem, setDatePickerItem] = useState<Item | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [updatingDate, setUpdatingDate] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [menuVisibleItemId, setMenuVisibleItemId] = useState<string | null>(null);
  const [menuResetCounter, setMenuResetCounter] = useState<Map<string, number>>(new Map());

  const minDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);

  const sections = useMemo(() => {
    return groupItemsByCategory(items, { sortDirection }).filter((section) => section.data.length > 0);
  }, [items, sortDirection]);

  const currentExpiryDate = useMemo(() => {
    if (!datePickerItem?.expiry_date) {
      return minDate;
    }
    const parsed = new Date(datePickerItem.expiry_date);
    parsed.setHours(0, 0, 0, 0);
    return isNaN(parsed.getTime()) ? minDate : parsed;
  }, [datePickerItem, minDate]);

  useEffect(() => {
    if (datePickerItem) {
      setSelectedDate(currentExpiryDate);
    }
  }, [datePickerItem, currentExpiryDate]);

  const showLockedModal = () => {
    Alert.alert(
      t('common.upgradeRequired') || 'שדרוג נדרש',
      t('common.upgradeRequiredMessage') || 'חרגת מכמות המוצרים המותרת בתוכנית החינמית. כדי לערוך את כל המוצרים ולקבל התראות ללא הגבלה, שדרג לתוכנית Pro.'
    );
  };

  const handleItemPress = (item: Item) => {
    if (isViewer) return;
    if (item.is_plan_locked) {
      showLockedModal();
      return;
    }
    // Pass item data as route params for instant rendering
    router.push({
      pathname: `/item/${item.id}` as any,
      params: {
        // Pass all essential item data for instant display
        productName: item.product_name || '',
        expiryDate: item.expiry_date || '',
        status: item.status || '',
        category: item.product_category || '',
        barcode: item.barcode_snapshot || item.product_barcode || '',
        isPlanLocked: item.is_plan_locked ? 'true' : 'false',
        productId: item.product_id || '',
      },
    } as any);
  };

  const isExpiringSoon = (item: Item) => {
    if (!item.expiry_date) {
      return false;
    }
    try {
      const expiry = new Date(item.expiry_date);
      expiry.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = differenceInCalendarDays(expiry, today);
      return diff <= 1;
    } catch {
      return false;
    }
  };

  /**
   * Calculate item status based on expiration date
   * This ensures the status is always correct regardless of database values
   */
  const getItemStatus = (item: Item): 'ok' | 'soon' | 'expired' | 'resolved' => {
    // If item is resolved, keep it resolved
    if (item.status === 'resolved') {
      return 'resolved';
    }

    if (!item.expiry_date) {
      return 'ok'; // Default to ok if no expiry date
    }

    try {
      const expiry = new Date(item.expiry_date);
      expiry.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = differenceInCalendarDays(expiry, today);

      // Expired: past date
      if (diff < 0) {
        return 'expired';
      }

      // Soon: within 7 days (including today)
      if (diff <= 7) {
        return 'soon';
      }

      // Ok: more than 7 days away
      return 'ok';
    } catch {
      return 'ok'; // Default to ok on error
    }
  };

  const handleEdit = (item: Item, e: any) => {
    e.stopPropagation();
    if (isViewer) return;
    if (item.is_plan_locked) {
      showLockedModal();
      return;
    }
    // Pass item data as route params for instant rendering
    router.push({
      pathname: '/add' as any,
      params: {
        itemId: item.id,
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

  const handleDelete = async (item: Item, e: any) => {
    e.stopPropagation();
    if (isViewer) return;
    
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
              setDeletingItems((prev) => new Set(prev).add(item.id));
              await deleteItem(item.id);
              onRefresh?.();
            } catch (error: any) {
              Alert.alert(
                t('common.error') || 'שגיאה',
                error?.message || t('item.deleteError') || 'לא ניתן למחוק את המוצר'
              );
            } finally {
              setDeletingItems((prev) => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
              });
            }
          },
        },
      ]
    );
  };

  const handleOpenDatePicker = (item: Item, e?: any) => {
    e?.stopPropagation?.();
    if (isViewer) return;
    if (item.is_plan_locked) {
      showLockedModal();
      return;
    }
    if (!item.expiry_date) {
      setSelectedDate(minDate);
    } else {
      const parsed = new Date(item.expiry_date);
      parsed.setHours(0, 0, 0, 0);
      setSelectedDate(isNaN(parsed.getTime()) ? minDate : parsed);
    }
    setDatePickerItem(item);
  };

  const handleCancelDatePicker = () => {
    setDatePickerItem(null);
    setSelectedDate(minDate);
  };

  const handleDateChange = (event: any, date?: Date) => {
    if (!date) {
      return;
    }
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        return;
      }
      if (date >= minDate) {
        setSelectedDate(date);
      }
    } else {
      if (date >= minDate) {
        setSelectedDate(date);
      }
    }
  };

  const handleUpdateExpiryDate = async () => {
    if (!datePickerItem) return;
    
    try {
      setUpdatingDate(true);
      const safeDate = selectedDate < minDate ? minDate : selectedDate;
      const formattedDate = format(safeDate, 'yyyy-MM-dd');
      await updateItem(datePickerItem.id, { expiry_date: formattedDate });
      setDatePickerItem(null);
      onRefresh?.();
    } catch (error: any) {
      Alert.alert(
        t('common.error') || 'Error',
        error?.message || t('item.dateUpdateError') || 'Could not update the expiry date'
      );
    } finally {
      setUpdatingDate(false);
    }
  };

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

  const renderCategoryCard = ({ item, index }: any) => {
    const isCollapsed = collapsedCategories.has(item.title);
    return (
      <View>
        {/* Separator line ABOVE each category block (not the first one) */}
        {index > 0 && <View style={styles.categorySeparator} />}
        <View style={[styles.categoryCard, isCollapsed && styles.categoryCardCollapsed]}>
          <TouchableOpacity
          style={styles.categoryHeaderRow}
          activeOpacity={0.8}
          onPress={() => toggleCategory(item.title)}
        >
          <View style={styles.categoryHeaderText}>
            <Text style={[styles.categoryTitle, rtlText]} numberOfLines={1}>
              {item.title === getDefaultCategory() ? t('categories.uncategorized') : item.title}
            </Text>
            <Text style={[styles.categorySubtitle, rtlText]} numberOfLines={1}>
              {item.data.length} {item.data.length === 1 ? t('common.product') : t('common.products')}
            </Text>
          </View>
          <IconButton
            icon={isCollapsed ? (isRTL ? 'chevron-left' : 'chevron-right') : 'chevron-down'}
            size={20}
            iconColor="#9CA3AF"
            style={styles.categoryToggleIcon}
          />
        </TouchableOpacity>
        {!isCollapsed && (
          <FlatList
            data={item.data}
            keyExtractor={(product) => product.id}
            renderItem={({ item: product, index }) => {
            const isDeleting = deletingItems.has(product.id);
            const showCalendarButton = isExpiringSoon(product);
            const calculatedStatus = getItemStatus(product);
            const isLocked = product.is_plan_locked;
            
            // Calculate days remaining
            let daysRemaining = 0;
            if (product.expiry_date) {
              try {
                const expiry = new Date(product.expiry_date);
                expiry.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                daysRemaining = differenceInCalendarDays(expiry, today);
              } catch {
                daysRemaining = 0;
              }
            }
            
            // Show "ימים" label only for the first item in the category
            const isFirstInCategory = index === 0;
            
            return (
              <AnimatedItemRow
                product={product}
                isDeleting={isDeleting}
                showCalendarButton={showCalendarButton}
                calculatedStatus={calculatedStatus}
                isLocked={isLocked}
                isViewer={isViewer}
                isRTL={isRTL}
                rtlContainer={rtlContainer}
                rtlText={rtlText}
                rtlTextDate={rtlTextDate}
                styles={styles}
                onPress={handleItemPress}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onOpenDatePicker={handleOpenDatePicker}
                getStatusColor={getStatusColor}
                menuVisible={menuVisibleItemId === product.id}
                onMenuDismiss={() => {
                  setMenuVisibleItemId(null);
                  // Increment counter for this menu to force re-render when reopening
                  setMenuResetCounter((prev) => {
                    const next = new Map(prev);
                    next.set(product.id, (next.get(product.id) || 0) + 1);
                    return next;
                  });
                }}
                onMenuPress={(e: any) => {
                  e.stopPropagation();
                  // Always set the menu ID - if it's already open, this will close it via toggle
                  const isCurrentlyOpen = menuVisibleItemId === product.id;
                  setMenuVisibleItemId(isCurrentlyOpen ? null : product.id);
                }}
                t={t}
                showDaysRemaining={showDaysRemaining}
                daysRemaining={daysRemaining}
                isFirstInCategory={isFirstInCategory}
                menuResetCounter={menuResetCounter}
              />
            );
          }}
            ItemSeparatorComponent={() => <View style={styles.itemDivider} />}
            scrollEnabled={false}
          />
        )}
        </View>
      </View>
    );
  };

  if (loading && sections.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>אירעה שגיאה</Text>
        <Text style={styles.errorMessage}>{error.message}</Text>
      </View>
    );
  }

  if (!loading && sections.length === 0) {
    const message =
      searchQuery?.length && !items.length
        ? t('common.noResults')
        : emptyMessage || t('common.noProductsToDisplay');

    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>{message}</Text>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={sections}
        keyExtractor={(section) => section.title}
        renderItem={(props) => renderCategoryCard({ ...props, index: props.index })}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={5}
        windowSize={6}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      />
      {datePickerItem && (
        <Modal
          visible={!!datePickerItem}
          transparent
          animationType="fade"
          onRequestClose={handleCancelDatePicker}
        >
          <TouchableWithoutFeedback onPress={handleCancelDatePicker}>
            <View style={styles.modalBackdrop}>
              <TouchableWithoutFeedback>
                <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
                  <View style={[styles.modalHeader, { borderBottomColor: theme.colors.surfaceVariant }]}>
                    <View style={[styles.modalHeaderContent, rtlContainer]}>
                      <View style={[styles.modalIconContainer, { backgroundColor: THEME_COLORS.primary + '15' }]}>
                        <MaterialCommunityIcons 
                          name="calendar-edit" 
                          size={24} 
                          color={THEME_COLORS.primary} 
                        />
                      </View>
                      <View style={styles.modalTitleContainer}>
                        <Text style={[styles.modalTitle, rtlText, { color: theme.colors.onSurface }]}>
                          {t('item.updateExpiryDate') || 'עדכן תאריך תפוגה'}
                        </Text>
                        <Text style={[styles.modalSubtitle, rtlText, { color: theme.colors.onSurfaceVariant }]}>
                          {t('item.updateExpiryDateDesc') || 'בחר תאריך תפוגה חדש למוצר זה'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                    <View style={[styles.datePickerContainer, { backgroundColor: theme.colors.surfaceVariant }]}>
                      <DateTimePicker
                        value={selectedDate < minDate ? minDate : selectedDate}
                        mode="date"
                        display={
                          datePickerStyle === 'calendar' 
                            ? (Platform.OS === 'ios' ? 'inline' : 'default')
                            : (Platform.OS === 'ios' ? 'spinner' : 'default')
                        }
                        minimumDate={minDate}
                        onChange={handleDateChange}
                        style={styles.datePicker}
                        textColor={theme.colors.onSurface}
                        accentColor={datePickerStyle === 'calendar' ? THEME_COLORS.primary : "white"}
                        themeVariant="light"
                        locale="he_IL"
                      />
                    </View>
                  </View>
                  <View style={[styles.modalFooter, { borderTopColor: theme.colors.surfaceVariant }]}>
                    <Button
                      mode="outlined"
                      onPress={handleCancelDatePicker}
                      style={styles.modalCancelButton}
                      labelStyle={[styles.modalCancelLabel, { color: theme.colors.onSurfaceVariant }]}
                      contentStyle={styles.modalButtonContent}
                    >
                      {t('common.cancel') || 'ביטול'}
                    </Button>
                    <Button
                      mode="contained"
                      onPress={handleUpdateExpiryDate}
                      style={styles.modalConfirmButton}
                      labelStyle={styles.modalConfirmLabel}
                      buttonColor={THEME_COLORS.primary}
                      loading={updatingDate}
                      disabled={updatingDate}
                      contentStyle={styles.modalButtonContent}
                      icon="check"
                    >
                      {t('common.update') || 'עדכן'}
                    </Button>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </>
  );
}

const createStyles = (isRTL: boolean) => StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 24, // More vertical spacing between category sections
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: 'center',
  },
  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06, // Stronger shadow
    shadowRadius: 6, // Stronger shadow
    elevation: 4, // Android elevation
    marginBottom: 20, // More vertical spacing between category blocks
  },
  categoryCardCollapsed: {
    paddingBottom: 12,
  },
  categorySeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginBottom: 12, // Spacing above category card
    marginTop: 0,
    marginHorizontal: 16, // Match card padding
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
    paddingVertical: 4,
  },
  categoryHeaderText: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 20,
    fontWeight: '800', // Bolder and more prominent
    color: '#0F172A',
  },
  categorySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  categoryToggleIcon: {
    margin: 0,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    minHeight: 60,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
    marginEnd: 2, // Reduced to move action icons closer to right edge
  },
  statusIndicatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    flexShrink: 0,
  },
  statusIndicatorContainerLTR: {
    // In LTR, status indicator is on the far left
    marginStart: 0, // Aligned with left padding of card
    marginEnd: 12, // Space between number and product name/date
  },
  statusIndicatorContainerRTL: {
    // In RTL, status indicator is on the far right
    marginStart: 12, // Space between number and product name/date
    marginEnd: 0,
  },
  statusDotContainer: {
    width: 20,
    height: 20,
    minWidth: 20,
    minHeight: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  daysRemainingWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysRemainingDotContainer: {
    width: 24,
    height: 24,
    minWidth: 24,
    minHeight: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemTextContainer: {
    flex: 1,
    flexDirection: 'column', // Explicitly use column layout
    gap: 3, // Small vertical spacing between name and date (2-4px range)
    minWidth: 0, // Ensures text can shrink and doesn't overlap with action icons
  },
  itemTextContainerLTR: {
    // In LTR mode, ensure left alignment of container contents
    alignItems: 'flex-start', // Left-align both name and date
  },
  itemName: {
    fontSize: 15, // Reduced by ~12% (from 17 to 15) for better fit of long names
    fontWeight: '600',
    color: '#111827',
  },
  itemNameLTR: {
    // In LTR mode, ensure left alignment
    textAlign: 'left',
    alignSelf: 'flex-start', // Ensure it starts at the left edge
  },
  itemDate: {
    fontSize: 13,
    color: '#6B7280',
    opacity: 0.65,
  },
  itemDateLTR: {
    // In LTR mode, date is left-aligned directly under the name at the same x-position
    textAlign: 'left',
    writingDirection: 'ltr', // Date numbers should be LTR
    alignSelf: 'flex-start', // Ensure it starts at the same x-position as the name
  },
  rowRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 0,
  },
  actionIconTouchable: {
    borderRadius: 20,
    marginEnd: 0, // No spacing between action icons - compact group
  },
  actionIcon: {
    margin: 0,
    minWidth: 40,
    minHeight: 40,
    width: 40,
    height: 40,
    flexShrink: 0,
  },
  itemDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginVertical: 2, // Add vertical spacing between items (total ~16px with paddingVertical: 7)
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.25,
        shadowRadius: 40,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  modalHeader: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FAFBFC',
  },
  modalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  modalIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: THEME_COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  modalTitleContainer: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 6,
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    letterSpacing: 0.1,
  },
  modalContent: {
    padding: 28,
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 320,
    backgroundColor: '#FFFFFF',
  },
  datePickerContainer: {
    borderRadius: 24,
    padding: Platform.OS === 'ios' ? 28 : 20,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        minHeight: 280,
      },
      android: {
        elevation: 4,
        minHeight: 240,
      },
    }),
  },
  datePicker: {
    width: '100%',
    ...Platform.select({
      ios: {
        height: 260,
        transform: [{ scale: 1.08 }],
      },
      android: {
        height: 220,
      },
    }),
  },
  modalFooter: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    paddingHorizontal: 28,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FAFBFC',
    justifyContent: isRTL ? 'flex-start' : 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  modalButtonContent: {
    paddingVertical: 6,
    paddingHorizontal: 20,
    minHeight: 48,
  },
  modalCancelButton: {
    minWidth: 110,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  modalCancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: '#6B7280',
  },
  modalConfirmButton: {
    minWidth: 130,
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: THEME_COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  modalConfirmLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  menuContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 140,
  },
  menuItemContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemTitle: {
    textAlign: 'center',
  },
  menuItemTitleDelete: {
    color: '#F44336',
  },
  daysRemainingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  daysRemainingLabel: {
    fontSize: 7,
    fontWeight: '400',
    color: '#666666',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 9,
  },
});

const styles = createStyles(false); // Will be updated dynamically


