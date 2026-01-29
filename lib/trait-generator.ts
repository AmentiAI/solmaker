import { TRAIT_OPTIONS, type OrdinalTraits } from "./traits"

/**
 * Advanced trait generator with rarity system
 */

export type TraitRarity = "common" | "rare" | "epic" | "legendary"

export interface TraitWithRarity {
  value: string
  rarity: TraitRarity
  weight: number
}

export interface TraitCategory {
  [key: string]: TraitWithRarity[]
}

export const TRAIT_RARITIES: Record<keyof OrdinalTraits, TraitWithRarity[]> = {
  characterType: TRAIT_OPTIONS.characterType.map((type) => ({
    value: type,
    rarity: "common" as TraitRarity,
    weight: 10, // Equal weight since we rotate through them
  })),
  background: [
    { value: "Blood Moon Graveyard", rarity: "legendary", weight: 2 },
    { value: "Haunted Forest Mist", rarity: "epic", weight: 15 },
    { value: "Cursed Carnival", rarity: "rare", weight: 25 },
    { value: "Abandoned Asylum", rarity: "epic", weight: 15 },
    { value: "Pumpkin Patch Night", rarity: "common", weight: 40 },
    { value: "Midnight Crypt", rarity: "rare", weight: 25 },
    { value: "Phantom Manor", rarity: "epic", weight: 15 },
    { value: "Spider Cathedral", rarity: "legendary", weight: 2 },
    { value: "Cemetery Fog", rarity: "common", weight: 40 },
    { value: "Vampire Castle", rarity: "epic", weight: 15 },
    { value: "Witch's Swamp", rarity: "rare", weight: 25 },
    { value: "Scarecrow Field", rarity: "common", weight: 40 },
    { value: "Ritual Circle", rarity: "epic", weight: 15 },
    { value: "Eternal Eclipse", rarity: "legendary", weight: 2 },
    { value: "Ghost Town Street", rarity: "common", weight: 40 },
    { value: "Pumpkin Inferno", rarity: "rare", weight: 25 },
    { value: "Frozen Cemetery", rarity: "epic", weight: 15 },
    { value: "Mirror Realm", rarity: "legendary", weight: 2 },
    { value: "Haunt Cloud", rarity: "rare", weight: 25 },
    { value: "Crypt Corridor", rarity: "common", weight: 40 },
  ],
  accessories: [
    { value: "Silver Stake Necklace", rarity: "rare", weight: 25 },
    { value: "Bloody Chalice", rarity: "epic", weight: 15 },
    { value: "Phantom Chains", rarity: "legendary", weight: 2 },
    { value: "Cursed Candle", rarity: "epic", weight: 15 },
    { value: "Bone Earrings", rarity: "rare", weight: 25 },
    { value: "Skull Amulet", rarity: "common", weight: 40 },
    { value: "Ghost Lantern", rarity: "legendary", weight: 2 },
    { value: "Voodoo Doll", rarity: "epic", weight: 15 },
    { value: "Bats' Wing Brooch", rarity: "rare", weight: 25 },
    { value: "Snake Bracelet", rarity: "epic", weight: 15 },
    { value: "Cobweb Veil", rarity: "common", weight: 40 },
    { value: "Shattered Halo", rarity: "legendary", weight: 2 },
    { value: "Grimoire Chain", rarity: "rare", weight: 25 },
    { value: "Raven Feather Charm", rarity: "common", weight: 40 },
    { value: "Bone Rosary", rarity: "epic", weight: 15 },
    { value: "Pumpkin Pendant", rarity: "common", weight: 40 },
    { value: "Eyeball Ring", rarity: "rare", weight: 25 },
    { value: "Mirror Shard", rarity: "epic", weight: 15 },
    { value: "Specter's Cloak Clip", rarity: "legendary", weight: 2 },
    { value: "Cursed Key", rarity: "common", weight: 40 },
  ],
  eyes: [
    { value: "Hollow Void Eyes", rarity: "legendary", weight: 2 },
    { value: "Glowing Ember Eyes", rarity: "epic", weight: 15 },
    { value: "Ghostly White", rarity: "common", weight: 40 },
    { value: "Bloody Tears", rarity: "rare", weight: 25 },
    { value: "Possessed Gaze", rarity: "epic", weight: 15 },
    { value: "Catacomb Eyes", rarity: "rare", weight: 25 },
    { value: "Moonlit Silver", rarity: "common", weight: 40 },
    { value: "Vampire Red", rarity: "common", weight: 40 },
    { value: "Spectral Blue", rarity: "rare", weight: 25 },
    { value: "Candle Flame", rarity: "epic", weight: 15 },
    { value: "Runic Eyes", rarity: "legendary", weight: 2 },
    { value: "Spider Eyes", rarity: "rare", weight: 25 },
    { value: "Stitched Shut", rarity: "epic", weight: 15 },
    { value: "Pumpkin Glow", rarity: "common", weight: 40 },
    { value: "Void Crack", rarity: "legendary", weight: 2 },
    { value: "Lunar Reflection", rarity: "epic", weight: 15 },
    { value: "Ichor Drops", rarity: "rare", weight: 25 },
    { value: "Mirrored Eyes", rarity: "legendary", weight: 2 },
    { value: "Fog Eyes", rarity: "rare", weight: 25 },
    { value: "Normal (Fake Human)", rarity: "common", weight: 40 },
  ],
  mouth: [
    { value: "Vampire Fangs", rarity: "common", weight: 40 },
    { value: "Sewn Shut", rarity: "epic", weight: 15 },
    { value: "Skull Grin", rarity: "rare", weight: 25 },
    { value: "Serpent Tongue", rarity: "rare", weight: 25 },
    { value: "Dripping Slime", rarity: "epic", weight: 15 },
    { value: "Ghost Whisper", rarity: "common", weight: 40 },
    { value: "Pumpkin Maw", rarity: "epic", weight: 15 },
    { value: "Cursed Smile", rarity: "legendary", weight: 2 },
    { value: "Broken Jaw", rarity: "rare", weight: 25 },
    { value: "No Mouth", rarity: "legendary", weight: 2 },
    { value: "Skeletal Bite", rarity: "common", weight: 40 },
    { value: "Spider Fangs", rarity: "rare", weight: 25 },
    { value: "Witch Laugh", rarity: "common", weight: 40 },
    { value: "Zombie Snarl", rarity: "common", weight: 40 },
    { value: "Demon Roar", rarity: "epic", weight: 15 },
    { value: "Bloody Lips", rarity: "rare", weight: 25 },
    { value: "Mist Breath", rarity: "common", weight: 40 },
    { value: "Ghostly Echo", rarity: "epic", weight: 15 },
    { value: "Voodoo Stitch", rarity: "legendary", weight: 2 },
    { value: "Smile of Lies", rarity: "epic", weight: 15 },
  ],
  headwear: [
    { value: "Witch Hat", rarity: "common", weight: 40 },
    { value: "Crown of Bones", rarity: "legendary", weight: 2 },
    { value: "Pumpkin Crown", rarity: "rare", weight: 25 },
    { value: "Tattered Hood", rarity: "common", weight: 40 },
    { value: "Bloody Halo", rarity: "epic", weight: 15 },
    { value: "Spider Tiara", rarity: "rare", weight: 25 },
    { value: "Phantom Hood", rarity: "epic", weight: 15 },
    { value: "Skull Helm", rarity: "rare", weight: 25 },
    { value: "Ghost Cap", rarity: "common", weight: 40 },
    { value: "Raven Feather Hat", rarity: "rare", weight: 25 },
    { value: "Runic Circlet", rarity: "epic", weight: 15 },
    { value: "Pumpkin Stem Hat", rarity: "common", weight: 40 },
    { value: "Cursed Tiara", rarity: "legendary", weight: 2 },
    { value: "Coffin Lid Helm", rarity: "epic", weight: 15 },
    { value: "Lunar Hood", rarity: "rare", weight: 25 },
    { value: "Warlock Hat", rarity: "epic", weight: 15 },
    { value: "Bloody Bandana", rarity: "common", weight: 40 },
    { value: "Candle Crown", rarity: "legendary", weight: 2 },
    { value: "Frozen Halo", rarity: "epic", weight: 15 },
    { value: "Shadow Cap", rarity: "rare", weight: 25 },
  ],
  outfits: [
    { value: "Tattered Robes", rarity: "common", weight: 40 },
    { value: "Bloody Suit", rarity: "rare", weight: 25 },
    { value: "Pumpkin Armor", rarity: "epic", weight: 15 },
    { value: "Lich Robe", rarity: "legendary", weight: 2 },
    { value: "Coffin Armor", rarity: "epic", weight: 15 },
    { value: "Gravedigger Coat", rarity: "common", weight: 40 },
    { value: "Ritual Garb", rarity: "rare", weight: 25 },
    { value: "Victorian Dress", rarity: "epic", weight: 15 },
    { value: "Zombie Overalls", rarity: "common", weight: 40 },
    { value: "Royal Vampire Attire", rarity: "legendary", weight: 2 },
    { value: "Scarecrow Body", rarity: "common", weight: 40 },
    { value: "Skeleton Frame", rarity: "common", weight: 40 },
    { value: "Phantom Cloak", rarity: "epic", weight: 15 },
    { value: "Cursed Knight Armor", rarity: "legendary", weight: 2 },
    { value: "Witch Robes", rarity: "rare", weight: 25 },
    { value: "Butcher Apron", rarity: "rare", weight: 25 },
    { value: "Shadow Form", rarity: "legendary", weight: 2 },
    { value: "Mummy Wraps", rarity: "common", weight: 40 },
    { value: "Spider Silk Suit", rarity: "epic", weight: 15 },
    { value: "Haunt Guard Armor", rarity: "epic", weight: 15 },
  ],
  props: [
    { value: "Ouija Board", rarity: "epic", weight: 15 },
    { value: "Bloody Scythe", rarity: "legendary", weight: 2 },
    { value: "Pumpkin Lantern", rarity: "common", weight: 40 },
    { value: "Spellbook", rarity: "epic", weight: 15 },
    { value: "Ghost Jar", rarity: "legendary", weight: 2 },
    { value: "Candle Cluster", rarity: "common", weight: 40 },
    { value: "Broomstick", rarity: "common", weight: 40 },
    { value: "Cursed Mirror", rarity: "epic", weight: 15 },
    { value: "Skull Staff", rarity: "rare", weight: 25 },
    { value: "Chains of Sin", rarity: "rare", weight: 25 },
    { value: "Bone Dagger", rarity: "rare", weight: 25 },
    { value: "Raven Perch", rarity: "epic", weight: 15 },
    { value: "Spider Lantern", rarity: "rare", weight: 25 },
    { value: "Voodoo Staff", rarity: "epic", weight: 15 },
    { value: "Haunted Music Box", rarity: "rare", weight: 25 },
    { value: "Crystal Orb", rarity: "epic", weight: 15 },
    { value: "Severed Hand", rarity: "legendary", weight: 2 },
    { value: "Cursed Doll", rarity: "rare", weight: 25 },
    { value: "Spirit Candle", rarity: "epic", weight: 15 },
    { value: "Broken Clock", rarity: "common", weight: 40 },
  ],
}

