# Ordinal Generation System

## Overview
A comprehensive system for generating AI-powered ordinal images using the new collection management system. This system integrates with OpenAI's image generation API and uses collection-specific settings to create unique, non-duplicate ordinals.

## Features Implemented

### 1. Database Schema
**Table: `generated_ordinals`**
- `id` - UUID primary key
- `collection_id` - Foreign key to collections table
- `ordinal_number` - Optional ordinal number
- `image_url` - URL to generated image (stored in Vercel Blob)
- `metadata_url` - URL to metadata JSON
- `prompt` - Full AI prompt used for generation
- `traits` - JSONB object storing selected traits for each layer
- `trait_combination_hash` - SHA256 hash for duplicate detection
- `rarity_score` - Optional rarity score
- `rarity_tier` - Optional rarity tier
- `created_at` - Timestamp

**Indexes:**
- `idx_generated_ordinals_collection` - Fast lookups by collection and date
- `idx_generated_ordinals_hash` - Duplicate detection

### 2. API Endpoints

#### POST `/api/collections/[id]/generate`
Generates a new ordinal for the specified collection.

**Features:**
- Randomly selects one trait from each layer
- Creates SHA256 hash of trait combination
- Detects duplicates and returns 409 status for retry
- Builds custom AI prompt using:
  - Collection art style
  - Border requirements
  - Custom rules
  - Trait descriptions from database
- Generates image via OpenAI API (gpt-image-1)
- Uploads to Vercel Blob
- Saves metadata and ordinal to database

**Request Body:**
```json
{
  "ordinal_number": null // optional
}
```

**Response:**
```json
{
  "ordinal": {
    "id": "uuid",
    "collection_id": "uuid",
    "ordinal_number": null,
    "image_url": "https://...",
    "metadata_url": "https://...",
    "traits": {
      "Head": { "name": "...", "description": "..." },
      "Body": { "name": "...", "description": "..." }
    },
    "created_at": "2025-10-25T..."
  }
}
```

#### GET `/api/collections/[id]/ordinals`
Lists all generated ordinals for a collection with pagination and filtering.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)
- `trait_[LayerName]` - Filter by trait name (e.g., `trait_Head=Pumpkin`)

**Response:**
```json
{
  "ordinals": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5
  }
}
```

#### DELETE `/api/collections/[id]/ordinals?ordinal_id=[id]`
Deletes a specific ordinal.

### 3. UI Components

#### Collection Details Page (`/collections/[id]`)
Enhanced with ordinal generation section below the layers section.

**Features:**
- **Generate Button** - Creates new ordinals with automatic retry on duplicates (up to 5 attempts)
- **Trait Filters** - Collapsible filter panel for each layer
- **Ordinal Grid** - 3-column responsive grid displaying generated ordinals
- **Pagination** - Navigate through pages of 10 ordinals
- **Delete Function** - Remove individual ordinals

**UI Elements:**
- Image preview (1024x1024)
- Ordinal number display
- Trait breakdown for each layer
- Creation date
- Delete button

### 4. Prompt Building System

The system builds AI prompts using:

1. **Collection Settings:**
   - Art style (e.g., "pixel art", "hand-drawn")
   - Border requirements (e.g., "thin decorative frame")
   - Custom rules (e.g., "always include shadows")

2. **Trait Information:**
   - Layer name
   - Trait name
   - Trait description
   - Trait prompt (AI-generated context)

3. **Standard Instructions:**
   - Front-facing pose
   - Professional quality
   - Lighting and color specifications
   - Border placement
   - Forbidden elements

**Example Prompt Structure:**
```
FRONT-FACING POSE: Character facing DIRECTLY at viewer...

ART STYLE: [collection.art_style]

COLLECTION: [collection.name]
DESCRIPTION: [collection.description]

ASSIGNED TRAITS:
Head: Pumpkin Crown - A bright orange pumpkin...
Body: Tattered Robes - Dark flowing fabric...

CUSTOM RULES: [collection.custom_rules]

DETAIL: Multiple layers, texture, highlights...

BORDER: [collection.border_requirements]

QUALITY: Professional gallery-quality...
```

### 5. Duplicate Prevention

**Hash-Based System:**
1. Trait IDs are sorted and concatenated
2. SHA256 hash is created
3. Hash is checked against existing ordinals
4. If duplicate found, returns 409 status
5. Frontend automatically retries up to 5 times
6. Alerts user if no unique combination found

**Benefits:**
- Prevents exact duplicate trait combinations
- Saves OpenAI API costs
- Maintains collection uniqueness
- Automatic retry logic

### 6. Cost Optimization

**Trait-Based Approach:**
- Instead of describing every detail in the prompt, we:
  1. Store trait descriptions in database
  2. Reference traits by name in prompt
  3. Use concise trait descriptions
  4. Reuse trait descriptions across ordinals

**Benefits:**
- Shorter prompts = lower OpenAI costs
- Consistent trait rendering
- Easier to maintain and update
- Faster generation times

## Usage Flow

1. **Setup Collection:**
   - Create collection
   - Add layers (Head, Body, Eyes, etc.)
   - Add/generate traits for each layer
   - Set art style, border requirements, custom rules

2. **Generate Ordinals:**
   - Navigate to collection details page
   - Click "Generate New Ordinal" button
   - System randomly selects traits
   - Checks for duplicates
   - Generates image via OpenAI
   - Displays in grid

3. **Filter & Browse:**
   - Use trait filters to find specific combinations
   - Navigate through pages
   - View trait breakdowns
   - Delete unwanted ordinals

## Technical Details

### Dependencies
- `@neondatabase/serverless` - Database connection
- `@vercel/blob` - Image storage
- `crypto` - Hash generation
- `next/image` - Optimized image display

### Environment Variables Required
- `NEON_DATABASE` - Neon database connection string
- `OPENAI_API_KEY` - OpenAI API key
- Vercel Blob credentials (automatic in Vercel)

### Database Migrations
- `005_add_collection_fields.sql` - Adds art_style, border_requirements, custom_rules
- `006_create_generated_ordinals.sql` - Creates generated_ordinals table

## Future Enhancements

Potential improvements:
- Bulk generation (generate multiple at once)
- Rarity calculation based on trait weights
- Export functionality (download all ordinals)
- Trait statistics (most/least common combinations)
- Collection analytics dashboard
- Batch delete functionality
- Advanced filtering (by date, rarity, etc.)
- Ordinal numbering system
- Metadata export for blockchain minting

## Notes

- Maximum 5 retry attempts for duplicate detection
- 10 ordinals per page (configurable)
- Images stored permanently in Vercel Blob
- Metadata stored as JSON in Blob
- Full prompt stored in database for debugging
- Trait combinations are case-sensitive
- Filters use partial matching (LIKE query)

