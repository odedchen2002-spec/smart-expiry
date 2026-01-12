// SPLIT & SCAN Strategy Implementation Guide
// This file contains the complete implementation for handling tall documents

/*
KEY CHANGES NEEDED:

1. Add helper function after checkAiLimitAndMaybeBlock():
*/

const splitImageVertically = async (uri: string, overlapPercent: number = 0.2) => {
    // Slice A: top 0%-60%
    // Slice B: bottom 40%-100%
    // Returns [{base64, sliceNum}]

    const topSlice = await ImageManipulator.manipulateAsync(
        uri,
        [{ crop: { originX: 0, originY: 0, width: 1, height: 0.6 } }],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    const bottomSlice = await ImageManipulator.manipulateAsync(
        uri,
        [{ crop: { originX: 0, originY: 0.4, width: 1, height: 0.6 } }],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    return [
        { base64: topSlice.base64!, sliceNum: 1, height: topSlice.height },
        { base64: bottomSlice.base64!, sliceNum: 2, height: bottomSlice.height }
    ];
};

const mergeSliceResults = (slice1Items: any[], slice2Items: any[]) => {
    // Simple merge: deduplicate by exact rawName+rawExpiry match
    const merged = [...slice1Items];
    const seen = new Set(slice1Items.map(item => `${item.rawName}|${item.rawExpiry}`));

    for (const item of slice2Items) {
        const key = `${item.rawName}|${item.rawExpiry}`;
        if (!seen.has(key)) {
            merged.push(item);
        }
    }

    return merged;
};

/*
2. Replace the single analyzeImage call with:
*/

// After image preprocessing and base64 generation:
if (isTallDocument && originalHeight / originalWidth > 1.6) {
    console.log('[AI Import] TALL DOCUMENT DETECTED - Using SPLIT & SCAN');

    // Split into 2 overlapping slices
    const slices = await splitImageVertically(manipulatedImage.uri);

    console.log('[AI Import] Split into', slices.length, 'slices');

    // Analyze each slice
    const sliceResults = [];
    for (const slice of slices) {
        console.log('[AI Import] Analyzing slice', slice.sliceNum);
        const { data, error } = await supabase.functions.invoke('ai-import-table', {
            body: { imageBase64: slice.base64, ownerId: activeOwnerId, mode: 'table_import' },
        });

        if (!error && data?.items) {
            sliceResults.push(data.items);
            console.log('[AI Import] Slice', slice.sliceNum, 'returned', data.items.length, 'rows');
        }
    }

    // Merge results
    if (sliceResults.length === 2) {
        const mergedItems = mergeSliceResults(sliceResults[0], sliceResults[1]);
        console.log('[AI Import] Merged total:', mergedItems.length, 'rows');

        // Process merged results same as before
        const importedItems = mergedItems.map((item, index) => ({
            id: `item-${Date.now()}-${index}`,
            name: item.name || '',
            expiryDate: item.expiryDate || '',
            barcode: item.barcode || null,
            needsBarcode: !item.barcode,
            rowIndex: index + 1,
        }));

        setItems(importedItems);
        // ... rest of processing
    }
} else {
    // Normal single-pass OCR
    await analyzeImage(base64);
}