/**
 * Weighted random selection based on rarity
 */
function selectWeightedRandom(traits: TraitWithRarity[]): string {
  const totalWeight = traits.reduce((sum, trait) => sum + trait.weight, 0)
  let random: number
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const array = new Uint32Array(1)
    crypto.getRandomValues(array)
    random = (array[0] / 0xffffffff) * totalWeight
  } else {
    random = Math.random() * totalWeight
  }

  for (const trait of traits) {
    random -= trait.weight
    if (random <= 0) {
      return trait.value
    }
  }

  return traits[traits.length - 1].value
}

/**
 * Generate traits with rarity-based weighting
 */
export function generateWeightedTraits(): OrdinalTraits {
  return {
    characterType: selectWeightedRandom(TRAIT_RARITIES.characterType),
    background: selectWeightedRandom(TRAIT_RARITIES.background),
    accessories: selectWeightedRandom(TRAIT_RARITIES.accessories),
    eyes: selectWeightedRandom(TRAIT_RARITIES.eyes),
    mouth: selectWeightedRandom(TRAIT_RARITIES.mouth),
    headwear: selectWeightedRandom(TRAIT_RARITIES.headwear),
    outfits: selectWeightedRandom(TRAIT_RARITIES.outfits),
    props: selectWeightedRandom(TRAIT_RARITIES.props),
  }
}

