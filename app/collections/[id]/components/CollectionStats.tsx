'use client'

interface Layer {
  trait_count: number
}

interface CollectionStatsProps {
  layers: Layer[]
  totalOrdinals: number
  isActive: boolean
}

export function CollectionStats({ layers, totalOrdinals, isActive }: CollectionStatsProps) {
  const totalTraits = layers.reduce((sum, layer) => sum + layer.trait_count, 0)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
      <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg p-2">
        <p className="text-lg sm:text-xl font-bold text-[#00d4ff]">{layers.length}</p>
        <p className="text-[10px] text-white/70">Layers</p>
      </div>
      <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg p-2">
        <p className="text-lg sm:text-xl font-bold text-[#00d4ff]">{totalTraits}</p>
        <p className="text-[10px] text-white/70">Traits</p>
      </div>
      <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg p-2">
        <p className="text-lg sm:text-xl font-bold text-[#DC1FFF]">{totalOrdinals}</p>
        <p className="text-[10px] text-white/70">Ordinals</p>
      </div>
      <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg p-2">
        <p className={`text-lg sm:text-xl font-bold ${isActive ? 'text-[#00d4ff]' : 'text-white/70'}`}>
          {isActive ? 'Active' : 'Inactive'}
        </p>
        <p className="text-[10px] text-white/70">Status</p>
      </div>
    </div>
  )
}

