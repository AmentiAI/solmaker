'use client'

import React from 'react'

interface CollectionSettingsStepProps {
  collectionDescription: string
  setCollectionDescription: (value: string) => void
  bannerUrl: string
  setBannerUrl: (value: string) => void
  mobileUrl: string
  setMobileUrl: (value: string) => void
  audioUrl: string
  setAudioUrl: (value: string) => void
  videoUrl: string
  setVideoUrl: (value: string) => void
  twitterUrl: string
  setTwitterUrl: (value: string) => void
  discordUrl: string
  setDiscordUrl: (value: string) => void
  telegramUrl: string
  setTelegramUrl: (value: string) => void
  websiteUrl: string
  setWebsiteUrl: (value: string) => void
  creatorRoyaltyWallet: string
  setCreatorRoyaltyWallet: (value: string) => void
  extendLastPhase: boolean
  setExtendLastPhase: (value: boolean) => void
  capSupply: number | null
  setCapSupply: (value: number | null) => void
  totalSupply: number
  mintType: 'hidden' | 'choices' | 'agent_only' | 'agent_and_human'
  setMintType: (value: 'hidden' | 'choices' | 'agent_only' | 'agent_and_human') => void
  uploadingBanner: boolean
  uploadingMobile: boolean
  uploadingAudio: boolean
  bannerFileName: string
  mobileFileName: string
  audioFileName: string
  onUploadMedia: (kind: 'banner' | 'mobile' | 'audio', file: File) => void
  onOpenPromoModal: (mode: 'banner' | 'mobile') => void
  onSave: () => void
  saving: boolean
}

