'use client'

interface DownloadProgressModalProps {
  isOpen: boolean
  current: number
  total: number
  status: 'downloading' | 'generating' | 'completed' | 'error'
  message?: string
  failedCount?: number
}

export function DownloadProgressModal({
  isOpen,
  current,
  total,
  status,
  message,
  failedCount = 0
}: DownloadProgressModalProps) {
  if (!isOpen) return null

  const progress = total > 0 ? (current / total) * 100 : 0
  const isDownloading = status === 'downloading'
  const isGenerating = status === 'generating'
  const isCompleted = status === 'completed'
  const isError = status === 'error'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              {isDownloading ? 'Downloading Images' : isGenerating ? 'Generating ZIP File' : isCompleted ? 'Download Complete' : 'Download Error'}
            </h2>
            {!isCompleted && !isError && (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400"></div>
            )}
            {isCompleted && (
              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </div>

          {isError ? (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
              <p className="text-red-300 font-semibold">Error</p>
              <p className="text-red-200 text-sm mt-1">{message || 'An error occurred during download'}</p>
            </div>
          ) : (
            <>
              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-300">
                    {message && (isDownloading || isGenerating) ? message : (
                      <>
                        {isDownloading && `Downloaded ${current}/${total} images...`}
                        {isGenerating && `Generating ZIP file with ${current} images...`}
                        {isCompleted && `Successfully downloaded ${current} image${current !== 1 ? 's' : ''}!`}
                      </>
                    )}
                  </span>
                  <span className="text-sm text-gray-400">{Math.round(progress)}%</span>
                </div>
                <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Status Message */}
              {message && (
                <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 mb-4">
                  <p className="text-blue-200 text-sm">{message}</p>
                </div>
              )}

              {/* Failed Count Warning */}
              {failedCount > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3 mb-4">
                  <p className="text-yellow-200 text-sm">
                    ⚠️ {failedCount} image{failedCount !== 1 ? 's' : ''} failed to download. Check console for details.
                  </p>
                </div>
              )}

              {/* Loading Animation */}
              {!isCompleted && (
                <div className="mt-6 pt-6 border-t border-gray-800">
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span>Please wait...</span>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {isCompleted && (
                <div className="mt-6 pt-6 border-t border-gray-800">
                  <div className="flex items-center justify-center gap-2 text-sm text-green-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-semibold">Your download will start automatically!</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

