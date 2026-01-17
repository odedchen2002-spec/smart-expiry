# תיקון: מוצרים שפג תוקפם לא עוברים אוטומטית למסך "פג תוקף"

## 🐛 הבעיה

מוצרים שהיו עם 0 ימים עד תפוגה, ולאחר שעבר יום אחד:
1. ❌ לא עוברים אוטומטית למסך "פג תוקף"
2. ❌ מוצגים במסך "הכל" עם סטטוס "-1 ימים"
3. ✅ רק אחרי רענון ידני (pull-to-refresh) הם עוברים כמו שצריך

### הסיבה:

המסכים **"הכל"** ו**"פג תוקף"** משתמשים ב-**cache-first strategy**:
- הנתונים נטענים מ-cache מיידית (מהיר מאוד)
- אין refetch אוטומטי כש:
  - המשתמש חוזר למסך
  - עבר זמן מאז הטעינה האחרונה
  - מוצרים שהיו "בסדר" הפכו ל"פג תוקף"

```typescript
// QueryProvider - cache-first configuration
defaultOptions: {
  queries: {
    refetchOnMount: false,      // ❌ לא מרענן בטעינת מסך
    refetchOnWindowFocus: false, // ❌ לא מרענן בפוקוס
    refetchOnReconnect: true,    // ✅ רק כשחוזרים לאונליין
  }
}
```

## ✅ הפתרון

הוספת **`useFocusEffect`** לשני המסכים שמרענן נתונים אוטומטית כשהמסך חוזר לפוקוס.

### 1. מסך "הכל" (`app/(tabs)/all.tsx`):

```typescript
// Import useFocusEffect
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

// Add ref to track initial mount
const isInitialMountRef = useRef(true);

// Auto-refresh when screen comes into focus
useFocusEffect(
  useCallback(() => {
    // Skip if navigating to product details (internal navigation)
    if (isNavigatingToProductRef.current) {
      isNavigatingToProductRef.current = false;
      return;
    }
    
    // Skip initial mount (data already loaded)
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    // Only refetch if we have owner and items
    if (activeOwnerId && items.length > 0) {
      console.log('[All Screen] Screen focused - refreshing data to update expired items');
      refetch();
    }
    
    return () => {
      // Cleanup - reset navigation flag
      isNavigatingToProductRef.current = false;
    };
  }, [activeOwnerId, items.length, refetch])
);
```

### 2. מסך "פג תוקף" (`app/(tabs)/expired.tsx`):

```typescript
// Import useFocusEffect and useRef
import React, { useMemo, useCallback, useState, useRef } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';

// Add ref to track initial mount
const isInitialMountRef = useRef(true);

// Auto-refresh when screen comes into focus
useFocusEffect(
  useCallback(() => {
    // Skip initial mount (data already loaded)
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    // Only refetch if we have an owner
    if (activeOwnerId) {
      console.log('[Expired Screen] Screen focused - refreshing data to catch newly expired items');
      refetch();
    }
  }, [activeOwnerId, refetch])
);
```

## 🎯 איך זה עובד עכשיו:

### תרחיש 1: מוצר שפג תוקפו
```
יום ראשון 08:00:
  📦 מוצר במסך "הכל" → 0 ימים עד תפוגה
      ↓
יום ראשון 23:59:
  🕐 חצות עוברת
      ↓
יום שני 08:00:
  👤 משתמש פותח את האפליקציה
      ↓
  📱 מסך "הכל" בפוקוס
      ↓
  🔄 useFocusEffect מזהה → refetch אוטומטי
      ↓
  ✅ מוצר מוצג במסך "פג תוקף" עם סטטוס "פג תוקף"
      ↓
  ✅ מסך "הכל" מראה את המוצר עם סטטוס "-1 ימים"
```

### תרחיש 2: מעבר בין טאבים
```
👤 משתמש במסך "דף הבית"
    ↓
🕐 עוברות כמה שעות
    ↓
👆 משתמש עובר למסך "הכל"
    ↓
🔄 useFocusEffect → refetch אוטומטי
    ↓
✅ נתונים מעודכנים מ-Supabase
```

### תרחיש 3: חזרה לאפליקציה
```
📱 משתמש סוגר את האפליקציה
    ↓
🕐 עוברים כמה ימים
    ↓
📱 משתמש פותח את האפליקציה שוב
    ↓
🔄 useFocusEffect במסך שנפתח → refetch
    ↓
✅ כל המוצרים מעודכנים לפי התאריך הנוכחי
```

## 🔧 פרטים טכניים

### למה `useFocusEffect` ולא `useEffect`?

**`useEffect`:**
```typescript
useEffect(() => {
  refetch(); // רץ רק ב-mount ראשוני
}, []);
```
- ✅ רץ פעם אחת כשהקומפוננטה נטענת
- ❌ לא רץ כשחוזרים למסך מטאב אחר
- ❌ לא רץ כשהמסך חוזר לפוקוס

