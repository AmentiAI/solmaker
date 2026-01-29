'use client'

interface MetadataModalProps {
  isOpen: boolean
  onClose: () => void
  collectionName: string
  metadata: any[]
}

export default function MetadataModal({
  isOpen,
  onClose,
  collectionName,
  metadata,
}: MetadataModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {collectionName} - Inscription Metadata
            </h3>
            <p className="text-sm text-gray-500">{metadata.length} completed inscriptions</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        {/* JSON Content */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto font-mono whitespace-pre-wrap">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <button
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(metadata, null, 2))
              alert('Metadata copied to clipboard!')
            }}
            className="px-4 py-2 bg-[#4561ad] hover:bg-[#3a5294] text-white rounded-lg font-semibold transition-colors"
          >
            📋 Copy JSON
          </button>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              const safeName = collectionName.toLowerCase().replace(/[^a-z0-9]/g, '-')
              a.download = `${safeName}-metadata.json`
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="px-4 py-2 bg-[#e27d0f] hover:bg-[#c96a0a] text-white rounded-lg font-semibold transition-colors"
          >
            💾 Download JSON
          </button>
        </div>
      </div>
    </div>
  )
}

