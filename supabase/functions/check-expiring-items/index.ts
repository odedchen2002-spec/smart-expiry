/**
 * Check Expiring Items Edge Function
 *
 * This function runs via Supabase cron every 15 minutes to check for expiring items
 * and send Expo push notifications to users based on their notification settings.
 *
 * WATERMARK MODEL:
 * - Reads last_successful_run_at from cron_job_state at start
 * - Sends notifications for users whose target time falls within [watermark, now]
 * - Updates watermark only on successful completion (no partial updates)
 * - This ensures no notifications are missed even if cron jobs are delayed/skipped
 *
 * CRON SCHEDULE: Every 15 minutes (0,15,30,45 of each hour)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DateTime } from 'https://esm.sh/luxon@3.4.4';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';
const JOB_NAME = 'check-expiring-items';
const LOCK_TIMEOUT_MINUTES = 5; // Auto-release stale locks after 5 minutes

/**
 * Get the watermark (last successful run time) for this job
 */
async function getWatermark(supabase: SupabaseClient): Promise<DateTime> {
  const { data, error } = await supabase
    .from('cron_job_state')
    .select('last_successful_run_at')
    .eq('job_name', JOB_NAME)
    .single();

  if (error || !data) {
    // If no watermark exists, default to 15 minutes ago (safe fallback)
    console.warn('[check-expiring-items] No watermark found, using 15 min ago as default');
    return DateTime.utc().minus({ minutes: 15 });
  }

  return DateTime.fromISO(data.last_successful_run_at, { zone: 'utc' });
}

/**
 * Update the watermark to current time (only call on successful completion)
 */
async function updateWatermark(supabase: SupabaseClient, newTime: DateTime): Promise<boolean> {
  const { error } = await supabase
    .from('cron_job_state')
    .upsert({
      job_name: JOB_NAME,
      last_successful_run_at: newTime.toISO(),
      updated_at: newTime.toISO(),
    }, {
      onConflict: 'job_name',
    });

  if (error) {
    console.error('[check-expiring-items] Failed to update watermark:', error.message);
    return false;
  }
  return true;
}

/**
 * Try to acquire an exclusive lock for this job.
 * Returns runId if lock acquired, null if another run is active.
 * Lock auto-expires after LOCK_TIMEOUT_MINUTES (fail-safe for crashes).
 */
async function tryAcquireLock(supabase: SupabaseClient): Promise<string | null> {
  const runId = crypto.randomUUID();

  // Use RPC function to acquire lock (bypasses PostgREST schema cache)
  const { data, error } = await supabase.rpc('try_acquire_cron_lock', {
    p_job_name: JOB_NAME,
    p_run_id: runId,
    p_lock_timeout_minutes: LOCK_TIMEOUT_MINUTES,
  });

  if (error) {
    console.error('[check-expiring-items] Error acquiring lock:', error.message);
    return null;
  }

  if (!data) {
    // Lock is held by another active run
    return null;
  }

  return runId;
}

/**
 * Release the lock (only if we still hold it).
 * Safe to call even if lock was already released or taken by another run.
 */
async function releaseLock(supabase: SupabaseClient, runId: string): Promise<void> {
  // Use RPC function to release lock (bypasses PostgREST schema cache)
  const { error } = await supabase.rpc('release_cron_lock', {
    p_job_name: JOB_NAME,
    p_run_id: runId,
  });

  if (error) {
    console.warn('[check-expiring-items] Failed to release lock:', error.message);
  }
}

/**
 * Check if a user's target notification time (HH:MM in their timezone) 
 * falls within the watermark window [watermarkUtc, nowUtc].
 * 
 * This handles the case where the target time "occurred" between the last run and now.
 */
function isTargetTimeInWatermarkWindow(
  timezone: string,
  targetHour: number,
  targetMinute: number,
  watermarkUtc: DateTime,
  nowUtc: DateTime
): boolean {
  if (targetHour === null || targetMinute === null) return false;
  if (isNaN(targetHour) || isNaN(targetMinute)) return false;

  // Convert watermark and now to user's local timezone
  const watermarkLocal = watermarkUtc.setZone(timezone);
  const nowLocal = nowUtc.setZone(timezone);

  // Get the target time as a DateTime in user's timezone for TODAY
  const todayTarget = nowLocal.set({ hour: targetHour, minute: targetMinute, second: 0, millisecond: 0 });

  // Also check yesterday's target (in case watermark spans midnight)
  const yesterdayTarget = todayTarget.minus({ days: 1 });

  // Check if today's target falls within [watermarkLocal, nowLocal]
  if (todayTarget >= watermarkLocal && todayTarget <= nowLocal) {
    return true;
  }

  // Check if yesterday's target falls within [watermarkLocal, nowLocal]
  // This handles cases like: watermark=23:50, now=00:05, target=23:55
  if (yesterdayTarget >= watermarkLocal && yesterdayTarget <= nowLocal) {
    return true;
  }

  return false;
}

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
  preferred_language: string | null; // 'he' or 'en', default 'he'
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
function whenText(daysUntil: number, language: string = 'he'): string {
  if (language === 'en') {
    if (daysUntil <= 0) return 'today';
    if (daysUntil === 1) return 'tomorrow';
    return `in ${daysUntil} days`;
  }
  // Hebrew (default)
  if (daysUntil <= 0) return 'היום';
  if (daysUntil === 1) return 'מחר';
  return `בעוד ${daysUntil} ימים`;
}

