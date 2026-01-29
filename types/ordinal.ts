import type { OrdinalTraits } from "@/lib/traits"
import type { TraitRarity } from "@/lib/trait-generator"

export type Ordinal = {
  id: string
  number: number
  imageUrl: string
  metadataUrl: string
  traits: OrdinalTraits
  prompt: string
  createdAt: string
  rarityScore?: number
  rarityTier?: TraitRarity
}
