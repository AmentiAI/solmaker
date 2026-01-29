import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('image') as File

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Image size must be less than 10MB' }, { status: 400 })
    }

    // Convert File to Blob
    const arrayBuffer = await file.arrayBuffer()
    const blob = new Blob([arrayBuffer], { type: file.type })

    // Upload to Vercel Blob Storage
    const filename = `promotion-upload-${Date.now()}-${file.name}`
    const uploadedBlob = await put(filename, blob, {
      access: 'public',
      addRandomSuffix: false,
    })

    return NextResponse.json({ imageUrl: uploadedBlob.url })
  } catch (error: any) {
    console.error('[promotion/upload-image] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload image' },
      { status: 500 }
    )
  }
}