/**
 * Build notification title and body based on language
 */
function buildNotificationMessage(
  itemsCount: number,
  productName: string | null,
  daysUntil: number,
  language: string = 'he'
): { title: string; body: string } {
  const whenTextValue = whenText(daysUntil, language);

  if (language === 'en') {
    const title = 'Expiry Alert ⚠️';
    const body = itemsCount === 1
      ? `${productName || 'Product'} expires ${whenTextValue}`
      : `${itemsCount} products expire ${whenTextValue}`;
    return { title, body };
  }

  // Hebrew (default)
  const title = 'התראת תפוגה ⚠️';
  const body = itemsCount === 1
    ? `${productName || 'מוצר'} יפוג ${whenTextValue}`
    : `ל-${itemsCount} מוצרים יפוג התוקף ${whenTextValue}`;
  return { title, body };
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
  
  // CRITICAL: Use start of day to calculate target date
  // This ensures consistent date calculation regardless of time of day
  // If notification runs at 01:30, we still want "today" to mean the current calendar day
  const todayStart = localNow.startOf('day');
  const targetDay = todayStart.plus({ days: daysBefore });

  // Use local date directly since expiry_date is stored as a simple date (YYYY-MM-DD)
  // without timezone info. Converting to UTC can span two calendar days due to timezone offset.
  const targetDateStr = targetDay.toFormat('yyyy-MM-dd');

  // Fetch items - use exact date match since expiry_date is stored as YYYY-MM-DD
  // CRITICAL: Fetch in chunks to handle >1000 items (Supabase limit)
  const CHUNK_SIZE = 1000;
  let allItems: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: chunk, error } = await supabase
      .from('items')
      .select('id, owner_id, expiry_date, status, is_plan_locked, product_id')
      .eq('owner_id', ownerId)
      .eq('expiry_date', targetDateStr)
      .neq('status', 'resolved') // Exclude sold/thrown/finished items
      .range(offset, offset + CHUNK_SIZE - 1);

    if (error) {
      console.error(`[check-expiring-items] ownerId=${ownerId}, stage=fetchItems, error:`, {
        message: error.message,
        code: error.code,
      });
      return [];
    }

    if (!chunk || chunk.length === 0) {
      break;
    }

    allItems = allItems.concat(chunk);

    if (chunk.length < CHUNK_SIZE) {
      hasMore = false;
    } else {
      offset += CHUNK_SIZE;
    }
  }

  const items = allItems;

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
      item.status !== 'resolved' &&  // Already filtered in DB query, but keep for safety
      item.is_plan_locked !== true    // Only show unlocked items (user can act on them)
    ) as Item[];

  return activeItems;
}

/**
 * Process a single user for expiry notifications
 * Uses watermark window to determine if notification should be sent
 */
