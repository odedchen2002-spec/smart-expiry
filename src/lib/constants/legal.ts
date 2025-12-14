/**
 * Legal constants
 * Terms of Use hash for tracking which version users accepted
 */

/**
 * SHA-256 hash of the Terms of Use text (Hebrew)
 * This hash represents the exact version of the terms that users accept.
 * When terms are updated, a new hash should be generated and this constant updated.
 * 
 * Generated from: app/(info)/terms.tsx
 * Hash algorithm: SHA-256
 */
export const TERMS_HASH = '845940b69e9cac676933443da5612d8e2dc0d45228aec11dbad75455b327611d';

/**
 * Current Terms of Use text (Hebrew)
 * This is the exact text that users accept when they register.
 * When terms are updated, this text should be updated and a new hash generated.
 * 
 * Source: app/(info)/terms.tsx
 */
export const CURRENT_TERMS_TEXT = `תנאי שימוש – ExpiryX

עודכן: 2025

ברוך הבא לאפליקציית ExpiryX ("האפליקציה").
השימוש באפליקציה מהווה הסכמה לכל התנאים המפורטים במסמך זה. אם אינך מסכים – אל תשתמש באפליקציה.

1. מטרת האפליקציה

האפליקציה מאפשרת ניהול מוצרים ותאריכי תפוגה, קבלת התראות, והזנת מוצרים ידנית או באמצעות סריקת ברקוד.

האפליקציה אינה מהווה תחליף לבדיקת תאריכי תפוגה בפועל, ולא נושאת באחריות לדיוק מלא של הנתונים.

2. אחריות המשתמש

המשתמש מאשר כי:

• האחריות על בדיקת תאריכי התפוגה בפועל היא עליו בלבד.
• יתכנו טעויות, עיכובים או אי-דיוקים בתצוגת התוקף או בהתראות.
• האפליקציה לא אחראית לנזק ישיר או עקיף הנגרם משימוש בנתונים.

3. הרשאות

האפליקציה עשויה לבקש:

• הרשאת מצלמה (לסריקה)
• הרשאת התראות
• הרשאות נוספות בהתאם לפיצ'רים עתידיים

סירוב להרשאות עלול להגביל חלק מהשירותים.

4. תוכן משתמש

כל מידע שהמשתמש מזין נשמר בענן Supabase.
המשתמש אחראי שלא להזין תוכן מטעה, פוגעני או בלתי חוקי.

5. איסור שימוש אסור

אסור למשתמש:

• לשנות, להעתיק, לשכפל או להפיץ את האפליקציה ללא רשות.
• לנסות לגשת לקוד המקור, למסד הנתונים או לשרתים.
• להשתמש באפליקציה לצרכים זדוניים.

6. הפסקת שימוש

במקרים של שימוש אסור או חריגה מהתנאים – המפתח רשאי לחסום גישה או למחוק חשבון.

7. שינוי תנאים

התנאים עשויים להתעדכן מעת לעת.
המשך שימוש מהווה הסכמה לתנאים המעודכנים.

8. יצירת קשר

לשאלות ניתן לפנות לכתובת האימייל המופיעה באפליקציה.`;

