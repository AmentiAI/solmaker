import { NftTraits } from './traits'
import { sql } from './database'
import { generateTraitsFromDatabase } from './database-traits'

// Collection interface
export interface Collection {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  traitSelections: TraitSelections
  isActive: boolean
}

// Trait selections for a collection
export interface TraitSelections {
  characterType: {
    enabled: boolean
    selected: string[]
  }
  background: {
    enabled: boolean
    selected: string[]
  }
  accessories: {
    enabled: boolean
    selected: string[]
  }
  eyes: {
    enabled: boolean
    selected: string[]
  }
  mouth: {
    enabled: boolean
    selected: string[]
  }
  headwear: {
    enabled: boolean
    selected: string[]
  }
  outfits: {
    enabled: boolean
    selected: string[]
  }
  props: {
    enabled: boolean
    selected: string[]
  }
}

// Default trait selections (all traits available)
export const DEFAULT_TRAIT_SELECTIONS: TraitSelections = {
  characterType: {
    enabled: true,
    selected: ['skull', 'zombie', 'ghoul', 'werewolf', 'skeleton', 'vampire', 'witch', 'demon', 'mummy', 'reaper']
  },
  background: {
    enabled: true,
    selected: ['Blood Moon Graveyard', 'Haunted Mansion Interior', 'Spooky Forest Path', 'Crystal Cave', 'Ghost Town Street', 'Pumpkin Patch', 'Ancient Cemetery', 'Witch\'s Cauldron Room', 'Vampire\'s Castle', 'Demon\'s Lair', 'Haunt Cloud', 'Misty Swamp', 'Bone Yard', 'Shadow Realm', 'Cursed Library', 'Abandoned Church', 'Gothic Tower', 'Moonlit Garden', 'Thunderstorm Sky', 'Volcanic Crater']
  },
  accessories: {
    enabled: true,
    selected: ['Silver Stake Necklace', 'Bloody Chalice', 'Phantom Chains', 'Cursed Candle', 'Bone Earrings', 'Skull Amulet', 'Ghost Lantern', 'Voodoo Doll', 'Raven Feather Charm', 'Crystal Pendant', 'Spider Brooch', 'Bat Wing Clasp', 'Coffin Key', 'Witch\'s Broom', 'Demon Horn', 'Vampire Fangs', 'Ghostly Locket', 'Cursed Ring', 'Bone Bracelet', 'Shadow Cloak']
  },
  eyes: {
    enabled: true,
    selected: ['Hollow Void Eyes', 'Glowing Ember Eyes', 'Ghostly White', 'Bloody Tears', 'Vampire Red', 'Pumpkin Glow', 'Runic Eyes', 'Spider Eyes', 'Stitched Shut', 'Normal (Fake Human)', 'X-Shaped Eyes', 'Crescent Moon Eyes', 'Spiral Hypnotic Eyes', 'Crystal Faceted Eyes', 'Flame Flicker Eyes', 'Lightning Bolt Eyes', 'Star Constellation Eyes', 'Diamond Shard Eyes', 'Mystic Rune Eyes', 'Cosmic Galaxy Eyes']
  },
  mouth: {
    enabled: true,
    selected: ['Vampire Fangs', 'Sewn Shut', 'Skull Grin', 'Serpent Tongue', 'Pumpkin Maw', 'No Mouth', 'Skeletal Bite', 'Witch Laugh', 'Demon Snarl', 'Ghost Whisper', 'Zombie Drool', 'Werewolf Howl', 'Mummy Mumble', 'Reaper Sigh', 'Ghoul Moan', 'Skeleton Chatter', 'Witch Cackle', 'Demon Roar', 'Vampire Hiss', 'Spider Mandibles']
  },
  headwear: {
    enabled: true,
    selected: ['Witch Hat', 'Crown of Bones', 'Pumpkin Crown', 'Bloody Halo', 'Spider Tiara', 'Cursed Tiara', 'Demon Horns', 'Vampire Crown', 'Skull Cap', 'Ghost Veil', 'Werewolf Mane', 'Mummy Bandages', 'Reaper Hood', 'Zombie Scarf', 'Ghoul Mask', 'Skeleton Helmet', 'Witch\'s Broom', 'Demon Spikes', 'Vampire Cape', 'Shadow Crown']
  },
  outfits: {
    enabled: true,
    selected: ['Tattered Robes', 'Bloody Suit', 'Pumpkin Armor', 'Lich Robe', 'Royal Vampire Attire', 'Shadow Form', 'Scarecrow Body', 'Mummy Wraps', 'Demon Skin', 'Phantom Cloak', 'Zombie Rags', 'Werewolf Fur', 'Ghoul Shroud', 'Skeleton Bones', 'Witch Garb', 'Reaper Cloak', 'Vampire Formal', 'Demon Armor', 'Mummy Bandages', 'Ghostly Mist']
  },
  props: {
    enabled: true,
    selected: ['Bloody Scythe', 'Pumpkin Lantern', 'Ghost Jar', 'Skull Staff', 'Ouija Board', 'Cursed Doll', 'Broken Clock', 'Magic Wand', 'Vampire Coffin', 'Demon Skull', 'Zombie Brain', 'Werewolf Claw', 'Ghoul Hand', 'Skeleton Rib', 'Witch\'s Broom', 'Reaper\'s Hood', 'Mummy\'s Bandage', 'Vampire\'s Cape', 'Demon\'s Tail', 'Ghostly Orb']
  }
}

