'use client'

import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'

export interface Profile {
  walletAddress: string
  paymentAddress?: string | null
  username: string
  displayName?: string
  bio?: string
  avatarUrl?: string
  walletType?: string
  optIn?: boolean
  twitterUrl?: string | null
  createdAt: string
  updatedAt: string
}

interface ProfileContextType {
  profile: Profile | null
  loading: boolean
  error: string | null
  refreshProfile: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<boolean>
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { isConnected, currentAddress } = useWallet()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Use Bitcoin wallet only
  const activeWalletConnected = isConnected
  const activeWalletAddress = currentAddress

  const fetchProfile = useCallback(async () => {
    // Use current values from refs/state at call time, not closure values
    const walletConnected = isConnected
    const walletAddress = currentAddress
    
    if (!walletConnected || !walletAddress) {
      setProfile(null)
      setLoading(false)
      return
    }

    // Prevent duplicate concurrent fetches
    if (isFetchingRef.current) {
      return
    }

    setLoading(true)
    setError(null)
    isFetchingRef.current = true

    try {
      // Add cache-busting to ensure fresh data
      const cacheBuster = Date.now()
      const url = `/api/profile?wallet_address=${encodeURIComponent(walletAddress)}&_t=${cacheBuster}`
      
      const response = await fetch(url)
      
      if (response.ok) {
        const data = await response.json()
        setProfile(data.profile)
        lastProfileRef.current = data.profile
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Failed to fetch profile:', response.status, errorData)
        setProfile(null)
        lastProfileRef.current = null
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
      setError('Failed to load profile')
      setProfile(null)
      lastProfileRef.current = null
    } finally {
      setLoading(false)
      isFetchingRef.current = false
    }
  }, [isConnected, currentAddress])

  const lastFetchRef = useRef<string>('')
  const isFetchingRef = useRef(false)
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastProfileRef = useRef<Profile | null>(null)
  const profileRef = useRef<Profile | null>(null)
  
  // Keep profileRef in sync with profile state
  useEffect(() => {
    profileRef.current = profile
  }, [profile])
  
  useEffect(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current)
      fetchTimeoutRef.current = null
    }
    
    const fetchKey = `${activeWalletConnected}-${activeWalletAddress}`
    
    // If wallet address changed, reset the last fetch key to force a new fetch
    if (lastFetchRef.current && lastFetchRef.current !== fetchKey) {
      lastFetchRef.current = ''
      lastProfileRef.current = null
    }
    
    // Only skip if we've already fetched for this exact key AND we have a profile
    // Use profileRef to avoid dependency on profile state
    if (lastFetchRef.current === fetchKey && profileRef.current !== null) {
      return
    }
    
    if (isFetchingRef.current) {
      return
    }
    
    fetchTimeoutRef.current = setTimeout(() => {
      const currentFetchKey = `${activeWalletConnected}-${activeWalletAddress}`
      
      // Double-check conditions before fetching
      if (lastFetchRef.current === currentFetchKey && profileRef.current !== null) {
        return
      }
      
      if (isFetchingRef.current) {
        return
      }
      
      // Check if wallet is still connected and address matches
      if (!activeWalletConnected || !activeWalletAddress) {
        return
      }
      
      lastFetchRef.current = currentFetchKey
      
      fetchProfile()
    }, 500)
    
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
        fetchTimeoutRef.current = null
      }
    }
  }, [activeWalletConnected, activeWalletAddress, fetchProfile])

  // Listen for profile creation events and wallet connection events
  const eventRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const debouncedRefresh = useCallback(() => {
    if (eventRefreshTimeoutRef.current) {
      clearTimeout(eventRefreshTimeoutRef.current)
    }
    eventRefreshTimeoutRef.current = setTimeout(() => {
      fetchProfile()
      eventRefreshTimeoutRef.current = null
    }, 1000)
  }, [fetchProfile])
  
  useEffect(() => {
    const handleProfileCreated = () => {
      debouncedRefresh()
    }

    window.addEventListener('profileCreated', handleProfileCreated)
    
    return () => {
      window.removeEventListener('profileCreated', handleProfileCreated)
      if (eventRefreshTimeoutRef.current) {
        clearTimeout(eventRefreshTimeoutRef.current)
        eventRefreshTimeoutRef.current = null
      }
    }
  }, [debouncedRefresh])

  const refreshProfile = useCallback(async () => {
    await fetchProfile()
  }, [fetchProfile])

  const updateProfile = useCallback(async (updates: Partial<Profile>): Promise<boolean> => {
    if (!activeWalletConnected || !activeWalletAddress) {
      setError('Wallet not connected')
      return false
    }

    setLoading(true)
    setError(null)

    try {
      // Filter out undefined values to prevent resetting fields
      const cleanUpdates: any = {
        wallet_address: activeWalletAddress,
      }
      
      // Only include fields that are explicitly provided (not undefined)
      if (updates.username !== undefined) cleanUpdates.username = updates.username
      if (updates.displayName !== undefined) cleanUpdates.display_name = updates.displayName
      if (updates.bio !== undefined) cleanUpdates.bio = updates.bio
      if (updates.avatarUrl !== undefined) cleanUpdates.avatar_url = updates.avatarUrl
      if (updates.paymentAddress !== undefined) cleanUpdates.payment_address = updates.paymentAddress
      if (updates.walletType !== undefined) cleanUpdates.wallet_type = updates.walletType
      if (updates.optIn !== undefined) cleanUpdates.optIn = updates.optIn
      if (updates.twitterUrl !== undefined) cleanUpdates.twitterUrl = updates.twitterUrl
      
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanUpdates),
      })

      if (response.ok) {
        const data = await response.json()
        setProfile(data.profile)
        return true
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to update profile')
        return false
      }
    } catch (err) {
      console.error('Error updating profile:', err)
      setError('Failed to update profile')
      return false
    } finally {
      setLoading(false)
    }
  }, [activeWalletConnected, activeWalletAddress])

  return (
    <ProfileContext.Provider value={{ profile, loading, error, refreshProfile, updateProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider')
  }
  return context
}
