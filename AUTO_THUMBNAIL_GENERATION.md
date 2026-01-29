# Auto Thumbnail Generation

## Overview

The system automatically generates thumbnails for **existing ordinals** that don't have them. This happens transparently when users browse the mint page.

## How It Works

### 1. Detection Phase
```typescript
// When mint page loads ordinals
const missing = ordinals.filter(o => !o.thumbnail_url)
console.log(`Found ${missing.length} ordinals without thumbnails`)
```

### 2. Background Generation
```typescript
// Batch API call to generate all missing thumbnails
POST /api/ordinals/batch-thumbnails
{
  "ordinal_ids": ["uuid1", "uuid2", "uuid3"]
}
```

### 3. Processing
For each ordinal:
1. Download original image from blob storage
2. Create 512px JPEG thumbnail (80% quality)
3. Upload thumbnail to blob storage
4. Update database with `thumbnail_url`

### 4. Refresh
```typescript
// After 2 seconds, reload ordinals with new thumbnails
setTimeout(() => loadOrdinals(), 2000)
```

## API Endpoints

### Single Ordinal
**POST** `/api/ordinals/ensure-thumbnail`

```json
{
  "ordinal_id": "uuid"
}
```

**Response:**
```json
{
  "message": "Thumbnail generated successfully",
  "thumbnail_url": "https://...",
  "original_size_kb": 2048,
  "thumbnail_size_kb": 256
}
```

### Batch Processing (Recommended)
**POST** `/api/ordinals/batch-thumbnails`

```json
{
  "ordinal_ids": ["uuid1", "uuid2", "uuid3"]
}
```

**Response:**
```json
{
  "message": "Batch processing complete",
  "total": 20,
  "successful": 18,
  "skipped": 2,
  "failed": 0
}
```

## Performance

### Batch Generation
- **20 ordinals**: ~30-60 seconds
- **Concurrent processing**: All at once
- **Non-blocking**: Page remains usable during generation

### Result
```
Before: 20 ordinals × 2MB = 40 MB
After:  20 ordinals × 250KB = 5 MB
Saved: 35 MB (87.5% reduction)
```

## User Experience

### First Visit (Without Thumbnails)
1. Page loads with original 2MB images
2. Background process starts generating thumbnails
3. Console shows: `[Thumbnail] Found 20 ordinals without thumbnails, generating...`
4. After ~30-60 seconds: `[Thumbnail] Batch complete: 20 generated, 0 skipped, 0 failed`
5. Page auto-refreshes with thumbnails

### Subsequent Visits
1. Page loads with compressed thumbnails
2. Instant fast loading
3. No generation needed

## Code Integration

### Mint Page (`app/mint/[collectionId]/page.tsx`)

```typescript
const loadOrdinals = async () => {
  const response = await fetch(`/api/mint/available-ordinals/${collectionId}`)
  const data = await response.json()
  
  setOrdinals(data.ordinals)
  
  // Automatically generate thumbnails for any missing
  ensureThumbnails(data.ordinals)
}

const ensureThumbnails = async (ordinals: Ordinal[]) => {
  const missing = ordinals.filter(o => !o.thumbnail_url)
  
  if (missing.length === 0) return
  
  // Batch generate all missing thumbnails
  await fetch('/api/ordinals/batch-thumbnails', {
    method: 'POST',
    body: JSON.stringify({ 
      ordinal_ids: missing.map(o => o.id) 
    })
  })
  
  // Reload with new thumbnails
  setTimeout(() => loadOrdinals(), 2000)
}
```

## Backend Processing

### Image Download
```typescript
const imageResponse = await fetch(ordinal.image_url)
const imageBlob = await imageResponse.blob()
```

### Thumbnail Creation
```typescript
import { createThumbnail } from '@/lib/image-optimizer'

const thumbnailBuffer = await createThumbnail(imageBlob, 512, 80)
// Returns optimized JPEG buffer
```

### Upload to Storage
```typescript
import { put } from '@vercel/blob'

const thumbnailBlob = await put(
  `thumbnail-${collectionId}-${ordinalNumber}.jpg`,
  new Blob([new Uint8Array(thumbnailBuffer)], { type: 'image/jpeg' }),
  { access: 'public', contentType: 'image/jpeg' }
)
```

### Database Update
```typescript
await sql`
  UPDATE generated_ordinals
  SET thumbnail_url = ${thumbnailBlob.url}
  WHERE id = ${ordinal_id}
`
```

## Error Handling

### Network Errors
```typescript
try {
  await generateThumbnail(ordinalId)
} catch (error) {
  console.error('Failed to generate thumbnail:', error)
  // Ordinal still displays with original image
}
```

### Missing Original
```typescript
if (!imageResponse.ok) {
  throw new Error('Failed to download original image')
}
```

### Duplicate Prevention
```typescript
// Skip if thumbnail already exists
if (ordinal.thumbnail_url) {
  return { skipped: true }
}
```

## Monitoring

### Console Logs
```
[Thumbnail] Found 20 ordinals without thumbnails, generating...
[Thumbnail Batch] Processing 20 ordinals
[Thumbnail Batch] Ordinal #1: 2048KB → 256KB
[Thumbnail Batch] Ordinal #2: 1920KB → 240KB
...
[Thumbnail] Batch complete: 20 generated, 0 skipped, 0 failed
```

### Database Verification
```sql
-- Check how many ordinals have thumbnails
SELECT 
  COUNT(*) as total,
  COUNT(thumbnail_url) as with_thumbnails,
  COUNT(*) - COUNT(thumbnail_url) as without_thumbnails
FROM generated_ordinals;
```

## Benefits

✅ **Zero manual work** - Automatic generation  
✅ **User-triggered** - Only generates when needed  
✅ **Non-blocking** - Page loads immediately  
✅ **Progressive enhancement** - Works with or without thumbnails  
✅ **One-time cost** - Generated once, used forever  
✅ **Bandwidth savings** - 85-90% reduction  
✅ **Better UX** - Faster loads after first visit  

## Migration Path

### Old Collections
When users visit the mint page for the first time after this update:
1. System detects 0% have thumbnails
2. Generates all thumbnails in background
3. Future visits are instant

### New Collections
All new ordinals automatically include thumbnails from creation.

### Mixed Collections
Handles both old (no thumbnails) and new (with thumbnails) ordinals seamlessly.

## Technical Notes

### Why Background Generation?
- Don't block page load
- User can browse immediately
- Thumbnails generated transparently

### Why Batch Endpoint?
- More efficient than individual calls
- Single database connection
- Parallel processing
- Better error handling

### Why 2-Second Delay?
```typescript
setTimeout(() => loadOrdinals(), 2000)
```
- Gives time for all thumbnails to finish
- Prevents rapid page refreshes
- Better user experience

## Future Enhancements

### Potential Improvements
1. **Progress bar**: Show thumbnail generation progress
2. **Incremental updates**: Update images as they complete
3. **Prioritization**: Generate visible ordinals first
4. **Caching**: CDN caching for thumbnails
5. **WebP support**: Even smaller file sizes

This system makes thumbnail optimization completely transparent to users! 🚀

