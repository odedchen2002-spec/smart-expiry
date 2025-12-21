# Barcode Catalog & Expiry Events Migration

This document describes the database and app changes for the Smart Expiry refactoring.

## Overview

This migration implements:
- **Global barcode name resolution** with store-specific overrides
- **Supplier intake** without expiry date estimation
- **Level B savings tracking** via expiry events
- **4-tab navigation** with Home dashboard

## Database Tables

### A1) Barcode Name System

| Table | Purpose |
|-------|---------|
| `barcode_catalog` | Global product names for barcodes (read-only for clients) |
| `barcode_name_suggestions` | User-submitted name suggestions |
| `store_barcode_overrides` | Store-specific custom names (takes precedence) |

### A2) Supplier Intake

| Table | Purpose |
|-------|---------|
| `pending_items` | Items from supplier documents awaiting real expiry dates |

### A3) Expiry Events

| Table | Purpose |
|-------|---------|
| `expiry_events` | Immutable history of expiry outcomes for savings tracking |

## How to Run the Migration

1. Open your Supabase dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `001_barcode_catalog_and_events.sql`
4. Run the migration

## Name Resolution Order (C1)

When displaying or saving a product name:

1. Check `store_barcode_overrides` (store_id + barcode)
2. Else check `barcode_catalog`
3. Else call `resolve_barcode_name()` Edge Function (stub returns null)
4. If still no name → display "Unknown product"

## Edge Function: resolve-barcode-name

Deploy to Supabase:
```bash
supabase functions deploy resolve-barcode-name
```

The function currently returns NULL for step 3 (stub behavior).
When you integrate a real barcode API, update the `resolveBarcodeName()` function.

## Event Types for Level B Tracking

| Event Type | Description |
|------------|-------------|
| `SOLD_FINISHED` | Item was sold or fully used |
| `THROWN` | Item was disposed/thrown |
| `UPDATED_DATE` | Expiry date was corrected (new batch created) |
| `EXPIRED_AUTO_ARCHIVED` | System archived expired item automatically |

## App Changes

### New Tab Structure (4 tabs)
1. **Scan** - Barcode scanner entry point
2. **Home** - Dashboard with color-coded counts
3. **All** - Full product list
4. **Expiring** - Expired items with action sheet

### Home Screen Dashboard Colors
- 🔴 **Red** - Already expired
- 🟠 **Orange** - Expiring today
- 🟡 **Yellow** - Expiring this week
- 🟢 **Green** - OK (future items)

### Fast Scan Screen (`app/fast-scan.tsx`)

A new high-speed scanning screen for quick batch creation:

**Features:**
- Real-time barcode detection with expo-camera
- Calculator-style numeric keypad for date entry (DD/MM or DD/MM/YY)
- Date validation (ignores invalid dates, dates > 2 years ahead)
- Clickable date chips for instant batch save
- Haptic + visual feedback on success
- Automatic product name resolution (store override → catalog → stub)
- Inline name prompt for unknown products (Save/Skip)
- Supplier pending item resolution

**Modes:**
- `full` (default): Scan barcode + enter date
- `date_only`: Enter date only (for UPDATE DATE flow)

**Navigation:**
- Home → Fast Scan button → `/fast-scan`
- Expiry Alert → Update Date → `/fast-scan?mode=date_only&itemId=...`

### Expiry Alert Actions
When tapping an expiring item:
- **Sold/Finished** → Logs `SOLD_FINISHED` event, marks resolved
- **Thrown** → Logs `THROWN` event, marks as disposed
- **Update Date** → Opens Fast Scan (date-only mode), logs `UPDATED_DATE` event

## Services Created

| Service | Location | Purpose |
|---------|----------|---------|
| `barcodeNameService` | `src/lib/supabase/services/barcodeNameService.ts` | Name resolution with priority order |
| `pendingItemsService` | `src/lib/supabase/services/pendingItemsService.ts` | Supplier intake management |
| `expiryEventsService` | `src/lib/supabase/services/expiryEventsService.ts` | Level B savings tracking |

## Future API Integration

To integrate a real barcode lookup API:

1. Update `supabase/functions/resolve-barcode-name/index.ts`
2. Replace the stub in `resolveBarcodeName()` with actual API call
3. Optionally cache results in `barcode_catalog`

Example APIs:
- Open Food Facts
- UPC Database
- Barcode Lookup

No UI or DB structure changes needed!

