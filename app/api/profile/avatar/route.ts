import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB for avatars

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const walletAddress = formData.get('wallet_address') as string | null

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    // Validate file size
    if (file.size <= 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'File is too large (max 5MB)' }, { status: 400 })
    }

    // Generate filename
    const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
    const safeWalletAddress = walletAddress.replace(/[^a-zA-Z0-9]/g, '_')
    const filename = `avatars/${safeWalletAddress}-${Date.now()}.${extension}`

    // Upload to Vercel Blob Storage
    const blob = await put(filename, file, {
      access: 'public',
      addRandomSuffix: false,
    })

    return NextResponse.json({ 
      success: true,
      url: blob.url 
    })
  } catch (error: any) {
    console.error('[avatar-upload] Error:', error)
    return NextResponse.json({ 
      error: 'Upload failed',
      details: error.message 
    }, { status: 500 })
  }
}

