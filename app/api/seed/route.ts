import { NextResponse } from 'next/server'
import { seedDatabase } from '@/lib/seed-database'

export async function POST() {
  try {
    console.log('🌱 Starting database seeding...')
    await seedDatabase()
    
    return NextResponse.json({ 
      success: true, 
      message: 'Database seeded successfully with collections and trait data' 
    })
  } catch (error) {
    console.error('❌ Error seeding database:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to seed database',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
