'use client'

import { useState } from 'react'
import { ProfileManager } from '@/components/profile-manager'
import { ProfileCollections } from '@/components/profile-collections'
import { ProfileCollabs } from '@/components/profile-collabs'
import { ProfileMarketplace } from '@/components/profile-marketplace'
import { CollaborationInvitations } from '@/components/collaboration-invitations'
import { ProfileSellerRating } from '@/components/profile-seller-rating'
import { CreditTransfer } from '@/components/credit-transfer'

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<'collections' | 'collabs' | 'marketplace'>('collections')

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-[#0a0e27]/90 via-[#1a1f3a]/90 to-[#0f172a]/90 text-white border-b border-[#00d4ff]/30">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Profile</h1>
              <p className="text-[#a5b4fc] mt-2 text-lg">
                Manage your profile, collections, and collaborations
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="w-full max-w-[1200px] mx-auto px-6 py-12">
        <div className="space-y-6">
          
          <ProfileManager />
          <CreditTransfer />
          <ProfileSellerRating />
          <CollaborationInvitations />
          
          {/* Tabs */}
          <div className="cosmic-card border-2 border-[#00d4ff]/30 rounded-xl shadow-lg">
            <div className="flex border-b-2 border-[#00d4ff]/30">
              <button
                onClick={() => setActiveTab('collections')}
                className={`flex-1 px-6 py-4 text-center font-semibold transition-colors ${
                  activeTab === 'collections'
                    ? 'text-[#ff6b35] border-b-2 border-[#ff6b35] bg-[#ff6b35]/10 -mb-[2px]'
                    : 'text-white/70 hover:text-white hover:bg-[#1a1f3a]'
                }`}
              >
                My Collections
              </button>
              <button
                onClick={() => setActiveTab('collabs')}
                className={`flex-1 px-6 py-4 text-center font-semibold transition-colors ${
                  activeTab === 'collabs'
                    ? 'text-[#ff6b35] border-b-2 border-[#ff6b35] bg-[#ff6b35]/10 -mb-[2px]'
                    : 'text-white/70 hover:text-white hover:bg-[#1a1f3a]'
                }`}
              >
                My Collabs
              </button>
              <button
                onClick={() => setActiveTab('marketplace')}
                className={`flex-1 px-6 py-4 text-center font-semibold transition-colors ${
                  activeTab === 'marketplace'
                    ? 'text-[#ff6b35] border-b-2 border-[#ff6b35] bg-[#ff6b35]/10 -mb-[2px]'
                    : 'text-white/70 hover:text-white hover:bg-[#1a1f3a]'
                }`}
              >
                My Marketplace
              </button>
            </div>
            
            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'collections' ? (
                <ProfileCollections />
              ) : activeTab === 'collabs' ? (
                <ProfileCollabs />
              ) : (
                <ProfileMarketplace />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

