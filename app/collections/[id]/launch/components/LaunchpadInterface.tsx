'use client'

import { useState } from 'react'
import { Collection, Phase, Whitelist } from '../types'
import SettingsTab from './tabs/SettingsTab'
import PhasesTab from './tabs/PhasesTab'
import WhitelistsTab from './tabs/WhitelistsTab'

interface LaunchpadInterfaceProps {
  collection: Collection
  collectionId: string
  phases: Phase[]
  whitelists: Whitelist[]
  currentAddress: string | null
  onLoadData: () => Promise<void>
  onSaveSettings: (settings: any) => Promise<void>
  saving: boolean
}

export default function LaunchpadInterface({
  collection,
  collectionId,
  phases,
  whitelists,
  currentAddress,
  onLoadData,
  onSaveSettings,
  saving,
}: LaunchpadInterfaceProps) {
  const [activeTab, setActiveTab] = useState<'settings' | 'phases' | 'whitelists'>('settings')

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'settings'
              ? 'border-[#4561ad] text-[#4561ad]'
              : 'border-transparent text-[#a8a8b8]/80 hover:text-gray-700'
          }`}
        >
          ⚙️ Settings
        </button>
        <button
          onClick={() => setActiveTab('phases')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'phases'
              ? 'border-[#4561ad] text-[#4561ad]'
              : 'border-transparent text-[#a8a8b8]/80 hover:text-gray-700'
          }`}
        >
          📅 Mint Phases ({phases.length})
        </button>
        <button
          onClick={() => setActiveTab('whitelists')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'whitelists'
              ? 'border-[#4561ad] text-[#4561ad]'
              : 'border-transparent text-[#a8a8b8]/80 hover:text-gray-700'
          }`}
        >
          📋 Whitelists ({whitelists.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'settings' && (
        <SettingsTab
          collection={collection}
          collectionId={collectionId}
          currentAddress={currentAddress}
          onSave={onSaveSettings}
          saving={saving}
          onLoadData={onLoadData}
        />
      )}
      {activeTab === 'phases' && (
        <PhasesTab
          collectionId={collectionId}
          phases={phases}
          whitelists={whitelists}
          currentAddress={currentAddress}
          onLoadData={onLoadData}
        />
      )}
      {activeTab === 'whitelists' && (
        <WhitelistsTab
          collectionId={collectionId}
          whitelists={whitelists}
          currentAddress={currentAddress}
          onLoadData={onLoadData}
        />
      )}
    </>
  )
}

