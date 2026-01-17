# תיקון: cleanupOfflineQueue() לא קיים

## 🐛 הבעיה

השגיאה:
```
[ReferenceError: Property 'cleanupOfflineQueue' doesn't exist]
```

הופיעה ב-`app/_layout.tsx` בשורה 258, כאשר הקוד ניסה לקרוא לפונקציה `cleanupOfflineQueue()` ב-cleanup function של הקומפוננטה `IAPInitialization`.

### הסיבה:

המערכת עברה מ-**Offline Queue** ל-**Outbox Pattern** (המנוהל ב-`QueryProvider`), אבל הקריאה לפונקציה הישנה `cleanupOfflineQueue()` לא נמחקה מה-cleanup.

## ✅ הפתרון

### לפני התיקון:

```typescript
function IAPInitialization() {
  // ...
  
  useEffect(() => {
    // ...
    
    return () => {
      subscription.remove();
      disconnectIAP();
      cleanupOfflineQueue();  // ❌ פונקציה שלא קיימת!
    };
  }, []);
  
  return null;
}
```

### אחרי התיקון:

```typescript
function IAPInitialization() {
  // ...
  
  useEffect(() => {
    // ...
    
    return () => {
      subscription.remove();
      disconnectIAP();
      // Offline operations now handled by Outbox pattern in QueryProvider
    };
  }, []);
  
  return null;
}
```

## 📋 פרטים טכניים

### הערות בקובץ שמצביעות על השינוי:

**שורה 18:**
```typescript
// Offline queue removed - now handled by Outbox pattern in QueryProvider
```

**שורה 245:**
```typescript
// Offline operations now handled by Outbox in QueryProvider
```

### איך Offline operations עובדות עכשיו?

**לפני (Offline Queue):**
```
App → cleanupOfflineQueue() → Manual queue management
```

**עכשיו (Outbox Pattern):**
```
App → QueryProvider → Outbox pattern
    ↓
    Automatic offline queue management
    ↓
    Handled by TanStack Query + Persistence
```

## 🔍 איפה ה-Outbox Pattern?

הניהול של offline operations עכשיו ב:
- `src/providers/QueryProvider.tsx` - TanStack Query with persistence
- `src/lib/hooks/useItems.ts` - Offline-first data fetching
- `AsyncStorage` - Persistent cache

## 🧪 בדיקות

1. ✅ האפליקציה עולה בלי שגיאות
2. ✅ IAP initialization עובד
3. ✅ Cleanup function רץ בלי שגיאות
4. ✅ Offline operations ממשיכות לעבוד (דרך Outbox)

## 📝 קבצים ששונו

- `app/_layout.tsx` - הסרת קריאה ל-`cleanupOfflineQueue()`

---

**תאריך:** 16/01/2026  
**תיקון:** Removed deprecated cleanupOfflineQueue() call  
**סיבה:** המערכת עברה ל-Outbox pattern

---

## ✅ סיכום

השגיאה `cleanupOfflineQueue() doesn't exist` תוקנה על ידי **הסרת הקריאה הישנה** לפונקציה שכבר לא קיימת.

Offline operations ממשיכות לעבוד מושלם דרך **Outbox Pattern** ב-`QueryProvider`! 🎉
