'use client'

import Image from 'next/image'
import { GeneratedOrdinal } from '../types'
import { toast } from 'sonner'

interface OrdinalCardProps {
  ordinal: GeneratedOrdinal
  displayNumber: number
  imageSliders: Record<string, number>
  setImageSliders: React.Dispatch<React.SetStateAction<Record<string, number>>>
  expandedTraits: Record<string, boolean>
  setExpandedTraits: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  showPromptId: string | null
  setShowPromptId: (id: string | null) => void
  flippingOrdinal: string | null
  onDownload: (ordinal: GeneratedOrdinal) => void
  onDelete: (id: string) => void
  onFlip: (id: string) => void
  onShowCompression: (ordinal: GeneratedOrdinal) => void
  collectionArtStyle?: string | null
}

export function OrdinalCard({
  ordinal,
  displayNumber,
  imageSliders,
  setImageSliders,
  expandedTraits,
  setExpandedTraits,
  showPromptId,
  setShowPromptId,
  flippingOrdinal,
  onDownload,
  onDelete,
  onFlip,
  onShowCompression,
  collectionArtStyle,
}: OrdinalCardProps) {
  const hasCompressed = ordinal.compressed_image_url && 
    ordinal.compressed_image_url !== null && 
    ordinal.compressed_image_url.trim() !== '' &&
    ordinal.compressed_image_url !== ordinal.image_url
  const compressedImageUrl = hasCompressed ? ordinal.compressed_image_url! : ordinal.image_url
  
  // Use ordinal's art_style if available, otherwise fall back to collection's art_style
  const artStyle = ordinal.art_style || collectionArtStyle

  return (
    <div className="border border-gray-200 bg-[#FDFCFA] rounded-lg overflow-hidden">
      {artStyle && (
        <div className="px-3 py-2 bg-gradient-to-r from-orange-50 to-blue-50 border-b border-gray-200">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-0.5">Art Style</div>
          <div className="text-sm text-gray-900 font-medium truncate" title={artStyle}>
            {artStyle}
          </div>
        </div>
      )}
      <div className="relative aspect-square bg-gray-100 overflow-hidden">
        <div className="relative w-full h-full">
          <div className="absolute inset-0">
            <Image src={compressedImageUrl} alt={`Compressed #${displayNumber}`} fill className="object-cover" />
            <div className={`absolute top-1 left-1 ${hasCompressed ? 'bg-green-600/90' : 'bg-yellow-600/90'} text-white text-[8px] px-1 py-0.5 rounded font-semibold`}>
              {hasCompressed ? 'Compressed' : 'Original Only'}
            </div>
          </div>
          <div 
            className="absolute inset-0"
            style={{ clipPath: `inset(0 ${100 - (imageSliders[ordinal.id] ?? 50)}% 0 0)` }}
          >
            <Image src={ordinal.image_url} alt={`Original #${displayNumber}`} fill className="object-cover" />
            <div className="absolute top-1 right-1 bg-blue-600/90 text-white text-[8px] px-1 py-0.5 rounded font-semibold">
              Original
            </div>
          </div>
          <div
            className="absolute top-0 bottom-0 w-1 bg-[#FDFCFA] border-l-2 border-r-2 border-blue-500 cursor-ew-resize z-10 shadow-lg"
            style={{ left: `${imageSliders[ordinal.id] ?? 50}%`, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => {
              e.preventDefault()
              const container = e.currentTarget.parentElement
              if (!container) return
              const handleMove = (moveEvent: MouseEvent) => {
                const rect = container.getBoundingClientRect()
                const newX = moveEvent.clientX - rect.left
                const percentage = Math.max(0, Math.min(100, (newX / rect.width) * 100))
                setImageSliders(prev => ({ ...prev, [ordinal.id]: percentage }))
              }
              const handleUp = () => {
                document.removeEventListener('mousemove', handleMove)
                document.removeEventListener('mouseup', handleUp)
              }
              document.addEventListener('mousemove', handleMove)
              document.addEventListener('mouseup', handleUp)
            }}
          >
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-blue-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
              <div className="flex gap-0.5">
                <div className="w-0.5 h-2 bg-[#FDFCFA]"></div>
                <div className="w-0.5 h-2 bg-[#FDFCFA]"></div>
              </div>
            </div>
          </div>
        </div>
        {/* KB File Size Display */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between items-center px-2 py-1 bg-black/60 text-white text-[8px] sm:text-[10px] font-semibold">
          <div className="flex items-center gap-1">
            <span className="text-blue-300">Original:</span>
            <span>{ordinal.original_size_kb != null ? `${Number(ordinal.original_size_kb).toFixed(1)} KB` : '—'}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-green-300">Compressed:</span>
            <span>{ordinal.compressed_size_kb != null ? `${Number(ordinal.compressed_size_kb).toFixed(1)} KB` : '—'}</span>
          </div>
        </div>
      </div>
      <div className="p-1.5 sm:p-2">
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-semibold text-[10px] sm:text-xs text-gray-900 truncate flex-1 mr-1">
            #{displayNumber}
          </h3>
          <div className="flex gap-0.5 sm:gap-1 flex-shrink-0">
            <button onClick={() => onDownload(ordinal)} className="text-green-700 hover:text-green-800 text-[10px] sm:text-xs p-0.5" title="Download">
              ⬇
            </button>
            <button onClick={() => onDelete(ordinal.id)} className="text-red-700 hover:text-red-800 text-[10px] sm:text-xs p-0.5" title="Delete">
              Del
            </button>
          </div>
        </div>
        <button onClick={() => onShowCompression(ordinal)} className="w-full mb-1.5 px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-[10px] sm:text-xs rounded transition-colors text-center">
          🖼️ {hasCompressed ? 'Compare Compression' : 'View Image'}
        </button>
        <button onClick={() => onFlip(ordinal.id)} disabled={flippingOrdinal === ordinal.id} className="w-full mb-1.5 px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[10px] sm:text-xs rounded transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed">
          {flippingOrdinal === ordinal.id ? '⏳ Flipping...' : '🔄 Flip Horizontal'}
        </button>
        <button onClick={() => setShowPromptId(showPromptId === ordinal.id ? null : ordinal.id)} className="w-full mb-1.5 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] sm:text-xs rounded transition-colors text-center">
          {showPromptId === ordinal.id ? 'Hide Prompt' : 'View Prompt'}
        </button>
        {showPromptId === ordinal.id && (
          <div className="mb-2 p-2 bg-[#FDFCFA] border border-gray-300 rounded max-h-60 overflow-y-auto">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-xs font-semibold text-gray-900">AI Prompt Used:</h4>
              <button onClick={() => { navigator.clipboard.writeText(ordinal.prompt || ''); toast.success('Copied!') }} className="text-xs text-green-700 hover:text-green-800 px-2 py-1 bg-green-50 rounded">
                Copy
              </button>
            </div>
            <pre className="text-[10px] sm:text-xs text-gray-900 whitespace-pre-wrap font-mono leading-relaxed">{ordinal.prompt || 'No prompt available'}</pre>
            <div className="mt-1 text-[8px] text-gray-500">Ordinal ID: {ordinal.id}</div>
          </div>
        )}
        {ordinal.traits && Object.keys(ordinal.traits).length > 0 && (
          <div className="border border-gray-300 rounded-md overflow-hidden">
            <button onClick={() => setExpandedTraits(prev => ({ ...prev, [ordinal.id]: !prev[ordinal.id] }))} className="w-full flex items-center justify-between px-2 py-1.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
              <span className="text-[11px] font-semibold text-gray-900">Traits</span>
              <svg className={`w-4 h-4 text-gray-600 transition-transform ${expandedTraits[ordinal.id] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedTraits[ordinal.id] && (
              <div className="px-2 py-1.5 space-y-0.5 bg-[#FDFCFA]">
                {Object.entries(ordinal.traits).map(([layerName, trait]) => (
                  <div key={layerName} className="text-[10px]">
                    <span className="text-gray-900 font-semibold">{layerName}:</span>{' '}
                    <span className="text-gray-600">{trait?.name || String(trait)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <p className="text-[10px] text-gray-900 mt-1">{new Date(ordinal.created_at).toLocaleDateString()}</p>
      </div>
    </div>
  )
}

