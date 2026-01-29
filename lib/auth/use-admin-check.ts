'use client'

import { useState, useEffect } from 'react'

export function useAdminCheck(walletAddress: string | null) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!walletAddress) {
      setIsAdmin(false)
      setLoading(false)
      return
    }

    setLoading(true)
    
    fetch(`/api/auth/check-admin?wallet_address=${encodeURIComponent(walletAddress)}`)
      .then(res => res.json())
      .then(data => {
        setIsAdmin(data.isAdmin || false)
      })
      .catch(err => {
        console.error('Error checking admin status:', err)
        setIsAdmin(false)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [walletAddress])

  return { isAdmin, loading }
}
