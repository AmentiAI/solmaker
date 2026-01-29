import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Geist, Geist_Mono } from 'next/font/google'
import { Providers } from '@/components/providers'
import { ConditionalHeader } from '@/components/conditional-header'
import { AuthRedirect } from '@/components/auth-redirect'
import { SonnerToaster } from '@/components/sonner-toaster'
import { GlobalFooter } from '@/components/global-footer'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'SolMaker - AI-Powered NFT Creator on Solana',
  description: 'SolMaker - The easiest NFT maker on Solana using revolutionary AI technology. Create unique NFT collections with AI-powered generation.',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head />
      <body className={`font-sans antialiased min-h-screen`} suppressHydrationWarning>
        <noscript>
          <div style={{ padding: '20px', textAlign: 'center', color: 'white', background: 'red' }}>
            JavaScript is required for this application to work. Please enable JavaScript.
          </div>
        </noscript>
        <Providers>
          <Suspense fallback={null}>
            <AuthRedirect>
              <div className="flex flex-col min-h-screen overflow-x-hidden">
                <ConditionalHeader />
                <main className="flex-1 overflow-x-hidden">
                  {children}
                </main>
                <GlobalFooter />
                <SonnerToaster />
              </div>
            </AuthRedirect>
          </Suspense>
        </Providers>
      </body>
    </html>
  )
}
