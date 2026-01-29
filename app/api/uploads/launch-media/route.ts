import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 // 25MB

function getExtensionFromName(name: string) {
  const idx = name.lastIndexOf('.')
  if (idx === -1) return ''
  return name.slice(idx + 1).toLowerCase()
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const collectionId = (formData.get('collectionId') as string | null) ?? undefined
    const kind = (formData.get('kind') as string | null) ?? undefined // banner | mobile | audio | bannerVideo

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (!collectionId) {
      return NextResponse.json({ error: 'collectionId is required' }, { status: 400 })
    }
    if (!kind || !['banner', 'mobile', 'audio', 'bannerVideo'].includes(kind)) {
      return NextResponse.json({ error: 'kind must be one of: banner, mobile, audio, bannerVideo' }, { status: 400 })
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: 'file is empty' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'file is too large (max 25MB)' }, { status: 400 })
    }

    // Basic content-type validation
    const isImage = file.type.startsWith('image/')
    const isAudio = file.type.startsWith('audio/')
    const isVideo = file.type.startsWith('video/')
    if ((kind === 'banner' || kind === 'mobile') && !isImage) {
      return NextResponse.json({ error: 'banner/mobile must be an image' }, { status: 400 })
    }
    if (kind === 'audio' && !isAudio) {
      return NextResponse.json({ error: 'audio must be an audio file' }, { status: 400 })
    }
    if (kind === 'bannerVideo' && !isVideo) {
      return NextResponse.json({ error: 'bannerVideo must be a video file' }, { status: 400 })
    }

    const ext =
      getExtensionFromName(file.name) || (isImage ? 'png' : isAudio ? 'mp3' : isVideo ? 'mp4' : 'bin')
    const safeCollectionId = collectionId.replace(/[^a-zA-Z0-9_-]/g, '_')
    const filename = `launch-media/${safeCollectionId}/${kind}-${Date.now()}.${ext}`

    const upload = await put(filename, file, {
      access: 'public',
      addRandomSuffix: false,
    })

    return NextResponse.json({ url: upload.url })
  } catch (err) {
    console.error('[upload-launch-media] Error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}


