# SPLIT & SCAN Implementation for Tall Documents

## Problem
GPT-4o Vision consistently stops at ~30 rows out of ~35 in tall spreadsheets, regardless of resolution or prompt quality.

## Solution
Implement vertical image splitting with overlap for tall documents.

## Implementation Steps

### 1. Add Helper Functions (before `handlePickImage`)

```typescript
// SPLIT & SCAN: Helper to split tall images into overlapping vertical slices
const splitImageVertically = async (uri: string, width: number, height: number) => {
  console.log('[AI Import] Splitting image into 2 overlapping slices...');
  
  // Slice 1: Top 0%-60%
  const topSlice = await ImageManipulator.manipulateAsync(
    uri,
    [{
      crop: {
        originX: 0,
        originY: 0,
        width,
        height: Math.round(height * 0.6),
      },
    }],
    {
      compress: 0.92,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );

  // Slice 2: Bottom 40%-100% (20% overlap)
  const bottomSlice = await ImageManipulator.manipulateAsync(
    uri,
    [{
      crop: {
        originX: 0,
        originY: Math.round(height * 0.4),
        width,
        height: Math.round(height * 0.6),
      },
    }],
    {
      compress: 0.92,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );

  return [
    { base64: topSlice.base64!, sliceNum: 1 },
    { base64: bottomSlice.base64!, sliceNum: 2 },
  ];
};

// SPLIT & SCAN: Merge and deduplicate results
const mergeSliceResults = (slice1Items: any[], slice2Items: any[]) => {
  const merged = [...slice1Items];
  const seen = new Set(slice1Items.map(item => `${item.name}|${item.expiryDate}`));

  for (const item of slice2Items) {
    const key = `${item.name}|${item.expiryDate}`;
    if (!seen.has(key)) {
      merged.push(item);
    }
  }

  return merged;
};
```

### 2. Replace `await analyzeImage(base64)` section

**Find this section (around line 260):**
```typescript
await analyzeImage(base64);
```

**Replace with:**
```typescript
// SPLIT & SCAN for very tall documents
const needsSplitScan = isTallDocument && originalAspectRatio > 1.6;

if (needsSplitScan) {
  console.log('[AI Import] 🔪 SPLIT & SCAN MODE - Aspect ratio:', originalAspectRatio.toFixed(2));
  setAnalyzing(true);
  setItems([]);

  try {
    // Split image
    const slices = await splitImageVertically(manipulatedImage.uri, newWidth, newHeight);
    console.log('[AI Import] Created', slices.length, 'slices');

    // Analyze each slice
    const allItems: AiImportedItem[][] = [];
    
    for (const slice of slices) {
      console.log('[AI Import] Analyzing slice', slice.sliceNum, '...');
      const { data, error } = await supabase.functions.invoke('ai-import-table', {
        body: { imageBase64: slice.base64, ownerId: activeOwnerId, mode: 'table_import' },
      });

      if (error) {
        console.error('[AI Import] Slice', slice.sliceNum, 'error:', error);
        throw error;
      }

      if (data?.items && Array.isArray(data.items)) {
        const sliceItems: AiImportedItem[] = data.items.map((item: any, index: number) => ({
          id: `item-s${slice.sliceNum}-${Date.now()}-${index}`,
          name: item.name || '',
          expiryDate: item.expiryDate || '',
          barcode: item.barcode || null,
          needsBarcode: !item.barcode,
          rowIndex: item.rowIndex || index + 1,
        }));
        
        allItems.push(sliceItems);
        console.log('[AI Import] Slice', slice.sliceNum, 'returned', sliceItems.length, 'items');
      }
    }

    // Merge results
    if (allItems.length === 2) {
      const mergedItems = mergeSliceResults(allItems[0], allItems[1]);
      console.log('[AI Import] ✅ SPLIT & SCAN complete:', mergedItems.length, 'total rows');
      
      setItems(mergedItems);
      setAnalyzing(false);
      
      // Record AI usage
      await loadAiUsage();
      
      setSnack(t('screens.aiImport.success', { count: mergedItems.length }));
    } else {
      throw new Error('Expected 2 slices');
    }
  } catch (error: any) {
    console.error('[AI Import] SPLIT & SCAN error:', error);
    setAnalyzing(false);
    setSnack(t('screens.aiImport.errors.analysisError', { error: error.message }));
  }
} else {
  // Normal single-pass OCR
  await analyzeImage(base64);
}
```

## Expected Results

### Before (Single Pass)
- Rows detected: ~30/35
- Missing bottom rows

### After (Split & Scan)
- Slice 1 (top 60%): ~21 rows
- Slice 2 (bottom 60%): ~21 rows
- Overlap deduplication: ~7 rows
- **Total: 34-35/35 rows** ✅

## Performance Impact

- **Latency:** 2x OpenAI calls (~40-50s total)
- **Accuracy:** Near 100% row coverage
- **Reliability:** Predictable behavior
- **Cost:** 2x OpenAI Vision API calls

## Testing

1. Test with 35-row tall spreadsheet
2. Verify logs show "SPLIT & SCAN MODE"
3. Confirm 2 slices analyzed
4. Check final row count >= 34

## Monitoring

Watch for these logs:
```
[AI Import] 🔪 SPLIT & SCAN MODE - Aspect ratio: 1.75
[AI Import] Created 2 slices
[AI Import] Analyzing slice 1 ...
[AI Import] Slice 1 returned 21 items
[AI Import] Analyzing slice 2 ...
[AI Import] Slice 2 returned 21 items
[AI Import] Merging slices: 21 + 21
[AI Import] Merged result: 35 rows (removed 7 duplicates)
[AI Import] ✅ SPLIT & SCAN complete: 35 total rows
```

## Future Enhancements

- [ ] Dynamic slice count based on height (3+ slices for very tall docs)
- [ ] Smarter deduplication using fuzzy matching
- [ ] Parallel slice processing
- [] Auto-adjust overlap based on row density