/**
 * Get rarity for a specific trait value
 */
export function getTraitRarity(category: keyof OrdinalTraits, value: string): TraitRarity {
  const traitCategory = TRAIT_RARITIES[category]
  if (!traitCategory) {
    console.warn(`Trait category '${category}' not found in TRAIT_RARITIES`)
    return "common"
  }
  const trait = traitCategory.find((t) => t.value === value)
  return trait?.rarity || "common"
}

/**
 * Calculate overall rarity score for an ordinal
 */
export function calculateRarityScore(traits: OrdinalTraits): number {
  const rarityScores: Record<TraitRarity, number> = {
    common: 1,
    rare: 2,
    epic: 3,
    legendary: 5,
  }

  let totalScore = 0
  for (const [category, value] of Object.entries(traits)) {
    const rarity = getTraitRarity(category as keyof OrdinalTraits, value)
    totalScore += rarityScores[rarity]
  }

  return totalScore
}

/**
 * Get overall rarity tier based on score
 */
export function getRarityTier(score: number): TraitRarity {
  if (score >= 20) return "legendary"
  if (score >= 15) return "epic"
  if (score >= 10) return "rare"
  return "common"
}

/**
 * Get all possible trait combinations count
 */
export function getTotalCombinations(): number {
  return Object.values(TRAIT_OPTIONS).reduce((total, options) => total * options.length, 1)
}

/**
 * Validate if traits are valid
 */
export function validateTraits(traits: OrdinalTraits): boolean {
  return (
    TRAIT_OPTIONS.characterType.includes(traits.characterType) &&
    TRAIT_OPTIONS.background.includes(traits.background) &&
    TRAIT_OPTIONS.accessories.includes(traits.accessories) &&
    TRAIT_OPTIONS.eyes.includes(traits.eyes) &&
    TRAIT_OPTIONS.mouth.includes(traits.mouth) &&
    TRAIT_OPTIONS.headwear.includes(traits.headwear) &&
    TRAIT_OPTIONS.outfits.includes(traits.outfits) &&
    TRAIT_OPTIONS.props.includes(traits.props)
  )
}
