/**
 * Export data utilities
 * Handles CSV and PDF export of items
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { format as formatDate, parseISO } from 'date-fns';
import type { ItemWithDetails } from '../supabase/queries/items';
import {
  getItems,
  getItemsExpiringToday,
  getItemsExpiringTomorrow,
  getItemsExpiringNextWeek,
  getExpiredItems,
} from '../supabase/queries/items';

export type DateRange = 'all' | 'today' | 'tomorrow' | 'week' | 'expired';

/**
 * Fetch items based on date range
 */
export async function fetchItemsForExport(
  ownerId: string,
  dateRange: DateRange
): Promise<ItemWithDetails[]> {
  switch (dateRange) {
    case 'all':
      // For "all", get all items without filtering by status
      return getItems({
        ownerId,
        limit: 10000, // Large limit to get all items
      });
    case 'today':
      return getItemsExpiringToday(ownerId);
    case 'tomorrow':
      return getItemsExpiringTomorrow(ownerId);
    case 'week':
      return getItemsExpiringNextWeek(ownerId);
    case 'expired':
      return getExpiredItems(ownerId);
    default:
      return getItems({
        ownerId,
        limit: 10000,
      });
  }
}

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCsvField(field: string | null | undefined): string {
  if (field === null || field === undefined) return '';
  const str = String(field);
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Format date for CSV (Hebrew format: DD.MM.YYYY)
 */
function formatDateForCsv(dateString: string | null | undefined): string {
  if (!dateString) return '';
  try {
    const date = parseISO(dateString);
    return formatDate(date, 'dd.MM.yyyy');
  } catch {
    return dateString;
  }
}

/**
 * Format date for display (Hebrew format: DD.MM.YYYY)
 */
function formatDateForDisplay(dateString: string | null | undefined): string {
  if (!dateString) return '';
  try {
    const date = parseISO(dateString);
    return formatDate(date, 'dd.MM.yyyy');
  } catch {
    return dateString;
  }
}

/**
 * Generate CSV content from items
 */
export function generateCSV(items: ItemWithDetails[]): string {
  // CSV header in Hebrew - id, name, barcode, expiration_date, category, notes, created_at, updated_at
  const headers = [
    'מזהה',
    'שם מוצר',
    'ברקוד',
    'תאריך תפוגה',
    'קטגוריה',
    'הערות',
    'נוצר ב',
    'עודכן ב',
  ];

  // Build CSV rows
  const rows = items.map((item) => {
    return [
      escapeCsvField(item.id),
      escapeCsvField(item.product_name || item.barcode_snapshot || 'ללא שם'),
      escapeCsvField(item.product_barcode || item.barcode_snapshot || ''),
      escapeCsvField(formatDateForCsv(item.expiry_date)),
      escapeCsvField(item.product_category || ''),
      escapeCsvField(item.note || ''),
      escapeCsvField(formatDateForCsv(item.created_at)),
      escapeCsvField(formatDateForCsv(item.updated_at)),
    ];
  });

  // Combine header and rows
  const csvLines = [headers.join(',')];
  rows.forEach((row) => {
    csvLines.push(row.join(','));
  });

  return csvLines.join('\n');
}

/**
 * Generate filename for export
 */
export function generateExportFilename(
  fileFormat: 'csv' | 'pdf',
  ownerName?: string
): string {
  const now = new Date();
  const dateStr = formatDate(now, 'yyyy-MM-dd');
  const timeStr = formatDate(now, 'HH-mm');
  const ownerPart = ownerName
    ? `-${ownerName.replace(/[^a-zA-Z0-9]/g, '_')}`
    : '';
  return `expiryx-export-${dateStr}-${timeStr}${ownerPart}.${fileFormat}`;
}

/**
 * Get date range label in Hebrew
 */
export function getDateRangeLabel(dateRange: DateRange): string {
  switch (dateRange) {
    case 'all':
      return 'הכל';
    case 'today':
      return 'היום';
    case 'tomorrow':
      return 'מחר';
    case 'week':
      return '7 הימים הבאים';
    case 'expired':
      return 'פג תוקף';
    default:
      return 'הכל';
  }
}

/**
 * Export items as CSV
 */
export async function exportAsCSV(
  items: ItemWithDetails[],
  ownerName?: string
): Promise<string> {
  // Generate CSV content
  const csvContent = generateCSV(items);

  // Generate filename
  const filename = generateExportFilename('csv', ownerName);

  // Write to file
  // UTF-8 is the default encoding, so we don't need to specify it
  const fileUri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, csvContent);

  return fileUri;
}

/**
 * Generate HTML for PDF
 */
function generatePDFHTML(
  items: ItemWithDetails[],
  dateRange: DateRange
): string {
  const dateRangeLabel = getDateRangeLabel(dateRange);

  // Filter items to show important columns for PDF: שם מוצר, ברקוד, תאריך תפוגה, קטגוריה
  const tableRows = items.map((item) => {
    const name = item.product_name || item.barcode_snapshot || 'ללא שם';
    const barcode = item.product_barcode || item.barcode_snapshot || '';
    const expiryDate = formatDateForDisplay(item.expiry_date);
    const category = item.product_category || '';

    return `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${escapeHtml(name)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${escapeHtml(barcode)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${escapeHtml(expiryDate)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${escapeHtml(category)}</td>
      </tr>
    `;
  });

  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
          direction: rtl;
        }
        h1 {
          text-align: center;
          color: #212121;
          margin-bottom: 8px;
        }
        .subtitle {
          text-align: center;
          color: #757575;
          margin-bottom: 24px;
          font-size: 14px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 16px;
        }
        th {
          background-color: #F5F5F5;
          padding: 12px 8px;
          text-align: right;
          font-weight: 600;
          border-bottom: 2px solid #ddd;
        }
        td {
          padding: 8px;
          border-bottom: 1px solid #ddd;
          text-align: right;
        }
        .footer {
          margin-top: 24px;
          text-align: center;
          color: #757575;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <h1>דו"ח מוצרים</h1>
      <div class="subtitle">טווח תאריכים: ${dateRangeLabel}</div>
      <table>
        <thead>
          <tr>
            <th>שם מוצר</th>
            <th>ברקוד</th>
            <th>תאריך תפוגה</th>
            <th>קטגוריה</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows.join('')}
        </tbody>
      </table>
      <div class="footer">
        נוצר ב: ${formatDate(new Date(), 'dd.MM.yyyy HH:mm')} | סה"כ מוצרים: ${items.length}
      </div>
    </body>
    </html>
  `;

  return html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  const str = String(text);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Export items as PDF
 */
export async function exportAsPDF(
  items: ItemWithDetails[],
  dateRange: DateRange,
  ownerName?: string
): Promise<string> {
  // Generate HTML
  const html = generatePDFHTML(items, dateRange);

  // Generate PDF - printToFileAsync creates a file and returns its URI
  // The filename is automatically generated by expo-print
  // We'll use this URI directly for sharing, which works fine
  const { uri } = await Print.printToFileAsync({ 
    html,
    // Optionally set a base filename (expo-print will add extension)
    base64: false,
  });

  // Return the URI directly - the share function will handle it
  // The user can rename the file when saving if needed
  return uri;
}

/**
 * Share file using system share sheet
 */
export async function shareFile(fileUri: string): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('שיתוף לא זמין במכשיר זה');
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: fileUri.endsWith('.csv')
      ? 'text/csv'
      : fileUri.endsWith('.pdf')
      ? 'application/pdf'
      : undefined,
    dialogTitle: 'שתף קובץ ייצוא',
  });
}

