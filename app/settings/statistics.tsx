/**
 * Statistics Screen
 * 
 * Shows statistics with tabs for "This Month" and "All Time":
 * - Handled vs Thrown ratio (visual)
 * - Top 3 thrown products (expandable to Top 10)
 * - Reset statistics button with confirmation
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState, useEffect } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { STALE_TIME, useStatisticsCache } from '@/lib/hooks/useStatisticsCache';
import {
  getThrownProductsList,
  resetStatistics,
  resetMonthStatistics,
  resetYearStatistics,
  StatisticsSummary,
  ThrownProductEvent,
  TopThrownProduct,
  TimeRange,
} from '@/lib/supabase/services/statisticsService';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Podium colors for rankings
const PODIUM_COLORS = {
  1: '#FFD700', // Gold
  2: '#C0C0C0', // Silver  
  3: '#CD7F32', // Bronze
};

type TabType = 'month' | 'year';

// Chart colors
const CHART_COLORS = {
  handled: '#22C55E', // Green
  thrown: '#F97316',  // Orange
};

// Visual ratio component - shows handled vs thrown as colored blocks
function RatioChart({ 
  handledCount, 
  thrownCount, 
  t, 
  isRTL 
}: { 
  handledCount: number; 
  thrownCount: number; 
  t: (key: string) => string;
  isRTL: boolean;
}) {
  const total = handledCount + thrownCount;
  
  if (total === 0) {
    return (
      <View style={styles.noDataContainer}>
        <MaterialCommunityIcons name="chart-donut" size={40} color="#D1D5DB" />
        <Text style={styles.noDataText}>{t('statistics.noData')}</Text>
      </View>
    );
  }

  const handledPercent = Math.round((handledCount / total) * 100);
  const thrownPercent = 100 - handledPercent;

  return (
    <View style={styles.ratioChartContainer}>
      {/* Stats Cards */}
      <View style={[styles.statsRow, isRTL && styles.statsRowRTL]}>
        {/* Handled Card */}
        <View style={[styles.statCard, styles.statCardHandled]}>
          <View style={styles.statIconContainer}>
            <MaterialCommunityIcons name="check-circle" size={28} color={CHART_COLORS.handled} />
          </View>
          <Text style={[styles.statPercent, { color: CHART_COLORS.handled }]}>{handledPercent}%</Text>
          <Text style={styles.statLabel}>{t('statistics.handled')}</Text>
          <Text style={styles.statCount}>{handledCount}</Text>
        </View>

        {/* Thrown Card */}
        <View style={[styles.statCard, styles.statCardThrown]}>
          <View style={styles.statIconContainer}>
            <MaterialCommunityIcons name="delete-circle" size={28} color={CHART_COLORS.thrown} />
          </View>
          <Text style={[styles.statPercent, { color: CHART_COLORS.thrown }]}>{thrownPercent}%</Text>
          <Text style={styles.statLabel}>{t('statistics.thrown')}</Text>
          <Text style={styles.statCount}>{thrownCount}</Text>
        </View>
      </View>

      {/* Visual Bar */}
      <View style={styles.ratioBarWrapper}>
        <View style={styles.ratioBar}>
          {handledCount > 0 && (
            <View style={[styles.ratioSegment, { flex: handledCount, backgroundColor: CHART_COLORS.handled }]} />
          )}
          {thrownCount > 0 && (
            <View style={[styles.ratioSegment, { flex: thrownCount, backgroundColor: CHART_COLORS.thrown }]} />
          )}
        </View>
      </View>

      {/* Total */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{t('statistics.ofTotal')}</Text>
        <Text style={styles.totalCount}>{total}</Text>
      </View>
    </View>
  );
}

