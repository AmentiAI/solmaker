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
      <div className="bg-gradient-to-r from-[#121218] to-[#1A1A22] text-white border-b border-[#9945FF]/20 -mx-6 lg:-mx-12 px-6 lg:px-12">
        <div className="w-full py-8 lg:py-12">
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">Dashboard</h1>
            <p className="text-[#A1A1AA] text-base lg:text-lg font-medium">
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
          <div className="bg-[#121218] border-2 border-[#9945FF]/20 rounded-2xl shadow-xl shadow-[#9945FF]/5 overflow-hidden">
            <div className="flex border-b border-[#9945FF]/20">
              <button
                onClick={() => setActiveTab('collections')}
                className={`flex-1 px-6 py-4 text-center font-semibold transition-all duration-300 relative ${
                  activeTab === 'collections'
                    ? 'text-white bg-gradient-to-r from-[#9945FF]/10 to-[#14F195]/10'
                    : 'text-[#A1A1AA] hover:text-white hover:bg-[#1A1A22]'
                }`}
              >
                {activeTab === 'collections' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#9945FF] to-[#14F195]" />
                )}
                <span className="relative z-10">My Collections</span>
              </button>
              <button
                onClick={() => setActiveTab('collabs')}
                className={`flex-1 px-6 py-4 text-center font-semibold transition-all duration-300 relative ${
                  activeTab === 'collabs'
                    ? 'text-white bg-gradient-to-r from-[#9945FF]/10 to-[#14F195]/10'
                    : 'text-[#A1A1AA] hover:text-white hover:bg-[#1A1A22]'
                }`}
              >
                {activeTab === 'collabs' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#9945FF] to-[#14F195]" />
                )}
                <span className="relative z-10">My Collabs</span>
              </button>
              <button
                onClick={() => setActiveTab('marketplace')}
                className={`flex-1 px-6 py-4 text-center font-semibold transition-all duration-300 relative ${
                  activeTab === 'marketplace'
                    ? 'text-white bg-gradient-to-r from-[#9945FF]/10 to-[#14F195]/10'
                    : 'text-[#A1A1AA] hover:text-white hover:bg-[#1A1A22]'
                }`}
              >
                {activeTab === 'marketplace' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#9945FF] to-[#14F195]" />
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

