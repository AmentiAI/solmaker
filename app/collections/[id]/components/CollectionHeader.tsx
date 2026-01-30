'use client'

import Link from 'next/link'

interface CollectionHeaderProps {
  collection: { id: string; name: string }
  collaboratorCount: number
  userRole: 'owner' | 'editor' | 'viewer'
  onShowCollaborators: () => void
  onDelete: () => void
}

export function CollectionHeader({
  collection,
  collaboratorCount,
  userRole,
  onShowCollaborators,
  onDelete,
}: CollectionHeaderProps) {
  return (
    <div className="mb-6">
      <Link 
        href="/collections" 
        className="text-[#00d4ff] hover:text-[#14F195] mb-4 inline-block transition-colors"
      >
        ← Back to Collections
      </Link>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-white break-words">{collection.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {collection && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Collaborators:</span>
              <span className="text-sm text-white/70">{collaboratorCount}</span>
            </div>
          )}
          <Link
            href={`/collections/${collection.id}/edit`}
            className="bg-yellow-500 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded hover:bg-[#FBBF24] flex-1 sm:flex-initial text-center"
          >
            <svg className="w-4 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 26 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
          {(userRole === 'owner' || userRole === 'editor') && (
            <Link
              href="#"
              onClick={(e) => {
                e.preventDefault()
                onShowCollaborators()
              }}
              className="bg-[#4561ad] text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded hover:bg-[#3a5294] flex-1 sm:flex-initial text-center"
            >
              Invite
            </Link>
          )}
          <Link
            href={`/collections/${collection.id}/launch`}
            className="bg-[#4561ad] text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded hover:bg-[#3a5294] flex-1 sm:flex-initial text-center"
          >
            🚀 Launch Collection
          </Link>
          <button
            onClick={onDelete}
            className="bg-red-500 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded hover:bg-red-600 flex-1 sm:flex-initial"
          >
            Delete Collection
          </button>
        </div>
      </div>
    </div>
  )
}

