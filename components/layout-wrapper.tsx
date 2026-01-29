'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { ConditionalHeader } from '@/components/conditional-header'
import { GlobalFooter } from '@/components/global-footer'

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  // Check if we're on homepage without seeall=1
  const isHomepage = pathname === '/'
  const seeAll = searchParams.get('seeall') === '1'
  const showComingSoon = isHomepage && !seeAll
  
  // If coming soon, render children without header/footer
  if (showComingSoon) {
    return <>{children}</>
  }
  
  // Normal layout with header and footer
  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">
      <ConditionalHeader />
      <main className="flex-1 overflow-x-hidden">
        {children}
      </main>
      <GlobalFooter />
    </div>
  )
}
