# משימות שנותרו לביצוע

## ✅ הושלם:
1. ✅ החלפת SYSTEM_PROMPT  
2. ✅ החלפת USER PROMPT (table_import) ל-"Smooth + Robust"

---

## ⏳ עוד לביצוע:

### 2) ביטול כיווץ תמונה (app/ai-import.tsx)

**קובץ:** `app/ai-import.tsx`  
**שורות:** 229-295

**שינויים נדרשים:**

```typescript
// החלף את כל ה-block הזה (שורות 229-295):

// NO RESIZE/COMPRESS - send original with logging only
console.log('[AI Import] Original image will be sent as-is (no resize/compress)');
console.log('[AI Import] Dimensions:', { width: originalWidth, height: originalHeight });
console.log('[AI Import] Original size:', originalSizeKB.toFixed(1), 'KB');

// Convert to base64 WITHOUT any manipulation
const originalImageB64 = await ImageManipulator.manipulateAsync(
  asset.uri,
  [], // No resize, no crop
  {
    compress: 1.0,  // No compression
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  }
);

const base64 = originalImageB64.base64;
if (!base64) {
  setSnack(t('screens.aiImport.errors.errorLoadingImage'));
  return;
}

const newWidth = originalImageB64.width;
const newHeight = originalImageB64.height;
const base64SizeKB = ((base64.length * 3) / 4 / 1024).toFixed(1);

console.log('[AI Import] Base64 size:', base64SizeKB, 'KB');
console.log('[AI Import] Base64 length:', base64.length);
```

---

### 3) Guardrail נגד שמות ללא עברית (index.ts)

**קובץ:** `supabase/functions/ai-import-table/index.ts`  
**מיקום:** בתוך `processRows()` אחרי קבלת השורות מ-AI

**הוסף פונקציה:**
```typescript
function hasHebrew(s: string): boolean {
  return /[\u0590-\u05FF]/.test(s);
}
```

**ב-loop של processRows, אחרי row validation:**
```typescript
// Guardrail: Check if rawName has Hebrew
if (row.rawName && !hasHebrew(row.rawName)) {
  row.nameConfidence = Math.min(row.nameConfidence || 0.5, 0.5);
  if (!row.notes) row.notes = [];
  if (!row.notes.includes('uncertain_name_ocr')) {
    row.notes.push('uncertain_name_ocr');
  }
}
```

---

### 4) לוגים מסודרים

**מיקום:** `supabase/functions/ai-import-table/index.ts`

#### A) לפני קריאה ל-OpenAI:
```typescript
console.log('[OpenAI] Config:', { 
  model: 'gpt-4o', 
  detail, 
  max_tokens: 4096 
});
console.log('[AI-IMPORT] Image received:', { 
  base64Length: imageBase64.length, 
  estimatedSizeKB: ((imageBase64.length * 3) / 4 / 1024).toFixed(1) 
});
```

#### B) אחרי OpenAI:
```typescript
console.log('[AI-IMPORT] OPENAI_CALL:', endTime - startTime, 'ms');
console.log('[Intake] AI returned totalRows:', aiResponse.totalRowsDetected, 'rows:', aiResponse.rows.length);

const hebrewNameRows = aiResponse.rows.filter(r => r.rawName && hasHebrew(r.rawName)).length;
const nullExpiryRows = aiResponse.rows.filter(r => !r.rawExpiry).length;

console.log('[Intake] Hebrew names:', hebrewNameRows, '/', aiResponse.rows.length);
console.log('[Intake] Null expiry:', nullExpiryRows);
```

#### C) אחרי נורמול:
```typescript
console.log('[AI-IMPORT] Document date format detection:', {
  format: documentFormat,
  evidenceDMY: X,
  evidenceMDY: Y,
  ambiguous: Z
});

// Count normalization failures
const invalidCalendarCount = validRows.filter(r => 
  r.normalizationReason === 'invalid_calendar_date'
).length;
const ambiguousFormatCount = validRows.filter(r => 
  r.normalizationReason === 'ambiguous_format'
).length;

console.log('[AI-IMPORT] Normalization:', {
  invalid_calendar_date: invalidCalendarCount,
  ambiguous_format: ambiguousFormatCount
});
```

---

### 5) Deploy + בדיקה

```bash
npx supabase functions deploy ai-import-table
```

**בדיקות:**
1. טבלה פשוטה (30-40 שורות)
2. חשבונית מורכבת

**צילום מסך של:**
- `[OPENAI_CALL: Xms]`
- `[AI-IMPORT] TOTAL: Xms`
- `AI returned totalRows: X rows: X`
- `Hebrew names: X / X`
- `Null expiry: X`
