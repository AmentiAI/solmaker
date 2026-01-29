export interface GeneratedOrdinal {
  id: string
  collection_id: string
  ordinal_number: number | null
  image_url: string
  compressed_image_url?: string | null
  thumbnail_url?: string
  metadata_url: string
  prompt: string
  traits: Record<string, { name: string; description: string }>
  created_at: string
  compressed_size_kb?: number | null
  original_size_kb?: number | null
  art_style?: string | null
}

