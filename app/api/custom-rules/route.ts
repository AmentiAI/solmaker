import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

export async function GET() {
  try {
    const rules = await sql`
      SELECT * FROM custom_rules 
      ORDER BY created_at DESC
    `
    return NextResponse.json({ rules })
  } catch (error) {
    console.error('Error fetching custom rules:', error)
    return NextResponse.json({ error: 'Failed to fetch custom rules' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { type, content } = await request.json()
    
    if (!type || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' }, { status: 400 })
    }

    await sql`
      INSERT INTO custom_rules (type, content, created_at)
      VALUES (${type}, ${content}, NOW())
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error adding custom rule:', error)
    return NextResponse.json({ error: 'Failed to add custom rule' }, { status: 500 })
  }
}
