/**
 * AI Import Table Edge Function - Goods Intake
 * 
 * Extracts products from supplier table images (delivery notes).
 * Strict OCR mode: no guessing, no inference, no catalog lookups.
 * 
 * Flow:
 * 1. AI extracts rows with name + barcodeCandidate
 * 2. Server validates EAN-13 checksum
 * 3. Server removes duplicate barcodes (set to null)
 * 4. Returns final rows with barcode + needsBarcode flag
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// =============================================================================
// CONFIG
// =============================================================================

const AI_CONFIG = {
  model: 'gpt-4o',
  detail: 'high',
  max_tokens: 4000,  // Increased from 3000 in case response is truncated
  temperature: 0,
};

// =============================================================================
// PROMPTS - ISRAELI SUPPLIER TABLE OCR
// =============================================================================

const SYSTEM_PROMPT = `You are a strict OCR extraction engine for Hebrew business tables and invoices.
Copy EXACTLY what you see: Hebrew letters, digits, punctuation, and separators (. / -).
Never translate, never normalize, never guess, never infer missing characters or years.
CRITICAL: Extract the ACTUAL product names from cells, not generic words like "מוצר" or "פריט". If you see generic text, you are reading the wrong column.
If text is partially unclear, still copy the visible part exactly and lower confidence (do NOT replace with null unless nothing is readable).
Return ONLY valid JSON. No markdown, no explanations.`;

// Base strict prompt - used for all modes
const BASE_STRICT_PROMPT = `
STRUCTURE DISCOVERY (CRITICAL - Execute this FIRST for table_import mode):

1. DOCUMENT TYPE DETECTION:
   - Determine if this is a simple spreadsheet (2-3 columns) or complex invoice (many columns with headers)

2. COLUMN IDENTIFICATION (if headers exist):
   - Locate the EXPIRY DATE column by header keywords:
     * Hebrew: תוקף, תאריך תפוגה, לפג, עד, ת.תפוגה, תפוגה
     * English: EXP, EXPIRY, DATE, BEST BEFORE, USE BY, BBD
     * Do NOT treat 'תאריך ייצור' / 'ת.יצור' / 'Production Date' as expiry
     * Prefer expiry/best-before/use-by columns over production columns
   - Locate the PRODUCT NAME column by header keywords:
     * Hebrew: שם, פריט, מוצר, תיאור, תאור
     * English: NAME, PRODUCT, DESCRIPTION, ITEM

3. COLUMN IDENTIFICATION (if NO headers):
   - Score each column by count of date-like tokens across rows (digits with separators . / -)
   - Choose the highest-scoring column as EXPIRY DATE column
   - Search within up to 3 columns left/right of the expiry column
   - Choose the column with the highest Hebrew-word density (multiple Hebrew letters/words per cell) as PRODUCT NAME

4. COLUMN BINDING (CRITICAL):
   - Once the expiry column is identified, extract rawExpiry from that column's cell for EVERY item row
   - rawExpiry MUST be the exact cell text copied as written
   - rawExpiry = null ONLY if the expiry-cell is truly empty OR completely unreadable (no characters can be confidently read)
   - If the expiry-cell contains ANY characters (even partial or noisy), copy them into rawExpiry and set expiryConfidence <= 0.6 and add note "uncertain_date_binding"
   - Do NOT drop to null just because it might be noise
   - In table_import mode, if the expiry cell contains ANY numeric pattern that resembles a date (digits with separators . / -), copy it into rawExpiry even if it might be noise. If unsure, set expiryConfidence <= 0.6 and add note "uncertain_date_binding"

5. FALLBACK (only when column binding is impossible):
   - For messy/scanned documents where columns cannot be clearly identified
   - Prefer the closest date-like token to the product name on the same row
   - If extracted via fallback, set expiryConfidence <= 0.6 and add note "uncertain_date_binding"
   - Never invent missing digits or years

DO NOT:
- translate
- normalize
- correct spelling
- infer missing data
- convert dates
- guess years
- use product knowledge
- merge or split values
- Do NOT interpret date order (DD/MM vs MM/DD). Just copy rawExpiry exactly as written

TASK:
From the table image, extract only rows that contain product items.

For each detected item row, extract:
- rawName: the Hebrew product name EXACTLY as written
- rawExpiry: the expiry date string EXACTLY as written (OR null depending on MODE)
- barcodeCandidate: a 13-digit barcode ONLY if clearly visible

OUTPUT:
Return ONLY valid JSON in this exact structure:

{
  "totalRowsDetected": <number>,
  "rows": [
    {
      "rowIndex": <number>,
      "rawName": <string | null>,
      "rawExpiry": <string | null>,
      "barcodeCandidate": <string | null>,
      "nameConfidence": <number between 0 and 1>,
      "expiryConfidence": <number between 0 and 1 (0.0 if rawExpiry forced null)>,
      "barcodeConfidence": <number between 0 and 1>,
      "notes": <array of short strings>
    }
  ]
}

RULES:
1. Extraction only:
   - rawName must be copied EXACTLY as seen (Hebrew text only, no translation).
   - If MODE allows expiry: rawExpiry must be copied EXACTLY as seen (examples: "25.12", "3/1/2026"). Do not convert/iso.
   - If MODE forbids expiry: force rawExpiry = null.
2. Rows:
   - Skip headers, titles, column names, totals, summaries, and empty rows.
   - If a row exists but the product name is unreadable → rawName = null.
   - ITEM ROW DETECTION: An item row has a PRODUCT NAME cell with Hebrew letters that looks like a product label.
   - Always skip rows where the name cell contains: ["סה\"כ","סך הכל","מע\"מ","הנחה","משלוח","תשלום","זיכוי","חוב","יתרה","כמות כוללת","TOTAL","VAT","DISCOUNT","SHIPPING","BALANCE"]
3. Barcode:
   - barcodeCandidate must be exactly 13 digits.
   - If not fully visible or unclear → null.
4. Confidence scoring (0.0–1.0):
   - 1.0 = perfectly clear, 0.0 = not visible.
5. Notes:
   - Add notes ONLY if confidence < 0.8.
   - Allowed: "blurry", "partial_text", "cut_off", "low_contrast", "overlapping_text", "uncertain_date_binding"

Return ONLY the JSON. No markdown. No explanations.`;

// =============================================================================
// TYPES
// =============================================================================

interface AIRow {
  rowIndex: number;
  rawName: string | null;
  rawExpiry: string | null;
  barcodeCandidate: string | null;
  nameConfidence: number;
  expiryConfidence: number;
  barcodeConfidence: number;
  notes?: string[];
}

interface AIResponse {
  totalRowsDetected: number;
  rows: AIRow[];
}

interface FinalRow {
  rowIndex: number;
  name: string | null;
  barcode: string | null;
  expiryDate: string | null;
  needsBarcode: boolean;
}

interface QuotaResult {
  allowed: boolean;
  error_code: string | null;
  pages_used: number;
  pages_limit: number;
  remaining: number;
  reset_at: string | null;
}

interface Metrics {
  totalRows: number;
  extractedWithNameCount: number;
  extractedWithBarcodeCandidateCount: number;
  extractedWithDateCount: number;
  validBarcodeCount: number;
  duplicatesRemovedCount: number;
  finalBarcodeCount: number;
}

// ... EAN-13 VALIDATION CODE REMAINS THE SAME (LINES 121-149) ...
function isValidEan13(barcode: string): boolean {
  if (!barcode || barcode.length !== 13) return false;
  if (!/^\d{13}$/.test(barcode)) return false;

  // EAN-13 checksum: sum odd positions + sum even positions * 3
  // Result mod 10 should equal check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(barcode[i], 10);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(barcode[12], 10);
}

function validateBarcode(candidate: string | null): string | null {
  if (!candidate) return null;

  // Extract digits only
  const digits = candidate.replace(/\D/g, '');

  // Must be exactly 13 digits for EAN-13
  if (digits.length !== 13) return null;

  // Must pass checksum
  if (!isValidEan13(digits)) return null;

  return digits;
}

// ... AI CALL CODE REMAINS THE SAME (LINES 155-220) ...
async function callOpenAI(
  imageBase64: string,
  userPrompt: string,
  detail: 'low' | 'high' = 'high',
  modelOverride?: string  // Allow model override (e.g., 'gpt-4o-mini')
): Promise<AIResponse> {
  const startTime = Date.now();
  const model = modelOverride || AI_CONFIG.model;

  console.log('[OpenAI] Config:', {
    model,
    detail,
    temperature: AI_CONFIG.temperature,
    max_tokens: AI_CONFIG.max_tokens,
  });

  console.time('[AI-IMPORT] OPENAI_CALL');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model, // Use the model variable (which respects modelOverride)
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt }, // Use dynamic prompt
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail
              }
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: AI_CONFIG.max_tokens,
      temperature: AI_CONFIG.temperature,
    }),
  });

  const elapsed = Date.now() - startTime;
  console.timeEnd('[AI-IMPORT] OPENAI_CALL');
  console.log('[OpenAI] Response time:', elapsed, 'ms');

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[OpenAI] Error:', response.status, errorText.substring(0, 300));
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No response from AI');
  }

  try {
    const parsed = JSON.parse(content);
    return {
      totalRowsDetected: parsed.totalRowsDetected || 0,
      rows: parsed.rows || [],
    };
  } catch (e) {
    console.error('[OpenAI] JSON parse error, content:', content.substring(0, 500));
    throw new Error('Invalid JSON from AI');
  }
}

// =============================================================================
// GEMINI API CALL
// =============================================================================

async function callGemini(
  imageBase64: string,
  userPrompt: string
): Promise<AIResponse> {
  const startTime = Date.now();
  const model = 'gemini-2.0-flash-exp'; // Using Gemini 2.0 Flash (experimental) for fast, high-quality vision

  console.log('[Gemini] Config:', {
    model,
    temperature: AI_CONFIG.temperature,
    max_tokens: AI_CONFIG.max_tokens,
  });

  console.time('[AI-IMPORT] GEMINI_CALL');

  // Gemini API endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: `${SYSTEM_PROMPT}\n\n${userPrompt}` },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: imageBase64
            }
          }
        ]
      }],
      generationConfig: {
        temperature: AI_CONFIG.temperature,
        maxOutputTokens: AI_CONFIG.max_tokens,
        responseMimeType: 'application/json',
      },
    }),
  });

  const elapsed = Date.now() - startTime;
  console.timeEnd('[AI-IMPORT] GEMINI_CALL');
  console.log('[Gemini] Response time:', elapsed, 'ms');

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Gemini] Error:', response.status, errorText.substring(0, 300));
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error('No response from Gemini');
  }

  try {
    const parsed = JSON.parse(content);
    return {
      totalRowsDetected: parsed.totalRowsDetected || 0,
      rows: parsed.rows || [],
    };
  } catch (e) {
    console.error('[Gemini] JSON parse error, content:', content.substring(0, 500));
    throw new Error('Invalid JSON from Gemini');
  }
}

// =============================================================================
// PROCESS ROWS - VALIDATE & REMOVE DUPLICATES
// =============================================================================

// Document-level date format detection
type DateFormat = 'DMY' | 'MDY' | 'MIXED' | 'AMBIGUOUS_DEFAULT';

interface DateFormatDetectionResult {
  format: DateFormat;
  evidenceDMY: number; // count of dates where A>12 (must be DD/MM)
  evidenceMDY: number; // count of dates where B>12 (must be MM/DD)
  ambiguousCount: number; // count of dates where both A<=12 and B<=12
}

function detectDocumentDateFormat(rawDates: (string | null)[]): DateFormatDetectionResult {
  let evidenceDMY = 0;
  let evidenceMDY = 0;
  let ambiguousCount = 0;

  for (const raw of rawDates) {
    if (!raw) continue;

    // Clean and normalize separators
    let clean = raw.replace(/^(exp|expiry|date|תוקף|לשימוש|עד|מתאריך|ת\.יצור)[:\s]*/i, '');
    clean = clean.replace(/[^0-9/.\s-]/g, '');
    clean = clean.replace(/[\s/-]+/g, '.');
    clean = clean.replace(/^\.+|\.+$/g, '');

    const parts = clean.split('.').filter(p => p.length > 0);

    // Only analyze numeric dates with 3 parts and 4-digit year
    if (parts.length !== 3) continue;

    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    const p3 = parseInt(parts[2], 10);

    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) continue;

    // Skip if it's YYYY-MM-DD format
    if (p1 > 31) continue;

    // Only analyze if p3 looks like a year (4 digits or > 31)
    if (p3 < 100 && p3 <= 31) continue;

    // Collect evidence
    if (p1 > 12 && p2 <= 12) {
      evidenceDMY++; // p1 must be day -> DD/MM/YYYY
    } else if (p2 > 12 && p1 <= 12) {
      evidenceMDY++; // p2 must be day -> MM/DD/YYYY
    } else if (p1 <= 12 && p2 <= 12) {
      ambiguousCount++; // Could be either
    }
    // If both > 12, it's invalid, skip
  }

  // Decide format based on evidence
  let format: DateFormat;

  if (evidenceMDY >= 1 && evidenceDMY === 0) {
    format = 'MDY'; // Clear US format
  } else if (evidenceDMY >= 1 && evidenceMDY === 0) {
    format = 'DMY'; // Clear EU/IL format
  } else if (evidenceDMY >= 1 && evidenceMDY >= 1) {
    format = 'MIXED'; // Document has both formats (unusual)
  } else {
    // No strong evidence - default to DMY for Israeli locale
    format = 'AMBIGUOUS_DEFAULT';
  }

  return { format, evidenceDMY, evidenceMDY, ambiguousCount };
}