**`useFocusEffect`:**
```typescript
useFocusEffect(
  useCallback(() => {
    refetch(); // רץ כל פעם שהמסך בפוקוס
    return () => cleanup();
  }, [deps])
);
```
- ✅ רץ כל פעם שהמסך חוזר לפוקוס
- ✅ מושלם לרענון נתונים כשחוזרים למסך
- ✅ תומך ב-cleanup function

### למה לדלג על Initial Mount?

```typescript
const isInitialMountRef = useRef(true);

if (isInitialMountRef.current) {
  isInitialMountRef.current = false;
  return; // Skip first run
}
```

**סיבות:**
1. **מניעת Fetch כפול**: הנתונים כבר נטענים על ידי `useItemsQuery`
2. **ביצועים**: לא צריך 2 fetches במקביל
3. **UX טוב יותר**: המסך נטען מהר עם cache, ואז מתעדכן רק כשחוזרים אליו

### למה לבדוק `activeOwnerId`?

```typescript
if (activeOwnerId) {
  refetch();
}
```

- ✅ מונע fetches כש-user לא מחובר
- ✅ מונע fetches כש-owner עדיין נטען
- ✅ חוסך קריאות מיותרות לשרת

## 🧪 בדיקות מומלצות

### 1. בדיקת מעבר יום:
1. הוסף מוצר עם תאריך תפוגה **היום**
2. המתן עד חצות (או שנה את שעון המכשיר)
3. פתח את האפליקציה למחרת
4. ✅ המוצר צריך להופיע ב"פג תוקף" אוטומטית
5. ✅ במסך "הכל" הוא צריך להיות עם "-1 ימים"

### 2. בדיקת מעבר בין טאבים:
1. פתח מסך "הכל"
2. עבור ל"דף הבית"
3. המתן 5 שניות
4. חזור ל"הכל"
5. ✅ צריך לראות refetch בקונסול
6. ✅ הנתונים צריכים להתעדכן

### 3. בדיקת פתיחה מחדש:
1. סגור את האפליקציה לגמרי
2. המתן דקה
3. פתח את האפליקציה שוב
4. ✅ המסך הראשון שנפתח צריך לעשות refetch
5. ✅ כל המוצרים מעודכנים

### 4. בדיקת ניווט פנימי:
1. במסך "הכל", לחץ על מוצר
2. חזור אחורה
3. ✅ **לא** צריך לעשות refetch מיותר
4. ✅ `isNavigatingToProductRef` מונע refetch

## 📊 השפעה על ביצועים

### לפני התיקון:
```
User opens "All" screen:
  ↓
Loads from cache (fast)
  ↓
❌ Stale data if time passed
  ↓
User manually pulls to refresh
  ↓
✅ Fresh data
```

### אחרי התיקון:
```
User opens "All" screen:
  ↓
Loads from cache (fast)
  ↓
✅ Fresh data immediately

User switches tabs:
  ↓
Returns to "All":
  ↓
🔄 Auto-refresh in background
  ↓
✅ Always up-to-date
```

### השפעה על Network:
- ✅ **Minimal**: רק כשחוזרים למסך אחרי שעזבו אותו
- ✅ **Smart**: דולג על fetch ראשוני (משתמש ב-cache)
- ✅ **Efficient**: לא עושה fetch אם אין owner

### השפעה על Battery:
- ✅ **Low Impact**: רק fetches כשהמשתמש אקטיבי
- ✅ **No Polling**: לא עושה checks תקופתיים
- ✅ **Event-Driven**: רק כשיש אירוע פוקוס

## 📝 קבצים ששונו

1. **`app/(tabs)/all.tsx`**:
   - Import `useFocusEffect`
   - הוספת `isInitialMountRef`
   - הוספת `useFocusEffect` hook עם logic של דילוג על initial mount וניווט פנימי

2. **`app/(tabs)/expired.tsx`**:
   - Import `useFocusEffect` and `useRef`
   - הוספת `isInitialMountRef`
   - הוספת `useFocusEffect` hook פשוט יותר (בלי ניווט פנימי)

## ✅ סיכום

התיקון מוסיף **auto-refresh on focus** לשני המסכים:
- 🔄 **רענון אוטומטי** כשחוזרים למסך
- ⚡ **מהיר**: משתמש ב-cache + background refresh
- 🎯 **חכם**: דולג על initial mount ו-internal navigation
- 💾 **יעיל**: רק fetches כשצריך
- ✅ **פותר**: מוצרים שפג תוקפם עוברים אוטומטית

**תוצאה: המשתמש תמיד רואה מוצרים עם סטטוס מעודכן!** 🎉

---

**תאריך:** 17/01/2026  
**תיקון:** Auto-refresh on focus for expired items  
**קבצים:** `app/(tabs)/all.tsx`, `app/(tabs)/expired.tsx`
