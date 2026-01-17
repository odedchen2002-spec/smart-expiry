# User Statistics View

## 📊 סקירה כללית

ה-view `user_statistics` מספק סטטיסטיקות מצטברות בזמן אמת על משתמשי האפליקציה ורמות המנוי שלהם.

**תאריך יצירה:** 17/01/2026  
**קובץ Migration:** `supabase/migrations/20260117000000_create_user_statistics_view.sql`

---

## 🎯 מה זה עושה?

ה-VIEW מסכם נתונים מטבלת `profiles` ומחזיר:

| שדה | תיאור | דוגמה |
|-----|-------|-------|
| `total_users` | סה"כ משתמשים באפליקציה | 1,250 |
| `free_users` | משתמשים חינמיים | 900 |
| `pro_users` | משתמשי Pro | 250 |
| `pro_plus_users` | משתמשי Pro+ | 80 |
| `basic_users` | משתמשי Basic | 20 |
| `active_paid_users` | משתמשים בתשלום פעילים (מנוי תקף) | 300 |
| `expired_paid_users` | משתמשים בתשלום שהמנוי שלהם פג | 50 |
| `auto_renew_users` | משתמשים עם חידוש אוטומטי | 280 |
| `new_users_last_7_days` | משתמשים חדשים ב-7 ימים אחרונים | 45 |
| `new_users_last_30_days` | משתמשים חדשים ב-30 ימים אחרונים | 180 |
| `calculated_at` | תאריך ושעה של החישוב | 2026-01-17 10:30:00 |

---

## 🚀 התקנה

### 1. הרצת Migration ב-Supabase