// Create a new collection
export async function createCollection(name: string, description?: string, traitSelections?: Partial<TraitSelections>, walletAddress?: string): Promise<Collection> {
  const id = `collection-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  
  const collection: Collection = {
    id,
    name,
    description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    traitSelections: {
      ...DEFAULT_TRAIT_SELECTIONS,
      ...traitSelections
    },
    isActive: false
  }
  
  await sql`
    INSERT INTO collections (id, name, description, created_at, updated_at, is_active, trait_selections, wallet_address)
    VALUES (${id}, ${name}, ${description || null}, ${collection.createdAt}, ${collection.updatedAt}, false, ${JSON.stringify(collection.traitSelections)}, ${walletAddress || null})
  `
  
  return collection
}

// Get all collections (optionally filtered by wallet address)
export async function getAllCollections(walletAddress?: string): Promise<Collection[]> {
  let rows
  if (walletAddress) {
    rows = await sql`
      SELECT id, name, description, created_at, updated_at, is_active, trait_selections
      FROM collections
      WHERE wallet_address = ${walletAddress}
      ORDER BY created_at DESC
    `
  } else {
    rows = await sql`
      SELECT id, name, description, created_at, updated_at, is_active, trait_selections
      FROM collections
      ORDER BY created_at DESC
    `
  }
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active,
    traitSelections: row.trait_selections
  }))
}

// Get collection by ID
export async function getCollectionById(id: string): Promise<Collection | null> {
  const rows = await sql`
    SELECT id, name, description, created_at, updated_at, is_active, trait_selections
    FROM collections
    WHERE id = ${id}
  `
  
  if (rows.length === 0) return null
  
  const row = rows[0]
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active,
    traitSelections: row.trait_selections
  }
}

// Update collection
export async function updateCollection(id: string, updates: Partial<Collection>): Promise<Collection | null> {
  const updatedAt = new Date().toISOString()
  
  await sql`
    UPDATE collections
    SET name = ${updates.name || ''},
        description = ${updates.description || null},
        updated_at = ${updatedAt},
        is_active = ${updates.isActive || false},
        trait_selections = ${updates.traitSelections ? JSON.stringify(updates.traitSelections) : null}
    WHERE id = ${id}
  `
  
  return getCollectionById(id)
}

// Delete collection
export async function deleteCollection(id: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM collections
    WHERE id = ${id}
  `
  
  return result.rowCount > 0
}

// Set active collection
export async function setActiveCollection(id: string): Promise<boolean> {
  try {
    // Deactivate all collections
    await sql`
      UPDATE collections
      SET is_active = false
    `
    
    // Activate the selected collection
    const result = await sql`
      UPDATE collections
      SET is_active = true
      WHERE id = ${id}
    `
    
    // Check if the collection exists by querying it after update
    const updatedCollection = await sql`
      SELECT id FROM collections WHERE id = ${id} AND is_active = true
    `
    
    return updatedCollection.length > 0
  } catch (error) {
    console.error('Error in setActiveCollection:', error)
    return false
  }
}

// Get active collection
export async function getActiveCollection(): Promise<Collection | null> {
  const rows = await sql`
    SELECT id, name, description, created_at, updated_at, is_active, trait_selections
    FROM collections
    WHERE is_active = true
  `
  
  if (rows.length === 0) return null
  
  const row = rows[0]
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active,
    traitSelections: row.trait_selections
  }
}

// Generate traits for a specific collection using database
export async function generateTraitsForCollection(collectionId: string, ordinalNumber: number): Promise<NftTraits | null> {
  try {
    const generatedTraits = await generateTraitsFromDatabase(collectionId, ordinalNumber)
    return generatedTraits as NftTraits
  } catch (error) {
    console.error('Error generating traits for collection:', error)
    return null
  }
}

// Get available traits for a category
export function getAvailableTraitsForCategory(category: keyof TraitSelections): string[] {
  return DEFAULT_TRAIT_SELECTIONS[category].selected
}

// Validate collection trait selections
export function validateCollectionTraitSelections(traitSelections: TraitSelections): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  Object.entries(traitSelections).forEach(([category, selection]) => {
    if (selection.enabled && selection.selected.length === 0) {
      errors.push(`${category} is enabled but has no traits selected`)
    }
  })
  
  return {
    valid: errors.length === 0,
    errors
  }
}
