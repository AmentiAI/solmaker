import type { NftTraits } from "@/lib/traits"
import type { TraitRarity } from "@/lib/trait-generator"

export type Nft = {
  id: string
  number: number
  imageUrl: string
  metadataUrl: string
  traits: NftTraits
  prompt: string
  createdAt: string
  rarityScore?: number
  rarityTier?: TraitRarity
}

/** @deprecated Use Nft from "@/types/nft" instead */
export type Ordinal = Nft