אפשרות א': דרך Supabase Dashboard:
1. פתח את ה-[Supabase Dashboard](https://app.supabase.com)
2. בחר את הפרויקט שלך
3. עבור ל-**SQL Editor**
4. העתק את התוכן מ-`supabase/migrations/20260117000000_create_user_statistics_view.sql`
5. הדבק והרץ את השאילתה

אפשרות ב': דרך Supabase CLI:
```bash
# אם יש לך Supabase CLI מותקן
supabase migration up
```

### 2. בדיקה שה-VIEW נוצר בהצלחה

```sql
-- הרץ שאילתה זו ב-SQL Editor
SELECT * FROM public.user_statistics;
```

אתה אמור לראות שורה אחת עם כל הסטטיסטיקות!

---

## 💻 שימוש בקוד

### דוגמה 1: Hook בסיסי

```typescript
import { useUserStatistics } from '@/lib/hooks/useUserStatistics';

function AdminDashboard() {
  const { data: stats, isLoading, error } = useUserStatistics();

  if (isLoading) return <div>טוען סטטיסטיקות...</div>;
  if (error) return <div>שגיאה: {error.message}</div>;

  return (
    <div>
      <h2>סטטיסטיקות משתמשים</h2>
      <div>
        <p>סה"כ משתמשים: {stats?.total_users}</p>
        <p>משתמשים חינמיים: {stats?.free_users}</p>
        <p>משתמשי Pro: {stats?.pro_users}</p>
        <p>משתמשי Pro+: {stats?.pro_plus_users}</p>
        <p>משתמשים פעילים בתשלום: {stats?.active_paid_users}</p>
      </div>
    </div>
  );
}
```

### דוגמה 2: עם Refetch אוטומטי

```typescript
import { useUserStatistics } from '@/lib/hooks/useUserStatistics';

function LiveStatsDashboard() {
  const { data: stats, isLoading } = useUserStatistics({
    refetchInterval: 30000, // רענון כל 30 שניות
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h2>סטטיסטיקות חיות</h2>
      <p>עודכן לאחרונה: {new Date(stats?.calculated_at || '').toLocaleString('he-IL')}</p>
      <div>
        <StatCard title="סה״כ משתמשים" value={stats?.total_users} />
        <StatCard title="Pro" value={stats?.pro_users} />
        <StatCard title="Pro+" value={stats?.pro_plus_users} />
        <StatCard title="חינמי" value={stats?.free_users} />
      </div>
    </div>
  );
}
```

### דוגמה 3: עם Conversion Rates

```typescript
import { useUserStatistics, calculateConversionRates } from '@/lib/hooks/useUserStatistics';

function AnalyticsDashboard() {
  const { data: stats } = useUserStatistics();
  const rates = calculateConversionRates(stats);

  return (
    <div>
      <h2>ניתוח המרות</h2>
      <div>
        <p>המרה מחינמי לתשלום: {rates.freeToPaid}%</p>
        <p>שימור משתמשים משלמים: {rates.paidRetention}%</p>
        <p>שיעור חידוש אוטומטי: {rates.autoRenewRate}%</p>
      </div>
      
      <h2>משתמשים חדשים</h2>
      <div>
        <p>7 ימים אחרונים: {stats?.new_users_last_7_days}</p>
        <p>30 ימים אחרונים: {stats?.new_users_last_30_days}</p>
      </div>
    </div>
  );
}
```

### דוגמה 4: שאילתה ישירה מ-Supabase

```typescript
import { supabase } from '@/lib/supabase/client';

async function getStatistics() {
  const { data, error } = await supabase
    .from('user_statistics')
    .select('*')
    .single();

  if (error) {
    console.error('Error fetching statistics:', error);
    return null;
  }

  return data;
}

// שימוש
const stats = await getStatistics();
console.log(`Total users: ${stats?.total_users}`);
```

---

## 🔒 אבטחה (RLS - Row Level Security)

**ברירת מחדל:** ה-VIEW **לא מוגן** ב-RLS, כלומר כל משתמש מחובר יכול לקרוא אותו.

### אם אתה רוצה להגביל רק לאדמינים:

#### אפשרות 1: הוספת עמודת `is_admin` ל-`profiles`

```sql
-- 1. הוסף עמודה לטבלת profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. סמן את עצמך כאדמין
UPDATE public.profiles
SET is_admin = TRUE
WHERE id = 'your-user-id-here';

-- 3. צור פונקציה שבודקת אם משתמש הוא אדמין
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- 4. צור policy על ה-VIEW (אופציונלי - VIEWs לא תמיד תומכים ב-RLS)
-- במקום, צור edge function שבודקת is_admin לפני שמחזירה נתונים
```

#### אפשרות 2: Edge Function עם הגנה

```typescript
// supabase/functions/get-user-statistics/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // בדיקת אימות
  const authHeader = req.headers.get('Authorization')!;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseClient.auth.getUser(token);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // בדיקה אם המשתמש הוא אדמין
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // קבלת סטטיסטיקות
  const { data: stats, error } = await supabaseClient
    .from('user_statistics')
    .select('*')
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(stats), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

---

## 🎨 רעיונות לתצוגה

### דוגמה: כרטיסי סטטיסטיקות

```typescript
import { useUserStatistics } from '@/lib/hooks/useUserStatistics';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from 'react-native-paper';

function StatisticsCards() {
  const { data: stats, isLoading } = useUserStatistics();

  if (isLoading) return <Text>טוען...</Text>;

  const cards = [
    {
      title: 'סה"כ משתמשים',
      value: stats?.total_users,
      icon: '👥',
      color: '#3B82F6',
    },
    {
      title: 'Pro',
      value: stats?.pro_users,
      icon: '📦',
      color: '#007AFF',
    },
    {
      title: 'Pro+',
      value: stats?.pro_plus_users,
      icon: '👑',
      color: '#6d28d9',
    },
    {
      title: 'חינמי',
      value: stats?.free_users,
      icon: '🆓',
      color: '#9CA3AF',
    },
    {
      title: 'פעילים בתשלום',
      value: stats?.active_paid_users,
      icon: '✅',
      color: '#10B981',
    },
    {
      title: 'משתמשים חדשים (7 ימים)',
      value: stats?.new_users_last_7_days,
      icon: '🆕',
      color: '#F59E0B',
    },
  ];

  return (
    <View style={styles.grid}>
      {cards.map((card, index) => (
        <Card key={index} style={[styles.card, { borderColor: card.color }]}>
          <Card.Content>
            <Text style={styles.icon}>{card.icon}</Text>
            <Text style={styles.value}>{card.value?.toLocaleString('he-IL')}</Text>
            <Text style={styles.title}>{card.title}</Text>
          </Card.Content>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    padding: 16,
  },
  card: {
    width: '48%',
    borderWidth: 2,
    borderRadius: 12,
  },
  icon: {
    fontSize: 32,
    textAlign: 'center',
    marginBottom: 8,
  },
  value: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    textAlign: 'center',
    color: '#6B7280',
  },
});
```

---

## 📊 שאילתות SQL שימושיות נוספות

### שאילתה 1: סטטיסטיקות לפי חודש

```sql
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) AS new_users,
  COUNT(*) FILTER (WHERE subscription_tier = 'free') AS free_users,
  COUNT(*) FILTER (WHERE subscription_tier IN ('pro', 'pro_plus')) AS paid_users
FROM public.profiles
WHERE created_at > NOW() - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;
```

### שאילתה 2: שיעור המרה לפי קוהורט

```sql
WITH cohorts AS (
  SELECT
    DATE_TRUNC('month', created_at) AS cohort_month,
    id,
    subscription_tier,
    created_at
  FROM public.profiles
)
SELECT
  cohort_month,
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE subscription_tier IN ('pro', 'pro_plus')) AS paid_users,
  ROUND(
    COUNT(*) FILTER (WHERE subscription_tier IN ('pro', 'pro_plus'))::NUMERIC / 
    COUNT(*)::NUMERIC * 100, 
    2
  ) AS conversion_rate
