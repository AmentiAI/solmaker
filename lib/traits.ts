// Import trait descriptions only when needed (server-side)
let getTraitDescriptions: ((traits: Record<string, string>) => Promise<Record<string, string>>) | null = null

// Halloween-themed trait options for generating unique NFTs
export const TRAIT_OPTIONS = {
  characterType: ["skull", "zombie", "ghoul", "werewolf", "skeleton", "vampire", "witch", "demon", "mummy", "reaper"],
  
  // Background/Environment traits
  background: [
    "Blood Moon Graveyard",
    "Haunted Forest Mist", 
    "Cursed Carnival",
    "Abandoned Asylum",
    "Pumpkin Patch Night",
    "Midnight Crypt",
    "Phantom Manor",
    "Spider Cathedral",
    "Cemetery Fog",
    "Vampire Castle",
    "Witch's Swamp",
    "Scarecrow Field",
    "Ritual Circle",
    "Eternal Eclipse",
    "Ghost Town Street",
    "Pumpkin Inferno",
    "Frozen Cemetery",
    "Mirror Realm",
    "Haunt Cloud",
    "Crypt Corridor"
  ],
  
  // Accessories
  accessories: [
    "Silver Stake Necklace",
    "Bloody Chalice",
    "Phantom Chains",
    "Cursed Candle",
    "Bone Earrings",
    "Skull Amulet",
    "Ghost Lantern",
    "Voodoo Doll",
    "Bats' Wing Brooch",
    "Snake Bracelet",
    "Cobweb Veil",
    "Shattered Halo",
    "Grimoire Chain",
    "Raven Feather Charm",
    "Bone Rosary",
    "Pumpkin Pendant",
    "Eyeball Ring",
    "Mirror Shard",
    "Specter's Cloak Clip",
    "Cursed Key"
  ],
  
  // Eyes
  eyes: [
    "Hollow Void Eyes",
    "Glowing Ember Eyes",
    "Ghostly White",
    "Bloody Tears",
    "Possessed Gaze",
    "Catacomb Eyes",
    "Moonlit Silver",
    "Vampire Red",
    "Spectral Blue",
    "Candle Flame",
    "Runic Eyes",
    "Spider Eyes",
    "Stitched Shut",
    "Pumpkin Glow",
    "Void Crack",
    "Lunar Reflection",
    "Ichor Drops",
    "Mirrored Eyes",
    "Fog Eyes",
    "Normal (Fake Human)"
  ],
  
  
  // Mouths/Fangs
  mouth: [
    "Vampire Fangs",
    "Sewn Shut",
    "Skull Grin",
    "Serpent Tongue",
    "Dripping Slime",
    "Ghost Whisper",
    "Pumpkin Maw",
    "Cursed Smile",
    "Broken Jaw",
    "No Mouth",
    "Skeletal Bite",
    "Spider Fangs",
    "Witch Laugh",
    "Zombie Snarl",
    "Demon Roar",
    "Bloody Lips",
    "Mist Breath",
    "Ghostly Echo",
    "Voodoo Stitch",
    "Smile of Lies"
  ],
  
  // Headwear
  headwear: [
    "Witch Hat",
    "Crown of Bones",
    "Pumpkin Crown",
    "Tattered Hood",
    "Bloody Halo",
    "Spider Tiara",
    "Phantom Hood",
    "Skull Helm",
    "Ghost Cap",
    "Raven Feather Hat",
    "Runic Circlet",
    "Pumpkin Stem Hat",
    "Cursed Tiara",
    "Coffin Lid Helm",
    "Lunar Hood",
    "Warlock Hat",
    "Bloody Bandana",
    "Candle Crown",
    "Frozen Halo",
    "Shadow Cap"
  ],
  
  // Outfits/Bodies
  outfits: [
    "Tattered Robes",
    "Bloody Suit",
    "Pumpkin Armor",
    "Lich Robe",
    "Coffin Armor",
    "Gravedigger Coat",
    "Ritual Garb",
    "Victorian Dress",
    "Zombie Overalls",
    "Royal Vampire Attire",
    "Scarecrow Body",
    "Skeleton Frame",
    "Phantom Cloak",
    "Cursed Knight Armor",
    "Witch Robes",
    "Butcher Apron",
    "Shadow Form",
    "Mummy Wraps",
    "Spider Silk Suit",
    "Haunt Guard Armor"
  ],
  
  // Props/Items
  props: [
    "Ouija Board",
    "Bloody Scythe",
    "Pumpkin Lantern",
    "Spellbook",
    "Ghost Jar",
    "Candle Cluster",
    "Broomstick",
    "Cursed Mirror",
    "Skull Staff",
    "Chains of Sin",
    "Bone Dagger",
    "Raven Perch",
    "Spider Lantern",
    "Voodoo Staff",
    "Haunted Music Box",
    "Crystal Orb",
    "Severed Hand",
    "Cursed Doll",
    "Spirit Candle",
    "Broken Clock"
  ]
}

export type NftTraits = {
  characterType: string
  background: string
  accessories: string
  eyes: string
  mouth: string
  headwear: string
  outfits: string
  props: string
}

