'use client'

import { useState, useEffect, useMemo } from 'react'
import { useProfile } from '@/lib/profile/useProfile'
import { useWallet } from '@/lib/wallet/compatibility'
import Link from 'next/link'

export function ProfileManager() {
  const { isConnected, currentAddress, paymentAddress } = useWallet()
  const { profile, loading, error, updateProfile } = useProfile()
  
  // Determine active wallet (Bitcoin only)
  const activeWalletAddress = useMemo(() => {
    return currentAddress
  }, [currentAddress])
  
  const activeWalletConnected = isConnected
  
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    displayName: '',
    bio: '',
    avatarUrl: '',
    twitterUrl: '',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setFormData({
        username: profile.username || '',
        displayName: profile.displayName || '',
        bio: profile.bio || '',
        avatarUrl: profile.avatarUrl || '',
        twitterUrl: profile.twitterUrl || '',
      })
      setAvatarPreview(profile.avatarUrl || null)
      // Don't auto-enter edit mode when profile loads
      setIsEditing(false)
    } else if (activeWalletConnected && activeWalletAddress && !loading) {
      // Only reset form for new profile if we're not still loading
      // This prevents clearing the form while profile is being fetched
      setFormData({
        username: '',
        displayName: '',
        bio: '',
        avatarUrl: '',
        twitterUrl: '',
      })
      setAvatarPreview(null)
      setIsEditing(true)
    }
  }, [profile, activeWalletConnected, activeWalletAddress, loading])

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeWalletAddress) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setSaveError('Please select an image file')
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setSaveError('Image must be less than 5MB')
      return
    }

    setUploadingAvatar(true)
    setSaveError(null)

    try {
      // Create preview
      const previewUrl = URL.createObjectURL(file)
      setAvatarPreview(previewUrl)

      // Upload to blob storage
      const uploadFormData = new FormData()
      uploadFormData.append('file', file)
      uploadFormData.append('wallet_address', activeWalletAddress)

      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: uploadFormData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const data = await response.json()
      
      // Update form data with the uploaded URL
      if (data.url) {
        setFormData(prev => ({ ...prev, avatarUrl: data.url }))
      } else {
        throw new Error('Upload succeeded but no URL returned')
      }
      
      // Clean up preview URL
      URL.revokeObjectURL(previewUrl)
    } catch (error: any) {
      console.error('Avatar upload error:', error)
      setSaveError(error.message || 'Failed to upload avatar')
      setAvatarPreview(formData.avatarUrl || null)
    } finally {
      setUploadingAvatar(false)
      // Reset file input
      e.target.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    console.log('[ProfileManager] Form submitted manually by user')
    console.log('[ProfileManager] Form data:', formData)
    
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    if (!formData.username.trim()) {
      setSaveError('Username is required')
      setSaving(false)
      return
    }

    const success = await updateProfile({
      username: formData.username.trim(),
      displayName: formData.displayName?.trim() || undefined,
      bio: formData.bio?.trim() || undefined,
      avatarUrl: formData.avatarUrl?.trim() || undefined,
      twitterUrl: formData.twitterUrl?.trim() || undefined,
    })

    if (success) {
      setSaveSuccess(true)
      setIsEditing(false)
      setTimeout(() => setSaveSuccess(false), 3000)
    } else {
      setSaveError('Failed to save profile')
    }

    setSaving(false)
  }

  if (!activeWalletConnected || !activeWalletAddress) {
    return (
      <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#00d4ff]/30 rounded-xl p-6 shadow-lg">
        <p className="text-[#a8a8b8]">Please connect your wallet to create a profile</p>
      </div>
    )
  }

  if (loading && !profile) {
    return (
      <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#00d4ff]/30 rounded-xl p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#00d4ff] border-t-transparent"></div>
          <p className="text-[#a8a8b8]">Loading profile...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-6 shadow-xl relative overflow-hidden col-span-1 sm:col-span-2">
      {/* Cosmic background effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-cyan-900/20 pointer-events-none"></div>
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#00d4ff]/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>
      
      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-[#00d4ff] via-purple-400 to-pink-400 bg-clip-text text-transparent mb-1">
              Account Information
            </h2>
            <p className="text-white/70 text-sm">Manage your cosmic profile</p>
          </div>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-gradient-to-r from-[#DC1FFF] to-[#9945FF] hover:from-[#9945FF] hover:to-[#DC1FFF] text-white rounded-lg font-semibold shadow-lg shadow-[#DC1FFF]/30 transition-all duration-200 text-sm whitespace-nowrap"
            >
              {profile ? 'Edit Profile' : 'Create Profile'}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#EF4444]/50 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 text-[#EF4444] rounded-lg backdrop-blur-sm">
            {error}
          </div>
        )}

        {saveError && (
          <div className="mb-4 p-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#EF4444]/50 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 text-[#EF4444] rounded-lg backdrop-blur-sm">
            {saveError}
          </div>
        )}

        {saveSuccess && (
          <div className="mb-4 p-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/50 bg-[#00d4ff]/10 text-[#00d4ff] rounded-lg backdrop-blur-sm">
            ✨ Profile saved successfully!
          </div>
        )}

        {/* Single column layout for better mobile/sidebar compatibility */}
        <div className="space-y-6">
          {/* Profile Information */}
          <div className="space-y-6">

            {isEditing ? (
              <form 
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleSubmit(e)
          }} 
          className="space-y-4"
          onKeyDown={(e) => {
            // Prevent accidental form submission on Enter key
            if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type !== 'submit') {
              e.preventDefault()
            }
          }}
        >
              {/* Avatar First */}
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-purple-500/30 rounded-xl p-6 bg-gradient-to-br from-purple-900/20 to-blue-900/20 backdrop-blur-sm">
                <label className="block text-sm font-medium text-white mb-4">
                  <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Avatar</span>
                </label>
                <div className="flex items-center gap-6">
                  {/* Avatar Preview/Upload */}
                  <div className="relative">
                    <label
                      htmlFor="avatar-upload"
                      className="cursor-pointer group"
                      title="Click to upload avatar"
                    >
                      <div className="w-32 h-32 rounded-full border-2 border-purple-500/50 group-hover:border-purple-400 transition-all duration-300 overflow-hidden bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md flex items-center justify-center relative shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40">
                        {avatarPreview || formData.avatarUrl ? (
                          <img
                            src={avatarPreview || formData.avatarUrl || ''}
                            alt="Avatar preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-white/50 group-hover:text-purple-400 transition-colors duration-200">
                            <svg
                              className="w-10 h-10 mb-2"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            <span className="text-xs font-medium">Upload</span>
                          </div>
                        )}
                        {uploadingAvatar && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full backdrop-blur-sm">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-400 border-t-transparent"></div>
                          </div>
                        )}
                      </div>
                    </label>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                      disabled={saving || uploadingAvatar}
                    />
                  </div>
                  
                  {/* Info text */}
                  <div className="flex-1">
                    <p className="text-sm text-[#a8a8b8] mb-2 font-medium">
                      Click to upload your cosmic avatar
                    </p>
                    <p className="text-xs text-[#a8a8b8]/80 mb-2">
                      Max size: 5MB • Formats: JPG, PNG, GIF, WebP
                    </p>
                    {formData.avatarUrl && (
                      <p className="text-xs text-purple-400 mt-2 font-semibold flex items-center gap-1">
                        <span>✨</span> Avatar uploaded successfully
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  <span className="bg-gradient-to-r from-[#00d4ff] to-purple-400 bg-clip-text text-transparent">Username</span> <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="username"
                  required
                  pattern="^[a-zA-Z0-9_-]{3,50}$"
                  className="w-full p-3.5 border-2 border-[#00d4ff]/30 rounded-lg bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md bg-black/20 text-white placeholder-white/50 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 focus:outline-none transition-all duration-200 backdrop-blur-sm"
                  disabled={saving}
                />
                <p className="text-xs text-[#a8a8b8]/80 mt-1">
                  3-50 characters, letters, numbers, underscores, and hyphens only
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Display Name</span>
                </label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="Your display name"
                  maxLength={100}
                  className="w-full p-3 border-2 border-[#00d4ff]/30 rounded-lg bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md bg-black/20 text-white placeholder-white/50 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 focus:outline-none backdrop-blur-sm"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">Bio</span>
                </label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Tell us about yourself..."
                  rows={4}
                  maxLength={500}
                  className="w-full p-3 border-2 border-[#00d4ff]/30 rounded-lg bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md bg-black/20 text-white placeholder-white/50 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 focus:outline-none resize-none backdrop-blur-sm"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Twitter/X</span>
                </label>
                <input
                  type="url"
                  value={formData.twitterUrl}
                  onChange={(e) => setFormData({ ...formData, twitterUrl: e.target.value })}
                  placeholder="https://x.com/username or https://twitter.com/username"
                  className="w-full p-3 border-2 border-[#00d4ff]/30 rounded-lg bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md bg-black/20 text-white placeholder-white/50 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 focus:outline-none backdrop-blur-sm"
                  disabled={saving}
                />
                <p className="text-xs text-[#a8a8b8]/80 mt-1">
                  Example: https://x.com/yourusername or https://twitter.com/yourusername
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-3 bg-gradient-to-r from-[#00d4ff] to-purple-500 hover:from-purple-500 hover:to-[#00d4ff] disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-semibold shadow-lg shadow-[#00d4ff]/30 transition-all duration-200 transform hover:scale-105"
                >
                  {saving ? 'Saving...' : '✨ Save Profile'}
                </button>
                {profile && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false)
                      setSaveError(null)
                      if (profile) {
                        setFormData({
                          username: profile.username || '',
                          displayName: profile.displayName || '',
                          bio: profile.bio || '',
                          avatarUrl: profile.avatarUrl || '',
                          twitterUrl: profile.twitterUrl || '',
                        })
                        setAvatarPreview(profile.avatarUrl || null)
                      } else {
                        setAvatarPreview(null)
                      }
                    }}
                    disabled={saving}
                    className="px-6 py-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 disabled:border-[#00d4ff]/20 disabled:cursor-not-allowed text-white/70 hover:text-white rounded-lg font-semibold transition-all duration-200 backdrop-blur-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          ) : profile ? (
            <div className="space-y-6">
              {/* Avatar First */}
              {profile.avatarUrl && (
                <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-purple-500/30 rounded-xl p-6 bg-gradient-to-br from-purple-900/20 to-blue-900/20 backdrop-blur-sm">
                  <p className="text-sm text-white/70 mb-4 font-medium">Avatar</p>
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName || profile.username}
                    className="w-32 h-32 rounded-full object-cover border-2 border-purple-500/50 shadow-lg shadow-purple-500/20"
                  />
                </div>
              )}
              <div>
                <p className="text-sm text-white/70 mb-1">Username</p>
                <p className="text-white font-semibold text-lg">@{profile.username}</p>
              </div>
              {profile.displayName && (
                <div>
                  <p className="text-sm text-white/70 mb-1">Display Name</p>
                  <p className="text-white text-lg">{profile.displayName}</p>
                </div>
              )}
              {profile.bio && (
                <div>
                  <p className="text-sm text-white/70 mb-1">Bio</p>
                  <p className="text-white">{profile.bio}</p>
                </div>
              )}
              {profile.twitterUrl && (
                <div>
                  <p className="text-sm text-white/70 mb-1">Twitter/X</p>
                  <a
                    href={profile.twitterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00d4ff] hover:text-[#14F195] transition-colors flex items-center gap-2"
                  >
                    <span>{profile.twitterUrl}</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}
              
              {/* Payout Opt-In Status */}
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-yellow-500/30 rounded-xl p-6 bg-gradient-to-br from-yellow-900/20 to-orange-900/20 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-white/70 mb-2 font-medium">Payout Opt-In Status</p>
                    {profile.optIn === true ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-sm font-semibold border border-green-500/30">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Opted In
                        </span>
                        <p className="text-xs text-[#a8a8b8]/80 mt-1">You're eligible to receive community payouts</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-500/20 text-[#FBBF24] rounded-lg text-sm font-semibold border border-yellow-500/30">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            Not Opted In
                          </span>
                        </div>
                        <p className="text-xs text-white/70 mb-3">You need to opt-in to receive community revenue payouts</p>
                        <Link
                          href="/payouts"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white rounded-lg font-semibold text-sm transition-all duration-200 shadow-lg shadow-yellow-500/20 transform hover:scale-105"
                        >
                          <span>💎</span>
                          <span>Go to Payouts Page</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          
          {/* Wallet Addresses Section */}
          {activeWalletConnected && activeWalletAddress && (
            <div className="bg-gradient-to-br from-cyan-900/10 to-blue-900/10 rounded-xl p-4 border border-cyan-500/20">
              <h3 className="text-base font-semibold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent mb-3">
                🌌 Wallet Addresses
              </h3>
              <div className="space-y-3">
                  {/* Wallet Address */}
                  <div className="p-3 bg-black/20 rounded-lg border border-cyan-500/20">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-cyan-400/80 mb-1 font-medium">Wallet Address</p>
                        <p className="text-white font-mono text-xs break-all">{currentAddress || 'Not connected'}</p>
                      </div>
                      <div className="ml-2">
                        {profile && profile.walletAddress === currentAddress ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-semibold border border-green-500/30">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Saved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-[#FBBF24] rounded text-xs font-semibold border border-yellow-500/30">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            Not Saved
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Payment Address */}
                  <div className="p-3 bg-black/20 rounded-lg border border-cyan-500/20">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-cyan-400/80 mb-1 font-medium">Payment Address</p>
                        {paymentAddress ? (
                          <p className="text-white font-mono text-xs break-all">{paymentAddress}</p>
                        ) : (
                          <p className="text-white/50 italic text-xs">Not available</p>
                        )}
                      </div>
                      <div className="ml-2">
                        {paymentAddress && profile && profile.paymentAddress === paymentAddress ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-semibold border border-green-500/30">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Saved
                          </span>
                        ) : paymentAddress && profile && profile.paymentAddress !== paymentAddress ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-[#FBBF24] rounded text-xs font-semibold border border-yellow-500/30">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            Different
                          </span>
                        ) : paymentAddress ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-[#FBBF24] rounded text-xs font-semibold border border-yellow-500/30">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            Not Saved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-500/20 text-[#a8a8b8] rounded text-xs font-semibold border border-[#9945FF]/40/30">
                            N/A
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}

