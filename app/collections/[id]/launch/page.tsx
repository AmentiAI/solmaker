'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/compatibility'
import { generateApiAuth } from '@/lib/wallet/api-auth'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CollectionSettingsStep } from './components/CollectionSettingsStep'
import { MintPhasesStep } from './components/MintPhasesStep'
import { WhitelistsStep } from './components/WhitelistsStep'
import { ReviewStep } from './components/ReviewStep'
import { LaunchStep } from './components/LaunchStep'
import { StepNavigation } from './components/StepNavigation'
import { Phase, Whitelist, Collection, Step } from './types'
import PromoModal from './components/PromoModal'

// Helper function to convert UTC datetime string to local datetime-local format
function utcToLocalDatetime(utcString: string): string {
  if (!utcString) return ''
  const date = new Date(utcString)
  // Get local time components
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export default function CollectionLaunchPage() {
  const params = useParams()
  const router = useRouter()
  const { currentAddress, isConnected, signMessage } = useWallet()
  const collectionId = params.id as string

  const [collection, setCollection] = useState<Collection | null>(null)
  const [phases, setPhases] = useState<Phase[]>([])
  const [whitelists, setWhitelists] = useState<Whitelist[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentStep, setCurrentStep] = useState<Step>(1)
  
  // Settings form state
  const [collectionDescription, setCollectionDescription] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [mobileUrl, setMobileUrl] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [extendLastPhase, setExtendLastPhase] = useState(false)
  const [creatorRoyaltyWallet, setCreatorRoyaltyWallet] = useState('')
  const [capSupply, setCapSupply] = useState<number | null>(null)
  const [mintType, setMintType] = useState<'hidden' | 'choices'>('hidden')
  
  // Social links
  const [twitterUrl, setTwitterUrl] = useState('')
  const [discordUrl, setDiscordUrl] = useState('')
  const [telegramUrl, setTelegramUrl] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')

  // Upload state
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [uploadingMobile, setUploadingMobile] = useState(false)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [bannerFileName, setBannerFileName] = useState<string>('')
  const [mobileFileName, setMobileFileName] = useState<string>('')
  const [audioFileName, setAudioFileName] = useState<string>('')

  // Phase and whitelist state (simplified - will add more as needed)
  const [showNewPhaseForm, setShowNewPhaseForm] = useState(false)
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null)
  const [newPhaseName, setNewPhaseName] = useState('')
  const [newPhasePrice, setNewPhasePrice] = useState(0)
  const [newPhaseStartTime, setNewPhaseStartTime] = useState('')
  const [newPhaseEndTime, setNewPhaseEndTime] = useState('')
  const [newPhaseWhitelistOnly, setNewPhaseWhitelistOnly] = useState(false)
  const [newPhaseWhitelistId, setNewPhaseWhitelistId] = useState<string | null>(null)
  const [newPhaseMaxPerWallet, setNewPhaseMaxPerWallet] = useState<number | null>(1)
  const [newPhaseAllocation, setNewPhaseAllocation] = useState<number | null>(null)
  
  const [showNewWhitelistForm, setShowNewWhitelistForm] = useState(false)
  const [editingWhitelistId, setEditingWhitelistId] = useState<string | null>(null)
  const [newWhitelistName, setNewWhitelistName] = useState('')
  const [newWhitelistDescription, setNewWhitelistDescription] = useState('')
  const [newWhitelistAddresses, setNewWhitelistAddresses] = useState('')
  const [existingWhitelistAddresses, setExistingWhitelistAddresses] = useState<string[]>([])
  const [removedWhitelistAddresses, setRemovedWhitelistAddresses] = useState<string[]>([])
  
  // Confirmation dialogs
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false)
  const [showDeletePhaseConfirm, setShowDeletePhaseConfirm] = useState<string | null>(null)
  const [showDeleteWhitelistConfirm, setShowDeleteWhitelistConfirm] = useState<string | null>(null)
  const [showStatusChangeConfirm, setShowStatusChangeConfirm] = useState(false)
  const [showRevertToDraftConfirm, setShowRevertToDraftConfirm] = useState(false)
  const [collectionStatusError, setCollectionStatusError] = useState<{ message: string; status: string } | null>(null)
  
  // Promo modal state
  const [showPromoModal, setShowPromoModal] = useState(false)
  const [promoModalMode, setPromoModalMode] = useState<'banner' | 'mobile'>('banner')
  const [promoHistory, setPromoHistory] = useState<any[]>([])
  const [loadingPromo, setLoadingPromo] = useState(false)

  const loadData = useCallback(async () => {
    if (!currentAddress) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    setCollectionStatusError(null)
    try {
      const collRes = await fetch(`/api/launchpad/${collectionId}?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (collRes.ok) {
        const collData = await collRes.json()
        setCollection(collData.collection)
        setCollectionDescription(collData.collection?.description || '')
        setBannerUrl(collData.collection?.banner_image_url || '')
        setMobileUrl(collData.collection?.mobile_image_url || '')
        setAudioUrl(collData.collection?.audio_url || '')
        setVideoUrl(collData.collection?.video_url || '')
        setExtendLastPhase(collData.collection?.extend_last_phase || false)
        setCreatorRoyaltyWallet(collData.collection?.creator_royalty_wallet || '')
        setTwitterUrl(collData.collection?.twitter_url || '')
        setDiscordUrl(collData.collection?.discord_url || '')
        setTelegramUrl(collData.collection?.telegram_url || '')
        setWebsiteUrl(collData.collection?.website_url || '')
        // Auto-fill cap_supply with total_supply if not set, otherwise use saved value
        const totalSupply = collData.collection?.total_supply || 0
        const savedCapSupply = collData.collection?.cap_supply
        setCapSupply(savedCapSupply !== null && savedCapSupply !== undefined ? savedCapSupply : totalSupply)
        setMintType(collData.collection?.mint_type || 'hidden')
      } else {
        // Check if collection is draft and needs status change
        const errorData = await collRes.json().catch(() => ({}))
        if (errorData.collection_status === 'draft' && errorData.message?.includes('not currently available')) {
          setCollectionStatusError({
            message: errorData.message || 'Collection is in draft status',
            status: errorData.collection_status || 'draft'
          })
          setShowStatusChangeConfirm(true)
          setLoading(false)
          return
        }
      }
      
      const phasesRes = await fetch(`/api/launchpad/${collectionId}/phases?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (phasesRes.ok) {
        const phasesData = await phasesRes.json()
        setPhases(phasesData.phases || [])
      }
      
      const wlRes = await fetch(`/api/launchpad/${collectionId}/whitelists?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (wlRes.ok) {
        const wlData = await wlRes.json()
        setWhitelists(wlData.whitelists || [])
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }, [collectionId, currentAddress])

  useEffect(() => {
    if (collectionId && currentAddress) {
      loadData()
    }
  }, [collectionId, currentAddress, loadData])

  const uploadLaunchMedia = async (kind: 'banner' | 'mobile' | 'audio', file: File) => {
    if (kind === 'banner') setUploadingBanner(true)
    if (kind === 'mobile') setUploadingMobile(true)
    if (kind === 'audio') setUploadingAudio(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('collectionId', collectionId)
      formData.append('kind', kind)

      const response = await fetch('/api/uploads/launch-media', {
        method: 'POST',
        body: formData,
      })
      
      if (response.ok) {
        const data = await response.json()
        if (kind === 'banner') {
          setBannerUrl(data.url)
          setBannerFileName(file.name)
        } else if (kind === 'mobile') {
          setMobileUrl(data.url)
          setMobileFileName(file.name)
        } else if (kind === 'audio') {
          setAudioUrl(data.url)
          setAudioFileName(file.name)
        }
        toast.success(`${kind} uploaded successfully!`)
      } else {
        const err = await response.json()
        toast.error('Upload failed', { description: err.error })
      }
    } catch (error) {
      console.error('Upload error:', error)
      toast.error('Upload failed')
    } finally {
      if (kind === 'banner') setUploadingBanner(false)
      if (kind === 'mobile') setUploadingMobile(false)
      if (kind === 'audio') setUploadingAudio(false)
    }
  }

  const handleSaveSettings = async () => {
    const trimmedCreatorWallet = creatorRoyaltyWallet?.trim() || ''
    const trimmedBannerUrl = bannerUrl?.trim() || ''
    
    if (!trimmedCreatorWallet) {
      toast.error('Validation Error', { description: 'Please enter a Creator Payment Wallet (Solana Address) before saving.' })
      return
    }
    
    if (!trimmedBannerUrl) {
      toast.error('Validation Error', { description: 'Please upload a Banner Image before saving.' })
      return
    }

    try {
      new URL(trimmedBannerUrl)
    } catch {
      toast.error('Validation Error', { description: 'Please upload a valid Banner Image URL before saving.' })
      return
    }

    setSaving(true)
    try {
      // Generate signed authentication
      const auth = await generateApiAuth(currentAddress, signMessage)
      if (!auth) {
        toast.error('Failed to sign request. Please ensure your wallet is connected.')
        setSaving(false)
        return
      }

      const response = await fetch(`/api/launchpad/${collectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...auth,
          description: collectionDescription || null,
          banner_image_url: trimmedBannerUrl,
          mobile_image_url: mobileUrl || null,
          audio_url: audioUrl || null,
          video_url: videoUrl || null,
          extend_last_phase: extendLastPhase,
          creator_royalty_wallet: trimmedCreatorWallet,
          creator_royalty_percent: 100,
          twitter_url: twitterUrl || null,
          discord_url: discordUrl || null,
          telegram_url: telegramUrl || null,
          website_url: websiteUrl || null,
          cap_supply: capSupply !== null ? capSupply : null,
          mint_type: mintType,
        }),
      })
      
      if (response.ok) {
        toast.success('Settings saved!')
        loadData()
        setCurrentStep(2)
      } else {
        const err = await response.json()
        toast.error('Error', { description: `Error: ${err.error}` })
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleCreatePhase = async () => {
    if (!newPhaseName.trim()) {
      toast.error('Phase name is required')
      return
    }
    if (!newPhaseStartTime) {
      toast.error('Phase start time is required')
      return
    }

    // Price is in lamports - no minimum validation needed for Solana
    // Just ensure it's a valid number >= 0
    if (newPhasePrice < 0) {
      toast.error('Price cannot be negative')
      return
    }

    // Validate end date is not more than 10 days from start date
    if (newPhaseEndTime) {
      const startDate = new Date(newPhaseStartTime)
      const endDate = new Date(newPhaseEndTime)
      const daysDifference = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      
      if (daysDifference > 10) {
        toast.error('End date cannot be more than 10 days from the start date. Please fix the end date.')
        return
      }
      
      if (endDate <= startDate) {
        toast.error('End date must be after the start date')
        return
      }
    }

    setSaving(true)
    try {
      // Generate signed authentication
      const auth = await generateApiAuth(currentAddress, signMessage)
      if (!auth) {
        toast.error('Failed to sign request. Please ensure your wallet is connected.')
        setSaving(false)
        return
      }

      const isEditing = editingPhaseId !== null
      const url = `/api/launchpad/${collectionId}/phases`
      const method = isEditing ? 'PATCH' : 'POST'
      
      // Convert local datetime to UTC ISO string for API
      const startTimeUtc = newPhaseStartTime ? new Date(newPhaseStartTime).toISOString() : ''
      const endTimeUtc = newPhaseEndTime ? new Date(newPhaseEndTime).toISOString() : null
      
      const response = await fetch(url, {
        method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...auth,
          ...(isEditing ? { phase_id: editingPhaseId } : {}),
          phase_name: newPhaseName,
          start_time: startTimeUtc,
          end_time: endTimeUtc,
          mint_price_sats: newPhasePrice,
          whitelist_only: newPhaseWhitelistOnly,
          whitelist_id: newPhaseWhitelistId || null,
          max_per_wallet: newPhaseMaxPerWallet,
          phase_allocation: newPhaseAllocation,
        }),
      })
      
      if (response.ok) {
        toast.success(isEditing ? 'Phase updated!' : 'Phase created!')
        setShowNewPhaseForm(false)
        setEditingPhaseId(null)
        setNewPhaseName('')
        setNewPhasePrice(0)
        setNewPhaseStartTime('')
        setNewPhaseEndTime('')
        setNewPhaseWhitelistOnly(false)
        setNewPhaseWhitelistId(null)
        setNewPhaseMaxPerWallet(1)
        setNewPhaseAllocation(null)
        loadData()
      } else {
        const err = await response.json()
        toast.error('Error', { description: err.error })
      }
    } catch (error) {
      console.error('Error creating/updating phase:', error)
      toast.error(`Failed to ${editingPhaseId ? 'update' : 'create'} phase`)
    } finally {
      setSaving(false)
    }
  }

  const handleCreateWhitelist = async () => {
    if (!newWhitelistName.trim()) {
      toast.error('Whitelist name is required')
      return
    }
    
    const isEditing = editingWhitelistId !== null
    
    // Only require addresses when creating new whitelist
    if (!isEditing && !newWhitelistAddresses.trim()) {
      toast.error('At least one address is required')
      return
    }

    const newAddresses = newWhitelistAddresses
      .split('\n')
        .map(a => a.trim())
        .filter(a => a.length > 0)
      
    if (!isEditing && newAddresses.length === 0) {
      toast.error('At least one valid address is required')
      return
    }

    setSaving(true)
    try {
      // Generate signed authentication
      const auth = await generateApiAuth(currentAddress, signMessage)
      if (!auth) {
        toast.error('Failed to sign request. Please ensure your wallet is connected.')
        setSaving(false)
        return
      }

      const url = `/api/launchpad/${collectionId}/whitelists`
      const method = isEditing ? 'PATCH' : 'POST'
      
      const requestBody: any = {
        ...auth,
        name: newWhitelistName,
        description: newWhitelistDescription || null,
      }
      
      if (isEditing) {
        requestBody.whitelist_id = editingWhitelistId
        if (newAddresses.length > 0) {
          requestBody.add_entries = newAddresses.map(addr => ({ wallet_address: addr }))
        }
        if (removedWhitelistAddresses.length > 0) {
          requestBody.remove_entries = removedWhitelistAddresses
        }
      } else {
        requestBody.entries = newAddresses.map(addr => ({ wallet_address: addr }))
      }
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      
      if (response.ok) {
        toast.success(isEditing ? 'Whitelist updated!' : 'Whitelist created!')
        setShowNewWhitelistForm(false)
        setEditingWhitelistId(null)
        setNewWhitelistName('')
        setNewWhitelistDescription('')
        setNewWhitelistAddresses('')
        setExistingWhitelistAddresses([])
        setRemovedWhitelistAddresses([])
        loadData()
      } else {
        const err = await response.json()
        toast.error('Error', { description: err.error })
      }
    } catch (error) {
      console.error('Error creating/updating whitelist:', error)
      toast.error(`Failed to ${editingWhitelistId ? 'update' : 'create'} whitelist`)
    } finally {
      setSaving(false)
    }
  }

  const loadPromoHistory = useCallback(async () => {
    if (!currentAddress) return
    setLoadingPromo(true)
    try {
      const res = await fetch(`/api/promotion/history?wallet_address=${encodeURIComponent(currentAddress)}`)
      const data = await res.json()
      if (res.ok) {
        setPromoHistory(data?.promotions || [])
      }
    } catch (error) {
      console.error('Error loading promotion history:', error)
    } finally {
      setLoadingPromo(false)
    }
  }, [currentAddress])

  const handleOpenPromoModal = (mode: 'banner' | 'mobile') => {
    setPromoModalMode(mode)
    setShowPromoModal(true)
    if (promoHistory.length === 0) {
      void loadPromoHistory()
    }
  }

  const handleSelectPromo = (imageUrl: string) => {
    if (promoModalMode === 'banner') {
      setBannerUrl(imageUrl)
      } else {
      setMobileUrl(imageUrl)
    }
    setShowPromoModal(false)
  }

  const handleEditPhase = (phaseId: string) => {
    const phase = phases.find(p => p.id === phaseId)
    if (!phase) return

    setEditingPhaseId(phase.id)
    setNewPhaseName(phase.phase_name)
    setNewPhasePrice(phase.mint_price_sats || 0)
    // Convert UTC to local time for datetime-local input
    setNewPhaseStartTime(utcToLocalDatetime(phase.start_time))
    setNewPhaseEndTime(phase.end_time ? utcToLocalDatetime(phase.end_time) : '')
    setNewPhaseWhitelistOnly(phase.whitelist_only || false)
    setNewPhaseWhitelistId(phase.whitelist_id || null)
    setNewPhaseMaxPerWallet(phase.max_per_wallet ?? 1)
    setNewPhaseAllocation(phase.phase_allocation)
    setShowNewPhaseForm(true)
  }

  const handleDeletePhase = async (phaseId: string) => {
    if (!currentAddress) return
    
    setSaving(true)
    try {
      // Generate signed authentication
      const auth = await generateApiAuth(currentAddress, signMessage)
      if (!auth) {
        toast.error('Failed to sign request. Please ensure your wallet is connected.')
        setSaving(false)
        return
      }

      const params = new URLSearchParams({
        wallet_address: auth.wallet_address,
        signature: auth.signature,
        message: auth.message,
        timestamp: auth.timestamp.toString(),
        phase_id: phaseId,
      })
      
      const response = await fetch(`/api/launchpad/${collectionId}/phases?${params.toString()}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        toast.success('Phase deleted!')
        setShowDeletePhaseConfirm(null)
        loadData()
      } else {
        const err = await response.json()
        toast.error('Error', { description: err.error })
      }
    } catch (error) {
      console.error('Error deleting phase:', error)
      toast.error('Failed to delete phase')
    } finally {
      setSaving(false)
    }
  }

  const handleEditWhitelist = async (whitelistId: string) => {
    const whitelist = whitelists.find(w => w.id === whitelistId)
    if (!whitelist) return

    // Set basic info
    setEditingWhitelistId(whitelistId)
    setNewWhitelistName(whitelist.name)
    setNewWhitelistDescription(whitelist.description || '')

    // Fetch existing addresses
    try {
      const response = await fetch(`/api/launchpad/${collectionId}/whitelists?whitelist_id=${whitelistId}&wallet_address=${encodeURIComponent(currentAddress || '')}`)
      if (response.ok) {
        const data = await response.json()
        const addresses = data.entries || []
        setExistingWhitelistAddresses(addresses)
        setNewWhitelistAddresses('') // Clear new addresses field
        setRemovedWhitelistAddresses([]) // Reset removed addresses
      } else {
        // If fetch fails, just set empty addresses
        setExistingWhitelistAddresses([])
        setNewWhitelistAddresses('')
        setRemovedWhitelistAddresses([])
      }
    } catch (error) {
      console.error('Error fetching whitelist entries:', error)
      setExistingWhitelistAddresses([])
      setNewWhitelistAddresses('')
      setRemovedWhitelistAddresses([])
    }

    setShowNewWhitelistForm(true)
  }

  const handleRemoveWhitelistAddress = (addressToRemove: string) => {
    setExistingWhitelistAddresses((prev: string[]) => prev.filter(addr => addr !== addressToRemove))
    setRemovedWhitelistAddresses((prev: string[]) => [...prev, addressToRemove])
  }

  const handleDeleteWhitelist = async (whitelistId: string) => {
    if (!currentAddress) return

    setSaving(true)
    try {
      // Generate signed authentication
      const auth = await generateApiAuth(currentAddress, signMessage)
      if (!auth) {
        toast.error('Failed to sign request. Please ensure your wallet is connected.')
        setSaving(false)
        return
      }

      const params = new URLSearchParams({
        wallet_address: auth.wallet_address,
        signature: auth.signature,
        message: auth.message,
        timestamp: auth.timestamp.toString(),
        whitelist_id: whitelistId,
      })
      
      const response = await fetch(`/api/launchpad/${collectionId}/whitelists?${params.toString()}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        toast.success('Whitelist deleted!')
        setShowDeleteWhitelistConfirm(null)
        loadData()
      } else {
        const err = await response.json()
        toast.error('Error', { description: err.error })
      }
    } catch (error) {
      console.error('Error deleting whitelist:', error)
      toast.error('Failed to delete whitelist')
    } finally {
      setSaving(false)
    }
  }

  const handleLaunch = async () => {
    if (!currentAddress) {
      toast.error('Please connect your wallet')
      return
    }
    
    setSaving(true)
    try {
      // Generate signed authentication
      const auth = await generateApiAuth(currentAddress, signMessage)
      if (!auth) {
        toast.error('Failed to sign request. Please ensure your wallet is connected.')
        setSaving(false)
        return
      }

      const response = await fetch(`/api/launchpad/${collectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...auth,
          launch_status: 'live',
        }),
      })
      
      if (response.ok) {
        const data = await response.json()
        toast.success(data.message || 'Collection launched!')
        setShowLaunchConfirm(false)
        loadData()
        router.push(`/launchpad/${collectionId}`)
      } else {
        const err = await response.json()
        toast.error('Error', { description: err.error || 'Failed to launch collection' })
      }
    } catch (error) {
      console.error('Error launching:', error)
      toast.error('Failed to launch collection')
    } finally {
      setSaving(false)
    }
  }

  const handleEndLiveMint = async () => {
    if (!currentAddress) {
      toast.error('Please connect your wallet')
      return
    }
    
    setSaving(true)
    try {
      // Generate signed authentication
      const auth = await generateApiAuth(currentAddress, signMessage)
      if (!auth) {
        toast.error('Failed to sign request. Please ensure your wallet is connected.')
        setSaving(false)
        return
      }

      const response = await fetch(`/api/launchpad/${collectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...auth,
          collection_status: 'launchpad',
        }),
      })
      
      if (response.ok) {
        toast.success('Live mint ended. Collection is no longer visible on launchpad.')
        loadData()
      } else {
        const err = await response.json()
        toast.error('Error', { description: err.error || 'Failed to end live mint' })
      }
    } catch (error) {
      console.error('Error ending live mint:', error)
      toast.error('Failed to end live mint')
    } finally {
      setSaving(false)
    }
  }

  // Not connected - show connect prompt FIRST (before loading check)
  if (!isConnected || !currentAddress) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-7xl mx-auto text-center">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#e27d0f]/50 rounded-xl p-8 max-w-2xl mx-auto">
            <div className="text-6xl mb-4">🔐</div>
            <h2 className="text-2xl font-bold text-white mb-4">Wallet Connection Required</h2>
            <p className="text-white/70 mb-6">
              Please connect your wallet to access collection launch settings.
            </p>
            <Link href="/collections" className="px-6 py-3 bg-[#4561ad] hover:bg-[#3a5294] text-white rounded-lg font-semibold transition-colors inline-block">
              Go to Collections
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Security check: Must be connected and must be owner/collaborator
  const isOwner = collection && currentAddress && 
    (collection as any)?.creator_wallet === currentAddress
  
  // Check if user is a collaborator (from API response)
  const isCollaborator = collection && (collection as any)?.is_collaborator === true
  
  const hasAccess = isConnected && currentAddress && (isOwner || isCollaborator || (collection as any)?.is_owner === true)

  const handleStatusChangeConfirm = async () => {
    if (!currentAddress) {
      toast.error('Please connect your wallet first')
      return
    }

    setSaving(true)
    try {
      // Generate signed authentication
      const auth = await generateApiAuth(currentAddress, signMessage)
      if (!auth) {
        toast.error('Failed to sign request. Please ensure your wallet is connected.')
        setSaving(false)
        return
      }

      const response = await fetch(`/api/launchpad/${collectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...auth,
          collection_status: 'launchpad',
        }),
      })

      if (response.ok) {
        toast.success('Collection status updated to Launchpad')
        setShowStatusChangeConfirm(false)
        setCollectionStatusError(null)
        // Reload data now that status is updated
        await loadData()
      } else {
        const err = await response.json()
        toast.error('Error', { description: err.error || 'Failed to update collection status' })
      }
    } catch (error) {
      console.error('Error updating collection status:', error)
      toast.error('Failed to update collection status')
    } finally {
      setSaving(false)
    }
  }

  const handleRevertToDraft = async () => {
    if (!currentAddress) {
      toast.error('Please connect your wallet first')
      return
    }

    setSaving(true)
    try {
      // Generate signed authentication
      const auth = await generateApiAuth(currentAddress, signMessage)
      if (!auth) {
        toast.error('Failed to sign request. Please ensure your wallet is connected.')
        setSaving(false)
        return
      }

      const response = await fetch(`/api/launchpad/${collectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...auth,
          collection_status: 'draft',
        }),
      })

      if (response.ok) {
        toast.success('Collection status reverted to Draft')
        setShowRevertToDraftConfirm(false)
        // Reload data now that status is updated
        await loadData()
        // Redirect to collection details page
        router.push(`/collections/${collectionId}`)
      } else {
        const err = await response.json()
        toast.error('Error', { description: err.error || 'Failed to revert collection status' })
      }
    } catch (error) {
      console.error('Error reverting collection status:', error)
      toast.error('Failed to revert collection status')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-12">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="w-12 h-12 border-4 border-[#4561ad] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // Show status change confirmation if collection is draft
  if (showStatusChangeConfirm && collectionStatusError) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-7xl mx-auto text-center">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#e27d0f]/50 rounded-xl p-8 max-w-2xl mx-auto">
            <div className="text-6xl mb-4">🚀</div>
            <h2 className="text-2xl font-bold text-white mb-4">Change Collection Status to Launchpad?</h2>
            <p className="text-white/70 mb-6">
              This collection is currently in <strong>draft</strong> status. To access the launchpad editor, you need to change the status to <strong>launchpad</strong>.
            </p>
            <p className="text-[#a8a8b8]/80 text-sm mb-6">
              This will make your collection available for launchpad configuration. You can still edit all settings after this change.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => {
                  setShowStatusChangeConfirm(false)
                  router.push(`/collections/${collectionId}`)
                }}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold transition-colors border border-[#9945FF]/30"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleStatusChangeConfirm}
                disabled={saving}
                className="px-6 py-3 bg-[#e27d0f] hover:bg-[#c96a0a] text-white rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Updating...' : 'Yes, Change to Launchpad'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!collection && !showStatusChangeConfirm) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-white/70">Collection not found</p>
        </div>
      </div>
    )
  }

  // Not authorized - show access denied
  if (!hasAccess) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-7xl mx-auto text-center">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#DC1FFF]/50 rounded-xl p-8 max-w-2xl mx-auto">
            <div className="text-6xl mb-4">🚫</div>
            <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
            <p className="text-white/70 mb-6">
              You don't have permission to edit this collection. Only the collection owner or authorized collaborators can access launch settings.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/collections" className="px-6 py-3 bg-[#4561ad] hover:bg-[#3a5294] text-white rounded-lg font-semibold transition-colors">
                Go to Collections
              </Link>
              <Link href={`/launchpad/${collectionId}`} className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold transition-colors border border-[#9945FF]/30">
                View on Launchpad
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Check if collection is in launchpad status but not launched (not launchpad_live)
  const isLaunchpadButNotLive = collection?.collection_status === 'launchpad'

  return (
    <div className="container mx-auto px-6 py-12">
      <div className="max-w-7xl mx-auto">
        {/* Revert to Draft Button - Show if collection is launchpad but not launched */}
        {isLaunchpadButNotLive && (
          <div className="mb-6 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-amber-500/30 rounded-xl p-4 bg-amber-500/10">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Collection Status: Launchpad (Not Launched)</h3>
                <p className="text-white/70 text-sm">
                  This collection is set to launchpad status but hasn't been launched yet. You can revert it back to draft if needed.
                </p>
              </div>
              <button
                onClick={() => setShowRevertToDraftConfirm(true)}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Revert to Draft
              </button>
            </div>
          </div>
        )}

        <StepNavigation 
          currentStep={currentStep} 
          collectionName={collection?.name ?? ''} 
          collectionId={collectionId}
          onStepClick={(step) => {
            // Allow free navigation to steps 1-4, but step 5 (Launch) might need validation
            if (step === 5) {
              // For launch step, you might want to add validation here
              // For now, allow navigation
            }
            setCurrentStep(step)
          }}
        />

        {/* Step Content */}
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-xl p-8">
          {/* Step 1: Collection Settings */}
          {currentStep === 1 && (
            <CollectionSettingsStep
              collectionDescription={collectionDescription}
              setCollectionDescription={setCollectionDescription}
              bannerUrl={bannerUrl}
              setBannerUrl={setBannerUrl}
              mobileUrl={mobileUrl}
              setMobileUrl={setMobileUrl}
              audioUrl={audioUrl}
              setAudioUrl={setAudioUrl}
              videoUrl={videoUrl}
              setVideoUrl={setVideoUrl}
              twitterUrl={twitterUrl}
              setTwitterUrl={setTwitterUrl}
              discordUrl={discordUrl}
              setDiscordUrl={setDiscordUrl}
              telegramUrl={telegramUrl}
              setTelegramUrl={setTelegramUrl}
              websiteUrl={websiteUrl}
              setWebsiteUrl={setWebsiteUrl}
              creatorRoyaltyWallet={creatorRoyaltyWallet}
              setCreatorRoyaltyWallet={setCreatorRoyaltyWallet}
              extendLastPhase={extendLastPhase}
              setExtendLastPhase={setExtendLastPhase}
              capSupply={capSupply}
              setCapSupply={setCapSupply}
              totalSupply={collection?.total_supply || 0}
              mintType={mintType}
              setMintType={setMintType}
              uploadingBanner={uploadingBanner}
              uploadingMobile={uploadingMobile}
              uploadingAudio={uploadingAudio}
              bannerFileName={bannerFileName}
              mobileFileName={mobileFileName}
              audioFileName={audioFileName}
              onUploadMedia={uploadLaunchMedia}
              onOpenPromoModal={handleOpenPromoModal}
              onSave={handleSaveSettings}
              saving={saving}
            />
          )}

          {/* Step 2: Mint Phases */}
          {currentStep === 2 && (
            <MintPhasesStep
              phases={phases}
              whitelists={whitelists}
              showNewPhaseForm={showNewPhaseForm}
              setShowNewPhaseForm={setShowNewPhaseForm}
              editingPhaseId={editingPhaseId}
              setEditingPhaseId={setEditingPhaseId}
              newPhaseName={newPhaseName}
              setNewPhaseName={setNewPhaseName}
              newPhasePrice={newPhasePrice}
              setNewPhasePrice={setNewPhasePrice}
              newPhaseStartTime={newPhaseStartTime}
              setNewPhaseStartTime={setNewPhaseStartTime}
              newPhaseEndTime={newPhaseEndTime}
              setNewPhaseEndTime={setNewPhaseEndTime}
              newPhaseWhitelistOnly={newPhaseWhitelistOnly}
              setNewPhaseWhitelistOnly={setNewPhaseWhitelistOnly}
              newPhaseWhitelistId={newPhaseWhitelistId}
              setNewPhaseWhitelistId={setNewPhaseWhitelistId}
              newPhaseMaxPerWallet={newPhaseMaxPerWallet}
              setNewPhaseMaxPerWallet={setNewPhaseMaxPerWallet}
              newPhaseAllocation={newPhaseAllocation}
              setNewPhaseAllocation={setNewPhaseAllocation}
              onCreatePhase={handleCreatePhase}
              onEditPhase={handleEditPhase}
              onDeletePhase={(phaseId) => setShowDeletePhaseConfirm(phaseId)}
              onBack={() => setCurrentStep(1)}
              onContinue={() => setCurrentStep(3)}
              saving={saving}
            />
          )}

          {/* Step 3: Whitelists */}
          {currentStep === 3 && (
            <WhitelistsStep
              whitelists={whitelists}
              showNewWhitelistForm={showNewWhitelistForm}
              setShowNewWhitelistForm={setShowNewWhitelistForm}
              editingWhitelistId={editingWhitelistId}
              setEditingWhitelistId={setEditingWhitelistId}
              newWhitelistName={newWhitelistName}
              setNewWhitelistName={setNewWhitelistName}
              newWhitelistDescription={newWhitelistDescription}
              setNewWhitelistDescription={setNewWhitelistDescription}
              newWhitelistAddresses={newWhitelistAddresses}
              setNewWhitelistAddresses={setNewWhitelistAddresses}
              existingWhitelistAddresses={existingWhitelistAddresses}
              onRemoveWhitelistAddress={handleRemoveWhitelistAddress}
              onCreateWhitelist={handleCreateWhitelist}
              onEditWhitelist={handleEditWhitelist}
              onDeleteWhitelist={(whitelistId) => setShowDeleteWhitelistConfirm(whitelistId)}
              onBack={() => setCurrentStep(2)}
              onContinue={() => setCurrentStep(4)}
              saving={saving}
            />
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <ReviewStep
              collectionDescription={collectionDescription}
              bannerUrl={bannerUrl}
              creatorRoyaltyWallet={creatorRoyaltyWallet}
              twitterUrl={twitterUrl}
              discordUrl={discordUrl}
              telegramUrl={telegramUrl}
              websiteUrl={websiteUrl}
              phases={phases}
              whitelists={whitelists}
              onBack={() => setCurrentStep(3)}
              onContinue={() => setCurrentStep(5)}
            />
          )}

          {/* Step 5: Launch */}
          {currentStep === 5 && collection && (
            <LaunchStep
              collection={collection}
              onLaunch={() => setShowLaunchConfirm(true)}
              onEndLiveMint={handleEndLiveMint}
              onBack={() => setCurrentStep(4)}
              saving={saving}
            />
                )}
              </div>
              </div>

        {/* Confirmation Dialogs */}
        <ConfirmDialog
          isOpen={showLaunchConfirm}
          onClose={() => setShowLaunchConfirm(false)}
        onConfirm={handleLaunch}
        title="Launch Collection"
        message="Are you sure you want to launch this collection? Once launched, it will be live on the launchpad."
          confirmText="Launch"
          cancelText="Cancel"
        confirmButtonClass="bg-[#e27d0f] hover:bg-[#c96a0a]"
          loading={saving}
        />
          <ConfirmDialog
          isOpen={showDeletePhaseConfirm !== null}
            onClose={() => setShowDeletePhaseConfirm(null)}
          onConfirm={() => showDeletePhaseConfirm && handleDeletePhase(showDeletePhaseConfirm)}
            title="Delete Phase"
          message="Are you sure you want to delete this phase? This action cannot be undone."
            confirmText="Delete"
            cancelText="Cancel"
          confirmButtonClass="bg-red-500 hover:bg-red-600"
          loading={saving}
          />
          <ConfirmDialog
          isOpen={showDeleteWhitelistConfirm !== null}
            onClose={() => setShowDeleteWhitelistConfirm(null)}
          onConfirm={() => showDeleteWhitelistConfirm && handleDeleteWhitelist(showDeleteWhitelistConfirm)}
            title="Delete Whitelist"
          message="Are you sure you want to delete this whitelist? This action cannot be undone."
            confirmText="Delete"
            cancelText="Cancel"
          confirmButtonClass="bg-red-500 hover:bg-red-600"
          loading={saving}
        />
        <ConfirmDialog
          isOpen={showRevertToDraftConfirm}
          onClose={() => setShowRevertToDraftConfirm(false)}
          onConfirm={handleRevertToDraft}
          title="Revert Collection to Draft?"
          message="Are you sure you want to revert this collection back to draft status? This will remove it from launchpad configuration. You can always change it back to launchpad later."
          confirmText="Yes, Revert to Draft"
          cancelText="Cancel"
          confirmButtonClass="bg-amber-600 hover:bg-amber-700"
          loading={saving}
        />

        {/* Promo Modal */}
        <PromoModal
          isOpen={showPromoModal}
          onClose={() => setShowPromoModal(false)}
          promoHistory={promoHistory}
          loading={loadingPromo}
          onSelect={handleSelectPromo}
          mode={promoModalMode}
        />
    </div>
  )
}
