'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CreatorPassesPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to BTC page by default
    router.push('/creator-passes/btc')
  }, [router])

  return (
    <div className="min-h-screen bg-[#FDFCFA] flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-700">Redirecting to BTC Creator Passes...</p>
      </div>
    </div>
  )
}

