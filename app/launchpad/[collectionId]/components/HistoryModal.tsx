'use client'

interface HistoryModalProps {
  isOpen: boolean
  onClose: () => void
  loading: boolean
  mintHistory: any[]
  formatDateTime: (date: string) => string
}

export function HistoryModal({
  isOpen,
  onClose,
  loading,
  mintHistory,
  formatDateTime,
}: HistoryModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0a0a0a] max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-[#D4AF37]/30" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-[#D4AF37]/20">
          <h2 className="text-2xl font-bold text-[#D4AF37]">Mint History</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#D4AF37]/10 transition-colors text-[#808080] hover:text-white border border-transparent hover:border-[#D4AF37]/30"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : mintHistory.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#808080]">No mints found</p>
              <p className="text-sm text-[#808080] mt-2">Your mint history will appear here</p>
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-bold text-[#D4AF37] mb-4">Your Mints ({mintHistory.length})</h3>
              <div className="space-y-3">
                {mintHistory.map((mint: any) => (
                  <div
                    key={mint.id}
                    className="p-3 border border-[#D4AF37]/30 bg-[#1a1a1a] hover:border-[#D4AF37]/50 transition-all"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {mint.ordinal_number && (
                          <span className="px-2 py-0.5 bg-[#D4AF37]/20 text-white text-xs font-bold border border-[#D4AF37]/30">
                            #{mint.ordinal_number}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-xs font-bold ${
                          mint.mint_status === 'completed' ? 'bg-[#D4AF37] text-black' :
                          mint.mint_status === 'reveal_broadcast' ? 'bg-[#404040] text-white' :
                          'bg-[#404040] text-white'
                        }`}>
                          {mint.mint_status === 'reveal_broadcast' ? 'revealing' : mint.mint_status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#808080] flex-1 justify-center">
                        {mint.commit_tx_id && (
                          <a
                            href={`https://mempool.space/tx/${mint.commit_tx_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#D4AF37] hover:text-[#D4AF37]/80 hover:underline transition-colors"
                            title={mint.commit_tx_id}
                          >
                            commit ↗
                          </a>
                        )}
                        {mint.reveal_tx_id && (
                          <a
                            href={`https://mempool.space/tx/${mint.reveal_tx_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#D4AF37] hover:text-[#D4AF37]/80 hover:underline transition-colors"
                            title={mint.reveal_tx_id}
                          >
                            reveal ↗
                          </a>
                        )}
                        {mint.inscription_id && (
                          <a
                            href={`https://ordinals.com/inscription/${mint.inscription_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#D4AF37] hover:text-[#D4AF37]/80 hover:underline transition-colors"
                            title={mint.inscription_id}
                          >
                            {mint.inscription_id.slice(0, 8)}...i0 ↗
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-[#808080] flex-shrink-0">
                        {mint.commit_broadcast_at && formatDateTime(mint.commit_broadcast_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