// Helper to normalize dates from raw string to ISO YYYY-MM-DD
interface NormalizationResult {
  iso: string | null;
  reason: 'ok' | 'ambiguous_format' | 'invalid_calendar_date' | 'invalid_tokens';
}

function normalizeImportDate(raw: string | null, documentFormat: DateFormat): NormalizationResult {
  if (!raw) return { iso: null, reason: 'invalid_tokens' };

  // 1. Remove common prefixes (Hebrew/English) case-insensitive
  let clean = raw.replace(/^(exp|expiry|date|תוקף|לשימוש|עד|מתאריך|ת\.יצור)[:\s]*/i, '');

  // 2. Remove any chars that are NOT digits, dots, slashes, dashes, or spaces
  clean = clean.replace(/[^0-9/.\s-]/g, '');

  // 3. Normalize separators: turn spaces/slashes into dots for consistent splitting
  clean = clean.replace(/[\s/-]+/g, '.');

  // 4. Trim leading/trailing dots
  clean = clean.replace(/^\.+|\.+$/g, '');

  if (!clean) return { iso: null, reason: 'invalid_tokens' };

  // Split by dot
  const parts = clean.split('.').filter(p => p.length > 0);

  const now = new Date();
  const currentYear = now.getFullYear();

  // Case 1: "25.12" (Day, Month) -> Infer year
  if (parts.length === 2) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);

    if (isNaN(day) || isNaN(month) || day > 31 || month > 12 || day < 1 || month < 1) return { iso: null, reason: 'invalid_tokens' };

    // Create candidate for current year
    let year = currentYear;
    let candidate = new Date(year, month - 1, day);

    // Logic: If the date in current year is more than 3 months in the past, assume it's next year.
    // E.g., if today is March 2026 and we see "25.12", it was Dec 2025 (recent past) -> keep 2026? 
    // Wait, typical expiry logic:
    // - If we scan "25.12" in March 2026, it implies Dec 2026 (future).
    // - If we scan "01.01" in Dec 2025, it implies Jan 2026 (future).

    // Simple heuristic: If candidate < (now - 90 days), add 1 year.
    if (candidate.getTime() < now.getTime() - (90 * 24 * 60 * 60 * 1000)) {
      year++;
    }

    return { iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, reason: 'ok' };
  }

  // Case 2: "25.12.25" or "25/12/2025" (Day, Month, Year) OR "2025-12-25" (Year, Month, Day)
  if (parts.length === 3) {
    const p1 = parseInt(parts[0], 10); // Day or Year
    const p2 = parseInt(parts[1], 10); // Month
    const p3 = parseInt(parts[2], 10); // Year or Day

    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return { iso: null, reason: 'invalid_tokens' };

    let day: number | undefined;
    let month: number | undefined;
    let year: number;

    // Check if first part looks like a year (YYYY-MM-DD)
    if (p1 > 31) {
      year = p1;
      month = p2;
      day = p3;
    } else {
      // Year is likely p3 - use document-level format detection
      year = p3;

      // Use document format to decide parsing
      if (documentFormat === 'MDY') {
        // US format: MM/DD/YYYY
        month = p1;
        day = p2;
      } else if (documentFormat === 'DMY' || documentFormat === 'AMBIGUOUS_DEFAULT') {
        // EU/IL format or default: DD/MM/YYYY
        day = p1;
        month = p2;
      } else if (documentFormat === 'MIXED') {
        // Fall back to per-row detection for mixed documents
        if (p1 > 12 && p2 <= 12) {
          day = p1;
          month = p2;
        } else if (p2 > 12 && p1 <= 12) {
          month = p1;
          day = p2;
        } else if (p1 <= 12 && p2 <= 12) {
          // Truly ambiguous in MIXED document
          return { iso: null, reason: 'ambiguous_format' };
        } else {
          // Both > 12
          return { iso: null, reason: 'invalid_tokens' };
        }
      }
    }

    // Fix 2-digit years (mostly for DD/MM/YY case)
    if (year < 100) year += 2000;

    // Validate day/month were set
    if (day === undefined || month === undefined) {
      return { iso: null, reason: 'invalid_tokens' };
    }

    // Validate ranges
    if (day > 31 || day < 1 || month > 12 || month < 1 || year < 2000 || year > 2100) {
      return { iso: null, reason: 'invalid_tokens' };
    }

    // Validate actual calendar date (e.g., no Feb 30)
    const testDate = new Date(year, month - 1, day);
    if (testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
      return { iso: null, reason: 'invalid_calendar_date' }; // Invalid calendar date
    }

    return { iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, reason: 'ok' };
  }

  return { iso: null, reason: 'invalid_tokens' };
}

