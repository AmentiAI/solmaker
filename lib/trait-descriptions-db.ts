import { getTraitByName } from './database-traits'
 
// Get trait description from database for generation prompt
export async function getTraitDescription(category: string, traitName: string): Promise<string> {
  try {
    const trait = await getTraitByName(category, traitName)
    return trait?.description || `${traitName} trait`
  } catch (error) {
    console.error(`Error getting trait description for ${category}.${traitName}:`, error)
    return `${traitName} trait`
  }
}

// Get all trait descriptions for a set of traits
export async function getTraitDescriptions(traits: Record<string, string>): Promise<Record<string, string>> {
  const descriptions: Record<string, string> = {}
  
  for (const [category, traitName] of Object.entries(traits)) {
    descriptions[category] = await getTraitDescription(category, traitName)
  }
  
  return descriptions
}
 
