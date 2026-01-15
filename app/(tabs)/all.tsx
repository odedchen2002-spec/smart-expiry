import { CategoryCardList } from '@/components/items/CategoryCardList';
import { SkeletonItemList } from '@/components/items/SkeletonItemCard';
import { SearchBar } from '@/components/search/SearchBar';
import { Trial7DayReminderDialog } from '@/components/subscription/Trial5DayReminderDialog';
import { TrialEndedDialog } from '@/components/subscription/TrialEndedDialog';
import { TrialReminderDialog } from '@/components/subscription/TrialReminderDialog';
import { UpgradeBanner } from '@/components/subscription/UpgradeBanner';
import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useNotificationBadge } from '@/lib/hooks/useNotificationBadge';
import { useItemsQuery } from '@/hooks/queries/useItemsQuery';
import { useDeleteItem } from '@/hooks/writes/useDeleteItem';
import { useUpdateItem } from '@/hooks/writes/useUpdateItem';
import { resolveItem } from '@/lib/supabase/mutations/items';
import { logSoldFinished } from '@/lib/supabase/services/expiryEventsService';
import { getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { filterItems } from '@/lib/utils/search';
import type { Database } from '@/types/database';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { differenceInDays, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Button, Chip, IconButton, Surface, Text, Snackbar } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';

type Item = Database['public']['Views']['items_with_details']['Row'];

// Store the last action for undo
type LastAction = {
  itemId: string;
  itemName: string;
  previousStatus: 'ok' | 'soon' | 'expired';
};


export default function AllScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ daysAhead?: string }>();
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;
  const { activeOwnerId, loading: ownerLoading } = useActiveOwner();
  const { hasNew, markSeen } = useNotificationBadge();
  
  // TanStack Query for reading items
  const { data: items = [], isFetching, error, refetch } = useItemsQuery({
    ownerId: activeOwnerId || undefined,
    scope: 'all',
    enabled: !!activeOwnerId,
  });
  
  // Debug log for items changes
  useEffect(() => {
    console.log('[All Screen] Items updated:', {
      count: items.length,
      hasOptimistic: items.some((i: any) => i._optimistic),
      isFetching,
      activeOwnerId
    });
  }, [items.length, isFetching, activeOwnerId]);
  
  // Determine if we have cached data
  const hasCachedData = items.length > 0;
  
  // Show skeleton only if fetching AND no cached data (first load)
  const showSkeleton = isFetching && !hasCachedData;
  
  // Write hooks (Outbox-based)
  const { deleteItem, undoDelete, canUndo: canUndoDelete } = useDeleteItem(activeOwnerId || '', 'all');
  const { updateItem } = useUpdateItem(activeOwnerId || '', 'all');
  
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNavigatingToProductRef = useRef(false); // Track internal navigation (to product details)

  // Track if filter was set from navigation params (for display label)
  const [filterFromNav, setFilterFromNav] = useState<'today' | 'week' | null>(null);

  // Temporary filter states (before applying)
  const [tempStartDate, setTempStartDate] = useState<Date | null>(null);
  const [tempEndDate, setTempEndDate] = useState<Date | null>(null);
  const [tempCategoryFilter, setTempCategoryFilter] = useState<string | null>(null);
  
  // Date picker visibility
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // Handle navigation params for daysAhead filter (legacy support)
  // Note: This is kept for backward compatibility but date range filter is now the primary method
  useEffect(() => {
    if (params.daysAhead) {
      const days = parseInt(params.daysAhead, 10);
      if (!isNaN(days)) {
        // Convert days to date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        setStartDate(today);
        
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);
        futureDate.setHours(23, 59, 59, 999);
        setEndDate(futureDate);
        
        // Clear URL params immediately after applying
        router.setParams({ daysAhead: undefined } as any);
      }
    }
  }, [params.daysAhead]);

  // Get unique categories from items
  const availableCategories = useMemo(() => {
    const categories = new Set<string>();
    items.forEach(item => {
      if (item.product_category) {
        categories.add(item.product_category);
      }
    });
    return Array.from(categories).sort();
  }, [items]);

  // Filter items based on search query, date range, and category
  const filteredItems = useMemo(() => {
    console.log('[AllScreen] filteredItems useMemo start, items.length:', items.length);

    let filtered = items.filter((item) => item.status !== 'resolved');
    console.log('[AllScreen] After status filter:', filtered.length);

    // CRITICAL: Filter out soft-deleted items (marked for deletion with undo window)
    // This prevents duplicate key errors and ensures deleted items don't appear in UI
    filtered = filtered.filter((item) => !(item as any)._deleted);
    console.log('[AllScreen] After _deleted filter:', filtered.length);
    
    // SAFETY: Remove duplicate IDs (in case of optimistic + reconcile race)
    const seenIds = new Set<string>();
    const duplicates = new Set<string>();
    filtered = filtered.filter((item) => {
      if (seenIds.has(item.id)) {
        duplicates.add(item.id);
        return false;
      }
      seenIds.add(item.id);
      return true;
    });
    
    // Log duplicates only once (if any found)
    if (duplicates.size > 0) {
      console.warn('[AllScreen] Duplicate IDs filtered:', Array.from(duplicates));
    }
    console.log('[AllScreen] After dedup filter:', filtered.length);

    filtered = filterItems(filtered, searchQuery);

    // Apply date range filter (filter by expiry_date)
    if (startDate || endDate) {
      filtered = filtered.filter((item) => {
        try {
          if (!item.expiry_date) return false;

          const expiryDate = parseISO(item.expiry_date);
          if (isNaN(expiryDate.getTime())) return false;

          expiryDate.setHours(0, 0, 0, 0);

          // Check if expiry date is within the selected range
          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (expiryDate < start) return false;
          }

          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (expiryDate > end) return false;
          }

          return true;
        } catch (error) {
          console.warn('Error filtering item by date:', error, item);
          return false;
        }
      });
    }

    // Apply category filter
    if (categoryFilter !== null) {
      filtered = filtered.filter((item) => item.product_category === categoryFilter);
    }

    return filtered;
  }, [items, searchQuery, startDate, endDate, categoryFilter]);

  // Initialize temp filters when dialog opens
  useEffect(() => {
    if (filterMenuVisible) {
      setTempStartDate(startDate);
      setTempEndDate(endDate);
      setTempCategoryFilter(categoryFilter);
    }
  }, [filterMenuVisible, startDate, endDate, categoryFilter]);

  // Apply filters
  const handleApplyFilters = () => {
    setStartDate(tempStartDate);
    setEndDate(tempEndDate);
    setCategoryFilter(tempCategoryFilter);
    setFilterMenuVisible(false);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setTempStartDate(null);
    setTempEndDate(null);
    setTempCategoryFilter(null);
    setStartDate(null);
    setEndDate(null);
    setCategoryFilter(null);
    setFilterFromNav(null);
    setFilterMenuVisible(false);
    // Clear the route params by navigating to same screen without params
    router.setParams({ daysAhead: undefined } as any);
  };

  // Check if any filters are active
  const hasActiveFilters = startDate !== null || endDate !== null || categoryFilter !== null;

  // Pull-to-refresh (ONLY manual refetch path)
  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Clear undo timeout
  const clearUndoTimeout = useCallback(() => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
  }, []);

  // Handle undo action
  const handleUndo = useCallback(async () => {
    if (!lastAction) return;

    try {
      clearUndoTimeout();
      setSnackbarVisible(false);

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Restore item to previous status
      await updateItem({
        itemId: lastAction.itemId,
        updates: {
        status: lastAction.previousStatus,
        resolved_reason: null,
        },
      });

      // Success haptic
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Clear last action
      setLastAction(null);

      // Refetch to update list
      refetch();
    } catch (error) {
      console.error('[AllScreen] Error undoing action:', error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [lastAction, clearUndoTimeout, refetch]);

  // Handle sold/finished action
  const handleSoldFinished = useCallback(async (item: Item) => {
    if (!activeOwnerId) return;

    clearUndoTimeout();

    // Haptic feedback immediately
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Store previous status for potential manual undo
    const previousStatus = (item.status as 'ok' | 'soon' | 'expired') || 'ok';

    // Store last action
    setLastAction({
      itemId: item.id,
      itemName: item.product_name || t('common.product'),
      previousStatus,
    });

    // Show snackbar
    setSnackbarMessage(t('expiryAlert.actionSuccess'));
    setSnackbarVisible(true);

    // Set timeout to clear snackbar
    undoTimeoutRef.current = setTimeout(() => {
      setLastAction(null);
      setSnackbarVisible(false);
    }, 5000);

    // Background: Log event (fire-and-forget) and update item via Outbox
    try {
      // Log the event (fire-and-forget, no await)
      void logSoldFinished(
        activeOwnerId,
        item.id,
        item.barcode_snapshot || item.product_barcode || undefined,
        item.product_name || undefined
      );

      // Update item to resolved via Outbox (local operation only)
      await updateItem({
        itemId: item.id,
        updates: { status: 'resolved' as any, resolved_reason: 'sold' },
      });

      // Success haptic
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('[AllScreen] Error handling sold/finished:', error);
      setSnackbarMessage(t('common.error') || 'שגיאה');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [activeOwnerId, t, updateItem, clearUndoTimeout]);

  // Handle delete action with optimistic UI + Outbox + Undo
  const handleDelete = useCallback(async (item: Item) => {
    // Guard against missing owner
    if (!activeOwnerId) return;

    // Haptic feedback immediately
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Delete via Outbox (soft-delete with undo)
      const result = await deleteItem(item.id);

      // Show snackbar with undo (no manual timeout - managed by hook)
    setSnackbarMessage(t('item.deleted') || 'המוצר נמחק');
    setSnackbarVisible(true);
      // Note: canUndo state is managed by useDeleteItem hook automatically

      // Success haptic
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('[AllScreen] Error deleting item:', error);
      setSnackbarMessage(t('item.deleteError') || 'שגיאה במחיקה');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [activeOwnerId, deleteItem, t]);

  const styles = createStyles(isRTL);
  const rtlContainer = getRtlContainerStyles(isRTL);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#F8F9FA' }]} edges={[]}>
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={THEME_COLORS.primaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}
        >
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <IconButton
                icon="cog-outline"
                size={19}
                onPress={() => router.push('/settings' as any)}
                iconColor="rgba(255, 255, 255, 0.72)"
                style={styles.headerIcon}
              />
            </View>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>{t('screens.all.title')}</Text>
              <Text style={styles.headerSubtitle}>
                {t('screens.all.total')} {filteredItems.length} {filteredItems.length === 1 ? t('screens.all.product') : t('screens.all.products')}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.bellWrapper}>
                <IconButton
                  icon="bell-outline"
                  size={19}
                  onPress={async () => {
                    await markSeen();
                    router.push('/notifications-history' as any);
                  }}
                  iconColor="rgba(255, 255, 255, 0.72)"
                  style={[styles.headerIcon, styles.bellIcon]}
                />
                {hasNew && <View style={styles.badgeDot} />}
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.content}>
        {/* Status Line */}
        <View style={styles.statusLineContainer}>
          <Text style={styles.statusLineText}>
            {(() => {
              // Count items that need attention (expiring within 7 days or already expired)
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const needsAttention = items.filter(item => {
                if (item.status === 'resolved' || !item.expiry_date) return false;
                const expiryDate = new Date(item.expiry_date);
                expiryDate.setHours(0, 0, 0, 0);
                const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                return daysUntil <= 7;
              }).length;

              if (needsAttention === 0) {
                return t('screens.all.statusAllGood');
              } else if (needsAttention === 1) {
                return t('screens.all.statusNeedsAttentionSingle');
              } else {
                return t('screens.all.statusNeedsAttention', { count: needsAttention });
              }
            })()}
          </Text>
        </View>

        <View style={styles.filtersContainer}>
          {/* Search Bar Row with Filter Button */}
          <View style={[styles.searchFilterRow, rtlContainer]}>
            <View style={styles.searchBarWrapper}>
              <SearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('screens.all.searchPlaceholder')}
                elevated
              />
            </View>

            <TouchableOpacity
              style={[
                styles.filterButton,
                hasActiveFilters && styles.filterButtonActive
              ]}
              onPress={() => setFilterMenuVisible(true)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="filter-variant"
                size={20}
                color={hasActiveFilters ? '#FFFFFF' : '#6B7280'}
              />
            </TouchableOpacity>
          </View>

          {hasActiveFilters && (
            <View style={[styles.activeFilterRow, rtlContainer]}>
              {/* Show date range filter label */}
              {(startDate || endDate) && (
                <Chip
                  icon="calendar-range"
                  style={styles.activeFilterChip}
                  mode="flat"
                  textStyle={styles.activeFilterChipText}
                >
                  {startDate && endDate
                    ? `${startDate.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} - ${endDate.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}`
                    : startDate
                    ? `מ-${startDate.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                    : `עד ${endDate?.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
                </Chip>
              )}
              <Chip
                icon="close-circle"
                onPress={handleClearFilters}
                style={styles.clearFilterChip}
                mode="outlined"
                textStyle={{ fontSize: 12 }}
              >
                {t('filters.clearFilter') || 'נקה סינון'}
              </Chip>
            </View>
          )}

          <Modal
            visible={filterMenuVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setFilterMenuVisible(false)}
          >
            <TouchableWithoutFeedback onPress={() => setFilterMenuVisible(false)}>
              <View style={styles.filterBackdrop}>
                <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                  <Surface style={styles.filterCard}>
                    {/* Title Section */}
                    <View style={styles.filterTitleSection}>
                      <View style={styles.filterTitleIconContainer}>
                        <MaterialCommunityIcons name="filter-variant" size={24} color={THEME_COLORS.primary} />
                      </View>
                      <Text style={styles.filterTitle}>
                        {t('filters.title')}
                      </Text>
                    </View>
                    <View style={styles.filterTitleDivider} />

                    {/* CONTENT – date range filter */}
                    <View style={styles.filterContentWrapper}>
                      <View style={styles.filterSectionHeader}>
                        <MaterialCommunityIcons name="calendar-range" size={18} color="#6B7280" style={styles.filterSectionIcon} />
                        <Text style={styles.filterSectionTitle}>
                          {t('filters.dateRange') || 'טווח תאריכים'}
                        </Text>
                      </View>

                      <View style={styles.datePickerContainer}>
                        {/* Start Date */}
                        <View style={styles.datePickerRow}>
                          <Text style={styles.datePickerLabel}>
                            {t('filters.fromDate') || 'מתאריך'}:
                          </Text>
                          <TouchableOpacity
                            style={styles.datePickerButton}
                            onPress={() => {
                              setShowStartDatePicker(true);
                              setShowEndDatePicker(false);
                            }}
                          >
                            <MaterialCommunityIcons name="calendar" size={20} color={THEME_COLORS.primary} />
                            <Text style={styles.datePickerButtonText}>
                              {tempStartDate 
                                ? tempStartDate.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                : t('filters.selectDate') || 'בחר תאריך'}
                            </Text>
                          </TouchableOpacity>
                          {tempStartDate && (
                            <TouchableOpacity onPress={() => setTempStartDate(null)}>
                              <MaterialCommunityIcons name="close-circle" size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* End Date */}
                        <View style={styles.datePickerRow}>
                          <Text style={styles.datePickerLabel}>
                            {t('filters.toDate') || 'עד תאריך'}:
                          </Text>
                          <TouchableOpacity
                            style={styles.datePickerButton}
                            onPress={() => {
                              setShowEndDatePicker(true);
                              setShowStartDatePicker(false);
                            }}
                          >
                            <MaterialCommunityIcons name="calendar" size={20} color={THEME_COLORS.primary} />
                            <Text style={styles.datePickerButtonText}>
                              {tempEndDate 
                                ? tempEndDate.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                : t('filters.selectDate') || 'בחר תאריך'}
                            </Text>
                          </TouchableOpacity>
                          {tempEndDate && (
                            <TouchableOpacity onPress={() => setTempEndDate(null)}>
                              <MaterialCommunityIcons name="close-circle" size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      {/* Date Pickers */}
                      {showStartDatePicker && (
                        <View>
                          <DateTimePicker
                            value={tempStartDate || new Date()}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, selectedDate) => {
                              // On Android, close immediately after selection
                              // On iOS, keep open for spinner UX
                              if (Platform.OS === 'android') {
                                setShowStartDatePicker(false);
                              }
                              if (event.type === 'set' && selectedDate) {
                                setTempStartDate(selectedDate);
                              }
                              if (event.type === 'dismissed') {
                                setShowStartDatePicker(false);
                              }
                            }}
                          />
                          {Platform.OS === 'ios' && (
                            <Button
                              mode="text"
                              onPress={() => setShowStartDatePicker(false)}
                              style={styles.datePickerDoneButton}
                            >
                              {t('common.done') || 'סיום'}
                            </Button>
                          )}
                        </View>
                      )}

                      {showEndDatePicker && (
                        <View>
                          <DateTimePicker
                            value={tempEndDate || new Date()}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, selectedDate) => {
                              // On Android, close immediately after selection
                              // On iOS, keep open for spinner UX
                              if (Platform.OS === 'android') {
                                setShowEndDatePicker(false);
                              }
                              if (event.type === 'set' && selectedDate) {
                                setTempEndDate(selectedDate);
                              }
                              if (event.type === 'dismissed') {
                                setShowEndDatePicker(false);
                              }
                            }}
                            minimumDate={tempStartDate || undefined}
                          />
                          {Platform.OS === 'ios' && (
                            <Button
                              mode="text"
                              onPress={() => setShowEndDatePicker(false)}
                              style={styles.datePickerDoneButton}
                            >
                              {t('common.done') || 'סיום'}
                            </Button>
                          )}
                        </View>
                      )}
                    </View>

                    {/* ACTION BUTTONS */}
                    <View style={styles.filterActionsDivider} />
                    <View style={styles.filterActionsRow}>
                      <Button
                        mode="contained"
                        onPress={handleApplyFilters}
                        style={styles.filterActionButton}
                        contentStyle={styles.filterActionButtonContent}
                        labelStyle={styles.filterActionButtonLabel}
                        buttonColor={THEME_COLORS.primary}
                      >
                        {t('filters.apply')}
                      </Button>
                      <Button
                        mode="outlined"
                        onPress={handleClearFilters}
                        style={styles.filterActionButton}
                        contentStyle={styles.filterActionButtonContent}
                        labelStyle={styles.filterActionButtonLabel}
                        textColor="#6B7280"
                        outlineColor="rgba(107, 114, 128, 0.2)"
                      >
                        {t('common.clear')}
                      </Button>
                      <Button
                        mode="text"
                        onPress={() => setFilterMenuVisible(false)}
                        style={styles.filterActionButtonCancel}
                        contentStyle={styles.filterActionButtonContent}
                        labelStyle={styles.filterActionButtonLabelCancel}
                        textColor="#9CA3AF"
                      >
                        {t('common.cancel')}
                      </Button>
                    </View>
                  </Surface>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        </View>

        <UpgradeBanner />

        {showSkeleton ? (
          <SkeletonItemList count={10} />
        ) : (
        <CategoryCardList
          items={filteredItems}
            loading={ownerLoading}
          error={error}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          searchQuery={searchQuery}
          emptyMessage={t('screens.all.empty')}
          sortDirection="asc"
          showDaysRemaining={true}
          onSoldFinished={handleSoldFinished}
          onDelete={handleDelete}
          hasActiveFilters={hasActiveFilters}
          onBeforeNavigate={() => { isNavigatingToProductRef.current = true; }}
        />
        )}
      </View>
      <Trial7DayReminderDialog />
      <TrialReminderDialog />
      <TrialEndedDialog />

      {/* Snackbar with Undo for Delete */}
      {canUndoDelete && (
        <Snackbar
          visible={true}
          onDismiss={() => {
            setSnackbarVisible(false);
            // Note: actual cleanup happens in hook timer
          }}
          duration={5000}
          action={{
            label: t('common.cancel'),
            onPress: () => {
              undoDelete();
              setSnackbarVisible(false);
            },
          }}
          style={{ marginBottom: insets.bottom + 70 }}
        >
          {snackbarMessage || t('item.deleted') || 'המוצר נמחק'}
        </Snackbar>
      )}

      {/* Snackbar for Sold/Finished (with manual undo) */}
      {snackbarVisible && lastAction && !canUndoDelete && (
        <View style={styles.undoContainer}>
          <View style={styles.undoCard}>
            <Text style={styles.undoMessage}>{snackbarMessage}</Text>
            <Button
              mode="text"
              onPress={handleUndo}
              style={styles.undoButton}
              labelStyle={styles.undoButtonLabel}
              compact
            >
              {t('common.cancel')}
            </Button>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (isRTL: boolean) => StyleSheet.create({
  container: {
    flex: 1,
  },
  headerWrapper: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, // Soft bottom shadow
    shadowOpacity: 0.08, // Very gentle shadow strength
    shadowRadius: 14, // Soft blur for polished separation
    elevation: 4, // Reduced for subtlety
  },
  header: {
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    position: 'relative',
  },
  headerIcon: {
    margin: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    minWidth: 40,
    minHeight: 40,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 50,
    flexShrink: 0,
    zIndex: 1,
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
    paddingHorizontal: 60,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: isRTL ? 'flex-start' : 'flex-end',
    minWidth: 50,
    flexShrink: 0,
    gap: 8,
    zIndex: 1,
  },
  bellIcon: {
    marginStart: 0,
  },
  bellWrapper: {
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  content: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  statusLineContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: '#F8F9FA',
  },
  statusLineText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    textAlign: isRTL ? 'right' : 'left',
    letterSpacing: 0.15,
  },
  filtersContainer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#F8F9FA',
  },
  searchFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBarWrapper: {
    flex: 1,
  },
  filterButton: {
    width: 44,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: THEME_COLORS.primary,
    borderColor: THEME_COLORS.primary,
  },
  activeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterLabel: {
    fontSize: 14,
    color: '#757575',
    marginEnd: 8,
  },
  filterChipOuter: {
    marginEnd: 8,
  },
  clearFilterChip: {
    marginStart: isRTL ? 0 : 'auto',
    marginEnd: isRTL ? 'auto' : 0,
  },
  activeFilterChip: {
    backgroundColor: THEME_COLORS.primary + '15',
    borderColor: THEME_COLORS.primary + '30',
  },
  activeFilterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME_COLORS.primary,
  },
  filterBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    width: '90%',
    maxWidth: 420,
    maxHeight: '75%',
    flexDirection: 'column',
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 32,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  filterTitleSection: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  filterTitleIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: THEME_COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginEnd: isRTL ? 0 : 12,
    marginStart: isRTL ? 12 : 0,
  },
  filterTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: 0.3,
    flex: 1,
  },
  filterTitleDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginBottom: 20,
  },
  filterContentWrapper: {
    marginTop: 12,
    marginBottom: 20,
    flexGrow: 1,
    minHeight: 0,
  },
  filterSectionHeader: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  filterSectionIcon: {
    marginEnd: isRTL ? 0 : 8,
    marginStart: isRTL ? 8 : 0,
  },
  filterSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.2,
  },
  filterChipsScroll: {
    maxHeight: 180,
  },
  filterChipsGrid: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  filterChipSelected: {
    backgroundColor: THEME_COLORS.primary,
    borderColor: THEME_COLORS.primary,
    ...Platform.select({
      ios: {
        shadowColor: THEME_COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterSection: {
    marginBottom: 0,
    borderRadius: 14,
    backgroundColor: '#FAFAFA',
    elevation: 0,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  sectionContent: {
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterOptionChip: {
    marginHorizontal: 0,
    marginVertical: 0,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
    paddingHorizontal: 12,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    lineHeight: 20,
    paddingVertical: 0,
  },
  filterActionsDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginTop: 8,
    marginBottom: 20,
  },
  filterActionsRow: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  filterActionButton: {
    flex: 1,
    borderRadius: 12,
    height: 50,
    minHeight: 50,
    maxHeight: 50,
  },
  filterActionButtonCancel: {
    flex: 1,
    borderRadius: 12,
    height: 50,
    minHeight: 50,
    maxHeight: 50,
  },
  filterActionButtonContent: {
    height: 50,
    minHeight: 50,
    maxHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
  },
  filterActionButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    letterSpacing: 0.3,
  },
  filterActionButtonLabelCancel: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    letterSpacing: 0.2,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    marginHorizontal: 0,
    height: 48,
    minHeight: 48,
    maxHeight: 48,
  },
  actionButtonContent: {
    paddingVertical: 0,
    height: 48,
    minHeight: 48,
    maxHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#757575',
    letterSpacing: 0.2,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  clearButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#757575',
    letterSpacing: 0.2,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  applyButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  selectedFilterItem: {
    backgroundColor: '#E3F2FD',
  },
  snackbar: {
    backgroundColor: '#22C55E',
    marginBottom: 100,
  },
  undoContainer: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  undoCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  undoButton: {
    backgroundColor: 'transparent',
    marginVertical: 0,
    marginHorizontal: 0,
    paddingHorizontal: 0,
  },
  undoButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#60A5FA',
    marginHorizontal: 0,
  },
  undoMessage: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  datePickerContainer: {
    gap: 16,
    paddingVertical: 8,
  },
  datePickerRow: {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: 12,
  },
  datePickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    minWidth: 70,
  },
  datePickerButton: {
    flex: 1,
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  datePickerButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    flex: 1,
  },
  datePickerDoneButton: {
    alignSelf: 'center',
    marginTop: 8,
  },
});

