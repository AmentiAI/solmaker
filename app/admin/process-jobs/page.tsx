'use client'

import { useState } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { toast } from 'sonner'

export default function ProcessJobsPage() {
  const { currentAddress, isConnected } = useWallet()
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleProcessJobs = async () => {
    if (!isConnected || !currentAddress) {
      toast.error('Please connect your wallet')
      return
    }

    setProcessing(true)
    setResult(null)

    try {
      const response = await fetch('/api/cron/process-generation-jobs-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: currentAddress,
        }),
      })

      const data = await response.json()
      
      if (response.ok) {
        setResult(data)
        toast.success('Jobs processed successfully!')
      } else {
        toast.error(data.error || 'Failed to process jobs')
        setResult({ error: data.error })
      }
    } catch (error) {
      console.error('Error processing jobs:', error)
      toast.error('Failed to process jobs')
      setResult({ error: String(error) })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-8">
          <h1 className="text-4xl font-bold text-white mb-6">Process Generation Jobs</h1>
          
          <p className="text-white/70 mb-8">
            This page manually triggers the generation jobs processor. Use this to process queued NFT generation jobs.
          </p>

          <button
            onClick={handleProcessJobs}
            disabled={processing || !isConnected}
            className="w-full bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:opacity-90 text-white font-bold py-4 px-8 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {processing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              '🚀 Process Queued Jobs'
            )}
          </button>

          {result && (
            <div className="mt-8 bg-black/30 rounded-xl p-6 border border-[#9945FF]/20">
              <h2 className="text-xl font-bold text-white mb-4">Result:</h2>
              <pre className="text-white/80 text-sm overflow-auto max-h-96">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {!isConnected && (
            <div className="mt-4 text-center text-yellow-400">
              Please connect your admin wallet to use this feature
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
