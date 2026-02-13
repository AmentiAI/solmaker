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
  
  // Check if we're on admin pages (admin has its own sidebar)
  const isAdminPage = pathname?.startsWith('/admin')
  
  // If coming soon, render children without sidebar/footer
  if (showComingSoon) {
    return <>{children}</>
  }
  
  // Admin pages handle their own layout (AdminSidebar)
  if (isAdminPage) {
    return <>{children}</>
  }
  
  // New layout with left sidebar
  return (
    <div className="flex min-h-screen overflow-x-hidden bg-[#0a0a0a]">
      {/* Left Sidebar */}
      <SidebarNav />

      {/* Main Content Area - Full width no padding */}
      <div className="flex-1 flex flex-col lg:ml-80 w-full">
        <main className="flex-1 overflow-x-hidden w-full">
          {children}
        </main>
        <GlobalFooter />
      </div>
    </div>
  )
}
