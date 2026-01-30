import { NftTraits } from './traits'

// All traits from your original list - complete trait pools
export const TRAIT_POOLS = {
  background: [
    'Blood Moon Graveyard',
    'Haunted Mansion Interior',
    'Spooky Forest Path',
    'Crystal Cave',
    'Ghost Town Street',
    'Pumpkin Patch',
    'Ancient Cemetery',
    'Witch\'s Cauldron Room',
    'Vampire\'s Castle',
    'Demon\'s Lair',
    'Haunt Cloud',
    'Misty Swamp',
    'Bone Yard',
    'Shadow Realm',
    'Cursed Library',
    'Abandoned Church',
    'Gothic Tower',
    'Moonlit Garden',
    'Thunderstorm Sky',
    'Volcanic Crater'
  ],
  
  accessories: [
    'Silver Stake Necklace',
    'Bloody Chalice',
    'Phantom Chains',
    'Cursed Candle',
    'Bone Earrings',
    'Skull Amulet',
    'Ghost Lantern',
    'Voodoo Doll',
    'Raven Feather Charm',
    'Crystal Pendant',
    'Spider Brooch',
    'Bat Wing Clasp',
    'Coffin Key',
    'Witch\'s Broom',
    'Demon Horn',
    'Vampire Fangs',
    'Ghostly Locket',
    'Cursed Ring',
    'Bone Bracelet',
    'Shadow Cloak'
  ],
  
  eyes: [
    'Hollow Void Eyes',
    'Glowing Ember Eyes',
    'Ghostly White',
    'Bloody Tears',
    'Vampire Red',
    'Pumpkin Glow',
    'Runic Eyes',
    'Spider Eyes',
    'Stitched Shut',
    'Normal (Fake Human)',
    'X-Shaped Eyes',
    'Crescent Moon Eyes',
    'Spiral Hypnotic Eyes',
    'Crystal Faceted Eyes',
    'Flame Flicker Eyes',
    'Lightning Bolt Eyes',
    'Star Constellation Eyes',
    'Diamond Shard Eyes',
    'Mystic Rune Eyes',
    'Cosmic Galaxy Eyes'
  ],
  
  mouth: [
    'Vampire Fangs',
    'Sewn Shut',
    'Skull Grin',
    'Serpent Tongue',
    'Pumpkin Maw',
    'No Mouth',
    'Skeletal Bite',
    'Witch Laugh',
    'Demon Snarl',
    'Ghost Whisper',
    'Zombie Drool',
    'Werewolf Howl',
    'Mummy Mumble',
    'Reaper Sigh',
    'Ghoul Moan',
    'Skeleton Chatter',
    'Witch Cackle',
    'Demon Roar',
    'Vampire Hiss',
    'Spider Mandibles'
  ],
  
  headwear: [
    'Witch Hat',
    'Crown of Bones',
    'Pumpkin Crown',
    'Bloody Halo',
    'Spider Tiara',
    'Cursed Tiara',
    'Demon Horns',
    'Vampire Crown',
    'Skull Cap',
    'Ghost Veil',
    'Werewolf Mane',
    'Mummy Bandages',
    'Reaper Hood',
    'Zombie Scarf',
    'Ghoul Mask',
    'Skeleton Helmet',
    'Witch\'s Broom',
    'Demon Spikes',
    'Vampire Cape',
    'Shadow Crown'
  ],
  
  outfits: [
    'Tattered Robes',
    'Bloody Suit',
    'Pumpkin Armor',
    'Lich Robe',
    'Royal Vampire Attire',
    'Shadow Form',
    'Scarecrow Body',
    'Mummy Wraps',
    'Demon Skin',
    'Phantom Cloak',
    'Zombie Rags',
    'Werewolf Fur',
    'Ghoul Shroud',
    'Skeleton Bones',
    'Witch Garb',
    'Reaper Cloak',
    'Vampire Formal',
    'Demon Armor',
    'Mummy Bandages',
    'Ghostly Mist'
  ],
  
  props: [
    'Bloody Scythe',
    'Pumpkin Lantern',
    'Ghost Jar',
    'Skull Staff',
    'Ouija Board',
    'Cursed Doll',
    'Broken Clock',
    'Magic Wand',
    'Vampire Coffin',
    'Demon Skull',
    'Zombie Brain',
    'Werewolf Claw',
    'Ghoul Hand',
    'Skeleton Rib',
    'Witch\'s Broom',
    'Reaper\'s Hood',
    'Mummy\'s Bandage',
    'Vampire\'s Cape',
    'Demon\'s Tail',
    'Ghostly Orb'
  ]
}

