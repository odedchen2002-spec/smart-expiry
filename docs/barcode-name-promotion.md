# Smart Global Barcode Name Promotion

## Overview

Global barcode names are automatically promoted to the shared catalog after **10 distinct stores** suggest the same normalized name **within the same locale**.

This ensures that product names are crowd-sourced accurately while preventing:
- Single-store bias or spam
- Cross-locale contamination (Hebrew stores won't affect English names)
- Low-quality or invalid names

## How It Works

### 1. User Suggestions

When a user enters a product name for a barcode, it's saved to `barcode_name_suggestions` with:
- `barcode`: The product barcode
- `locale`: The user's app locale (e.g., 'he', 'en')
- `suggested_name`: The exact name the user entered
- `normalized_name`: Auto-computed normalized version for comparison
- `store_id`: The user's store ID

### 2. Normalization Rules

Names are normalized before comparison:
- Trim whitespace
- Convert to lowercase
- Collapse multiple spaces to single space
- Remove punctuation: `- / . , ; : ! ? ( ) ' " [ ] { }`

**Example:**
```
"Coca-Cola Zero 330ml" → "coca cola zero 330ml"
"  COCA COLA  Zero  " → "coca cola zero"
```

### 3. Promotion Logic

The `promote-barcode-names` Edge Function runs every 6 hours and:

1. **Groups suggestions** by `(barcode, locale, normalized_name)`
2. **Counts distinct stores** per group
3. **Filters groups** where count >= 10
4. **Picks winner**: For each (barcode, locale), selects only the group with the **highest distinct_stores** count. Ties are broken by `suggestion_count`.
5. **Chooses display name**: Most frequent exact `suggested_name` within the winning group
6. **Upserts to catalog**: Updates `barcode_catalog` with:
   - `source = 'mixed'` (indicates crowd-sourced)
   - `confidence_score` = 0.5 + (store_count / 100), capped at 1.0

**Example**: If barcode `7290000001` has 20 stores suggesting "חלב" and 40 stores suggesting "חלב תנובה", only "חלב תנובה" (the larger group) will be promoted.

### 4. Safety Rules

Names are skipped if:
- Length < 3 characters
- Contains only digits and spaces
- `barcode` or `locale` is null/empty

### 5. No Cross-Locale Promotion

Each locale is completely independent:
- Hebrew stores (locale='he') only affect Hebrew global names
- English stores (locale='en') only affect English global names
- A barcode can have different names in different locales

## Database Schema

### barcode_name_suggestions

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| barcode | TEXT | Product barcode |
| suggested_name | TEXT | User's exact input |
| normalized_name | TEXT | Auto-computed, for comparison |
| locale | TEXT | User's locale (NOT NULL) |
| store_id | UUID | Suggesting store |
| created_at | TIMESTAMPTZ | Timestamp |

**Unique Constraint:** `(store_id, barcode, locale, normalized_name)` - prevents duplicate suggestions from same store.

### barcode_catalog

| Column | Type | Description |
|--------|------|-------------|
| barcode | TEXT | Product barcode |
| locale | TEXT | Locale (NULL = fallback) |
| name | TEXT | Display name |
| source | TEXT | 'api', 'stub', 'user', 'mixed' |
| confidence_score | NUMERIC | 0.0 - 1.0 |
| updated_at | TIMESTAMPTZ | Last update |

**Unique Constraint:** `(barcode, locale)` - one name per barcode per locale.

## Name Resolution Order

When looking up a barcode name, the app uses this priority:

1. **Store Override** (`store_barcode_overrides`) - Custom name set by the store
2. **Catalog Same Locale** (`barcode_catalog WHERE locale = user_locale`) 
3. **Catalog Fallback** (`barcode_catalog WHERE locale IS NULL`)
4. **External API** (Open Food Facts)
5. **Not Found** - User must enter manually

## Scheduling

The promotion function runs via pg_cron:
- **Schedule:** Every 6 hours (0:00, 6:00, 12:00, 18:00 UTC)
- **Max per run:** 500 promotions
- **Job name:** `promote-barcode-names`

## Monitoring

Logs are available in Supabase Edge Function logs:

```
[promote] Starting barcode name promotion run...
[promote] Config: MIN_STORES=10, MAX_PER_RUN=500
[promote] Found 15 promotion candidates
[promote] PROMOTED: barcode=7290000000001, locale=he, name="חלב תנובה 3%", stores=12
[promote] Skipping unsafe name: barcode=123, locale=en, name="ab"
[promote] Promotion run complete: promoted=10, skipped=3, errors=2
```

## Manual Trigger

The function can be triggered manually via HTTP:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/promote-barcode-names \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Configuration

Constants in `promote-barcode-names/index.ts`:

```typescript
const MIN_STORES_FOR_PROMOTION = 10;  // Minimum distinct stores required
const MAX_PROMOTIONS_PER_RUN = 500;   // Limit per execution
const MIN_NAME_LENGTH = 3;            // Minimum name length
```

## Rollback

To disable automatic promotion:

```sql
SELECT cron.unschedule('promote-barcode-names');
```

To re-enable:
```sql
SELECT cron.schedule(
    'promote-barcode-names',
    '0 */6 * * *',
    -- ... (see migration file for full SQL)
);
```

