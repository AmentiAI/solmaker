'use client'

import Image from 'next/image'
import { GeneratedOrdinal } from '@/app/collections/[id]/types'

interface CompressionModalProps {
  isOpen: boolean
  ordinal: GeneratedOrdinal | null
  sliderValue: number
  onClose: () => void
  onSliderChange: (value: number) => void
}

export function CompressionModal({ isOpen, ordinal, sliderValue, onClose, onSliderChange }: CompressionModalProps) {
  if (!isOpen || !ordinal) return null

  const hasCompressed = ordinal.compressed_image_url && 
                        ordinal.compressed_image_url !== null && 
                        ordinal.compressed_image_url.trim() !== '' &&
                        ordinal.compressed_image_url !== ordinal.image_url
  const compressedImageUrl = hasCompressed ? ordinal.compressed_image_url! : ordinal.image_url
  const displayNumber = ordinal.ordinal_number !== null && ordinal.ordinal_number !== undefined
    ? ordinal.ordinal_number
    : '?'

  return (
    <div 
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#00d4ff]/30 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">
            {hasCompressed ? `Compression Comparison - NFT #${displayNumber}` : `Image View - NFT #${displayNumber}`}
          </h2>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-2xl font-bold transition-colors"
          >
            ×
          </button>
        </div>
        
        <div className="p-6">
          {/* Large Image Comparison Slider or Single Image View */}
          <div className="relative bg-[#0a0e27] rounded-lg overflow-hidden border border-[#00d4ff]/20" style={{ aspectRatio: '1/1', maxHeight: '80vh' }}>
            <div className="relative w-full h-full">
              {hasCompressed ? (
                <>
                  {/* Compressed Image (Left/Behind) */}
                  <div className="absolute inset-0">
                    <Image
                      src={compressedImageUrl}
                      alt={`Compressed #${displayNumber}`}
                      fill
                      className="object-contain"
                    />
                    <div className="absolute top-4 left-4 bg-green-600/90 text-white text-sm px-3 py-1.5 rounded font-semibold">
                      Compressed
                    </div>
                    {ordinal.compressed_size_kb != null && (
                      <div className="absolute bottom-4 left-4 bg-green-600/90 text-white text-sm px-3 py-1.5 rounded font-semibold">
                        Compressed: {(() => {
                          const size = Number(ordinal.compressed_size_kb)
                          return isNaN(size) ? '0.0' : size.toFixed(1)
                        })()} KB
                      </div>
                    )}
                  </div>
                  
                  {/* Original Image (Right/Front) with clip-path based on slider */}
                  <div 
                    className="absolute inset-0"
                    style={{
                      clipPath: `inset(0 ${100 - sliderValue}% 0 0)`
                    }}
                  >
                    <Image
                      src={ordinal.image_url}
                      alt={`Original #${displayNumber}`}
                      fill
                      className="object-contain"
                    />
                    <div className="absolute top-4 right-4 bg-[#9945FF]/90 text-white text-sm px-3 py-1.5 rounded font-semibold">
                      Original
                    </div>
                    {ordinal.original_size_kb != null && (
                      <div className="absolute bottom-4 right-4 bg-[#9945FF]/90 text-white text-sm px-3 py-1.5 rounded font-semibold">
                        Original: {(() => {
                          const size = Number(ordinal.original_size_kb)
                          return isNaN(size) ? '0.0' : size.toFixed(1)
                        })()} KB
                      </div>
                    )}
                  </div>
                  
                  {/* Slider Handle */}
                  <div
                    className="absolute top-0 bottom-0 w-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-l-4 border-r-4 border-[#00d4ff] cursor-ew-resize z-10 shadow-lg"
                    style={{
                      left: `${sliderValue}%`,
                      transform: 'translateX(-50%)'
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const startX = e.clientX
                      const container = e.currentTarget.parentElement?.parentElement
                      if (!container) return
                      
                      const handleMove = (moveEvent: MouseEvent) => {
                        const rect = container.getBoundingClientRect()
                        const newX = moveEvent.clientX - rect.left
                        const percentage = Math.max(0, Math.min(100, (newX / rect.width) * 100))
                        onSliderChange(percentage)
                      }
                      
                      const handleUp = () => {
                        document.removeEventListener('mousemove', handleMove)
                        document.removeEventListener('mouseup', handleUp)
                      }
                      
                      document.addEventListener('mousemove', handleMove)
                      document.addEventListener('mouseup', handleUp)
                    }}
                  >
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-[#00d4ff] rounded-full border-4 border-[#0a0e27] shadow-lg flex items-center justify-center">
                      <div className="flex gap-1">
                        <div className="w-1 h-3 bg-[#0a0e27]"></div>
                        <div className="w-1 h-3 bg-[#0a0e27]"></div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Labels */}
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#00d4ff]/30 text-white text-base px-4 py-2 rounded flex gap-4 z-20 shadow-lg">
                    <span className={sliderValue < 50 ? 'font-bold text-[#00d4ff]' : 'text-white/70'}>
                      ← Compressed
                    </span>
                    <span className="text-white/40">|</span>
                    <span className={sliderValue >= 50 ? 'font-bold text-[#00d4ff]' : 'text-white/70'}>
                      Original →
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {/* Single Image View (No Compression) */}
                  <div className="absolute inset-0">
                    <Image
                      src={ordinal.image_url}
                      alt={`NFT #${displayNumber}`}
                      fill
                      className="object-contain"
                    />
                    <div className="absolute top-4 left-4 bg-[#9945FF]/90 text-white text-sm px-3 py-1.5 rounded font-semibold">
                      Original Image
                    </div>
                    {ordinal.original_size_kb != null && (
                      <div className="absolute bottom-4 left-4 bg-[#9945FF]/90 text-white text-sm px-3 py-1.5 rounded font-semibold">
                        Size: {(() => {
                          const size = Number(ordinal.original_size_kb)
                          return isNaN(size) ? '0.0' : size.toFixed(1)
                        })()} KB
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