// Pre-defined trait combinations for specific character types
export const CHARACTER_TRAIT_COMBINATIONS = {
  skull: {
    background: 'Blood Moon Graveyard',
    accessories: 'Skull Amulet',
    eyes: 'Hollow Void Eyes',
    mouth: 'Skull Grin',
    headwear: 'Crown of Bones',
    outfits: 'Tattered Robes',
    props: 'Skull Staff'
  },
  
  zombie: {
    background: 'Haunted Mansion Interior',
    accessories: 'Bone Earrings',
    eyes: 'Glowing Ember Eyes',
    mouth: 'Skeletal Bite',
    headwear: 'Skull Cap',
    outfits: 'Tattered Robes',
    props: 'Broken Clock'
  },
  
  ghoul: {
    background: 'Spooky Forest Path',
    accessories: 'Raven Feather Charm',
    eyes: 'Ghostly White',
    mouth: 'Ghost Whisper',
    headwear: 'Ghost Veil',
    outfits: 'Shadow Form',
    props: 'Ghost Jar'
  },
  
  werewolf: {
    background: 'Crystal Cave',
    accessories: 'Crystal Pendant',
    eyes: 'Vampire Red',
    mouth: 'Demon Snarl',
    headwear: 'Demon Horns',
    outfits: 'Demon Skin',
    props: 'Demon Skull'
  },
  
  skeleton: {
    background: 'Ancient Cemetery',
    accessories: 'Bone Earrings',
    eyes: 'Hollow Void Eyes',
    mouth: 'Skull Grin',
    headwear: 'Crown of Bones',
    outfits: 'Mummy Wraps',
    props: 'Skull Staff'
  },
  
  vampire: {
    background: 'Vampire\'s Castle',
    accessories: 'Silver Stake Necklace',
    eyes: 'Vampire Red',
    mouth: 'Vampire Fangs',
    headwear: 'Vampire Crown',
    outfits: 'Royal Vampire Attire',
    props: 'Vampire Coffin'
  },
  
  witch: {
    background: 'Witch\'s Cauldron Room',
    accessories: 'Voodoo Doll',
    eyes: 'Runic Eyes',
    mouth: 'Witch Laugh',
    headwear: 'Witch Hat',
    outfits: 'Tattered Robes',
    props: 'Magic Wand'
  },
  
  demon: {
    background: 'Demon\'s Lair',
    accessories: 'Cursed Candle',
    eyes: 'Bloody Tears',
    mouth: 'Demon Snarl',
    headwear: 'Demon Horns',
    outfits: 'Demon Skin',
    props: 'Demon Skull'
  },
  
  mummy: {
    background: 'Ancient Cemetery',
    accessories: 'Phantom Chains',
    eyes: 'Stitched Shut',
    mouth: 'No Mouth',
    headwear: 'Cursed Tiara',
    outfits: 'Mummy Wraps',
    props: 'Cursed Doll'
  },
  
  reaper: {
    background: 'Ghost Town Street',
    accessories: 'Ghost Lantern',
    eyes: 'Hollow Void Eyes',
    mouth: 'Ghost Whisper',
    headwear: 'Bloody Halo',
    outfits: 'Phantom Cloak',
    props: 'Bloody Scythe'
  }
}

