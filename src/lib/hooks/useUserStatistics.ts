import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

/**
 * User statistics data structure
 */
export interface UserStatistics {
  total_users: number;
  free_users: number;
  pro_users: number;
  pro_plus_users: number;
  basic_users: number;
  active_paid_users: number;
  expired_paid_users: number;
  auto_renew_users: number;
  new_users_last_7_days: number;
  new_users_last_30_days: number;
  calculated_at: string;
}

/**
 * Hook to fetch real-time user statistics
 * 
 * @param options - Query options
 * @param options.refetchInterval - How often to refetch data in milliseconds (default: 60000 = 1 minute)
 * @param options.enabled - Whether to enable the query (default: true)
 * 
 * @returns TanStack Query result with user statistics
 * 
 * @example
 * ```tsx
 * function AdminDashboard() {
 *   const { data: stats, isLoading, error } = useUserStatistics({
 *     refetchInterval: 30000, // Refetch every 30 seconds
 *   });
 * 
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 * 
 *   return (
 *     <div>
 *       <h2>User Statistics</h2>
 *       <p>Total Users: {stats?.total_users}</p>
 *       <p>Free: {stats?.free_users}</p>
 *       <p>Pro: {stats?.pro_users}</p>
 *       <p>Pro+: {stats?.pro_plus_users}</p>
 *       <p>Active Paid: {stats?.active_paid_users}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUserStatistics(options?: {
  refetchInterval?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['user-statistics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_statistics')
        .select('*')
        .single();

      if (error) {
        console.error('[useUserStatistics] Error fetching statistics:', error);
        throw error;
      }

      return data as UserStatistics;
    },
    refetchInterval: options?.refetchInterval ?? 60000, // Default: refetch every 1 minute
    enabled: options?.enabled ?? true,
    staleTime: 30000, // Consider data stale after 30 seconds
  });
}

/**
 * Helper function to calculate conversion rates from statistics
 * 
 * @param stats - User statistics
 * @returns Calculated conversion rates as percentages
 * 
 * @example
 * ```tsx
 * const stats = useUserStatistics();
 * const rates = calculateConversionRates(stats.data);
 * console.log(`Free to Paid: ${rates.freeToPaid}%`);
 * ```
 */
export function calculateConversionRates(stats: UserStatistics | undefined) {
  if (!stats || stats.total_users === 0) {
    return {
      freeToPaid: 0,
      paidRetention: 0,
      autoRenewRate: 0,
    };
  }

  const paidUsers = stats.pro_users + stats.pro_plus_users + stats.basic_users;
  const totalPaidUsers = stats.active_paid_users + stats.expired_paid_users;

  return {
    // Percentage of users who converted from free to paid
    freeToPaid: totalPaidUsers > 0 ? ((totalPaidUsers / stats.total_users) * 100).toFixed(2) : '0',
    
    // Percentage of paid users who are still active (not expired)
    paidRetention: totalPaidUsers > 0 ? ((stats.active_paid_users / totalPaidUsers) * 100).toFixed(2) : '0',
    
    // Percentage of paid users with auto-renewal enabled
    autoRenewRate: paidUsers > 0 ? ((stats.auto_renew_users / paidUsers) * 100).toFixed(2) : '0',
  };
}
