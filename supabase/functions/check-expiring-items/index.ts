/**
 * Check Expiring Items Edge Function
 *
 * This function runs via Supabase cron every minute to check for expiring items
 * and send Expo push notifications to users based on their notification settings.
 *
 * CRON: * * * * *  → calls this function every minute
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DateTime } from 'https://esm.sh/luxon@3.4.4';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';

interface UserPreferences {
  user_id: string;
  push_token: string | null;
  timezone: string | null;
  notification_time: string | null; // Format: 'HH:mm'
  notification_hour: number | null;
  notification_minute: number | null;
  notification_days_before: number | null;
  updated_at: string | null;
  expiry_notify_enabled: boolean | null; // Default true if not set
  expiry_last_notified_at: string | null;
  expiry_last_notified_settings_updated_at: string | null;
}

interface Item {
  id: string;
  owner_id: string;
  expiry_date: string;
  status: string;
  is_plan_locked?: boolean;
  product_id?: string | null;
  product_name?: string | null;
}

/**
 * Helper function to generate when text based on days until expiry
 */
function whenText(daysUntil: number): string {
  if (daysUntil <= 0) return 'היום';
  if (daysUntil === 1) return 'מחר';
  return `בעוד ${daysUntil} ימים`;
}

/**
 * Get current hour and minute in a specific timezone using Intl.DateTimeFormat
 */
function getCurrentTimeInTimezone(timezone: string): { hour: number; minute: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  
  return { hour, minute };
}

/**
 * Check if current time exactly matches target hour and minute in user's timezone
 */
function isExactTimeMatch(timezone: string, targetHour: number, targetMinute: number): boolean {
  if (targetHour === null || targetMinute === null) return false;
  if (isNaN(targetHour) || isNaN(targetMinute)) return false;
  
  const { hour: nowHour, minute: nowMinute } = getCurrentTimeInTimezone(timezone);
  
  return nowHour === targetHour && nowMinute === targetMinute;
}

/**
 * Get push tokens from user preferences (deduplicated)
 * push_token is already a single token, but we dedupe for safety
 */
function getPushTokensFromPreferences(userPref: UserPreferences): string[] {
  if (!userPref.push_token || userPref.push_token.trim() === '') {
    return [];
  }
  // Deduplicate using Set (even though it's a single token)
  const tokenSet = new Set<string>();
  tokenSet.add(userPref.push_token.trim());
  return Array.from(tokenSet);
}

/**
 * Mask push token for logging (show first 10 chars + "...")
 */
function maskToken(token: string): string {
  if (!token || token.length <= 10) return '***';
  return token.substring(0, 10) + '...';
}

/**
 * Send push notifications via Expo Push API
 */
async function sendPushNotifications(tokens: string[], title: string, body: string) {
  if (tokens.length === 0) {
    return { response: null, message: null };
  }

  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    priority: 'high',
    // Android: use 'default' channel (must match the channel created in the app)
    channelId: 'default',
    // iOS: configure how notification appears when app is in foreground
    _contentAvailable: true,
    data: {
      source: 'supabase-edge',
      type: 'expiry_notification',
    },
  }));

  const messageForLog = messages[0] ? {
    title: messages[0].title,
    body: messages[0].body,
    sound: messages[0].sound,
    data: messages[0].data,
  } : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (EXPO_ACCESS_TOKEN) {
    headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
  }

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    // Log full response on error
    console.error('[Push] Expo push failed:', {
      status: response.status,
      statusText: response.statusText,
      response: JSON.stringify(json),
      tokensCount: tokens.length,
      maskedTokens: tokens.map(maskToken),
    });
    throw new Error(`[Push] Expo push failed with status ${response.status}`);
  }

  // Log only status + receipt IDs on success
  const receiptIds = Array.isArray(json?.data) 
    ? json.data.map((r: any) => r.id).filter(Boolean)
    : [];
  
  if (Array.isArray(json?.data)) {
    const errors = json.data.filter((r: any) => r.status !== 'ok');
    if (errors.length > 0) {
      console.error('[Push] Expo reported push errors:', {
        errorsCount: errors.length,
        errors: errors.map((e: any) => ({
          id: e.id,
          status: e.status,
          message: e.message,
        })),
      });
    }
  }

  return { response: json, message: messageForLog };
}