// System to randomly select traits from curated pools
export function selectTraitsForCharacter(characterType: string): NftTraits {
  // Always randomize from the curated trait pools
  return {
    characterType,
    background: TRAIT_POOLS.background[Math.floor(Math.random() * TRAIT_POOLS.background.length)],
    accessories: TRAIT_POOLS.accessories[Math.floor(Math.random() * TRAIT_POOLS.accessories.length)],
    eyes: TRAIT_POOLS.eyes[Math.floor(Math.random() * TRAIT_POOLS.eyes.length)],
    mouth: TRAIT_POOLS.mouth[Math.floor(Math.random() * TRAIT_POOLS.mouth.length)],
    headwear: TRAIT_POOLS.headwear[Math.floor(Math.random() * TRAIT_POOLS.headwear.length)],
    outfits: TRAIT_POOLS.outfits[Math.floor(Math.random() * TRAIT_POOLS.outfits.length)],
    props: TRAIT_POOLS.props[Math.floor(Math.random() * TRAIT_POOLS.props.length)]
  }
}

// System to create custom trait combinations
export function createCustomTraitCombination(
  characterType: string,
  background?: string,
  accessories?: string,
  eyes?: string,
  mouth?: string,
  headwear?: string,
  outfits?: string,
  props?: string
): NftTraits {
  return {
    characterType,
    background: background || TRAIT_POOLS.background[Math.floor(Math.random() * TRAIT_POOLS.background.length)],
    accessories: accessories || TRAIT_POOLS.accessories[Math.floor(Math.random() * TRAIT_POOLS.accessories.length)],
    eyes: eyes || TRAIT_POOLS.eyes[Math.floor(Math.random() * TRAIT_POOLS.eyes.length)],
    mouth: mouth || TRAIT_POOLS.mouth[Math.floor(Math.random() * TRAIT_POOLS.mouth.length)],
    headwear: headwear || TRAIT_POOLS.headwear[Math.floor(Math.random() * TRAIT_POOLS.headwear.length)],
    outfits: outfits || TRAIT_POOLS.outfits[Math.floor(Math.random() * TRAIT_POOLS.outfits.length)],
    props: props || TRAIT_POOLS.props[Math.floor(Math.random() * TRAIT_POOLS.props.length)]
  }
}

// System to get specific traits for a character type
export function getTraitsForCharacterType(characterType: string) {
  return CHARACTER_TRAIT_COMBINATIONS[characterType as keyof typeof CHARACTER_TRAIT_COMBINATIONS] || null
}

// System to validate trait combinations
export function validateTraitCombination(traits: NftTraits): boolean {
  const requiredFields = ['characterType', 'background', 'accessories', 'eyes', 'mouth', 'headwear', 'outfits', 'props']
  return requiredFields.every(field => traits[field as keyof NftTraits])
}

// System to get available traits for each category (for display/selection)
export function getAvailableTraits() {
  return {
    backgrounds: TRAIT_POOLS.background,
    accessories: TRAIT_POOLS.accessories,
    eyes: TRAIT_POOLS.eyes,
    mouths: TRAIT_POOLS.mouth,
    headwear: TRAIT_POOLS.headwear,
    outfits: TRAIT_POOLS.outfits,
    props: TRAIT_POOLS.props
  }
}

// System to add/remove traits from pools
export function addTraitToPool(category: keyof typeof TRAIT_POOLS, trait: string) {
  if (!TRAIT_POOLS[category].includes(trait)) {
    TRAIT_POOLS[category].push(trait)
  }
}

export function removeTraitFromPool(category: keyof typeof TRAIT_POOLS, trait: string) {
  const index = TRAIT_POOLS[category].indexOf(trait)
  if (index > -1) {
    TRAIT_POOLS[category].splice(index, 1)
  }
}
