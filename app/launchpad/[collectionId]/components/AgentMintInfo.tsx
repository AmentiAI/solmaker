'use client'

import React, { useState } from 'react'

interface AgentMintInfoProps {
  collectionId: string
  mintType: 'agent_only' | 'agent_and_human'
}

export function AgentMintInfo({ collectionId, mintType }: AgentMintInfoProps) {
  const [copied, setCopied] = useState(false)

  const skillUrl = `${window.location.origin}/api/launchpad/${collectionId}/agent/skill`

  const handleCopy = () => {
    navigator.clipboard.writeText(skillUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/30 p-6 backdrop-blur-md">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🤖</span>
        <h3 className="text-lg font-bold text-white">
          {mintType === 'agent_only' ? 'Agent-Only Mint' : 'Agent Mint Available'}
        </h3>
      </div>

      {mintType === 'agent_only' && (
        <p className="text-[#a8a8b8] text-sm mb-4">
          This collection can only be minted by AI agents via API.
          Copy the skill URL below and provide it to your agent.
        </p>
      )}

      {mintType === 'agent_and_human' && (
        <p className="text-[#a8a8b8] text-sm mb-4">
          AI agents can also mint from this collection via API.
          Copy the skill URL below and provide it to your agent.
        </p>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={skillUrl}
          className="flex-1 px-4 py-2.5 bg-[#0a0a12] border border-[#9945FF]/20 rounded-lg text-white/80 text-sm font-mono truncate"
        />
        <button
          onClick={handleCopy}
          className="px-4 py-2.5 bg-[#9945FF] hover:bg-[#7c35cc] text-white rounded-lg font-semibold text-sm transition-colors whitespace-nowrap"
        >
          {copied ? 'Copied!' : 'Copy URL'}
        </button>
      </div>

      <p className="text-[#a8a8b8]/60 text-xs mt-3">
        The skill file contains live collection data and step-by-step mint instructions for AI agents.
      </p>
    </div>
  )
}
