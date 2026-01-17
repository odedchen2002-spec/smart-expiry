# התקנת מערכת סטטיסטיקות משתמשים 📊

## שלבי התקנה מהירים

### שלב 1: הרצת Migration ב-Supabase

1. פתח את [Supabase Dashboard](https://app.supabase.com)
2. עבור ל-**SQL Editor**
3. העתק והדבק את התוכן מהקובץ:
   ```
   supabase/migrations/20260117000000_create_user_statistics_view.sql
   ```
4. הרץ את השאילתה (לחץ **RUN**)

### שלב 2: בדיקה שזה עובד

הרץ ב-SQL Editor:
```sql
SELECT * FROM public.user_statistics;
```

אתה אמור לראות משהו כזה:
```
total_users: 150
free_users: 100
pro_users: 30
pro_plus_users: 20
active_paid_users: 45
...
```

### שלב 3: שימוש בקוד

```typescript
import { useUserStatistics } from '@/lib/hooks/useUserStatistics';

function MyComponent() {
  const { data: stats, isLoading } = useUserStatistics();
  
  return (
    <div>
      <h2>סה"כ משתמשים: {stats?.total_users}</h2>
      <p>Pro: {stats?.pro_users}</p>
      <p>Pro+: {stats?.pro_plus_users}</p>
    </div>
  );
}
```

### שלב 4 (אופציונלי): הוספת מסך Admin

אם תרצה מסך admin מוכן, השתמש בקומפוננטה:
```
app/(admin)/user-statistics.tsx
```

---

## קבצים שנוצרו

✅ **Migration:**  
`supabase/migrations/20260117000000_create_user_statistics_view.sql`

✅ **TypeScript Hook:**  
`src/lib/hooks/useUserStatistics.ts`

✅ **קומפוננטת דוגמה:**  
`app/(admin)/user-statistics.tsx`

✅ **דוקומנטציה מלאה:**  
`docs/USER_STATISTICS_VIEW.md`

---

## שאילתות שימושיות

### סטטיסטיקות בסיסיות
```sql
SELECT * FROM public.user_statistics;
```

### סטטיסטיקות לפי חודש
```sql
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) AS new_users,
  COUNT(*) FILTER (WHERE subscription_tier IN ('pro', 'pro_plus')) AS paid_users
FROM public.profiles
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC
LIMIT 12;
```

### שיעור המרה
```sql
SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE subscription_tier IN ('pro', 'pro_plus')) AS paid_users,
  ROUND(
    COUNT(*) FILTER (WHERE subscription_tier IN ('pro', 'pro_plus'))::NUMERIC / 
    COUNT(*)::NUMERIC * 100, 
    2
  ) AS conversion_rate_percent
FROM public.profiles;
```

---

## תמיכה

📖 **דוקומנטציה מלאה:** `docs/USER_STATISTICS_VIEW.md`  
🔧 **בעיות?** בדוק את ה-SQL Editor ל-errors  
💡 **שאלות?** ראה דוגמאות בקומפוננטה `app/(admin)/user-statistics.tsx`

---

**תאריך יצירה:** 17/01/2026  
**גרסה:** 1.0.0  
**סטטוס:** ✅ מוכן לשימוש