async function processUser(
  supabase: SupabaseClient,
  userPref: UserPreferences,
  watermarkUtc: DateTime,
  nowUtc: DateTime,
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

  // Step 4: Get current hour/minute in user's timezone for logging
  const { hour: nowHour, minute: nowMinute } = getCurrentTimeInTimezone(timezone);

  // Step 5: Check if target time falls within watermark window [watermarkUtc, nowUtc]
  const targetHour = userPref.notification_hour;
  const targetMinute = userPref.notification_minute;
  const timeMatches = isTargetTimeInWatermarkWindow(timezone, targetHour, targetMinute, watermarkUtc, nowUtc);

  // Format current time for logging
  const nowLocal = `${nowHour.toString().padStart(2, '0')}:${nowMinute.toString().padStart(2, '0')}`;
  const watermarkLocal = watermarkUtc.setZone(timezone).toFormat('HH:mm');

  // Debug log per user ONLY when debug=true OR when timeMatches=false (for troubleshooting)
  if (debug || !timeMatches) {
    console.log(
      `[check-expiring-items] userId=${userId}, timezone=${timezone}, ` +
      `watermarkLocal=${watermarkLocal}, nowLocal=${nowLocal}, ` +
      `targetHour=${targetHour}, targetMinute=${targetMinute}, timeMatches=${timeMatches}`
    );
  }

  if (!timeMatches && !forceSend) {
    return { sent: false, itemsCount: 0 };
  }

  // Step 6: Check if already sent today (using DateTime for date comparison)
  // Use the nowUtc passed as parameter for consistency
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

  // Step 8: Get items ONLY for the user's own products (not collaborations)
  // Users should only receive notifications for their own items, not for items
  // they collaborate on (which belong to other owners)
  const daysBefore = userPref.notification_days_before ?? 1; // Default to 1 day before

  // Step 9: Get expiring items only for this user (as owner)
  const allItems = await getExpiringItemsForOwner(supabase, userId, daysBefore, timezone);

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

  // Get user's preferred language (default to Hebrew)
  const userLanguage = userPref.preferred_language || 'he';

  // Build notification message in user's language
  const productName = N === 1 ? itemsInEarliestBucket[0].product_name : null;
  const { title: notificationTitle, body: notificationBody } = buildNotificationMessage(
    N,
    productName,
    minDaysUntil,
    userLanguage
  );

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

    // Use user's own ID as owner_id (notifications are only for user's own items)
    const primaryOwnerId = userId;

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

  // ========== STEP 1: Try to acquire exclusive lock ==========
  const runId = await tryAcquireLock(supabase);

  if (!runId) {
    // Another run is active - skip gracefully
    const durationMs = Date.now() - startTime;
    console.log('[check-expiring-items] Skipped: another run is active (lock held)');
    return new Response(
      JSON.stringify({
        ok: true,
        skippedDueToLock: true,
        invokedAt,
        isCron,
        forceSend,
        message: 'Skipped due to active lock - another run in progress',
        durationMs,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[check-expiring-items] Lock acquired: runId=${runId}`);

  // ========== MAIN LOGIC (wrapped in try/finally to always release lock) ==========
  try {
    // Step 2: Get watermark (last successful run time)
    const watermarkUtc = await getWatermark(supabase);
    const nowUtc = DateTime.utc();

    console.log(
      `[check-expiring-items] Watermark window: ${watermarkUtc.toISO()} → ${nowUtc.toISO()} ` +
      `(${Math.round(nowUtc.diff(watermarkUtc, 'minutes').minutes)} minutes)`
    );

    // Get all users with notification settings from user_preferences
    const selectCols = 'user_id, push_token, timezone, notification_time, notification_hour, notification_minute, notification_days_before, updated_at, expiry_notify_enabled, expiry_last_notified_at, expiry_last_notified_settings_updated_at, preferred_language';

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
            runId,
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
          runId,
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
          runId,
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

    // Process each user with watermark window
    for (const userPref of users as UserPreferences[]) {
      try {
        const result = await processUser(supabase, userPref, watermarkUtc, nowUtc, forceSend, debug);
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

    // Update watermark only if run was successful (no fatal errors)
    // We update even if some users had errors, as long as we processed everyone
    let watermarkUpdated = false;
    if (results.processed === eligibleUsers) {
      watermarkUpdated = await updateWatermark(supabase, nowUtc);
      if (watermarkUpdated) {
        console.log(`[check-expiring-items] Watermark updated to ${nowUtc.toISO()}`);
      }
    } else {
      console.warn(
        `[check-expiring-items] Watermark NOT updated: processed=${results.processed}, expected=${eligibleUsers}`
      );
    }

    console.log(
      `[check-expiring-items] summary: runId=${runId}, invokedAt=${invokedAt}, isCron=${isCron}, forceSend=${forceSend}, ` +
      `totalUsers=${totalUsers}, eligibleUsers=${eligibleUsers}, sent=${results.sent}, ` +
      `skipped=${results.skipped}, errorsCount=${errorsCount}, durationMs=${durationMs}, ` +
      `watermarkUpdated=${watermarkUpdated}`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        invokedAt,
        isCron,
        forceSend,
        runId,
        totalUsers,
        eligibleUsers,
        sent: results.sent,
        skipped: results.skipped,
        errorsCount,
        durationMs,
        watermarkUpdated,
        watermarkWindow: {
          from: watermarkUtc.toISO(),
          to: nowUtc.toISO(),
          minutes: Math.round(nowUtc.diff(watermarkUtc, 'minutes').minutes),
        },
        errors: errorsCount > 0 ? results.errors : undefined,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error('[check-expiring-items] stage=fatal, error:', {
      runId,
      message: err?.message || 'Unknown error',
      durationMs,
    });
    return new Response(
      JSON.stringify({
        ok: false,
        invokedAt,
        forceSend,
        runId,
        error: 'Fatal error',
        details: err?.message,
        durationMs,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  } finally {
    // ========== ALWAYS release lock (even on error/exception) ==========
    await releaseLock(supabase, runId);
    console.log(`[check-expiring-items] Lock released: runId=${runId}`);
  }
});
