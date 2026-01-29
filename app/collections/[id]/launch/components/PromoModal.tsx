'use client'

interface PromoItem {
  id: string
  image_url: string
  collection_name: string
  created_at: string
  character_count: number
  no_text?: boolean
  flyer_text?: string
}

interface PromoModalProps {
  isOpen: boolean
  onClose: () => void
  promoHistory: PromoItem[]
  loading: boolean
  onSelect: (imageUrl: string) => void
  mode?: 'banner' | 'marketplace' | 'mobile'
}

export default function PromoModal({
  isOpen,
  onClose,
  promoHistory,
  loading,
  onSelect,
  mode = 'banner',
}: PromoModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-xl p-0 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Choose From Promotion History</h2>
            <p className="text-sm text-gray-500 mt-1">
              {mode === 'marketplace' 
                ? 'Select promotional images to include in your listing'
                : mode === 'mobile'
                ? 'Select a promotional image to use as your mobile/thumbnail image'
                : 'Select a promotional image to use as your banner'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-12 h-12 border-4 border-[#4561ad] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : promoHistory.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No promotion history found</p>
              <p className="text-sm text-gray-400">
                Generate promotional images on the{' '}
                <a href="/promotion" className="text-[#4561ad] hover:underline">
                  Promotion page
                </a>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {promoHistory.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelect(item.image_url)}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden cursor-pointer hover:shadow-lg hover:border-[#4561ad] transition-all"
                >
                  {item.image_url?.endsWith('.mp4') || item.image_url?.includes('.mp4') ? (
                    <video
                      src={item.image_url}
                      className="w-full h-48 object-cover"
                      controls
                      muted
                      playsInline
                      onMouseEnter={(e) => e.currentTarget.play()}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause()
                        e.currentTarget.currentTime = 0
                      }}
                    />
                  ) : (
                    <img
                      src={item.image_url}
                      alt={`Promo for ${item.collection_name}`}
                      className="w-full h-48 object-cover"
                    />
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900">{item.collection_name}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(item.created_at).toLocaleDateString()} at{' '}
                      {new Date(item.created_at).toLocaleTimeString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.character_count} character{item.character_count !== 1 ? 's' : ''}
                      {item.no_text
                        ? ' • No text'
                        : item.flyer_text
                          ? ` • "${item.flyer_text.slice(0, 30)}${item.flyer_text.length > 30 ? '...' : ''}"`
                          : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

