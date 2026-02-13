'use client'

interface LaunchpadSearchBarProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  filterStatus: 'all' | 'live' | 'upcoming' | 'ended'
  onFilterChange: (status: 'all' | 'live' | 'upcoming' | 'ended') => void
}

export function LaunchpadSearchBar({
  searchTerm,
  onSearchChange,
  filterStatus,
  onFilterChange,
}: LaunchpadSearchBarProps) {
  const filters: Array<'all' | 'live' | 'upcoming' | 'ended'> = ['all', 'live', 'upcoming', 'ended']

  return (
    <div className="bg-[#0a0a0a] border-b border-[#404040]/40 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="SEARCH COLLECTIONS..."
            className="w-full px-4 py-2 bg-[#1a1a1a] border border-[#404040] hover:border-[#D4AF37]/40 focus:border-[#D4AF37] text-white text-xs uppercase tracking-wider placeholder:text-[#808080] outline-none transition-colors"
          />
        </div>
        {/* Filter Buttons */}
        <div className="flex items-center gap-2">
          {filters.map((status) => (
            <button
              key={status}
              onClick={() => onFilterChange(status)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                filterStatus === status
                  ? 'bg-[#1a1a1a] border border-[#D4AF37] text-[#D4AF37]'
                  : 'bg-[#1a1a1a] border border-[#404040] text-[#808080] hover:border-[#D4AF37]/40 hover:text-white'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
