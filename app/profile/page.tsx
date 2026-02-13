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
      <div className="bg-[#0a0a0a] text-white border-b border-[#404040] -mx-6 lg:-mx-12 px-6 lg:px-12">
        <div className="w-full py-8 lg:py-12">
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-wide uppercase text-[#D4AF37]">Dashboard</h1>
            <p className="text-[#808080] text-base lg:text-lg font-medium">
              Manage your profile, collections, and collaborations
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="w-full py-6 lg:py-12">
        <div className="space-y-6 lg:space-y-8">

          {/* Stats Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
            <ProfileManager />
            <CreditTransfer />
            <ProfileSellerRating />
            <CollaborationInvitations />
          </div>

          {/* Tabs Section */}
          <div className="bg-[#1a1a1a] border-2 border-[#D4AF37] overflow-hidden">
            <div className="flex border-b border-[#404040]">
              <button
                onClick={() => setActiveTab('collections')}
                className={`flex-1 px-6 py-4 text-center font-semibold tracking-wide uppercase transition-all duration-300 relative ${
                  activeTab === 'collections'
                    ? 'text-white bg-[#0a0a0a]'
                    : 'text-[#808080] hover:text-white hover:bg-[#0a0a0a]'
                }`}
              >
                {activeTab === 'collections' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AF37]" />
                )}
                <span className="relative z-10">My Collections</span>
              </button>
              <button
                onClick={() => setActiveTab('collabs')}
                className={`flex-1 px-6 py-4 text-center font-semibold tracking-wide uppercase transition-all duration-300 relative ${
                  activeTab === 'collabs'
                    ? 'text-white bg-[#0a0a0a]'
                    : 'text-[#808080] hover:text-white hover:bg-[#0a0a0a]'
                }`}
              >
                {activeTab === 'collabs' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AF37]" />
                )}
                <span className="relative z-10">My Collabs</span>
              </button>
              <button
                onClick={() => setActiveTab('marketplace')}
                className={`flex-1 px-6 py-4 text-center font-semibold tracking-wide uppercase transition-all duration-300 relative ${
                  activeTab === 'marketplace'
                    ? 'text-white bg-[#0a0a0a]'
                    : 'text-[#808080] hover:text-white hover:bg-[#0a0a0a]'
                }`}
              >
                {activeTab === 'marketplace' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AF37]" />
                )}
                <span className="relative z-10">My Marketplace</span>
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-8">
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