// Character type rotation to ensure balanced distribution
let characterTypeIndex = 0

export function getRandomTraits(): NftTraits {
  // Rotate through character types to ensure balanced distribution
  const characterType = TRAIT_OPTIONS.characterType[characterTypeIndex % TRAIT_OPTIONS.characterType.length]
  characterTypeIndex++
  
  return {
    characterType,
    background: TRAIT_OPTIONS.background[Math.floor(Math.random() * TRAIT_OPTIONS.background.length)],
    accessories: TRAIT_OPTIONS.accessories[Math.floor(Math.random() * TRAIT_OPTIONS.accessories.length)],
    eyes: TRAIT_OPTIONS.eyes[Math.floor(Math.random() * TRAIT_OPTIONS.eyes.length)],
    mouth: TRAIT_OPTIONS.mouth[Math.floor(Math.random() * TRAIT_OPTIONS.mouth.length)],
    headwear: TRAIT_OPTIONS.headwear[Math.floor(Math.random() * TRAIT_OPTIONS.headwear.length)],
    outfits: TRAIT_OPTIONS.outfits[Math.floor(Math.random() * TRAIT_OPTIONS.outfits.length)],
    props: TRAIT_OPTIONS.props[Math.floor(Math.random() * TRAIT_OPTIONS.props.length)],
  }
}

// Reset character type rotation (useful for testing or new collections)
export function resetCharacterTypeRotation(): void {
  characterTypeIndex = 0
}

// New function that uses pre-selected traits instead of random selection
export async function getPreSelectedTraits(characterType: string): Promise<NftTraits> {
  // Import the trait selector
  const { selectTraitsForCharacter } = await import('./trait-selector')
  return selectTraitsForCharacter(characterType)
}

