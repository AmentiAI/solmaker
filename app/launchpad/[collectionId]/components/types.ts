export interface Phase {
  id: string
  phase_name: string
  start_time: string
  end_time: string | null
  mint_price_lamports: number
  whitelist_only: boolean
  phase_allocation: number | null
  phase_minted: number
  is_active: boolean
  is_completed: boolean
  max_per_wallet: number | null
}

export interface Collection {
  id: string
  name: string
  description?: string
  banner_image_url?: string
  banner_video_url?: string
  mobile_image_url?: string
  audio_url?: string
  video_url?: string
  total_supply: number
  cap_supply?: number | null
  max_supply?: number
  total_minted: number
  available_count: number
  phases: Phase[]
  twitter_url?: string
  discord_url?: string
  telegram_url?: string
  website_url?: string
  avg_ordinal_size_kb?: number // Average ordinal file size for cost estimation
  mint_type?: 'hidden' | 'choices' // Mint type: hidden (random) or choices (paginated selection)
}

export interface WhitelistStatus {
  is_whitelisted: boolean
  allocation?: number
  minted_count?: number
  remaining_allocation?: number
}

export interface UserMintStatus {
  minted_count: number
  max_per_wallet: number
  remaining: number
}

