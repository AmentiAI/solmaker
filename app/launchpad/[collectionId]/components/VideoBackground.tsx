'use client'

interface VideoBackgroundProps {
  collectionId: string
}

// Video background disabled for debugging click issues
// To re-enable, restore the original implementation

export function VideoBackground({ collectionId: _collectionId }: VideoBackgroundProps) {
  // Completely disabled - renders nothing to help isolate click-blocking issue
  return null
}