export function CollectionSettingsStep({
  collectionDescription,
  setCollectionDescription,
  bannerUrl,
  setBannerUrl,
  mobileUrl,
  setMobileUrl,
  audioUrl,
  setAudioUrl,
  videoUrl,
  setVideoUrl,
  twitterUrl,
  setTwitterUrl,
  discordUrl,
  setDiscordUrl,
  telegramUrl,
  setTelegramUrl,
  websiteUrl,
  setWebsiteUrl,
  creatorRoyaltyWallet,
  setCreatorRoyaltyWallet,
  extendLastPhase,
  setExtendLastPhase,
  capSupply,
  setCapSupply,
  totalSupply,
  mintType,
  setMintType,
  uploadingBanner,
  uploadingMobile,
  uploadingAudio,
  bannerFileName,
  mobileFileName,
  audioFileName,
  onUploadMedia,
  onOpenPromoModal,
  onSave,
  saving,
}: CollectionSettingsStepProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white mb-6">Step 1: Collection Settings</h2>
      
      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">Collection Description</label>
        <textarea
          value={collectionDescription}
          onChange={(e) => setCollectionDescription(e.target.value)}
          rows={4}
          placeholder="Write a short description that appears on the launchpad..."
          className="w-full px-4 py-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">Banner Image *</label>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              id="bannerUpload"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  onUploadMedia('banner', f)
                }
                e.currentTarget.value = ''
              }}
              disabled={uploadingBanner}
              className="hidden"
            />
            <label
              htmlFor="bannerUpload"
              className={`inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                uploadingBanner
                  ? 'bg-white/10 text-white/50 cursor-not-allowed'
                  : 'bg-[#00d4ff] text-white hover:bg-[#14F195] cursor-pointer'
              }`}
            >
              {uploadingBanner ? 'Uploading...' : 'Upload Banner'}
            </label>
            <button
              type="button"
              onClick={() => onOpenPromoModal('banner')}
              disabled={uploadingBanner}
              className="px-4 py-2 rounded-lg font-semibold text-sm transition-colors bg-white/10 hover:bg-white/20 text-white border border-[#00d4ff]/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Choose from History
            </button>
            {bannerUrl && (
              <button
                type="button"
                onClick={() => setBannerUrl('')}
                className="px-3 py-2 text-sm font-semibold rounded-lg border border-[#00d4ff]/30 hover:bg-white/10 text-white"
              >
                Clear
              </button>
            )}
          </div>
          {bannerUrl && (
            <>
              <input
                type="text"
                value={bannerUrl}
                readOnly
                className="w-full px-4 py-2 border border-[#00d4ff]/30 rounded-lg bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white"
              />
              <div className="mt-2">
                <img
                  src={bannerUrl}
                  alt="Banner preview"
                  className="h-20 rounded border border-[#00d4ff]/30 shadow-sm"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">Mobile/Thumbnail Image</label>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              id="mobileUpload"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  onUploadMedia('mobile', f)
                }
                e.currentTarget.value = ''
              }}
              disabled={uploadingMobile}
              className="hidden"
            />
            <label
              htmlFor="mobileUpload"
              className={`inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                uploadingMobile
                  ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
                  : 'bg-[#4561ad] text-white hover:bg-[#3a5294] cursor-pointer'
              }`}
            >
              {uploadingMobile ? 'Uploading...' : 'Upload Thumbnail'}
            </label>
            <button
              type="button"
              onClick={() => onOpenPromoModal('mobile')}
              disabled={uploadingMobile}
              className="px-4 py-2 rounded-lg font-semibold text-sm transition-colors bg-white/10 hover:bg-white/20 text-white border border-[#00d4ff]/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Choose from History
            </button>
            {mobileUrl && (
              <button
                type="button"
                onClick={() => setMobileUrl('')}
                className="px-3 py-2 text-sm font-semibold rounded-lg border border-[#00d4ff]/30 hover:bg-white/10 text-white"
              >
                Clear
              </button>
            )}
          </div>
          {mobileUrl && (
            <>
              <input
                type="text"
                value={mobileUrl}
                readOnly
                className="w-full px-4 py-2 border border-[#00d4ff]/30 rounded-lg bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white"
              />
              <div className="mt-2">
                <img
                  src={mobileUrl}
                  alt="Mobile/Thumbnail preview"
                  className="h-20 w-20 object-cover rounded border border-[#00d4ff]/30 shadow-sm"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">Background Music (MP3)</label>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <input
              id="audioUpload"
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  onUploadMedia('audio', f)
                }
                e.currentTarget.value = ''
              }}
              disabled={uploadingAudio}
              className="hidden"
            />
            <label
              htmlFor="audioUpload"
              className={`inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                uploadingAudio
                  ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
                  : 'bg-[#4561ad] text-white hover:bg-[#3a5294] cursor-pointer'
              }`}
            >
              {uploadingAudio ? 'Uploading...' : 'Upload Audio'}
            </label>
            {audioUrl && (
              <button
                type="button"
                onClick={() => setAudioUrl('')}
                className="px-3 py-2 text-sm font-semibold rounded-lg border border-[#00d4ff]/30 hover:bg-white/10 text-white"
              >
                Clear
              </button>
            )}
          </div>
          {audioUrl && (
            <>
              <input
                type="text"
                value={audioUrl}
                readOnly
                className="w-full px-4 py-2 border border-[#00d4ff]/30 rounded-lg bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white"
              />
              <div className="mt-2">
                <audio src={audioUrl} controls className="h-10" />
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">YouTube Video URL</label>
        <input
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
        />
      </div>

      {/* Social Links */}
      <div className="border-t border-[#00d4ff]/30 pt-6">
        <h3 className="text-lg font-semibold text-white mb-4">Social Links</h3>
        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Twitter/X URL</label>
            <input
              type="url"
              value={twitterUrl}
              onChange={(e) => setTwitterUrl(e.target.value)}
              placeholder="https://twitter.com/yourhandle"
              className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Discord URL</label>
            <input
              type="url"
              value={discordUrl}
              onChange={(e) => setDiscordUrl(e.target.value)}
              placeholder="https://discord.gg/yourinvite"
              className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Telegram URL</label>
            <input
              type="url"
              value={telegramUrl}
              onChange={(e) => setTelegramUrl(e.target.value)}
              placeholder="https://t.me/yourchannel"
              className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Website URL</label>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yourwebsite.com"
              className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">
          Creator Payment Wallet (Solana Address) *
        </label>
        <p className="text-xs text-white/40 mb-2">
          Mint payments go to this address. Defaults to your connected wallet.
        </p>
        <input
          type="text"
          value={creatorRoyaltyWallet}
          onChange={(e) => setCreatorRoyaltyWallet(e.target.value)}
          placeholder="Your Solana wallet address (e.g., D3SNZ...GiLJ)"
          className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] font-mono text-sm text-white placeholder:text-white/50"
        />
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="extendLastPhase"
          checked={extendLastPhase}
          onChange={(e) => setExtendLastPhase(e.target.checked)}
          className="w-4 h-4 text-[#4561ad] rounded"
        />
        <label htmlFor="extendLastPhase" className="text-sm text-white/70">
          Extend last phase until mint out (ignore end time)
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">
          Cap Supply
        </label>
        <input
          type="number"
          value={capSupply !== null ? capSupply : ''}
          onChange={(e) => {
            const value = e.target.value === '' ? null : parseInt(e.target.value, 10)
            if (value === null || (value >= 0 && value <= totalSupply)) {
              setCapSupply(value)
            }
          }}
          min={0}
          max={totalSupply}
          placeholder={totalSupply.toString()}
          className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
        />
        <p className="text-xs text-[#a8a8b8]/80 mt-1">
          Maximum number of mints allowed. Defaults to total supply ({totalSupply}). 
          {capSupply !== null && capSupply < totalSupply && ` Minting will stop at ${capSupply} instead of ${totalSupply}.`}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">
          Mint Type
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-3 p-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg cursor-pointer hover:border-[#00d4ff]/50 transition-colors">
            <input
              type="radio"
              name="mintType"
              value="hidden"
              checked={mintType === 'hidden'}
              onChange={(e) => setMintType(e.target.value as typeof mintType)}
              className="w-4 h-4 text-[#00d4ff]"
            />
            <div className="flex-1">
              <div className="font-semibold text-white">🎲 Mystery Mint</div>
              <div className="text-sm text-[#a8a8b8]/80">Default system - random NFT assignment when minting</div>
            </div>
          </label>
          <label className="flex items-center gap-3 p-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg cursor-pointer hover:border-[#00d4ff]/50 transition-colors">
            <input
              type="radio"
              name="mintType"
              value="choices"
              checked={mintType === 'choices'}
              onChange={(e) => setMintType(e.target.value as typeof mintType)}
              className="w-4 h-4 text-[#00d4ff]"
            />
            <div className="flex-1">
              <div className="font-semibold text-white">🎯 Choose Your NFT</div>
              <div className="text-sm text-[#a8a8b8]/80">Paginated browsing - users select specific NFTs to mint</div>
            </div>
          </label>
          <label className="flex items-center gap-3 p-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg cursor-pointer hover:border-[#00d4ff]/50 transition-colors">
            <input
              type="radio"
              name="mintType"
              value="agent_only"
              checked={mintType === 'agent_only'}
              onChange={(e) => setMintType(e.target.value as typeof mintType)}
              className="w-4 h-4 text-[#00d4ff]"
            />
            <div className="flex-1">
              <div className="font-semibold text-white">🤖 Agent Only</div>
              <div className="text-sm text-[#a8a8b8]/80">Only AI agents can mint via API — no manual mint button</div>
            </div>
          </label>
          <label className="flex items-center gap-3 p-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg cursor-pointer hover:border-[#00d4ff]/50 transition-colors">
            <input
              type="radio"
              name="mintType"
              value="agent_and_human"
              checked={mintType === 'agent_and_human'}
              onChange={(e) => setMintType(e.target.value as typeof mintType)}
              className="w-4 h-4 text-[#00d4ff]"
            />
            <div className="flex-1">
              <div className="font-semibold text-white">🤖+👤 Agent + Human</div>
              <div className="text-sm text-[#a8a8b8]/80">Both AI agents and humans can mint — agents use API, humans use the mint button</div>
            </div>
          </label>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-[#00d4ff]/30">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-6 py-2 bg-[#00d4ff] hover:bg-[#14F195] text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </div>
  )
}