// Podium-style product ranking
function ProductRanking({
  products,
  showAll,
  t,
  isRTL,
}: {
  products: TopThrownProduct[];
  showAll: boolean;
  t: (key: string) => string;
  isRTL: boolean;
}) {
  if (products.length === 0) {
    return (
      <View style={styles.noDataContainer}>
        <MaterialCommunityIcons name="trophy-outline" size={40} color="#D1D5DB" />
        <Text style={styles.noDataText}>{t('statistics.noThrownProducts')}</Text>
      </View>
    );
  }

  const displayProducts = showAll ? products : products.slice(0, 3);

  return (
    <View style={styles.rankingContainer}>
      {displayProducts.map((product) => (
        <View
          key={`${product.rank}-${product.productName}`}
          style={[styles.rankingItem, isRTL && styles.rankingItemRTL]}
        >
          {/* Rank badge */}
          <View
            style={[
              styles.rankBadge,
              { 
                backgroundColor: PODIUM_COLORS[product.rank as keyof typeof PODIUM_COLORS] || '#9CA3AF',
                opacity: product.rank <= 3 ? 1 : 0.7,
              },
            ]}
          >
            {product.rank <= 3 ? (
              <MaterialCommunityIcons
                name="trophy"
                size={16}
                color={product.rank === 1 ? '#92400E' : '#FFFFFF'}
              />
            ) : (
              <Text style={styles.rankNumber}>{product.rank}</Text>
            )}
          </View>

          {/* Product name */}
          <Text
            style={[
              styles.productName,
              isRTL && styles.productNameRTL,
              product.rank <= 3 && styles.productNameBold,
            ]}
            numberOfLines={1}
          >
            {product.productName}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Tab bar component
function TabBar({
  activeTab,
  onTabChange,
  t,
  isRTL,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  t: (key: string) => string;
  isRTL: boolean;
}) {
  return (
    <View style={[styles.tabBar, isRTL && styles.tabBarRTL]}>
      <TouchableOpacity
        style={[
          styles.tab,
          activeTab === 'month' && styles.tabActive,
        ]}
        onPress={() => onTabChange('month')}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name="calendar-month"
          size={18}
          color={activeTab === 'month' ? THEME_COLORS.primary : '#9CA3AF'}
        />
        <Text
          style={[
            styles.tabText,
            activeTab === 'month' && styles.tabTextActive,
          ]}
        >
          {t('statistics.thisMonth')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.tab,
          activeTab === 'year' && styles.tabActive,
        ]}
        onPress={() => onTabChange('year')}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name="calendar-clock"
          size={18}
          color={activeTab === 'year' ? THEME_COLORS.primary : '#9CA3AF'}
        />
        <Text
          style={[
            styles.tabText,
            activeTab === 'year' && styles.tabTextActive,
          ]}
        >
          {t('statistics.year')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Statistics content component
function StatisticsContent({
  summary,
  topProducts,
  isRTL,
  t,
  showExpanded,
  onToggleExpand,
  onShowThrownProducts,
}: {
  summary: StatisticsSummary;
  topProducts: TopThrownProduct[];
  isRTL: boolean;
  t: (key: string) => string;
  showExpanded: boolean;
  onToggleExpand: () => void;
  onShowThrownProducts: () => void;
}) {
  return (
    <View style={styles.tabContent}>
      {/* Block 1: Handled vs Thrown - Clickable to show thrown products */}
      <TouchableOpacity 
        style={styles.block}
        onPress={onShowThrownProducts}
        activeOpacity={0.8}
      >
        <View style={[styles.blockTitleRow, isRTL && styles.blockTitleRowRTL]}>
          <Text style={[styles.blockTitle, styles.blockTitleNoMargin, isRTL && styles.textRTL]}>
            {t('statistics.handledVsThrown')}
          </Text>
          <MaterialCommunityIcons
            name={isRTL ? 'chevron-left' : 'chevron-right'}
            size={20}
            color="#9CA3AF"
          />
        </View>
        <RatioChart
          handledCount={summary.handledCount}
          thrownCount={summary.thrownCount}
          t={t}
          isRTL={isRTL}
        />
      </TouchableOpacity>

      {/* Block 2: Top Thrown Products */}
      <View style={styles.block}>
        <Text style={[styles.blockTitle, isRTL && styles.textRTL]}>
          {t('statistics.topThrownProducts')}
        </Text>
        <ProductRanking
          products={topProducts}
          showAll={showExpanded}
          t={t}
          isRTL={isRTL}
        />

        {/* Show more/less button */}
        {topProducts.length > 3 && (
          <TouchableOpacity
            style={[styles.expandButton, isRTL && styles.expandButtonRTL]}
            onPress={onToggleExpand}
            activeOpacity={0.7}
          >
            <Text style={styles.expandButtonText}>
              {showExpanded ? t('statistics.showLess') : t('statistics.showMore')}
            </Text>
            <MaterialCommunityIcons
              name={showExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={THEME_COLORS.primary}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function StatisticsScreen() {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeOwnerId } = useActiveOwner();

  // Use cache-first data loading
  const { data, isLoading: isLoadingFromHook, refetch, clearCache, lastFetchTime } = useStatisticsCache({
    ownerId: activeOwnerId,
    autoFetch: !!activeOwnerId,
  });

  // Show loading state when:
  // 1. activeOwnerId is not yet available (user still loading)
  // 2. OR the hook says it's loading (no cache and fetching)
  const loading = !activeOwnerId || isLoadingFromHook;

  // Destructure data for easier access
  // Support both old cache (allTimeSummary) and new cache (yearSummary) for backwards compatibility
  const { 
    monthSummary, 
    yearSummary, 
    monthTopProducts, 
    yearTopProducts,
    // @ts-ignore - fallback for old cache
    allTimeSummary,
    // @ts-ignore - fallback for old cache
    allTimeTopProducts 
  } = data;
  
  // Use yearSummary if available, otherwise fall back to allTimeSummary (old cache)
  const actualYearSummary = yearSummary || allTimeSummary;
  const actualYearTopProducts = yearTopProducts || allTimeTopProducts || [];

  // UI State
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('month');
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [yearExpanded, setYearExpanded] = useState(false);
  const [showThrownModal, setShowThrownModal] = useState(false);
  const [thrownProducts, setThrownProducts] = useState<ThrownProductEvent[]>([]);

  // Clean up old cache format once (migration from allTimeSummary to yearSummary)
  useEffect(() => {
    // @ts-ignore
    if (data.allTimeSummary && !data.yearSummary) {
      console.log('[statistics] Detected old cache format, clearing and refetching...');
      clearCache().then(() => refetch());
    }
  }, []); // Only run once on mount

  // Refetch on focus if stale
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastFetchTime > STALE_TIME || lastFetchTime === 0) {
        refetch();
      }
    }, [lastFetchTime, refetch])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Reset statistics handler - resets based on active tab
  const handleResetStatistics = useCallback(() => {
    const isMonthTab = activeTab === 'month';
    const confirmTitle = isMonthTab 
      ? t('statistics.resetMonthConfirmTitle') 
      : t('statistics.resetYearConfirmTitle');
    const confirmMessage = isMonthTab 
      ? t('statistics.resetMonthConfirmMessage') 
      : t('statistics.resetYearConfirmMessage');
    const successMessage = isMonthTab 
      ? t('statistics.resetMonthSuccess') 
      : t('statistics.resetYearSuccess');

    Alert.alert(
      confirmTitle,
      confirmMessage,
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('statistics.resetConfirmButton'),
          style: 'destructive',
          onPress: async () => {
            if (!activeOwnerId) return;
            
            // Use appropriate reset function based on active tab
            const success = isMonthTab 
              ? await resetMonthStatistics(activeOwnerId)
              : await resetYearStatistics(activeOwnerId);
            
            if (success) {
              // Reset expanded states
              setMonthExpanded(false);
              setYearExpanded(false);
              
              // Clear cache and refetch (will show zeros)
              await clearCache();
              await refetch();
              
              Alert.alert(t('common.success'), successMessage);
            } else {
              Alert.alert(t('common.error'), t('statistics.resetError'));
            }
          },
        },
      ]
    );
  }, [activeOwnerId, activeTab, t, clearCache, refetch]);

  // Handler to show thrown products modal
  const handleShowThrownProducts = useCallback(async () => {
    if (!activeOwnerId) return;
    
    const timeRange: TimeRange = activeTab === 'month' ? 'month' : 'year';
    const products = await getThrownProductsList(activeOwnerId, timeRange);
    setThrownProducts(products);
    setShowThrownModal(true);
  }, [activeOwnerId, activeTab]);

  // Format date for display
  const formatDate = useCallback((isoDate: string) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString(isRTL ? 'he-IL' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, [isRTL]);

  // Get current tab data
  const currentSummary = activeTab === 'month' ? monthSummary : actualYearSummary;
  const currentTopProducts = activeTab === 'month' ? monthTopProducts : actualYearTopProducts;
  const currentExpanded = activeTab === 'month' ? monthExpanded : yearExpanded;
  const toggleExpand = () => {
    if (activeTab === 'month') {
      setMonthExpanded(!monthExpanded);
    } else {
      setYearExpanded(!yearExpanded);
    }
  };

  // Calculate current month date range for display (DD.MM.YYYY format)
  const getMonthDateRange = useCallback(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const formatDate = (date: Date) => {
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    };
    
    return `${formatDate(firstDay)} - ${formatDate(lastDay)}`;
  }, []);

  // Calculate current year date range for display (DD.MM.YYYY format)
  const getYearDateRange = useCallback(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), 0, 1); // January 1st
    const lastDay = new Date(now.getFullYear(), 11, 31); // December 31st
    
    const formatDate = (date: Date) => {
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    };
    
    return `${formatDate(firstDay)} - ${formatDate(lastDay)}`;
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={THEME_COLORS.primaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={isRTL ? 'chevron-right' : 'chevron-left'}
                size={28}
                color="#FFFFFF"
              />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('statistics.title')}</Text>
            <View style={styles.headerSpacer} />
          </View>
        </LinearGradient>
      </View>

      {/* Tab Bar */}
      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        t={t}
        isRTL={isRTL}
      />

      {/* Date Range Indicator for Month and Year tabs */}
      {(activeTab === 'month' || activeTab === 'year') && (
        <View style={styles.dateRangeContainer}>
          <MaterialCommunityIcons name="calendar-range" size={14} color="#9CA3AF" />
          <Text style={styles.dateRangeText}>
            {activeTab === 'month' ? getMonthDateRange() : getYearDateRange()}
          </Text>
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[THEME_COLORS.primary]}
            tintColor={THEME_COLORS.primary}
          />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>{t('common.loading')}</Text>
          </View>
        ) : (
          <>
            {/* Tab Content */}
            <StatisticsContent
              summary={currentSummary}
              topProducts={currentTopProducts}
              isRTL={isRTL}
              t={t}
              showExpanded={currentExpanded}
              onToggleExpand={toggleExpand}
              onShowThrownProducts={handleShowThrownProducts}
            />
          </>
        )}
      </ScrollView>

      {/* Reset Statistics Button - Fixed at bottom */}
      {!loading && (
        <TouchableOpacity
          style={[styles.resetButton, { paddingBottom: insets.bottom + 8 }]}
          onPress={handleResetStatistics}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="refresh" size={14} color="#9CA3AF" />
          <Text style={styles.resetButtonText}>{t('statistics.resetStatistics')}</Text>
        </TouchableOpacity>
      )}

      {/* Thrown Products Modal */}
      <Modal
        visible={showThrownModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowThrownModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, isRTL && styles.modalHeaderRTL]}>
              <Text style={[styles.modalTitle, isRTL && styles.textRTL]}>
                {t('statistics.thrownProductsList')}
              </Text>
              <TouchableOpacity
                onPress={() => setShowThrownModal(false)}
                style={styles.modalCloseButton}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Period indicator */}
            <View style={[styles.modalPeriodBadge, isRTL && styles.modalPeriodBadgeRTL]}>
              <MaterialCommunityIcons
                name={activeTab === 'month' ? 'calendar-month' : 'calendar-clock'}
                size={16}
                color={THEME_COLORS.primary}
              />
              <Text style={styles.modalPeriodText}>
                {activeTab === 'month' ? t('statistics.thisMonth') : t('statistics.year')}
              </Text>
            </View>

            {/* Product List */}
            {thrownProducts.length === 0 ? (
              <View style={styles.modalNoData}>
                <MaterialCommunityIcons name="delete-off-outline" size={48} color="#D1D5DB" />
                <Text style={styles.modalNoDataText}>{t('statistics.noThrownProducts')}</Text>
              </View>
            ) : (
              <FlatList
                data={thrownProducts}
                keyExtractor={(item, index) => `${item.productName}-${item.thrownAt}-${index}`}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalList}
                renderItem={({ item }) => (
                  <View style={[styles.modalItem, isRTL && styles.modalItemRTL]}>
                    <View style={styles.modalItemIcon}>
                      <MaterialCommunityIcons name="delete-outline" size={20} color="#F97316" />
                    </View>
                    <View style={styles.modalItemContent}>
                      <Text 
                        style={[styles.modalItemName, isRTL && styles.textRTL]} 
                        numberOfLines={1}
                      >
                        {item.productName}
                      </Text>
                      <Text style={[styles.modalItemDate, isRTL && styles.textRTL]}>
                        {item.thrownAt ? formatDate(item.thrownAt) : '-'}
                      </Text>
                    </View>
                  </View>
                )}
              />
            )}

            {/* Close Button */}
            <TouchableOpacity
              style={styles.modalCloseAction}
              onPress={() => setShowThrownModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseActionText}>{t('statistics.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  headerWrapper: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  header: {
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  headerSpacer: {
    width: 40,
  },

  // Tab bar styles
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  tabBarRTL: {
    flexDirection: 'row-reverse',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  tabActive: {
    backgroundColor: THEME_COLORS.primary + '15',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  tabTextActive: {
    color: THEME_COLORS.primary,
  },

  // Date range indicator
  dateRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#F8F9FA',
  },
  dateRangeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    writingDirection: 'ltr',
  },

  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },

  // Tab content
  tabContent: {
    gap: 12,
  },
  textRTL: {
    textAlign: 'right',
  },

  // Block styles
  block: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  blockTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  blockTitleRowRTL: {
    flexDirection: 'row-reverse',
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 14,
  },
  blockTitleNoMargin: {
    marginBottom: 0,
  },

  // No data
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  noDataText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },

  // Ratio chart styles
  ratioChartContainer: {
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statsRowRTL: {
    flexDirection: 'row-reverse',
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  statCardHandled: {
    backgroundColor: '#ECFDF5',
  },
  statCardThrown: {
    backgroundColor: '#FFF7ED',
  },
  statIconContainer: {
    marginBottom: 8,
  },
  statPercent: {
    fontSize: 32,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 4,
  },
  statCount: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  ratioBarWrapper: {
    paddingHorizontal: 4,
  },
  ratioBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  ratioSegment: {
    height: '100%',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  totalCount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
  },

  // Ranking styles
  rankingContainer: {
    gap: 10,
  },
  rankingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rankingItemRTL: {
    flexDirection: 'row-reverse',
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  productName: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
  },
  productNameRTL: {
    textAlign: 'right',
  },
  productNameBold: {
    fontWeight: '600',
  },

  // Expand button
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  expandButtonRTL: {
    flexDirection: 'row-reverse',
  },
  expandButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.primary,
  },

  // Reset button - small and subtle, fixed at bottom
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F8F9FA',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9CA3AF',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalHeaderRTL: {
    flexDirection: 'row-reverse',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalPeriodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: THEME_COLORS.primary + '15',
    borderRadius: 20,
    marginBottom: 16,
  },
  modalPeriodBadgeRTL: {
    flexDirection: 'row-reverse',
    alignSelf: 'flex-end',
  },
  modalPeriodText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME_COLORS.primary,
  },
  modalNoData: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  modalNoDataText: {
    fontSize: 15,
    color: '#9CA3AF',
    marginTop: 12,
  },
  modalList: {
    paddingBottom: 16,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalItemRTL: {
    flexDirection: 'row-reverse',
  },
  modalItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalItemContent: {
    flex: 1,
  },
  modalItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
  },
  modalItemDate: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  modalCloseAction: {
    backgroundColor: THEME_COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCloseActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