FROM cohorts
GROUP BY cohort_month
ORDER BY cohort_month DESC;
```

### שאילתה 3: Revenue Projection (הערכת הכנסות)

```sql
SELECT
  COUNT(*) FILTER (WHERE subscription_tier = 'pro' AND auto_renew = TRUE) AS pro_recurring,
  COUNT(*) FILTER (WHERE subscription_tier = 'pro_plus' AND auto_renew = TRUE) AS pro_plus_recurring,
  -- הנח שמחיר Pro = 29₪ ו-Pro+ = 59₪
  (COUNT(*) FILTER (WHERE subscription_tier = 'pro' AND auto_renew = TRUE) * 29) AS pro_mrr,
  (COUNT(*) FILTER (WHERE subscription_tier = 'pro_plus' AND auto_renew = TRUE) * 59) AS pro_plus_mrr,
  (COUNT(*) FILTER (WHERE subscription_tier = 'pro' AND auto_renew = TRUE) * 29) +
  (COUNT(*) FILTER (WHERE subscription_tier = 'pro_plus' AND auto_renew = TRUE) * 59) AS total_mrr
FROM public.profiles;
```

---

## ⚡ ביצועים

### VIEW רגיל:
- ✅ **מחושב בזמן אמת** - תמיד נתונים עדכניים
- ✅ **מהיר** למספר משתמשים עד ~50,000
- ⚠️ **עלול להיות איטי** למעלה מ-100,000 משתמשים

### אם השאילתה איטית:
1. **הוסף אינדקסים:**
```sql
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier 
ON public.profiles(subscription_tier);

CREATE INDEX IF NOT EXISTS idx_profiles_created_at 
ON public.profiles(created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_subscription_valid_until 
ON public.profiles(subscription_valid_until);
```

2. **עבור ל-MATERIALIZED VIEW** (ראה אפשרות 2 בדוקומנטציה המקורית)

---

## 🧪 בדיקות

### בדיקה 1: וודא שה-VIEW עובד
```sql
SELECT * FROM public.user_statistics;
```
**תוצאה מצופה:** שורה אחת עם כל השדות

### בדיקה 2: בדוק נתונים לוגיים
```sql
SELECT 
  total_users,
  free_users + pro_users + pro_plus_users + basic_users AS sum_by_tier,
  total_users = (free_users + pro_users + pro_plus_users + basic_users) AS matches
FROM public.user_statistics;
```
**תוצאה מצופה:** `matches` צריך להיות `true`

### בדיקה 3: בדוק מהקוד
```typescript
const { data } = await supabase.from('user_statistics').select('*').single();
console.log('Statistics:', data);
```

---

## 🔄 עדכונים עתידיים

אם תרצה להוסיף שדות נוספים בעתיד, פשוט ערוך את ה-VIEW:

```sql
CREATE OR REPLACE VIEW public.user_statistics AS
SELECT
  -- כל השדות הקיימים...
  COUNT(*) AS total_users,
  -- ... שאר השדות ...
  
  -- שדה חדש שתרצה להוסיף:
  COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL) AS users_with_stripe,
  
  NOW() AS calculated_at
FROM public.profiles;
```

---

## 📝 סיכום

✅ **יצרת VIEW** ששומר סטטיסטיקות בזמן אמת  
✅ **יצרת TypeScript Hook** לשימוש נוח בקוד  
✅ **נתונים תמיד עדכניים** - לא צריך רענון ידני  
✅ **פשוט לתחזוקה** - שאילתה SQL אחת  
✅ **גמיש** - קל להוסיף שדות חדשים  

**הצעד הבא:** הרץ את ה-migration ב-Supabase והתחל להשתמש ב-hook באפליקציה! 🚀
