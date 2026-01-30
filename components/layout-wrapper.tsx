'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { SidebarNav } from '@/components/sidebar-nav'
import { GlobalFooter } from '@/components/global-footer'

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  // Check if we're on homepage without seeall=1
  const isHomepage = pathname === '/'
  const seeAll = searchParams.get('seeall') === '1'
  const showComingSoon = isHomepage && !seeAll
  
  // If coming soon, render children without sidebar/footer
  if (showComingSoon) {
    return <>{children}</>
  }
  
  // New layout with left sidebar
  return (
    <div className="flex min-h-screen overflow-x-hidden">
      {/* Left Sidebar */}
      <SidebarNav />
      
      {/* Main Content Area - Full width with proper padding */}
      <div className="flex-1 flex flex-col lg:ml-64 w-full">
        <main className="flex-1 overflow-x-hidden w-full px-6 lg:px-12 py-6">
          {children}
        </main>
        <GlobalFooter />
      </div>
    </div>
  )
}
