# 🚀 Production Release - Build 1.1.0

## 📦 תיקונים והשבחות

### 🎨 UI/UX Improvements

#### 1. Filter Modal (All Screen)
- ✅ תיקון בעיית גובה date picker שהשתנה דינמית
- ✅ כפתור "סיום" מחליף כפתורי פעולה כשבוחרים תאריך
- ✅ תמיכה מלאה בהחלפה בין "לוח שנה" ל-"גלגל בחירה"
- ✅ מניעת בחירת תאריכים בעבר

#### 2. Subscription Cards (Subscribe Screen)
- ✅ הסרת פס כחול מיותר מעל כרטיס Pro
- ✅ מסגרת דינמית מופיעה רק על הכרטיס הנבחר
- ✅ תיקון מסגרת Pro+ שהייתה מכוסה ע"י badge
- ✅ תיקון מסגרת למנויים נוכחיים (עובד גם כשהמנוי פעיל)

#### 3. Fast Scan (Camera)
- ✅ Tap-to-focus - לחיצה על המסך ממקדת מחדש
- ✅ תמיכה במיקוד על ברקודים קרובים מאוד (3 נסיונות)
- ✅ הודעות משתמש מועילות ("לחץ למיקוד" ו-"קרב את המצלמה")

### ⚡ Performance & Data

#### 4. Home Screen Cache
- ✅ תצוגה מיידית של מספרים מ-cache (ללא הבהוב)
- ✅ רענון ברקע ממסד הנתונים
- ✅ תמיכה מלאה במצב offline

#### 5. Auto-Refresh Expired Items
- ✅ פריטים שפגו עוברים אוטומטית למסך "פג תוקף"
- ✅ רענון אוטומטי בכניסה למסך "הכל" ו-"פג תוקף"
- ✅ תיקון בעיית "-1 ימים" שהייתה דורשת רענון ידני

#### 6. Offline Support
- ✅ תיקון בעיית טעינה איטית במצב offline
- ✅ שימוש ב-cache תמיד זמין
- ✅ רענון אוטומטי בחזרה online

### 📊 New Feature: User Statistics (Admin)

#### 7. Admin Dashboard
- ✅ VIEW ב-Supabase לסטטיסטיקות בזמן אמת
- ✅ TypeScript Hook: `useUserStatistics()`
- ✅ מסך Admin מלא עם כרטיסי סטטיסטיקות
- ✅ Widget פשוט לשימוש מהיר
- ✅ שיעורי המרה אוטומטיים
- ✅ מעקב אחר משתמשים חדשים (7 ו-30 ימים)

**סטטיסטיקות זמינות:**
- סה"כ משתמשים
- משתמשי Free / Pro / Pro+ / Basic
- משתמשים פעילים vs שפגו
- משתמשים עם חידוש אוטומטי
- משתמשים חדשים

### 🐛 Bug Fixes

- ✅ תיקון `cleanupOfflineQueue` deprecated function
- ✅ תיקון TypeScript errors ב-items (null checks)
- ✅ תיקון translation חסרה (`he.fastScan.tapToFocus`)
- ✅ תיקון בעיית date picker שלא הראה יום נוכחי

---

## 📁 קבצים ששונו

### Core Files
- `app/(tabs)/all.tsx` - Filter improvements + dynamic height
- `app/(tabs)/home.tsx` - Instant cache display
- `app/(tabs)/expired.tsx` - Auto-refresh on focus
- `app/(paywall)/subscribe.tsx` - Border fixes + UX improvements
- `app/fast-scan.tsx` - Tap-to-focus functionality
- `app/_layout.tsx` - Cleanup deprecated function
- `src/lib/hooks/useItems.ts` - Offline cache fixes
- `src/types/database.ts` - Added user_statistics view types

### New Files
- `src/lib/hooks/useUserStatistics.ts` - Statistics hook
- `app/(admin)/user-statistics.tsx` - Admin dashboard
- `src/components/admin/UserStatsWidget.tsx` - Stats widget
- `supabase/migrations/20260117000000_create_user_statistics_view.sql`

### Translations
- `src/i18n/locales/he.json` - Added tap-to-focus hints
- `src/i18n/locales/en.json` - Added tap-to-focus hints

### Documentation
- Multiple `.md` files documenting all fixes

---

## 🚀 Deployment Steps

### 1. Run Supabase Migration
```sql
-- Execute in Supabase SQL Editor:
-- File: supabase/migrations/20260117000000_create_user_statistics_view.sql
```

### 2. Build & Deploy
```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

### 3. Submit to Stores
- App Store (iOS)
- Google Play (Android)

---

## ✅ Testing Checklist

- [x] All TypeScript errors fixed
- [x] No linter errors
- [x] All screens tested manually
- [x] Offline mode tested
- [x] Filter modal tested (calendar + spinner)
- [x] Subscription cards tested
- [x] Fast scan tap-to-focus tested
- [x] Admin statistics tested (after migration)

---

## 📝 Notes

- **Migration Required:** Run `20260117000000_create_user_statistics_view.sql` in Supabase
- **Breaking Changes:** None
- **Backwards Compatible:** Yes
- **Database Schema Changes:** Added `user_statistics` VIEW only

---

**Release Date:** 2026-01-17  
**Build Version:** 1.1.0  
**Previous Version:** 1.0.0

**Total Commits:** 28 commits ahead of origin/master
