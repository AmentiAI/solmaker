'use client'

import { memo } from 'react'

interface PaginationInfo {
  page: number
  per_page: number
  total: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}

interface PaginationControlsProps {
  pagination: PaginationInfo | null
  currentPage: number
  pageInput: string
  loading: boolean
  onPageChange: (page: number) => void
  onPageInputChange: (value: string) => void
  onPageInputSubmit: (e: React.FormEvent) => void
}

export const PaginationControls = memo(function PaginationControls({
  pagination,
  currentPage,
  pageInput,
  loading,
  onPageChange,
  onPageInputChange,
  onPageInputSubmit,
}: PaginationControlsProps) {
  if (!pagination) return null

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 py-4">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!pagination.has_prev || loading}
        className="px-3 sm:px-4 py-2 text-sm sm:text-base bg-gradient-to-r from-[#9945FF]/20 to-[#DC1FFF]/20 hover:from-[#9945FF]/30 hover:to-[#DC1FFF]/30 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all border border-[#9945FF]/30 hover:border-[#9945FF]/50"
      >
        Previous
      </button>
      
      <div className="flex items-center gap-1 sm:gap-2">
        <span className="text-[#a8a8b8] text-sm sm:text-base">Page</span>
        <form onSubmit={onPageInputSubmit} className="flex items-center gap-1 sm:gap-2">
          <input
            type="number"
            value={pageInput}
            onChange={(e) => onPageInputChange(e.target.value)}
            min={1}
            max={pagination.total_pages}
            className="w-14 sm:w-20 px-2 sm:px-3 py-2 text-sm sm:text-base bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/30 text-white rounded-lg text-center transition-all focus:ring-2 focus:ring-[#9945FF]/30 focus:border-[#9945FF]/50"
          />
          <span className="text-[#a8a8b8] text-sm sm:text-base">of {pagination.total_pages}</span>
        </form>
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!pagination.has_next || loading}
        className="px-3 sm:px-4 py-2 text-sm sm:text-base bg-gradient-to-r from-[#9945FF]/20 to-[#DC1FFF]/20 hover:from-[#9945FF]/30 hover:to-[#DC1FFF]/30 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all border border-[#9945FF]/30 hover:border-[#9945FF]/50"
      >
        Next
      </button>
    </div>
  )
})

