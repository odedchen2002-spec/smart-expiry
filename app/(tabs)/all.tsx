import { CategoryCardList } from '@/components/items/CategoryCardList';
import { SearchBar } from '@/components/search/SearchBar';
import { TrialEndedDialog } from '@/components/subscription/TrialEndedDialog';
import { TrialReminderDialog } from '@/components/subscription/TrialReminderDialog';
import { Trial5DayReminderDialog } from '@/components/subscription/Trial5DayReminderDialog';
import { UpgradeBanner } from '@/components/subscription/UpgradeBanner';
import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { useItems } from '@/lib/hooks/useItems';
import { useNotificationBadge } from '@/lib/hooks/useNotificationBadge';
import { getRtlContainerStyles } from '@/lib/utils/rtlStyles';
import { filterItems } from '@/lib/utils/search';
import { differenceInDays, parseISO } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Button, Chip, IconButton, Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';


export default function AllScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;
  const { activeOwnerId, loading: ownerLoading } = useActiveOwner();
  const { hasNew, markSeen } = useNotificationBadge();
  const { items, loading, error, refetch } = useItems({
    scope: 'all',
    ownerId: activeOwnerId || undefined,
    autoFetch: !!activeOwnerId, // Only auto-fetch when owner is loaded
  });
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [daysFilter, setDaysFilter] = useState<number | null>(null); // null = all, number = days before expiry
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  
  // Temporary filter states (before applying)
  const [tempDaysFilter, setTempDaysFilter] = useState<number | null>(null);
  const [tempCategoryFilter, setTempCategoryFilter] = useState<string | null>(null);
  
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

  // Filter items based on search query, days, and category
  const filteredItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let filtered = items.filter((item) => item.status !== 'resolved');

    filtered = filterItems(filtered, searchQuery);

    // Apply days filter
    if (daysFilter !== null) {
      filtered = filtered.filter((item) => {
        try {
          if (!item.expiry_date) return false;

          const expiryDate = parseISO(item.expiry_date);
          if (isNaN(expiryDate.getTime())) return false;

          expiryDate.setHours(0, 0, 0, 0);
          const daysUntilExpiry = differenceInDays(expiryDate, today);
          return daysUntilExpiry >= 0 && daysUntilExpiry <= daysFilter;
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
  }, [items, searchQuery, daysFilter, categoryFilter]);
  
  // Initialize temp filters when dialog opens
  useEffect(() => {
    if (filterMenuVisible) {
      setTempDaysFilter(daysFilter);
      setTempCategoryFilter(categoryFilter);
    }
  }, [filterMenuVisible, daysFilter, categoryFilter]);
  
  // Apply filters
  const handleApplyFilters = () => {
    setDaysFilter(tempDaysFilter);
    setCategoryFilter(tempCategoryFilter);
    setFilterMenuVisible(false);
  };
  
  // Clear all filters
  const handleClearFilters = () => {
    setTempDaysFilter(null);
    setTempCategoryFilter(null);
    setDaysFilter(null);
    setCategoryFilter(null);
    setFilterMenuVisible(false);
  };
  
  // Check if any filters are active
  const hasActiveFilters = daysFilter !== null || categoryFilter !== null;

  // Only refetch on focus if data is stale (older than 30 seconds) or if explicitly needed
  // This prevents unnecessary refetches on every tab switch
  const lastFetchRef = useRef<number>(0);
  const STALE_TIME = 30000; // 30 seconds

  useFocusEffect(
    useCallback(() => {
      if (activeOwnerId) {
        const now = Date.now();
        // Only refetch if data is stale (older than 30 seconds) or never fetched
        if (now - lastFetchRef.current > STALE_TIME || lastFetchRef.current === 0) {
          refetch();
          lastFetchRef.current = Date.now();
        }
      }
    }, [activeOwnerId, refetch])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

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
              <IconButton
                icon="folder-cog-outline"
                size={19}
                onPress={() => router.push('/categories' as any)}
                iconColor="rgba(255, 255, 255, 0.72)"
                style={styles.headerIcon}
              />
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
              <Chip
                icon="close-circle"
                onPress={handleClearFilters}
                style={styles.clearFilterChip}
                mode="outlined"
                textStyle={{ fontSize: 12 }}
              >
                {t('common.clear')}
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

                    {/* CONTENT – date filter */}
                    <View style={styles.filterContentWrapper}>
                      <View style={styles.filterSectionHeader}>
                        <MaterialCommunityIcons name="calendar-range" size={18} color="#6B7280" style={styles.filterSectionIcon} />
                        <Text style={styles.filterSectionTitle}>
                          {t('filters.date')}
                        </Text>
                      </View>

                      <ScrollView
                        style={styles.filterChipsScroll}
                        contentContainerStyle={styles.filterChipsGrid}
                        showsVerticalScrollIndicator={false}
                      >
                        <TouchableOpacity
                          style={[
                            styles.filterChip,
                            tempDaysFilter === null && styles.filterChipSelected
                          ]}
                          onPress={() => setTempDaysFilter(null)}
                        >
                          <Text style={[
                            styles.filterChipText,
                            tempDaysFilter === null && styles.filterChipTextSelected
                          ]}>
                            {t('all.allDays')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.filterChip,
                            tempDaysFilter === 0 && styles.filterChipSelected
                          ]}
                          onPress={() => setTempDaysFilter(0)}
                        >
                          <Text style={[
                            styles.filterChipText,
                            tempDaysFilter === 0 && styles.filterChipTextSelected
                          ]}>
                            {t('all.today')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.filterChip,
                            tempDaysFilter === 1 && styles.filterChipSelected
                          ]}
                          onPress={() => setTempDaysFilter(1)}
                        >
                          <Text style={[
                            styles.filterChipText,
                            tempDaysFilter === 1 && styles.filterChipTextSelected
                          ]}>
                            1 {t('all.day')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.filterChip,
                            tempDaysFilter === 3 && styles.filterChipSelected
                          ]}
                          onPress={() => setTempDaysFilter(3)}
                        >
                          <Text style={[
                            styles.filterChipText,
                            tempDaysFilter === 3 && styles.filterChipTextSelected
                          ]}>
                            3 {t('all.days')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.filterChip,
                            tempDaysFilter === 7 && styles.filterChipSelected
                          ]}
                          onPress={() => setTempDaysFilter(7)}
                        >
                          <Text style={[
                            styles.filterChipText,
                            tempDaysFilter === 7 && styles.filterChipTextSelected
                          ]}>
                            7 {t('all.days')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.filterChip,
                            tempDaysFilter === 14 && styles.filterChipSelected
                          ]}
                          onPress={() => setTempDaysFilter(14)}
                        >
                          <Text style={[
                            styles.filterChipText,
                            tempDaysFilter === 14 && styles.filterChipTextSelected
                          ]}>
                            14 {t('all.days')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.filterChip,
                            tempDaysFilter === 30 && styles.filterChipSelected
                          ]}
                          onPress={() => setTempDaysFilter(30)}
                        >
                          <Text style={[
                            styles.filterChipText,
                            tempDaysFilter === 30 && styles.filterChipTextSelected
                          ]}>
                            30 {t('all.days')}
                          </Text>
                        </TouchableOpacity>
                      </ScrollView>
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

        <CategoryCardList
          items={filteredItems}
          loading={loading || ownerLoading}
          error={error}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          searchQuery={searchQuery}
          emptyMessage={t('screens.all.empty')}
          sortDirection="asc"
          showDaysRemaining={true}
        />
      </View>
      <Trial5DayReminderDialog />
      <TrialReminderDialog />
      <TrialEndedDialog />
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
});

