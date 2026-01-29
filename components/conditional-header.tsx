'use client'

import { usePathname } from 'next/navigation'
import { AppHeader } from '@/components/app-header'

export function ConditionalHeader() {
  const pathname = usePathname()
  
  // Hide header on /mint page
  if (pathname === '/mint') {
    return null
  }
  
  // Always show header (no longer conditional on wallet connection)
  return <AppHeader />
}