/**
 * Get all owners a user is associated with (as owner or collaborator)
 * Since we now use user_preferences (per-user, not per-owner), we get owners from collaborations
 */
async function getUserOwners(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const owners = new Set<string>();

  // User is owner - add themselves
  owners.add(userId);

  // User is collaborator on these
  const { data: collaborations } = await supabase
    .from('collaborations')
    .select('owner_id')
    .eq('member_id', userId)
    .eq('status', 'active')
    .in('role', ['editor', 'viewer']);

  if (collaborations) {
    collaborations.forEach((row: any) => owners.add(row.owner_id));
  }

  return Array.from(owners);
}

/**
 * Get expiring items for an owner based on days_before setting
 */
async function getExpiringItemsForOwner(
  supabase: SupabaseClient,
  ownerId: string,
  daysBefore: number,
  timezone: string
): Promise<Item[]> {
  if (!daysBefore && daysBefore !== 0) {
    daysBefore = 1; // Default to 1 day before
  }
  const nowUtc = DateTime.utc();
  const localNow = nowUtc.setZone(timezone);
  const targetDay = localNow.plus({ days: daysBefore });
  
  // Use local date directly since expiry_date is stored as a simple date (YYYY-MM-DD)
  // without timezone info. Converting to UTC can span two calendar days due to timezone offset.
  const targetDateStr = targetDay.toFormat('yyyy-MM-dd');

  // Fetch items - use exact date match since expiry_date is stored as YYYY-MM-DD
  const { data: items, error } = await supabase
    .from('items')
    .select('id, owner_id, expiry_date, status, is_plan_locked, product_id')
    .eq('owner_id', ownerId)
    .eq('expiry_date', targetDateStr);

  if (error) {
    console.error(`[check-expiring-items] ownerId=${ownerId}, stage=fetchItems, error:`, {
      message: error.message,
      code: error.code,
    });
    return [];
  }

  // Fetch product names
  const productIds = [...new Set((items || []).map((item: any) => item.product_id).filter(Boolean))];
  let productsMap = new Map();
  
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('id, name')
      .in('id', productIds);
    
    if (products) {
      productsMap = new Map(products.map((p: any) => [p.id, p.name]));
    }
  }

  // Enrich and filter active items
  const activeItems = (items || [])
    .map((item: any) => ({
      ...item,
      product_name: item.product_id ? (productsMap.get(item.product_id) || null) : null,
    }))
    .filter((item: any) =>
      item.status !== 'resolved' &&
      item.status !== 'expired' &&
      item.is_plan_locked !== true
    ) as Item[];

  return activeItems;
}

/**
 * Process a single user for expiry notifications
 */
