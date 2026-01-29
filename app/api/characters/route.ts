import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const characters = await sql`
      SELECT * FROM character_types 
      ORDER BY name
    `
    return NextResponse.json({ characters })
  } catch (error) {
    console.error('Error fetching characters:', error)
    return NextResponse.json({ error: 'Failed to fetch characters' }, { status: 500 })
  }
} 

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { name, description } = await request.json()
    
    if (!name || !description) {
      return NextResponse.json(
        { error: 'Missing required fields' }, { status: 400 })
    }

    await sql`
      INSERT INTO character_types (name, description)
      VALUES (${name}, ${description})
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error adding character:', error)
    return NextResponse.json({ error: 'Failed to add character' }, { status: 500 })
  }
}
