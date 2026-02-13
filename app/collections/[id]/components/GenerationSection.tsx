'use client'

import { useState, useEffect } from 'react'
import { isAdmin } from '@/lib/auth/access-control'

interface Layer {
  id: string
  name: string
  trait_count: number
}

interface GenerationSectionProps {
  collection: { id: string; collection_status?: string }
  layers: Layer[]
  queuedJobs: number
  processingJobs: number
  traitFilters: Record<string, string>
  layerTraits: Record<string, string[]>
  generateQuantity: number
  setGenerateQuantity: (q: number) => void
  useClassicMode: boolean
  setUseClassicMode: (v: boolean) => void
  generating: boolean
  currentAddress: string | null | undefined
  onGenerate: () => void
  onClearFilters: () => void
  onFilterChange: (layerName: string, traitName: string) => void
}

export function GenerationSection({
  collection,
  layers,
  queuedJobs,
  processingJobs,
  traitFilters,
  layerTraits,
  generateQuantity,
  setGenerateQuantity,
  useClassicMode,
  setUseClassicMode,
  generating,
  currentAddress,
  onGenerate,
  onClearFilters,
  onFilterChange,
}: GenerationSectionProps) {
  const isUserAdmin = isAdmin(currentAddress || null)
  const hasActiveFilters = Object.values(traitFilters).some(v => v && v !== '')
  const [quantityDisplay, setQuantityDisplay] = useState<string>(generateQuantity.toString())

  // Sync quantityDisplay with generateQuantity when it changes externally
  useEffect(() => {
    setQuantityDisplay(generateQuantity.toString())
  }, [generateQuantity])

  return (
    <div>
      {(queuedJobs > 0 || processingJobs > 0) && (
        <div className="mb-6 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#D4AF37]/50 rounded-lg p-4 sm:p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-[#D4AF37]"></div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {processingJobs > 0 ? `Processing ${processingJobs} Generation${processingJobs !== 1 ? 's' : ''}` : 'Generations Queued'}
                </h3>
                <p className="text-sm text-white/90 mt-1">
                  {processingJobs > 0 ? 'Your NFTs are being generated. This may take a few minutes...' : queuedJobs > 0 ? `${queuedJobs} generation${queuedJobs !== 1 ? 's' : ''} waiting in queue` : ''}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {hasActiveFilters && (
        <div className="mb-6 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#D4AF37]/50 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[#D4AF37] text-lg">⚠️</span>
                <h3 className="text-base sm:text-lg font-bold text-[#D4AF37]">Trait Filters Active</h3>
              </div>
              <p className="text-sm text-white/90 mb-2">The selected trait filters will be used in generation instead of random selection.</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(traitFilters).filter(([_, value]) => value && value !== '').map(([layerName, traitName]) => (
                  <span key={layerName} className="inline-flex items-center gap-1 bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#D4AF37] px-2 py-1 rounded text-xs font-medium">
                    <span className="font-semibold">{layerName}:</span>
                    <span>{traitName}</span>
                  </span>
                ))}
              </div>
            </div>
            <button onClick={onClearFilters} className="bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-white px-4 py-2 rounded font-semibold text-sm transition-colors whitespace-nowrap shadow-lg shadow-[#D4AF37]/20">
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Generate NFTs</h2>
          <p className="text-sm text-[#808080] mt-1">
            {collection?.collection_status === 'launchpad' && !isUserAdmin ? 'Generation is disabled for launchpad collections' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
         
          <div className="flex items-center rounded-lg border border-[#D4AF37]/30 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl overflow-hidden">
            <button
              onClick={() => setUseClassicMode(false)}
              disabled={generating || layers.length === 0}
              className={`px-3 py-1.5 text-xs sm:text-sm font-semibold transition-all duration-200 ${
                !useClassicMode
                  ? 'bg-[#D4AF37] text-white shadow-lg shadow-[#D4AF37]/20'
                  : 'text-[#808080]/80 hover:text-[#808080] bg-transparent'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Model 1.1
            </button>
            <div className="w-px h-6 bg-[#D4AF37]/30"></div>
            <button
              onClick={() => setUseClassicMode(true)}
              disabled={generating || layers.length === 0}
              className={`px-3 py-1.5 text-xs sm:text-sm font-semibold transition-all duration-200 ${
                useClassicMode
                  ? 'bg-[#D4AF37] text-white shadow-lg shadow-[#D4AF37]/20'
                  : 'text-[#808080]/80 hover:text-[#808080] bg-transparent'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Model 1.0
            </button>
          </div>
        </div>
        {collection?.collection_status === 'launchpad' && !isUserAdmin ? (
          <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/50 rounded-lg p-3 w-full sm:w-auto">
            <p className="text-sm text-[#D4AF37]">⚠️ Generation is disabled for collections on launchpad.</p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <button onClick={onGenerate} disabled={generating || layers.length === 0} className={`${hasActiveFilters ? 'bg-[#D4AF37] hover:bg-[#D4AF37]/80 border-2 border-[#D4AF37]/50 shadow-lg shadow-[#D4AF37]/20' : 'bg-[#D4AF37] hover:bg-[#D4AF37]/80 shadow-lg shadow-[#D4AF37]/20'} text-white px-4 sm:px-6 py-2 sm:py-3 rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base font-bold transition-all duration-200 w-full sm:w-auto drop-shadow-lg`}>
              {generating ? 'Queueing...' : hasActiveFilters ? `⚠️ Generate ${generateQuantity > 1 ? `${generateQuantity} ` : ''}NFT${generateQuantity > 1 ? 's' : ''} (Filtered)` : `🎨 Generate ${generateQuantity > 1 ? `${generateQuantity} ` : ''}NFT${generateQuantity > 1 ? 's' : ''}`}
            </button>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-xs sm:text-sm text-white whitespace-nowrap">Quantity:</label>
              <input 
                type="number" 
                min="1" 
                value={quantityDisplay} 
                onChange={(e) => {
                  const val = e.target.value
                  setQuantityDisplay(val)
                  const num = parseInt(val)
                  if (!isNaN(num) && num >= 1) {
                    setGenerateQuantity(num)
                  }
                }}
                onBlur={(e) => {
                  const num = parseInt(e.target.value)
                  if (isNaN(num) || num < 1) {
                    setQuantityDisplay('1')
                    setGenerateQuantity(1)
                  } else {
                    setQuantityDisplay(num.toString())
                    setGenerateQuantity(num)
                  }
                }}
                className="flex-1 sm:w-20 border border-[#D4AF37]/30 rounded px-2 py-1 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white text-center focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20" 
                disabled={generating || layers.length === 0} 
              />
            </div>
          </div>
        )}
      </div>

      {layers.length === 0 && (
        <div className="text-center py-8 text-[#D4AF37] bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/50 rounded-lg">
          ⚠️ Please add layers and traits before generating NFTs
        </div>
      )}

      {layers.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
            {layers.map((layer) => (
              <div key={layer.id}>
                <label className="block text-xs font-medium text-white mb-1">{layer.name}</label>
                <select value={traitFilters[layer.name] || ''} onChange={(e) => onFilterChange(layer.name, e.target.value)} className="w-full border border-[#D4AF37]/30 rounded px-2 py-1 text-sm bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20">
                  <option value="" className="bg-[#0f172a] text-white">All {layer.name}</option>
                  {(layerTraits[layer.name] || []).map((traitName) => (
                    <option key={traitName} value={traitName} className="bg-[#0f172a] text-white">{traitName}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button onClick={onClearFilters} className="text-sm text-[#D4AF37] hover:text-[#D4AF37] transition-colors">Clear all filters</button>
        </div>
      )}

    </div>
  )
}