// =============================================================================
// GUARDRAIL: HEBREW TEXT VALIDATION
// =============================================================================

/**
 * Check if a string contains at least one Hebrew character
 * Hebrew Unicode range: U+0590 to U+05FF
 */
function hasHebrew(s: string): boolean {
  return /[\u0590-\u05FF]/.test(s);
}

// =============================================================================
// PROCESS ROWS - VALIDATE & REMOVE DUPLICATES
// =============================================================================

function processRows(aiResponse: AIResponse): { rows: FinalRow[], metrics: Metrics } {
  const { totalRowsDetected, rows: aiRows } = aiResponse;

  // Step 0: Detect document-level date format
  const rawDates = aiRows.map(row => row.rawExpiry);
  const formatDetection = detectDocumentDateFormat(rawDates);

  console.log('[AI-IMPORT] Document date format detection:', {
    format: formatDetection.format,
    evidenceDMY: formatDetection.evidenceDMY,
    evidenceMDY: formatDetection.evidenceMDY,
    ambiguous: formatDetection.ambiguousCount
  });

  // Step 1: Count metrics from AI response
  let extractedWithNameCount = 0;
  let extractedWithBarcodeCandidateCount = 0;
  let extractedWithDateCount = 0;

  for (const row of aiRows) {
    if (row.rawName) extractedWithNameCount++;
    if (row.barcodeCandidate) extractedWithBarcodeCandidateCount++;
    if (row.rawExpiry) extractedWithDateCount++;
  }

  // Step 1.5: GUARDRAIL - Detect "invented" names (no Hebrew)
  let uncertainNameCount = 0;
  for (const row of aiRows) {
    if (row.rawName && !hasHebrew(row.rawName)) {
      // Name exists but contains NO Hebrew characters -> likely OCR error/invention
      row.nameConfidence = Math.min(row.nameConfidence, 0.5);
      if (!row.notes) row.notes = [];
      if (!row.notes.includes('uncertain_name_ocr')) {
        row.notes.push('uncertain_name_ocr');
      }
      uncertainNameCount++;
    }
  }

  if (uncertainNameCount > 0) {
    console.log('[AI-IMPORT] Guardrail: Found', uncertainNameCount, 'names without Hebrew (marked uncertain)');
  }

  // Step 2: Validate barcodes (EAN-13 checksum) and normalize dates
  const validatedAndNormalizedRows: Array<{ row: AIRow, validBarcode: string | null, normalizedExpiry: string | null }> = [];
  let validBarcodeCount = 0;
  let invalidCalendarDateCount = 0;
  let ambiguousFormatCount = 0;

  for (const row of aiRows) {
    const validBarcode = validateBarcode(row.barcodeCandidate);
    const normalizationResult = normalizeImportDate(row.rawExpiry, formatDetection.format);

    // Track normalization failure reasons
    if (row.rawExpiry && !normalizationResult.iso) {
      if (normalizationResult.reason === 'invalid_calendar_date') {
        invalidCalendarDateCount++;
      } else if (normalizationResult.reason === 'ambiguous_format') {
        ambiguousFormatCount++;
      }

      // Log only failed normalizations
      console.log('[AI-IMPORT] Date normalization FAILED:', {
        rowIndex: row.rowIndex,
        raw: row.rawExpiry,
        reason: normalizationResult.reason
      });
    }

    if (validBarcode) validBarcodeCount++;
    validatedAndNormalizedRows.push({ row, validBarcode, normalizedExpiry: normalizationResult.iso });
  }

  // Step 3: Find duplicate barcodes among the *valid* ones
  const barcodeCounts = new Map<string, number>();
  for (const { validBarcode } of validatedAndNormalizedRows) {
    if (validBarcode) {
      barcodeCounts.set(validBarcode, (barcodeCounts.get(validBarcode) || 0) + 1);
    }
  }

  // Identify duplicates (appear more than once)
  const duplicateBarcodes = new Set<string>();
  let duplicatesRemovedCount = 0;
  for (const [barcode, count] of barcodeCounts) {
    if (count > 1) {
      duplicateBarcodes.add(barcode);
      duplicatesRemovedCount += count; // All instances will be nullified
    }
  }

  if (duplicateBarcodes.size > 0) {
    console.log('[Process] Duplicate barcodes found:', Array.from(duplicateBarcodes));
  }

  // Step 4: Build final rows
  const finalRows: FinalRow[] = [];
  let finalBarcodeCount = 0;

  for (const { row, validBarcode, normalizedExpiry } of validatedAndNormalizedRows) {
    // If barcode is a duplicate, set to null
    const finalBarcode = (validBarcode && !duplicateBarcodes.has(validBarcode))
      ? validBarcode
      : null;

    if (finalBarcode) finalBarcodeCount++;

    // Trim name if present, convert empty strings to null
    const trimmedName = row.rawName ? row.rawName.trim() : '';
    const name = trimmedName.length > 0 ? trimmedName : null;

    finalRows.push({
      rowIndex: row.rowIndex,
      name,
      barcode: finalBarcode,
      expiryDate: normalizedExpiry, // Use the normalized date
      needsBarcode: finalBarcode === null && name !== null,
    });
  }

  const metrics: Metrics = {
    totalRows: totalRowsDetected,
    extractedWithNameCount,
    extractedWithBarcodeCandidateCount,
    extractedWithDateCount,
    validBarcodeCount,
    duplicatesRemovedCount,
    finalBarcodeCount,
  };

  // Log normalization summary
  console.log('[AI-IMPORT] Normalization summary:', {
    documentFormat: formatDetection.format,
    invalidCalendarDateCount,
    ambiguousFormatCount,
    successfulNormalizations: finalRows.filter(r => r.expiryDate).length
  });

  return { rows: finalRows, metrics };
}

