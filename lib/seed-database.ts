import { sql } from './database'
import { DEFAULT_TRAIT_SELECTIONS } from './collections'

// Seed the database with default collections and trait data
export async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...')

    // Create a default collection with all traits
    const defaultCollection = {
      id: 'default-collection-all-traits',
      name: 'All Traits Collection',
      description: 'Default collection with all available traits',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true,
      trait_selections: DEFAULT_TRAIT_SELECTIONS
    }

    // Insert default collection
    await sql`
      INSERT INTO collections (id, name, description, created_at, updated_at, is_active, trait_selections)
      VALUES (
        ${defaultCollection.id},
        ${defaultCollection.name},
        ${defaultCollection.description},
        ${defaultCollection.created_at},
        ${defaultCollection.updated_at},
        ${defaultCollection.is_active},
        ${JSON.stringify(defaultCollection.trait_selections)}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        updated_at = EXCLUDED.updated_at,
        is_active = EXCLUDED.is_active,
        trait_selections = EXCLUDED.trait_selections
    `

    console.log('✅ Default collection created/updated')

    // Create some example themed collections
    const themedCollections = [
      {
        id: 'skull-collection',
        name: 'Skull Collection',
        description: 'Collection focused on skull-themed characters',
        trait_selections: {
          characterType: { enabled: true, selected: ['skull', 'skeleton'] },
          background: { enabled: true, selected: ['Blood Moon Graveyard', 'Ancient Cemetery', 'Bone Yard', 'Shadow Realm'] },
          accessories: { enabled: true, selected: ['Skull Amulet', 'Bone Earrings', 'Bone Bracelet', 'Coffin Key'] },
          eyes: { enabled: true, selected: ['Hollow Void Eyes', 'Skeleton Black', 'Stitched Shut'] },
          mouth: { enabled: true, selected: ['Skull Grin', 'Skeletal Bite', 'Skeleton Chatter'] },
          headwear: { enabled: true, selected: ['Crown of Bones', 'Skull Cap', 'Skeleton Helmet'] },
          outfits: { enabled: true, selected: ['Skeleton Bones', 'Tattered Robes', 'Lich Robe'] },
          props: { enabled: true, selected: ['Skull Staff', 'Skull Amulet', 'Skeleton Rib', 'Demon Skull'] }
        }
      },
      {
        id: 'vampire-collection',
        name: 'Vampire Collection',
        description: 'Collection focused on vampire-themed characters',
        trait_selections: {
          characterType: { enabled: true, selected: ['vampire'] },
          background: { enabled: true, selected: ['Vampire\'s Castle', 'Haunted Mansion Interior', 'Gothic Tower', 'Cursed Library'] },
          accessories: { enabled: true, selected: ['Silver Stake Necklace', 'Vampire Fangs', 'Ghostly Locket', 'Cursed Ring'] },
          eyes: { enabled: true, selected: ['Vampire Red', 'Bloody Tears', 'Demon Yellow'] },
          mouth: { enabled: true, selected: ['Vampire Fangs', 'Vampire Hiss', 'Demon Snarl'] },
          headwear: { enabled: true, selected: ['Vampire Crown', 'Vampire Cape', 'Cursed Tiara'] },
          outfits: { enabled: true, selected: ['Royal Vampire Attire', 'Vampire Formal', 'Bloody Suit'] },
          props: { enabled: true, selected: ['Vampire Coffin', 'Vampire\'s Cape', 'Bloody Chalice'] }
        }
      },
      {
        id: 'witch-collection',
        name: 'Witch Collection',
        description: 'Collection focused on witch-themed characters',
        trait_selections: {
          characterType: { enabled: true, selected: ['witch'] },
          background: { enabled: true, selected: ['Witch\'s Cauldron Room', 'Spooky Forest Path', 'Misty Swamp', 'Crystal Cave'] },
          accessories: { enabled: true, selected: ['Witch\'s Broom', 'Voodoo Doll', 'Cursed Candle', 'Crystal Pendant'] },
          eyes: { enabled: true, selected: ['Witch Green', 'Runic Eyes', 'Mystic Rune Eyes'] },
          mouth: { enabled: true, selected: ['Witch Laugh', 'Witch Cackle', 'Serpent Tongue'] },
          headwear: { enabled: true, selected: ['Witch Hat', 'Spider Tiara', 'Witch\'s Broom'] },
          outfits: { enabled: true, selected: ['Witch Garb', 'Tattered Robes', 'Lich Robe'] },
          props: { enabled: true, selected: ['Magic Wand', 'Witch\'s Broom', 'Ouija Board', 'Cursed Doll'] }
        }
      },
      {
        id: 'demon-collection',
        name: 'Demon Collection',
        description: 'Collection focused on demon-themed characters',
        trait_selections: {
          characterType: { enabled: true, selected: ['demon'] },
          background: { enabled: true, selected: ['Demon\'s Lair', 'Volcanic Crater', 'Shadow Realm', 'Thunderstorm Sky'] },
          accessories: { enabled: true, selected: ['Demon Horn', 'Demon Skull', 'Cursed Ring', 'Shadow Cloak'] },
          eyes: { enabled: true, selected: ['Demon Yellow', 'Lightning Bolt Eyes', 'Flame Flicker Eyes'] },
          mouth: { enabled: true, selected: ['Demon Snarl', 'Demon Roar', 'Spider Mandibles'] },
          headwear: { enabled: true, selected: ['Demon Horns', 'Demon Spikes', 'Shadow Crown'] },
          outfits: { enabled: true, selected: ['Demon Skin', 'Demon Armor', 'Shadow Form'] },
          props: { enabled: true, selected: ['Demon Skull', 'Demon\'s Tail', 'Bloody Scythe'] }
        }
      }
    ]

    // Insert themed collections
    for (const collection of themedCollections) {
      await sql`
        INSERT INTO collections (id, name, description, created_at, updated_at, is_active, trait_selections)
        VALUES (
          ${collection.id},
          ${collection.name},
          ${collection.description},
          ${new Date().toISOString()},
          ${new Date().toISOString()},
          false,
          ${JSON.stringify(collection.trait_selections)}
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          updated_at = EXCLUDED.updated_at,
          trait_selections = EXCLUDED.trait_selections
      `
    }

    console.log('✅ Themed collections created/updated')

    // Create a traits reference table for easy querying
    await sql`
      CREATE TABLE IF NOT EXISTS trait_categories (
        id SERIAL PRIMARY KEY,
        category TEXT NOT NULL,
        trait_name TEXT NOT NULL,
        description TEXT,
        rarity TEXT DEFAULT 'common',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Insert all trait data
    const traitData = [
      // Character Types
      { category: 'characterType', trait_name: 'skull', description: 'Round skull with bone texture', rarity: 'common' },
      { category: 'characterType', trait_name: 'zombie', description: 'Decaying flesh with greenish-gray skin', rarity: 'common' },
      { category: 'characterType', trait_name: 'ghoul', description: 'Gaunt skeletal face with pale gray skin', rarity: 'common' },
      { category: 'characterType', trait_name: 'werewolf', description: 'Wolf snout with furry face', rarity: 'common' },
      { category: 'characterType', trait_name: 'skeleton', description: 'Complete bone structure with ivory color', rarity: 'common' },
      { category: 'characterType', trait_name: 'vampire', description: 'Pale skin with aristocratic features', rarity: 'common' },
      { category: 'characterType', trait_name: 'witch', description: 'Green skin with pointed chin', rarity: 'common' },
      { category: 'characterType', trait_name: 'demon', description: 'Red/purple skin with pointed horns', rarity: 'common' },
      { category: 'characterType', trait_name: 'mummy', description: 'Aged bandages with ancient appearance', rarity: 'common' },
      { category: 'characterType', trait_name: 'reaper', description: 'Skeletal skull with hooded robe', rarity: 'common' },

      // Backgrounds
      { category: 'background', trait_name: 'Blood Moon Graveyard', description: 'Tombstones glowing under a crimson moon', rarity: 'legendary' },
      { category: 'background', trait_name: 'Haunted Mansion Interior', description: 'Creepy Victorian mansion with cobwebs and dust', rarity: 'epic' },
      { category: 'background', trait_name: 'Spooky Forest Path', description: 'Dark forest with twisted trees and fog', rarity: 'rare' },
      { category: 'background', trait_name: 'Crystal Cave', description: 'Glowing crystal formations in underground cavern', rarity: 'epic' },
      { category: 'background', trait_name: 'Ghost Town Street', description: 'Abandoned western town with tumbleweeds', rarity: 'rare' },
      { category: 'background', trait_name: 'Pumpkin Patch', description: 'Field of glowing jack-o-lanterns', rarity: 'common' },
      { category: 'background', trait_name: 'Ancient Cemetery', description: 'Old graveyard with weathered tombstones', rarity: 'rare' },
      { category: 'background', trait_name: 'Witch\'s Cauldron Room', description: 'Dark room with bubbling cauldron and potions', rarity: 'epic' },
      { category: 'background', trait_name: 'Vampire\'s Castle', description: 'Gothic castle with stone walls and torches', rarity: 'epic' },
      { category: 'background', trait_name: 'Demon\'s Lair', description: 'Hellish cave with lava and flames', rarity: 'legendary' },
      { category: 'background', trait_name: 'Haunt Cloud', description: 'Floating in ethereal clouds with spirits', rarity: 'epic' },
      { category: 'background', trait_name: 'Misty Swamp', description: 'Boggy wetland with hanging moss and fog', rarity: 'rare' },
      { category: 'background', trait_name: 'Bone Yard', description: 'Pile of bones and skulls', rarity: 'rare' },
      { category: 'background', trait_name: 'Shadow Realm', description: 'Dark dimension with floating shadows', rarity: 'legendary' },
      { category: 'background', trait_name: 'Cursed Library', description: 'Ancient library with floating books and dust', rarity: 'epic' },
      { category: 'background', trait_name: 'Abandoned Church', description: 'Derelict church with broken stained glass', rarity: 'rare' },
      { category: 'background', trait_name: 'Gothic Tower', description: 'Tall stone tower with pointed spires', rarity: 'epic' },
      { category: 'background', trait_name: 'Moonlit Garden', description: 'Garden under full moon with glowing flowers', rarity: 'rare' },
      { category: 'background', trait_name: 'Thunderstorm Sky', description: 'Stormy sky with lightning and dark clouds', rarity: 'epic' },
      { category: 'background', trait_name: 'Volcanic Crater', description: 'Active volcano with lava and ash', rarity: 'legendary' }
    ]

    // Insert trait data
    for (const trait of traitData) {
      await sql`
        INSERT INTO trait_categories (category, trait_name, description, rarity)
        VALUES (${trait.category}, ${trait.trait_name}, ${trait.description}, ${trait.rarity})
        ON CONFLICT DO NOTHING
      `
    }

    console.log('✅ Trait data inserted')

    console.log('🎉 Database seeding completed successfully!')
    console.log('📊 Created collections:')
    console.log('   - All Traits Collection (default)')
    console.log('   - Skull Collection')
    console.log('   - Vampire Collection')
    console.log('   - Witch Collection')
    console.log('   - Demon Collection')

  } catch (error) {
    console.error('❌ Error seeding database:', error)
    throw error
  }
}

// Run seeding if called directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('✅ Seeding completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error)
      process.exit(1)
    })
}
