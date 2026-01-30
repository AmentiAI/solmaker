'use client'

import React from 'react'

interface SolanaPageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
  actions?: React.ReactNode
}

export function SolanaPageHeader({ title, description, children, actions }: SolanaPageHeaderProps) {
  return (
    <div className="relative bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] text-white border-b border-[#9945FF]/20 overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-10 left-10 w-72 h-72 bg-[#9945FF]/20 rounded-full blur-3xl animate-[solanaFloat_6s_ease-in-out_infinite]" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-[#14F195]/15 rounded-full blur-3xl animate-[solanaFloat_8s_ease-in-out_infinite]" style={{ animationDelay: '1s' }} />
      </div>
      
      <div className="container mx-auto px-6 py-10 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="flex-1">
            <h1 className="text-5xl md:text-6xl font-black tracking-tight bg-gradient-to-r from-[#9945FF] via-[#00D4FF] to-[#14F195] bg-clip-text text-transparent mb-2 animate-[solanaGradientShift_8s_ease_infinite] bg-[length:200%_auto]">
              {title}
            </h1>
            {description && (
              <p className="text-[#a8a8b8] text-lg font-medium mt-2">
                {description}
              </p>
            )}
            {children}
          </div>
          {actions && (
            <div className="flex items-center gap-3">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface SolanaEmptyStateProps {
  icon?: string
  title: string
  description: string
  action?: React.ReactNode
}

export function SolanaEmptyState({ icon = '📦', title, description, action }: SolanaEmptyStateProps) {
  return (
    <div className="py-20 text-center bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-2xl backdrop-blur-md">
      <div className="text-6xl mb-6 opacity-50 animate-[solanaFloat_4s_ease-in-out_infinite]">{icon}</div>
      <h3 className="text-2xl font-black text-white mb-3">{title}</h3>
      <p className="text-[#a8a8b8] text-lg font-medium mb-8 max-w-md mx-auto">{description}</p>
      {action}
    </div>
  )
}

interface SolanaLoadingStateProps {
  message?: string
}

export function SolanaLoadingState({ message = 'Loading...' }: SolanaLoadingStateProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className="absolute inset-0 border-4 border-[#9945FF]/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin" />
          <div className="absolute inset-2 border-4 border-[#14F195]/20 rounded-full" />
          <div className="absolute inset-2 border-4 border-[#14F195] border-b-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
        <p className="text-white text-lg font-bold mb-2">{message}</p>
        <p className="text-[#a8a8b8] text-sm">Please wait...</p>
      </div>
    </div>
  )
}

interface SolanaCardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
}

export function SolanaCard({ children, className = '', hover = true }: SolanaCardProps) {
  return (
    <div className={`bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md shadow-xl shadow-[#9945FF]/10 ${hover ? 'hover:border-[#9945FF]/50 hover:shadow-2xl hover:shadow-[#9945FF]/15 transition-all duration-300' : ''} ${className}`}>
      {children}
    </div>
  )
}

interface SolanaBadgeProps {
  children: React.ReactNode
  variant?: 'purple' | 'green' | 'cyan' | 'pink'
  className?: string
}

export function SolanaBadge({ children, variant = 'purple', className = '' }: SolanaBadgeProps) {
  const variants = {
    purple: 'bg-gradient-to-r from-[#9945FF]/20 to-[#DC1FFF]/20 border-[#9945FF]/40 text-[#9945FF]',
    green: 'bg-gradient-to-r from-[#14F195]/20 to-[#19FB9B]/20 border-[#14F195]/40 text-[#14F195]',
    cyan: 'bg-gradient-to-r from-[#00D4FF]/20 to-[#9945FF]/20 border-[#00D4FF]/40 text-[#00D4FF]',
    pink: 'bg-gradient-to-r from-[#DC1FFF]/20 to-[#9945FF]/20 border-[#DC1FFF]/40 text-[#DC1FFF]',
  }

  return (
    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border backdrop-blur-sm ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}