// =============================================================================
// NAME QUALITY METRICS - Detect repetition/generalization
// =============================================================================

interface NameQualityMetrics {
  total: number;
  uniq: number;
  uniqueRatio: number;
  maxShare: number;
  veryShortCount: number;
}

function computeNameQuality(rows: AIRow[]): NameQualityMetrics {
  const names = rows
    .map(r => (r.rawName ?? '').trim())
    .filter(n => n.length > 0);

  const total = names.length;
  const uniq = new Set(names).size;

  const freq = new Map<string, number>();
  for (const n of names) {
    freq.set(n, (freq.get(n) ?? 0) + 1);
  }

  const maxShare = total === 0 ? 0 : Math.max(...Array.from(freq.values())) / total;
  const uniqueRatio = total === 0 ? 0 : uniq / total;

  const veryShortCount = names.filter(n => n.length < 5).length;

  return { total, uniq, uniqueRatio, maxShare, veryShortCount };
}

// =============================================================================
// MAIN: intakeGoodsFromImage
// =============================================================================

async function intakeGoodsFromImage(imageBase64: string, mode: 'supplier' | 'table_import', model?: string): Promise<{ rows: FinalRow[], metrics: Metrics }> {
  console.log('[Intake] Starting extraction (strict OCR)... Mode:', mode, 'Model:', model || AI_CONFIG.model);

  // Dynamic Prompt Construction
  let modeHeader = '';

  if (mode === 'table_import') {
    modeHeader = `TABLE IMPORT MODE

KEY RULES:
1. NEVER invent names. If unreadable → rawName=null
2. Do NOT repeat generic words ("חומוס","קוטג'") unless EXACT
3. totalRowsDetected = count ALL visible rows (even if unreadable)
4. Return row for EVERY rowIndex (0..totalRowsDetected-1)
5. ⚠️ CRITICAL: If you see "חומוס" repeating many times, you are reading the HEADER word, NOT the data! Look at the cells BELOW the header for actual product names.

TABLE STRUCTURE:
- Header row (titles): "שם מוצר", "תוקף", "ברקוד" ← SKIP THIS
- Data rows (below header): Each has UNIQUE product name

Example:
│ שם מוצר    │ תוקף      │ ← HEADER (SKIP!)
│ חלב תנובה  │ 25.12.26  │ ← Row 0: "חלב תנובה"
│ גבינה      │ 15.01.26  │ ← Row 1: "גבינה"
│ יוגורט     │ 20.01.26  │ ← Row 2: "יוגורט"

TASK:
1. Find product NAME column (most Hebrew text)
2. Find EXPIRY column (most dates: dd.mm or dd/mm)
3. For EACH row BELOW header: copy exact NAME text from that row's cell
   - Each row has DIFFERENT name (not all "חומוס"!)
   - If name unclear → rawName=null, nameConfidence<=0.4
   - Copy expiry EXACTLY (don't convert DD/MM vs MM/DD)
4. Barcode: 13 digits only if clear

OUTPUT JSON:
{
  "totalRowsDetected": <count all visible rows>,
  "rows": [
    {
      "rowIndex": 0,
      "rawName": <exact text or null>,
      "rawExpiry": <exact text or null>,
      "barcodeCandidate": <13 digits or null>,
      "nameConfidence": <0..1>,
      "expiryConfidence": <0..1>,
      "barcodeConfidence": <0..1>,
      "notes": []
    }
  ]
}

Notes: Only add if confidence<0.8: ["blurry","partial_text","cut_off"]
Return ONLY JSON.`;
  } else {
    // supplier mode (or any fallback)
    modeHeader = `CURRENT MODE: supplier_intake
INSTRUCTIONS:
- Extract item rows with rawName.
- ALWAYS set rawExpiry = null for every row.
- Do NOT spend effort detecting dates.
- Set expiryConfidence = 0.0.`;
  }

  // table_import mode has complete prompt in modeHeader, supplier_intake needs BASE_STRICT_PROMPT
  const fullPrompt = mode === 'table_import'
    ? modeHeader
    : `${modeHeader}\n\n${BASE_STRICT_PROMPT}`;

  // Log prompt header to verify correct mode injection
  console.log('[AI-IMPORT] promptModeHeader:\n', fullPrompt.split('\n').slice(0, 10).join('\n'));

  // Track time for timeout guard
  const requestStartMs = Date.now();

  // Log image size
  const base64Length = imageBase64.length;
  const imageSizeKB = ((base64Length * 3) / 4 / 1024).toFixed(1);
  console.log('[AI-IMPORT] Image received:', {
    base64Length,
    estimatedSizeKB: imageSizeKB,
    startMs: requestStartMs,
  });

  console.log('[AI-IMPORT] beforeAI - elapsed:', Date.now() - requestStartMs, 'ms');

  // Choose AI provider based on model parameter
  let aiResponse: AIResponse;
  if (model === 'gemini') {
    // Use Gemini API
    aiResponse = await callGemini(imageBase64, fullPrompt);
  } else {
    // Use OpenAI (default)
    let detail: 'low' | 'high' = 'high';
    aiResponse = await callOpenAI(imageBase64, fullPrompt, detail, model);
  }

  console.log('[AI-IMPORT] afterAI - elapsed:', Date.now() - requestStartMs, 'ms');

  console.log('[Intake] AI returned totalRows:', aiResponse.totalRowsDetected, 'rows:', aiResponse.rows.length);

  // Name Quality Metrics - detect repetition/generalization
  const nameQuality = computeNameQuality(aiResponse.rows);
  console.log('[AI-IMPORT] Name quality:', nameQuality);

  // ENFORCE: totalRowsDetected - fill missing rows
  const rowsReturned = aiResponse.rows.length;
  const totalExpected = aiResponse.totalRowsDetected || rowsReturned;

  if (rowsReturned < totalExpected) {
    // Find which rowIndex values are missing
    const returnedIndices = new Set(aiResponse.rows.map(r => r.rowIndex));
    const missingIndices: number[] = [];

    for (let i = 0; i < totalExpected; i++) {
      if (!returnedIndices.has(i)) {
        missingIndices.push(i);
      }
    }

    // Add missing rows with null values
    for (const idx of missingIndices) {
      aiResponse.rows.push({
        rowIndex: idx,
        rawName: null,
        rawExpiry: null,
        barcodeCandidate: null,
        nameConfidence: 0,
        expiryConfidence: 0,
        barcodeConfidence: 0,
        notes: ['missing_row_returned_by_ai'],
      });
    }

    // Sort by rowIndex to maintain order
    aiResponse.rows.sort((a, b) => a.rowIndex - b.rowIndex);

    console.log('[AI-IMPORT] Enforced totalRowsDetected:', {
      totalRowsDetected: totalExpected,
      rowsReturned,
      missingRowCount: missingIndices.length,
      rowsAfterEnforce: aiResponse.rows.length,
      missingIndices: missingIndices.slice(0, 10),  // Show first 10
    });
  }

  // Calculate quality metrics
  let nullExpiryCount = 0;
  let lowConfidenceCount = 0;
  let qualityIssuesCount = 0;

  if (aiResponse.rows.length > 0) {
    nullExpiryCount = aiResponse.rows.filter(r => !r.rawExpiry).length;
    lowConfidenceCount = aiResponse.rows.filter(r => r.expiryConfidence < 0.5).length;
    qualityIssuesCount = aiResponse.rows.filter(r =>
      r.notes?.some(note => ['blurry', 'partial_text', 'cut_off', 'low_contrast'].includes(note))
    ).length;
  }

  const nullRate = aiResponse.rows.length > 0
    ? (nullExpiryCount / aiResponse.rows.length)
    : 0;
  const extractionRate = aiResponse.totalRowsDetected > 0
    ? (aiResponse.rows.length / aiResponse.totalRowsDetected)
    : 1;

  // Count rows with Hebrew names
  const countHebrewNameRows = aiResponse.rows.filter(r => r.rawName && hasHebrew(r.rawName)).length;

  console.log('[AI-IMPORT] Quality metrics (model=' + (model || 'gpt-4o-mini') + '):', {
    rowsReturned: aiResponse.rows.length,
    totalRowsDetected: aiResponse.totalRowsDetected,
    countHebrewNameRows,
    countNullExpiry: nullExpiryCount,
    nullRate: (nullRate * 100).toFixed(1) + '%',
    extractionRate: (extractionRate * 100).toFixed(1) + '%',
    lowConfidenceCount,
    qualityIssuesCount
  });

  // NEW Retry Logic - based on missing rows + suspicious repetition
  let alreadyRetried = false;
  const missingRowCount = totalExpected - rowsReturned;
  const coverageRatio = totalExpected > 0 ? rowsReturned / totalExpected : 1;

  // Trigger retry if:
  // A) Missing rows (< 95% coverage OR >= 2 missing rows)
  const hasMissingRows = coverageRatio < 0.95 || missingRowCount >= 2;

  // B) Suspicious repetition (low uniqueness AND high share AND enough samples)
  const hasSuspiciousRepetition = nameQuality.total >= 10 &&
    nameQuality.uniqueRatio < 0.35 &&
    nameQuality.maxShare > 0.25;

  // DISABLED: Retry adds 20-30s even with detail=low, risking timeout
  const shouldRetry = false;  // Was: !alreadyRetried && (hasMissingRows || hasSuspiciousRepetition)

  let retryReason = '';
  if (hasMissingRows) retryReason = 'missing_rows';
  else if (hasSuspiciousRepetition) retryReason = 'suspicious_repetition';

  console.log('[AI-IMPORT] Retry decision:', {
    shouldRetry,
    reason: retryReason || 'no_retry_needed',
    coverageRatio: (coverageRatio * 100).toFixed(1) + '%',
    missingRowCount,
    nameQuality: {
      uniqueRatio: nameQuality.uniqueRatio.toFixed(2),
      maxShare: nameQuality.maxShare.toFixed(2),
    },
  });

  if (shouldRetry) {
    console.log(`[AI-IMPORT] Retry triggered: ${retryReason}`);
    alreadyRetried = true;

    // Retry with enhanced prompt
    const retryPrompt = `RETRY NOTICE:
Your previous output repeated product names and/or returned too few rows.
Re-bind columns and copy the exact full Hebrew names from the NAME column.
If unreadable -> rawName=null (do not guess).

${fullPrompt}`;

    aiResponse = await callOpenAI(imageBase64, retryPrompt, 'high');
    console.log('[Intake] AI retry returned totalRows:', aiResponse.totalRowsDetected, 'rows:', aiResponse.rows.length);

    // Recalculate metrics after retry
    const retryNameQuality = computeNameQuality(aiResponse.rows);
    console.log('[AI-IMPORT] Name quality after retry:', retryNameQuality);
  }

  // SUSPICIOUS OCR check (kept for logging purposes only)
  let hebrewCharCount = 0;
  let totalCharCount = 0;
  let veryShortNamesCount = 0;

  if (aiResponse.rows.length > 0) {
    for (const row of aiResponse.rows) {
      const name = row.rawName || '';
      if (name.length <= 2) {
        veryShortNamesCount++;
      }
      for (const char of name) {
        totalCharCount++;
        // Hebrew Unicode range: 0x0590-0x05FF
        if (char.charCodeAt(0) >= 0x0590 && char.charCodeAt(0) <= 0x05FF) {
          hebrewCharCount++;
        }
      }
    }
  }

  const hebrewCharRatio = totalCharCount > 0 ? hebrewCharCount / totalCharCount : 0;
  const avgNameLength = aiResponse.rows.length > 0
    ? aiResponse.rows.reduce((sum, r) => sum + (r.rawName?.length || 0), 0) / aiResponse.rows.length
    : 0;
  // Log sample rows for debugging - expanded to 15 rows
  if (aiResponse.rows.length > 0) {
    console.log('[AI-IMPORT] Sample raw rows (first 15):', JSON.stringify(aiResponse.rows.slice(0, 15).map(r => ({
      idx: r.rowIndex,
      name: r.rawName?.substring(0, 30),
      expiry: r.rawExpiry,
      expiryConf: r.expiryConfidence,
      notes: r.notes
    })), null, 2));
  }

  // Process and validate
  console.time('[AI-IMPORT] NORMALIZATION');
  const { rows, metrics } = processRows(aiResponse);
  console.timeEnd('[AI-IMPORT] NORMALIZATION');

  // Log metrics
  console.log('[Intake] Metrics:', JSON.stringify(metrics));

  // Log sample (first 3)
  if (rows.length > 0) {
    console.log('[Intake] Sample rows:', rows.slice(0, 3).map(r => ({
      rowIndex: r.rowIndex,
      name: r.name ? (r.name.substring(0, 25) + (r.name.length > 25 ? '...' : '')) : null,
      barcode: r.barcode,
      needsBarcode: r.needsBarcode,
    })));
  }

  return { rows, metrics };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  console.time('[AI-IMPORT] TOTAL');
  console.log('[ai-import-table] Request received');

  try {
    // CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
        },
      });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const body = await req.json();
    const image = body.image || body.imageBase64;
    const mode = body.mode || 'supplier';
    const ownerId = body.ownerId;
    const model = body.model; // Optional: 'gpt-4o' (default) or 'gpt-4o-mini'

    console.log('[ai-import-table] Mode:', mode, 'Model:', model || 'default (gpt-4o)');

    if (!image) {
      return new Response(JSON.stringify({ error: 'No image provided', rows: [] }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // =========================================================================
    // QUOTA CHECK
    // =========================================================================

    // Check quota based on mode
    let quotaInfo: QuotaResult | null = null;
    let isPro = false;

    // Check subscription tier to determine isPro
    if (ownerId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', ownerId)
        .single();

      if (profile) {
        isPro = profile.subscription_tier === 'pro' || profile.subscription_tier === 'pro_plus';
      }
    }

    // MODE: SUPPLIER (Strict quota)
    if (mode === 'supplier' && ownerId) {
      // Always check quota for supplier mode (Pro=20, Free=10 pages)
      console.time('[AI-IMPORT] DB_WRITE');
      const { data: quotaData, error: quotaError } = await supabase
        .rpc('check_and_use_intake_pages', { p_user_id: ownerId, p_pages_to_use: 1 });
      console.timeEnd('[AI-IMPORT] DB_WRITE');

      if (quotaError) {
        console.error('[Quota] Error:', quotaError);
      } else if (quotaData) {
        quotaInfo = quotaData as QuotaResult;
        console.log('[Quota] pages_used:', quotaInfo.pages_used, 'remaining:', quotaInfo.remaining);

        if (!quotaInfo.allowed) {
          return new Response(
            JSON.stringify({
              error: 'quota_exceeded',
              code: 'QUOTA_EXCEEDED',
              rows: [],
              quota: {
                pages_used: quotaInfo.pages_used,
                pages_limit: quotaInfo.pages_limit,
                remaining: quotaInfo.remaining,
                reset_at: quotaInfo.reset_at,
              }
            }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
          );
        }
      }
    }
    // MODE: TABLE IMPORT (Unlimited for Pro)
    else if (mode === 'table_import' && ownerId) {
      if (!isPro) {
        // Free users have a simple AI analysis limit (handled by client or another rpc, 
        // but here we just want to ensure we don't block PRO users).
        // If we want to enforce FREE limit here strictly, we would need to check 'ai_analysis_count'
        // For now, let's assume client checks apply for free users, or add a simple check.
        // But the requirement is specifically "Unlimited for PRO".
      } else {
        console.log('[Quota] PRO user in table_import mode - UNLIMITED access allowed.');
      }
    }

    // =========================================================================
    // PROCESSING
    // =========================================================================

    // Map legacy 'supplier' mode used in client request body to our internal strict types if needed
    // Actually the string matches: 'supplier' | 'table_import'.
    const effectiveMode = (mode === 'table_import') ? 'table_import' : 'supplier';

    const { rows, metrics } = await intakeGoodsFromImage(image, effectiveMode, model);

    // Filter out rows without names (defensive check)
    const validRows = rows.filter(r => r.name && r.name.trim().length > 0);
    if (validRows.length < rows.length) {
      console.log('[AI-IMPORT] Filtered out', rows.length - validRows.length, 'items without names');
    }

    // Build backward-compatible response
    // "items" for client compatibility, "rows" for new format
    console.timeEnd('[AI-IMPORT] TOTAL');
    return new Response(
      JSON.stringify({
        totalRows: metrics.totalRows,
        rows: validRows,
        // Backward compatibility: also return as "items" and "products"
        items: validRows.map(r => ({
          barcode: r.barcode || '',
          name: r.name,
          barcodeValid: r.barcode !== null,
          nameValid: r.name !== null,
          needsBarcode: r.needsBarcode,
          rowIndex: r.rowIndex,
          expiryDate: r.expiryDate || null,
        })),
        products: validRows
          .filter(r => r.barcode !== null)
          .map(r => ({
            barcode: r.barcode,
            name: r.name,
          })),
        metrics,
        quota: quotaInfo ? {
          pages_used: quotaInfo.pages_used,
          pages_limit: quotaInfo.pages_limit,
          remaining: quotaInfo.remaining,
          reset_at: quotaInfo.reset_at,
        } : undefined,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );

  } catch (error: any) {
    console.error('[Error]', error.message);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal error', rows: [] }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
});
