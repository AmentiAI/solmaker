'use client'

import { AdminSidebar } from '@/components/admin-sidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]">
      <AdminSidebar />
      <div className="flex-1 ml-64">
        {children}
      </div>
    </div>
  )
}
