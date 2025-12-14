/**
 * AI utility functions for product name suggestion
 * Currently returns null values - implement actual AI integration as needed
 */

export interface ProductSuggestion {
  suggestedName: string | null;
}

/**
 * Suggest product name from a barcode using AI
 * 
 * @param barcode - The barcode to look up
 * @param ownerId - The owner ID (for context if needed)
 * @returns Object with suggestedName (can be null)
 */
export async function suggestProductDataFromAI(
  barcode: string,
  ownerId: string
): Promise<ProductSuggestion> {
  try {
    // TODO: Implement actual AI integration here
    // This could call:
    // - OpenAI API
    // - A Supabase Edge Function
    // - A third-party barcode lookup service
    // - etc.
    
    // For now, return null to allow manual entry
    console.log(`[AI] suggestProductDataFromAI called for barcode: ${barcode}, ownerId: ${ownerId}`);
    return {
      suggestedName: null,
    };
  } catch (error) {
    console.error('[AI] Error suggesting product data:', error);
    return {
      suggestedName: null,
    };
  }
}

/**
 * @deprecated Use suggestProductDataFromAI instead
 * Legacy function for backward compatibility
 */
export async function suggestProductNameFromAI(
  barcode: string,
  ownerId: string
): Promise<string | null> {
  const result = await suggestProductDataFromAI(barcode, ownerId);
  return result.suggestedName;
}

