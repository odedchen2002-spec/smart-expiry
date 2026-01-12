# Supplier Intake - Single-Pass AI Flow

## Overview

The supplier intake feature uses a **Single-Pass** approach where one AI call extracts both barcodes and product names from the image.

## Flow

```
1. User uploads image
2. Edge Function calls OpenAI with image
3. AI returns JSON with items (barcode, name, confidence, issues)
4. Server validates barcodes and names
5. Server filters duplicates/conflicts
6. Return processed items to client
```

## AI Response Format

```json
{
  "items": [
    {
      "rowIndex": 0,
      "barcode": "7290011462819",
      "name": "כוסות-סחוג ביתי 200 גרם",
      "confidence": 0.95,
      "issues": []
    },
    {
      "rowIndex": 1,
      "barcode": null,
      "name": "חציל אפוי",
      "confidence": 0.7,
      "issues": ["invalid_barcode"]
    }
  ]
}
```

## Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `rowIndex` | number | Row position in table (0-indexed) |
| `barcode` | string \| null | Barcode digits, or null if not readable |
| `name` | string \| null | Product name, or null if not readable |
| `confidence` | number | OCR confidence 0.0-1.0 |
| `issues` | string[] | Optional issues: `invalid_barcode`, `name_cutoff`, `unclear_photo`, `duplicate_barcode` |

## Server-Side Validations

### Barcode Validation
- Must be digits only
- Valid lengths: 8, 12, 13, or 14 digits
- Israeli barcodes start with 729

### Name Validation
- Minimum 3 characters
- Must contain letters (not just digits)
- Cannot be truncated (ending with `...` or `-`)
- Cannot be placeholder (`unknown`, `n/a`, etc.)

## Duplicate Handling

### Conflicting Barcodes (Same barcode, different names)
- **Action**: Remove ALL rows with this barcode
- **Reason**: Likely OCR error or data entry mistake

### Duplicate Rows (Same barcode and name)
- **Action**: Keep only the first occurrence
- **Reason**: Prevent duplicate entries

## Metrics

```json
{
  "totalItemsReturned": 24,
  "validBarcodesCount": 20,
  "missingNameCount": 2,
  "invalidBarcodeCount": 2,
  "duplicatesRemoved": 5,
  "conflictingBarcodes": 1
}
```

## OpenAI Settings

- **Model**: gpt-4o
- **Temperature**: 0 (deterministic)
- **Max tokens**: 2500
- **Image detail**: high

## Error Handling

- If AI returns invalid JSON, attempt to fix truncated response
- If barcode is invalid, mark `barcodeValid: false`
- If name is invalid, mark `nameValid: false`
- Items with issues go to manual completion screen

