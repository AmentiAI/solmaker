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
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Mint History</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-[#4561ad] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : mintHistory.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No mints found</p>
              <p className="text-sm text-gray-400 mt-2">Your mint history will appear here</p>
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Your Mints ({mintHistory.length})</h3>
              <div className="space-y-3">
                {mintHistory.map((mint: any) => (
                  <div
                    key={mint.id}
                    className="p-3 rounded-lg border border-gray-200 bg-white hover:border-[#4561ad]/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {mint.ordinal_number && (
                          <span className="px-2 py-0.5 bg-[#4561ad]/10 text-[#4561ad] text-xs font-bold rounded">
                            #{mint.ordinal_number}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                          mint.mint_status === 'completed' ? 'bg-green-100 text-green-700' :
                          mint.mint_status === 'reveal_broadcast' ? 'bg-blue-100 text-blue-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {mint.mint_status === 'reveal_broadcast' ? 'revealing' : mint.mint_status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-1 justify-center">
                        {mint.commit_tx_id && (
                          <a
                            href={`https://mempool.space/tx/${mint.commit_tx_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#4561ad] hover:underline"
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
                            className="text-[#4561ad] hover:underline"
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
                            className="text-[#4561ad] hover:underline"
                            title={mint.inscription_id}
                          >
                            {mint.inscription_id.slice(0, 8)}...i0 ↗
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 flex-shrink-0">
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