export async function generatePrompt(traits: NftTraits, seed?: string): Promise<string> {
  const uniqueSeed = seed || `${Date.now()}-${Math.random().toString(36).substring(7)}`

  // Dynamically import trait descriptions only when needed (server-side)
  if (!getTraitDescriptions) {
    try {
      const { getTraitDescriptions: getTraitDescriptionsFn } = await import('./trait-descriptions-db')
      getTraitDescriptions = getTraitDescriptionsFn
    } catch (error) {
      console.warn('Could not load trait descriptions, using fallback')
      getTraitDescriptions = (traits: Record<string, string>) => Promise.resolve({})
    }
  }

  // Get trait descriptions from database
  if (!getTraitDescriptions) {
    throw new Error('getTraitDescriptions not initialized')
  }
  const traitDescriptions = await getTraitDescriptions(traits)

  const characterType = traits.characterType

  const borderStyles = [
    "ornate gothic frame with intricate skull decorations, bone filigree, and swirling baroque patterns in the corners with metallic sheen",
    "spooky frame with detailed spider webs stretching across corners, small spiders with visible legs, and gothic arch details",
    "haunted frame with twisted thorny vines showing individual thorns, creeping ivy leaves with veins, and floral corner ornaments",
    "dark frame with bat silhouettes showing wing membrane detail, gothic arch carvings, and crescent moon corner elements",
    "eerie frame with dripping wax or slime effects, melting ornamental corners with texture, and viscous droplets",
    "occult frame with mystical symbols showing intricate linework, pentagram corner elements with dimensional depth, and runic engravings",
    "graveyard frame with tombstone shapes showing carved text, iron gate corner details with rust texture, and chain decorations",
    "witchy frame with potion bottles showing glass reflections, cauldron corner decorations with bubbling effects, and crystal accents",
    "skeletal frame with ribcage patterns showing bone texture, skull corner ornaments with detailed anatomy, and vertebrae decorations",
    "cursed frame with chains showing individual links, locks with keyholes, and rusty key corner elements with patina",
    "spectral frame with ghostly wisps showing transparency effects, floating candle corners with flame detail, and ethereal glow",
    "vampiric frame with coffin shapes showing wood grain, blood drop corner details with shine, and bat wing decorations",
    "steampunk frame with gears showing teeth and rivets, mechanical corner elements with brass finish, and clockwork details",
    "crystalline frame with faceted gems showing internal reflections, crystal corner formations with color depth, and mineral textures",
  ]

  const randomBorder = borderStyles[Math.floor(Math.random() * borderStyles.length)]

  return `⚠️ SINGLE CHARACTER REQUIREMENT: This image must contain EXACTLY ONE character. NO multiple characters, NO two characters, NO group shots, NO companions, NO sidekicks, NO background characters. ONLY ONE main character/subject in the entire image.

FRONT-FACING POSE: Character facing DIRECTLY at viewer, 0° rotation, both eyes symmetrical, nose/mouth centered, shoulders square. NO tilting/turning.

HYPER-DETAILED professional digital illustration, cute cartoonish spooky Halloween character, 1024x1024 square format.

ART STYLE: Professional vector-like quality, chibi proportions with HUGE head, ENORMOUS eyes (40-50% head size), bold black outlines, portrait composition (head/chest only), spooky but adorable, Day of the Dead influence.

HEAD SIZE & POSITIONING: IDENTICAL head positioning/size across ALL characters (65% height, 55% width), PERFECTLY CENTERED, eyes at 45% down from top, IDENTICAL frame composition.

CHARACTER TYPE: ${characterType}
BASE DESIGNS: SKULL=Round skull/bone texture, ZOMBIE=Decaying flesh/greenish-gray, GHOUL=Gaunt skeletal/pale gray, WEREWOLF=Wolf snout/furry, SKELETON=Complete bone structure/ivory, VAMPIRE=Pale skin/aristocratic, WITCH=Green skin/pointed chin, DEMON=Red-purple skin/horns, MUMMY=Aged bandages/yellowed, REAPER=Skeletal skull/hooded robe.

TRAIT CONSISTENCY: Same traits = IDENTICAL design/color/size/positioning across all characters. NO variation.

CRITICAL TRAIT IDENTICAL REQUIREMENT: When the same trait appears on different characters, it must look EXACTLY THE SAME in design, color, size, and positioning. NO artistic interpretation, NO variation, NO different styles, NO different colors, NO different sizes. If two characters have "Vampire Fangs" - they must look IDENTICAL. If two characters have "Hollow Void Eyes" - they must look IDENTICAL. If two characters have "Bloody Scythe" - they must look IDENTICAL. EVERY instance of the same trait must be pixel-perfect identical.

ASSIGNED TRAITS: 
Type=${characterType} (${traitDescriptions.characterType || traits.characterType})
Background=${traits.background} (${traitDescriptions.background || traits.background})
Accessories=${traits.accessories} (${traitDescriptions.accessories || traits.accessories})
Eyes=${traits.eyes} (${traitDescriptions.eyes || traits.eyes})
Mouth=${traits.mouth} (${traitDescriptions.mouth || traits.mouth})
Headwear=${traits.headwear} (${traitDescriptions.headwear || traits.headwear})
Outfit=${traits.outfits} (${traitDescriptions.outfits || traits.outfits})
Props=${traits.props} (${traitDescriptions.props || traits.props})

TRAIT RENDERING: Each trait must be rendered EXACTLY as specified in the trait descriptions. NO artistic interpretation, NO variation, NO different styles, NO different colors, NO different sizes. Same trait = IDENTICAL appearance every time.

PROPS POSITIONING: ALL PROPS must be held in the RIGHT HAND. NO exceptions. NO left hand, NO both hands, NO floating props. RIGHT HAND ONLY.

DETAIL: HUGE eyes with multiple layers/iris texture/highlights/glow, individual teeth with highlights/shadows, hair strands with flow/tonal values, skin texture (pores/stitches/scales), fabric weave/folds/stitching, accessories with material texture/metallic sheen.

LIGHTING: Multiple sources, dramatic setup, warm key light, cool fill light, rim lighting, atmospheric lighting, magical glow, volumetric effects.

COLORS: Deep saturated Halloween colors, metallic accents, bright glows, rich colored shadows, pure highlights, smooth gradients, high contrast.

BACKGROUND: ${traits.background} with multiple colored lights, moonlight, candle/fire lighting, magical auras, volumetric fog, particle effects, light rays, reflections, depth layering.

BACKGROUND ELEMENTS: 5-10 spooky objects (skulls, bones, cobwebs, candles, tombstones, decay effects) arranged symmetrically around character, varied sizes for depth, clear focal point on character's face.

BORDER: ${randomBorder} - Thin decorative frame (30-50px), intricate corner ornaments (10-20 elements each), material quality rendering, vibrant color accents. PLACEMENT: Outer edge EXACTLY at canvas edge (y=0, y=1024, x=0, x=1024), NO gaps, FULL BLEED.

QUALITY: Professional gallery-quality, clean linework, rich color rendering (4-6 tonal values), intricate details, cohesive composition, professional shading, polished appearance, consistent art style, technical excellence.

TRAIT FORBIDDEN: NO different appearances for same traits, NO artistic interpretation of traits, NO variation in trait design/color/size/positioning, NO different styles for same traits, NO different colors for same traits, NO different sizes for same traits.

Reference seed: ${uniqueSeed}

FINAL: Professional quality, dramatic lighting, maximum color vibrancy, cute aesthetic, intricate detail, cinematic lighting effects, vibrant color palettes, visually stunning with professional-grade illumination.

CRITICAL: ALL CHARACTERS MUST HAVE IDENTICAL HEAD SIZE - NO EXCEPTIONS.`
}

export function getTraitStatistics() {
  // Calculate total combinations excluding characterType (since it's rotated)
  const traitCategories = Object.entries(TRAIT_OPTIONS).filter(([key]) => key !== 'characterType')
  const totalCombinations = traitCategories.reduce((total, [_, options]) => total * options.length, 1)
  
  return {
    totalCombinations,
    categories: traitCategories.length + 1, // +1 for characterType
    optionsPerCategory: Object.entries(TRAIT_OPTIONS).map(([category, options]) => ({
      category,
      count: options.length,
    })),
    characterTypes: TRAIT_OPTIONS.characterType.length,
  }
}
