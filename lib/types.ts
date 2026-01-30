// Type definitions for the NFT generation system
export interface NftTraits {
  characterType: string
  background: string
  accessories: string
  eyes: string
  mouth: string
  headwear: string
  outfits: string
  props: string
}

export interface TraitRarity {
  value: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  weight: number
}