async function processUser(
  supabase: SupabaseClient,
  userPref: UserPreferences,
  forceSend: boolean,
  debug: boolean = false
): Promise<{ sent: boolean; itemsCount: number; error?: string }> {
  const userId = userPref.user_id;

  // Step 1: Check if notifications are enabled
  if (userPref.expiry_notify_enabled !== true) {
    return { sent: false, itemsCount: 0 };
  }

  // Step 2: Check if notification time is configured (hour + minute)
  if (userPref.notification_hour === null || userPref.notification_minute === null) {
    return { sent: false, itemsCount: 0 };
  }

  // Step 3: Get user's timezone
  const timezone = userPref.timezone || 'Asia/Jerusalem';
  
  // Step 4: Get current hour/minute in user's timezone using Intl.DateTimeFormat
  const { hour: nowHour, minute: nowMinute } = getCurrentTimeInTimezone(timezone);
  
  // Step 5: Check exact time match
  const targetHour = userPref.notification_hour;
  const targetMinute = userPref.notification_minute;
  const timeMatches = isExactTimeMatch(timezone, targetHour, targetMinute);
  
  // Format current time for logging
  const nowLocal = `${nowHour.toString().padStart(2, '0')}:${nowMinute.toString().padStart(2, '0')}`;
  
  // Debug log per user ONLY when debug=true OR when timeMatches=false (for troubleshooting)
  if (debug || !timeMatches) {
    console.log(
      `[check-expiring-items] userId=${userId}, timezone=${timezone}, ` +
      `nowLocal=${nowLocal}, targetHour=${targetHour}, targetMinute=${targetMinute}, timeMatches=${timeMatches}`
    );
  }
  
  if (!timeMatches && !forceSend) {
    return { sent: false, itemsCount: 0 };
  }

  // Step 6: Check if already sent today (using DateTime for date comparison)
  const nowUtc = DateTime.utc();
  const localNow = nowUtc.setZone(timezone);
  const todayKey = localNow.toFormat('yyyy-LL-dd');
  let sentToday = false;
  
  if (userPref.expiry_last_notified_at) {
    const lastLocal = DateTime.fromISO(userPref.expiry_last_notified_at).setZone(timezone);
    const lastKey = lastLocal.toFormat('yyyy-LL-dd');
    sentToday = lastKey === todayKey;
  }

  // Step 6: Check settings change logic
  // Use updated_at as settingsUpdatedAt
  const settingsUpdatedAt = userPref.updated_at
    ? DateTime.fromISO(userPref.updated_at)
    : null;
  const lastNotifiedAt = userPref.expiry_last_notified_at
    ? DateTime.fromISO(userPref.expiry_last_notified_at)
    : null;
  const lastNotifiedSettingsAt = userPref.expiry_last_notified_settings_updated_at
    ? DateTime.fromISO(userPref.expiry_last_notified_settings_updated_at)
    : null;

  const settingsChangedAfterLastSend = settingsUpdatedAt && lastNotifiedAt && settingsUpdatedAt > lastNotifiedAt;

  // Step 7: Determine if allowed to send
  // Allow if: NOT sent today OR (sent today AND settings changed after last send)
  const allowedToSend = !sentToday || (sentToday && settingsChangedAfterLastSend);

  if (!allowedToSend && !forceSend) {
    console.log(
      `[check-expiring-items] userId=${userId}, timeMatches=${timeMatches}, sentToday=${sentToday}, ` +
      `settingsChangedAfterLastSend=${settingsChangedAfterLastSend}, allowedToSend=false`
    );
    return { sent: false, itemsCount: 0 };
  }

  // Step 8: Get all owners for this user
  const ownerIds = await getUserOwners(supabase, userId);
  if (ownerIds.length === 0) {
    return { sent: false, itemsCount: 0 };
  }

  // Step 9: Get expiring items from all owners
  // Use notification_days_before from user_preferences
  const daysBefore = userPref.notification_days_before ?? 1; // Default to 1 day before
  
  const allItems: Item[] = [];
  
  for (const ownerId of ownerIds) {
    const items = await getExpiringItemsForOwner(supabase, ownerId, daysBefore, timezone);
    allItems.push(...items);
  }

  if (allItems.length === 0) {
    return { sent: false, itemsCount: 0 };
  }

  // Step 10: Compute daysUntil and build notification message
  const todayUtc = localNow.startOf('day').toUTC();
  const itemsWithDaysUntil = allItems.map((item) => {
    const expiryDate = DateTime.fromISO(item.expiry_date, { zone: 'utc' }).startOf('day');
    const daysUntil = Math.floor(expiryDate.diff(todayUtc, 'days').days);
    return { ...item, daysUntil };
  });

  const minDaysUntil = Math.min(...itemsWithDaysUntil.map(item => item.daysUntil));
  const itemsInEarliestBucket = itemsWithDaysUntil.filter(item => item.daysUntil === minDaysUntil);
  const N = itemsInEarliestBucket.length;

  // Build notification body
  const whenTextValue = whenText(minDaysUntil);
  let notificationBody: string;
  
  if (N === 1) {
    const productName = itemsInEarliestBucket[0].product_name || 'מוצר';
    notificationBody = `${productName} יפוג ${whenTextValue}`;
  } else {
    notificationBody = `ל-${N} מוצרים יפוג התוקף ${whenTextValue}`;
  }

  const notificationTitle = 'התראת תפוגה ⚠️';

  // Step 11: Get tokens from user_preferences and send
  const userTokens = getPushTokensFromPreferences(userPref);
  if (userTokens.length === 0) {
    if (debug) {
      console.log(`[check-expiring-items] userId=${userId}, stage=noTokens, itemsCount=${allItems.length}`);
    }
    return { sent: false, itemsCount: allItems.length };
  }

  try {
    const pushResult = await sendPushNotifications(userTokens, notificationTitle, notificationBody);

    // Step 12: Update user_preferences table
    const nowUtcIso = nowUtc.toISO();
    const { error: updateError } = await supabase
      .from('user_preferences')
      .update({
        expiry_last_notified_at: nowUtcIso,
        expiry_last_notified_settings_updated_at: userPref.updated_at,
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error(`[check-expiring-items] userId=${userId}, stage=updatePreferences, error:`, {
        message: updateError.message,
        code: updateError.code,
      });
    }

    // Step 13: Log to notification_sent_log
    const sentDate = nowUtc.toFormat('yyyy-MM-dd');
    const notificationTime = nowUtc.toFormat('HH:mm:ss');
    
    // Use first owner for logging (or aggregate)
    const primaryOwnerId = ownerIds[0];
    
    const expoPushTicket = pushResult.message || {
      title: notificationTitle,
      body: notificationBody,
      sound: 'default',
      data: {
        source: 'supabase-edge',
        type: 'expiry_notification',
      },
    };

    await supabase.from('notification_sent_log').insert({
      user_id: userId,
      owner_id: primaryOwnerId,
      business_id: primaryOwnerId, // backward compatibility
      sent_date: sentDate,
      notification_time: notificationTime,
      items_count: allItems.length,
      target_expiry_date: sentDate,
      days_before: userPref.notification_days_before ?? 1,
      status: 'sent',
      expo_push_ticket: expoPushTicket,
    });

    return { sent: true, itemsCount: allItems.length };
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error';
    console.error(`[check-expiring-items] userId=${userId}, stage=sendNotification, error:`, {
      message: errorMsg,
      itemsCount: allItems.length,
    });
    return { sent: false, itemsCount: allItems.length, error: errorMsg };
  }
}

serve(async (_req) => {
  const startTime = Date.now();
  const invokedAt = new Date().toISOString();

  let forceSend = false;
  let isCron = false;
  let debug = false;
  
  // Check for cron header
  const cronHeader = _req.headers.get('x-cron');
  if (cronHeader) {
    isCron = true;
  }

  // Parse request body
  try {
    const body = await _req.json().catch(() => null);
    if (body && typeof body === 'object') {
      if (body.forceSend === true) {
        forceSend = true;
      }
      if (body.source === 'cron') {
        isCron = true;
      }
      if (body.debug === true) {
        debug = true;
      }
    }
  } catch (error) {
    // Silent fail on body parse
  }

  try {
    // Create admin Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[check-expiring-items] Missing environment variables:', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
      });
      return new Response(
        JSON.stringify({
          ok: false,
          invokedAt,
          forceSend,
          error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'X-Client-Info': 'check-expiring-items' } },
    });

    // Get all users with notification settings from user_preferences
    const selectCols = 'user_id, push_token, timezone, notification_time, notification_hour, notification_minute, notification_days_before, updated_at, expiry_notify_enabled, expiry_last_notified_at, expiry_last_notified_settings_updated_at';
    
    const { data: allUserPrefs, error: usersError } = await supabase
      .from('user_preferences')
      .select(selectCols);

    if (usersError) {
      const errorDetails = {
        message: usersError.message,
        details: (usersError as any).details,
        hint: (usersError as any).hint,
        code: (usersError as any).code,
        selectCols,
      };
      
      console.error('[check-expiring-items] stage=fetchUsers, error:', {
        message: usersError.message,
        code: (usersError as any).code,
        details: (usersError as any).details,
      });
      
      // Check if error is about missing columns
      const errorMsg = usersError.message || '';
      const isColumnError = errorMsg.includes('column') || errorMsg.includes('does not exist') || (usersError as any).code === '42703';
      
      if (isColumnError) {
        return new Response(
          JSON.stringify({
            ok: false,
            step: 'fetch_users',
            error: 'Missing columns in user_preferences table',
            missingColumns: [
              'user_id',
              'push_token',
              'timezone',
              'notification_time',
              'notification_hour',
              'notification_minute',
              'notification_days_before',
              'updated_at',
              'expiry_notify_enabled',
              'expiry_last_notified_at',
              'expiry_last_notified_settings_updated_at',
            ],
            errorDetails,
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({
          ok: false,
          invokedAt,
          forceSend,
          step: 'fetch_users',
          error: 'Failed to fetch users',
          errorDetails,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Filter users: has push_token AND (has notification_time OR has notification_hour+minute) AND enabled
    const totalUsers = (allUserPrefs || []).length;
    const users = (allUserPrefs || []).filter((p: any) => 
      p.push_token && 
      p.push_token.trim() !== '' &&
      ((p.notification_time && p.notification_time.trim() !== '') || 
       (p.notification_hour !== null && p.notification_minute !== null)) &&
      p.expiry_notify_enabled !== false // Default true
    ) as UserPreferences[];

    const eligibleUsers = users.length;

    if (eligibleUsers === 0) {
      return new Response(
        JSON.stringify({ 
          ok: true,
          invokedAt,
          isCron,
          forceSend,
          totalUsers,
          eligibleUsers: 0,
          sent: 0,
          skipped: 0,
          errorsCount: 0,
          durationMs: Date.now() - startTime,
          message: 'No users with notification settings',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Process each user
    for (const userPref of users as UserPreferences[]) {
      try {
        const result = await processUser(supabase, userPref, forceSend, debug);
        results.processed += 1;
        if (result.sent) {
          results.sent += 1;
        } else {
          results.skipped += 1;
        }
        if (result.error) {
          results.errors.push(`${userPref.user_id}: ${result.error}`);
        }
      } catch (err: any) {
        console.error(`[check-expiring-items] userId=${userPref.user_id}, stage=processUser, error:`, {
          message: err?.message || 'Unknown error',
        });
        results.errors.push(`${userPref.user_id}: ${err?.message || 'Unknown error'}`);
      }
    }

    // Always log summary line
    const durationMs = Date.now() - startTime;
    const errorsCount = results.errors.length;
    console.log(
      `[check-expiring-items] summary: invokedAt=${invokedAt}, isCron=${isCron}, forceSend=${forceSend}, ` +
      `totalUsers=${totalUsers}, eligibleUsers=${eligibleUsers}, sent=${results.sent}, ` +
      `skipped=${results.skipped}, errorsCount=${errorsCount}, durationMs=${durationMs}`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        invokedAt,
        isCron,
        forceSend,
        totalUsers,
        eligibleUsers,
        sent: results.sent,
        skipped: results.skipped,
        errorsCount,
        durationMs,
        errors: errorsCount > 0 ? results.errors : undefined,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error('[check-expiring-items] stage=fatal, error:', {
      message: err?.message || 'Unknown error',
      durationMs,
    });
    return new Response(
      JSON.stringify({ 
        ok: false,
        invokedAt: new Date().toISOString(),
        forceSend: false,
        error: 'Fatal error', 
        details: err?.message 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
