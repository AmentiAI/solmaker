export interface Phase {
  id: string
  phase_name: string
  phase_order: number
  start_time: string
  end_time: string | null
  mint_price_sats: number
  whitelist_only: boolean
  max_per_wallet: number | null
  phase_allocation: number | null
  phase_minted: number
  suggested_fee_rate: number
  is_active: boolean
  is_completed: boolean
  created_at: string
  whitelist_id?: string
  whitelist_name?: string
  whitelist_entries?: number
}

export interface Whitelist {
  id: string
  name: string
  description?: string
  entries_count: number
  created_at: string
}

export interface Collection {
  id: string
  name: string
  description?: string
  wallet_address: string
  launch_status: string
  collection_status?: string
  banner_image_url?: string
  banner_video_url?: string
  mobile_image_url?: string
  audio_url?: string
  video_url?: string
  extend_last_phase: boolean
  total_supply?: number
  total_minted?: number
  twitter_url?: string
  discord_url?: string
  telegram_url?: string
  website_url?: string
  compression_quality?: number
  compression_dimensions?: number
  compression_target_kb?: number
  compression_format?: string
  candy_machine_address?: string
  collection_mint_address?: string
}

export type Step = 1 | 2 | 3 | 4 | 5

