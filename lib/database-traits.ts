import { sql } from './database'

export interface DatabaseTrait {
  id: number
  category: string
  trait_name: string
  description: string
  rarity: string
  created_at: string
}

export interface TraitSelections {
  characterType: { enabled: boolean; selected: string[] }
  background: { enabled: boolean; selected: string[] }
  accessories: { enabled: boolean; selected: string[] }
  eyes: { enabled: boolean; selected: string[] }
  mouth: { enabled: boolean; selected: string[] }
  headwear: { enabled: boolean; selected: string[] }
  outfits: { enabled: boolean; selected: string[] }
  props: { enabled: boolean; selected: string[] }
}

// Get all traits from database
export async function getAllTraits(): Promise<DatabaseTrait[]> {
  try {
    const traits = await sql`
      SELECT id, category, trait_name, description, rarity, created_at
      FROM trait_categories
      ORDER BY category, trait_name
    `
    return traits as DatabaseTrait[]
  } catch (error) {
    console.error('Error fetching traits from database:', error)
    return []
  }
}

// Get traits by category
export async function getTraitsByCategory(category: string): Promise<DatabaseTrait[]> {
  try {
    const traits = await sql`
      SELECT id, category, trait_name, description, rarity, created_at
      FROM trait_categories
      WHERE category = ${category}
      ORDER BY trait_name
    `
    return traits as DatabaseTrait[]
  } catch (error) {
    console.error(`Error fetching ${category} traits from database:`, error)
    return []
  }
}

// Get all available trait categories
export async function getTraitCategories(): Promise<string[]> {
  try {
    const categories = await sql`
      SELECT DISTINCT category
      FROM trait_categories
      ORDER BY category
    `
    return categories.map(row => row.category)
  } catch (error) {
    console.error('Error fetching trait categories from database:', error)
    return []
  }
}

// Get trait by name and category
export async function getTraitByName(category: string, traitName: string): Promise<DatabaseTrait | null> {
  try {
    const trait = await sql`
      SELECT id, category, trait_name, description, rarity, created_at
      FROM trait_categories
      WHERE category = ${category} AND trait_name = ${traitName}
      LIMIT 1
    `
    return trait[0] as DatabaseTrait || null
  } catch (error) {
    console.error(`Error fetching trait ${traitName} from ${category}:`, error)
    return null
  }
}

// Get traits by rarity
export async function getTraitsByRarity(rarity: string): Promise<DatabaseTrait[]> {
  try {
    const traits = await sql`
      SELECT id, category, trait_name, description, rarity, created_at
      FROM trait_categories
      WHERE rarity = ${rarity}
      ORDER BY category, trait_name
    `
    return traits as DatabaseTrait[]
  } catch (error) {
    console.error(`Error fetching ${rarity} traits from database:`, error)
    return []
  }
}

// Generate random traits from database based on collection settings
export async function generateTraitsFromDatabase(collectionId: string, ordinalNumber: number): Promise<Record<string, unknown>> {
  try {
    // Get the collection
    const collection = await sql`
      SELECT * FROM collections WHERE id = ${collectionId}
    `
    
    if (!collection[0]) {
      throw new Error('Collection not found')
    }

    const traitSelections = collection[0].trait_selections as TraitSelections

    // Generate traits based on collection settings
    const generatedTraits: Record<string, unknown> = {}

    // Character type (rotate through selected types)
    if (traitSelections.characterType.enabled && traitSelections.characterType.selected.length > 0) {
      const characterTypeIndex = ordinalNumber % traitSelections.characterType.selected.length
      generatedTraits.characterType = traitSelections.characterType.selected[characterTypeIndex]
    }

    // Other traits (random selection from enabled categories)
    const categories = ['background', 'accessories', 'eyes', 'mouth', 'headwear', 'outfits', 'props']
    
    for (const category of categories) {
      if (traitSelections[category as keyof TraitSelections].enabled && 
          traitSelections[category as keyof TraitSelections].selected.length > 0) {
        
        const selectedTraits = traitSelections[category as keyof TraitSelections].selected
        const randomIndex = Math.floor(Math.random() * selectedTraits.length)
        generatedTraits[category] = selectedTraits[randomIndex]
      }
    }

    return generatedTraits

  } catch (error) {
    console.error('Error generating traits from database:', error)
    throw error
  }
}

// Get trait statistics from database
export async function getTraitStatistics(): Promise<{
  totalTraits: number
  traitsByCategory: Record<string, number>
  traitsByRarity: Record<string, number>
}> {
  try {
    const totalTraits = await sql`
      SELECT COUNT(*) as count FROM trait_categories
    `

    const traitsByCategory = await sql`
      SELECT category, COUNT(*) as count
      FROM trait_categories
      GROUP BY category
      ORDER BY category
    `

    const traitsByRarity = await sql`
      SELECT rarity, COUNT(*) as count
      FROM trait_categories
      GROUP BY rarity
      ORDER BY rarity
    `

    return {
      totalTraits: totalTraits[0].count,
      traitsByCategory: Object.fromEntries(traitsByCategory.map(row => [row.category, row.count])),
      traitsByRarity: Object.fromEntries(traitsByRarity.map(row => [row.rarity, row.count]))
    }
  } catch (error) {
    console.error('Error getting trait statistics from database:', error)
    return {
      totalTraits: 0,
      traitsByCategory: {},
      traitsByRarity: {}
    }
  }
}
