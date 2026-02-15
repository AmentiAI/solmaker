'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'
import { toast } from 'sonner'

interface Collection {
  id: string
  name: string
  description: string | null
  wallet_address: string
  is_locked: boolean
  collection_status: string
  launch_status: string | null
  banner_image_url: string | null
  mobile_image_url: string | null
  banner_video_url: string | null
  audio_url: string | null
  video_url: string | null
  extend_last_phase: boolean | null
  creator_royalty_wallet: string | null
  creator_royalty_percent: number | null
  hidden_from_homepage: boolean | null
  force_show_on_homepage_ticker: boolean | null
  twitter_url: string | null
  discord_url: string | null
  telegram_url: string | null
  website_url: string | null
  total_ordinals: number
  minted_count: number
  phase_count: number
}

export default function AdminCollectionEditPage() {
  const params = useParams()
  const router = useRouter()
  const { isConnected, currentAddress } = useWallet()
  const isAdminUser = isAdmin(currentAddress)
  const collectionId = params.id as string

  const [collection, setCollection] = useState<Collection | null>(null)
  const [phases, setPhases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPhase, setSavingPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [collectionStatus, setCollectionStatus] = useState('draft')
  const [launchStatus, setLaunchStatus] = useState<string | null>(null)
  const [bannerImageUrl, setBannerImageUrl] = useState('')
  const [mobileImageUrl, setMobileImageUrl] = useState('')
  const [bannerVideoUrl, setBannerVideoUrl] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [extendLastPhase, setExtendLastPhase] = useState(false)
  const [creatorRoyaltyWallet, setCreatorRoyaltyWallet] = useState('')
  const [creatorRoyaltyPercent, setCreatorRoyaltyPercent] = useState<number | null>(null)
  const [hiddenFromHomepage, setHiddenFromHomepage] = useState(false)
  const [forceShowOnHomepageTicker, setForceShowOnHomepageTicker] = useState(false)
  const [twitterUrl, setTwitterUrl] = useState('')
  const [discordUrl, setDiscordUrl] = useState('')
  const [telegramUrl, setTelegramUrl] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')

  useEffect(() => {
    if (isConnected && isAdminUser && currentAddress && collectionId) {
      loadCollection()
    }
  }, [isConnected, isAdminUser, currentAddress, collectionId])

  const loadCollection = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/admin/collections/${collectionId}?wallet_address=${encodeURIComponent(currentAddress)}`
      )

      if (!response.ok) {
        if (response.status === 403) {
          setError('Unauthorized. Admin access only.')
        } else {
          const errorData = await response.json()
          setError(errorData.error || 'Failed to load collection')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      const coll = data.collection

      setCollection(coll)
      setPhases(data.phases || [])
      setName(coll.name || '')
      setDescription(coll.description || '')
      setIsLocked(coll.is_locked || false)
      setCollectionStatus(coll.collection_status || 'draft')
      setLaunchStatus(coll.launch_status || null)
      setBannerImageUrl(coll.banner_image_url || '')
      setMobileImageUrl(coll.mobile_image_url || '')
      setBannerVideoUrl(coll.banner_video_url || '')
      setAudioUrl(coll.audio_url || '')
      setVideoUrl(coll.video_url || '')
      setExtendLastPhase(coll.extend_last_phase || false)
      setCreatorRoyaltyWallet(coll.creator_royalty_wallet || '')
      setCreatorRoyaltyPercent(coll.creator_royalty_percent || null)
      setHiddenFromHomepage(coll.hidden_from_homepage || false)
      setForceShowOnHomepageTicker(coll.force_show_on_homepage_ticker || false)
      setTwitterUrl(coll.twitter_url || '')
      setDiscordUrl(coll.discord_url || '')
      setTelegramUrl(coll.telegram_url || '')
      setWebsiteUrl(coll.website_url || '')
    } catch (err: any) {
      console.error('Error loading collection:', err)
      setError(err.message || 'Failed to load collection')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!currentAddress || !collectionId) return

    setSaving(true)
    setError(null)

    try {
      const updates = {
        name: name || undefined,
        description: description || undefined,
        is_locked: isLocked,
        collection_status: collectionStatus || undefined,
        launch_status: launchStatus || undefined,
        banner_image_url: bannerImageUrl || undefined,
        mobile_image_url: mobileImageUrl || undefined,
        banner_video_url: bannerVideoUrl || undefined,
        audio_url: audioUrl || undefined,
        video_url: videoUrl || undefined,
        extend_last_phase: extendLastPhase,
        creator_royalty_wallet: creatorRoyaltyWallet || undefined,
        creator_royalty_percent: creatorRoyaltyPercent || undefined,
        hidden_from_homepage: hiddenFromHomepage,
        force_show_on_homepage_ticker: forceShowOnHomepageTicker,
        twitter_url: twitterUrl || undefined,
        discord_url: discordUrl || undefined,
        telegram_url: telegramUrl || undefined,
        website_url: websiteUrl || undefined,
      }

      const response = await fetch(
        `/api/admin/collections/${collectionId}?wallet_address=${encodeURIComponent(currentAddress)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update collection')
      }

      toast.success('Collection updated successfully')
      await loadCollection()
    } catch (err: any) {
      console.error('Error saving collection:', err)
      setError(err.message || 'Failed to save collection')
      toast.error('Failed to save collection', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdatePhase = async (phaseId: string, updates: any) => {
    if (!currentAddress || !collectionId) return

    setSavingPhase(phaseId)
    setError(null)

    try {
      const response = await fetch(
        `/api/admin/collections/${collectionId}/phases/${phaseId}?wallet_address=${encodeURIComponent(currentAddress)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update phase')
      }

      toast.success('Phase updated successfully')
      await loadCollection()
    } catch (err: any) {
      console.error('Error updating phase:', err)
      setError(err.message || 'Failed to update phase')
      toast.error('Failed to update phase', { description: err.message })
    } finally {
      setSavingPhase(null)
    }
  }

  if (!isConnected || !isAdminUser) {
    return (
      <div className="min-h-screen bg-[#0a0e27] p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg shadow p-6 text-center">
            <p className="text-white/70">Please connect your wallet</p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="w-16 h-16 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/70">Loading collection...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !collection) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-red-500/50 rounded-lg shadow p-6">
            <p className="text-[#EF4444]">Error: {error}</p>
            <button
              onClick={() => router.push('/admin/collections')}
              className="mt-4 px-4 py-2 btn-cosmic text-white rounded"
            >
              Back to Collections
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Edit Collection</h1>
              <p className="text-white/70 mt-1">{collection?.name || collectionId}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/admin/collections')}
                className="px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 hover:border-[#9945FF]/50 text-white rounded"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 btn-cosmic text-white rounded disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-red-500/50 rounded-lg">
              <p className="text-[#EF4444]">Error: {error}</p>
            </div>
          )}

          {/* Collection Stats */}
          {collection && (
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg shadow mb-6 p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-white/70">Total Ordinals</p>
                  <p className="text-xl font-bold text-white">{collection.total_ordinals}</p>
                </div>
                <div>
                  <p className="text-sm text-white/70">Minted</p>
                  <p className="text-xl font-bold text-white">{collection.minted_count}</p>
                </div>
                <div>
                  <p className="text-sm text-white/70">Phases</p>
                  <p className="text-xl font-bold text-white">{collection.phase_count}</p>
                </div>
                <div>
                  <p className="text-sm text-white/70">Owner</p>
                  <p className="text-xs font-mono text-white/70 truncate">{collection.wallet_address}</p>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg shadow p-6 space-y-6">
            {/* Basic Info */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4">Basic Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Collection Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                  />
                </div>
              </div>
            </div>

            {/* Status & Settings */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4">Status & Settings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Collection Status</label>
                  <select
                    value={collectionStatus}
                    onChange={(e) => setCollectionStatus(e.target.value)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white"
                  >
                    <option value="draft">Draft</option>
                    <option value="launchpad">Launchpad</option>
                    <option value="launchpad_live">Launchpad Live</option>
                    <option value="self_inscribe">Self Inscribe</option>
                    <option value="marketplace">Marketplace</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Launch Status</label>
                  <select
                    value={launchStatus || ''}
                    onChange={(e) => setLaunchStatus(e.target.value || null)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white"
                  >
                    <option value="">None</option>
                    <option value="draft">Draft</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isLocked"
                    checked={isLocked}
                    onChange={(e) => setIsLocked(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="isLocked" className="text-sm font-medium text-white/70">
                    Locked
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="extendLastPhase"
                    checked={extendLastPhase}
                    onChange={(e) => setExtendLastPhase(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="extendLastPhase" className="text-sm font-medium text-white/70">
                    Extend Last Phase
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="hiddenFromHomepage"
                    checked={hiddenFromHomepage}
                    onChange={(e) => setHiddenFromHomepage(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="hiddenFromHomepage" className="text-sm font-medium text-white/70">
                    Hidden from Homepage
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="forceShowOnHomepageTicker"
                    checked={forceShowOnHomepageTicker}
                    onChange={(e) => setForceShowOnHomepageTicker(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="forceShowOnHomepageTicker" className="text-sm font-medium text-white/70">
                    Force Show on Homepage Ticker
                  </label>
                </div>
              </div>
            </div>

            {/* Media URLs */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4">Media URLs</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Banner Image URL</label>
                  <input
                    type="text"
                    value={bannerImageUrl}
                    onChange={(e) => setBannerImageUrl(e.target.value)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Mobile Image URL</label>
                  <input
                    type="text"
                    value={mobileImageUrl}
                    onChange={(e) => setMobileImageUrl(e.target.value)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Banner Video URL</label>
                  <input
                    type="text"
                    value={bannerVideoUrl}
                    onChange={(e) => setBannerVideoUrl(e.target.value)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Audio URL</label>
                  <input
                    type="text"
                    value={audioUrl}
                    onChange={(e) => setAudioUrl(e.target.value)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Video URL</label>
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                  />
                </div>
              </div>
            </div>

            {/* Royalty Settings */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4">Royalty Settings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Creator Royalty Wallet</label>
                  <input
                    type="text"
                    value={creatorRoyaltyWallet}
                    onChange={(e) => setCreatorRoyaltyWallet(e.target.value)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                    placeholder="bc1..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Creator Royalty Percent</label>
                  <input
                    type="number"
                    value={creatorRoyaltyPercent || ''}
                    onChange={(e) => setCreatorRoyaltyPercent(e.target.value ? Number(e.target.value) : null)}
                    min={0}
                    max={100}
                    step={0.01}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* Social Links */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4">Social Links</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Twitter URL</label>
                  <input
                    type="text"
                    value={twitterUrl}
                    onChange={(e) => setTwitterUrl(e.target.value)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Discord URL</label>
                  <input
                    type="text"
                    value={discordUrl}
                    onChange={(e) => setDiscordUrl(e.target.value)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Telegram URL</label>
                  <input
                    type="text"
                    value={telegramUrl}
                    onChange={(e) => setTelegramUrl(e.target.value)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Website URL</label>
                  <input
                    type="text"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF] text-white placeholder:text-white/50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Mint Phases Management */}
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg shadow p-6 mt-6">
            <h2 className="text-xl font-bold text-white mb-4">Mint Phases</h2>
            {phases.length === 0 ? (
              <p className="text-white/70">No phases configured for this collection.</p>
            ) : (
              <div className="space-y-4">
                {phases.map((phase) => (
                  <div
                    key={phase.id}
                    className="border border-[#9945FF]/20 rounded-lg p-4 bg-[#0a0e27]/50"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-bold text-white">{phase.phase_name}</h3>
                          {phase.is_active && (
                            <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30 rounded">
                              Active
                            </span>
                          )}
                          {phase.is_completed && (
                            <span className="px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded">
                              Completed
                            </span>
                          )}
                          {phase.whitelist_only && (
                            <span className="px-2 py-1 text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded">
                              Whitelist Only
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-white/70">Price:</span>
                            <span className="text-white ml-1">{(Number(phase.mint_price_sats) / 100000000).toFixed(8)} BTC</span>
                          </div>
                          <div>
                            <span className="text-white/70">Minted:</span>
                            <span className="text-white ml-1">{phase.phase_minted || 0}</span>
                            {phase.phase_allocation && (
                              <span className="text-white/50 ml-1">/ {phase.phase_allocation}</span>
                            )}
                          </div>
                          <div>
                            <span className="text-white/70">Max/Wallet:</span>
                            <span className="text-white ml-1">{phase.max_per_wallet || '∞'}</span>
                          </div>
                          <div>
                            <span className="text-white/70">Fee Rate:</span>
                            <span className="text-white ml-1">{phase.suggested_fee_rate || phase.min_fee_rate || '1'}</span>
                          </div>
                        </div>
                        {phase.start_time && phase.end_time && (
                          <div className="mt-2 text-xs text-[#a8a8b8]/80">
                            <span>{new Date(phase.start_time).toLocaleString()}</span>
                            <span className="mx-2">→</span>
                            <span>{new Date(phase.end_time).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleUpdatePhase(phase.id, { is_active: !phase.is_active })}
                        disabled={savingPhase === phase.id}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                          phase.is_active
                            ? 'bg-yellow-500/20 text-[#FBBF24] border border-yellow-500/30 hover:bg-yellow-500/30'
                            : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                        }`}
                      >
                        {savingPhase === phase.id ? 'Saving...' : phase.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleUpdatePhase(phase.id, { is_completed: !phase.is_completed })}
                        disabled={savingPhase === phase.id}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                          phase.is_completed
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                        }`}
                      >
                        {savingPhase === phase.id ? 'Saving...' : phase.is_completed ? 'Mark Incomplete' : 'Mark Complete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
    </div>
  )
}
