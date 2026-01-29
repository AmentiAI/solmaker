'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/compatibility'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Collection = {
  id: string
  name: string
  description?: string
  wallet_address?: string
  is_owner?: boolean
  collaborator_role?: string
}

export default function MyLaunchesPage() {
  const { isConnected, currentAddress } = useWallet()
  const { activeWalletAddress, activeWalletConnected } = useMemo(() => {
    if (currentAddress && isConnected) return { activeWalletAddress: currentAddress, activeWalletConnected: true }
    return { activeWalletAddress: null, activeWalletConnected: false }
  }, [currentAddress, isConnected])

  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!activeWalletAddress) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/collections?wallet_address=${encodeURIComponent(activeWalletAddress)}&is_locked=true`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Failed to load collections')
        setCollections(Array.isArray(data?.collections) ? data.collections : [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load collections')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [activeWalletAddress])

  return (
    <div className="bg-[#FDFCFA]">
      <div className="container mx-auto px-4 md:px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
      
              <h1 className="mt-1 text-3xl md:text-4xl font-black text-gray-900 tracking-tight">My Launches</h1>
              <p className="text-muted-foreground mt-1">
                View the collections you own or collaborate on, and jump into mint settings.
              </p>
            </div>
          </div>

          {!activeWalletConnected && (
            <Card>
              <CardHeader>
                <CardTitle>Connect your wallet</CardTitle>
                <CardDescription>You need a connected wallet to see your launches.</CardDescription>
              </CardHeader>
            </Card>
          )}

          {activeWalletConnected && (
            <>
              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 font-semibold">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <Card key={i} className="animate-pulse">
                        <CardHeader>
                          <div className="h-5 w-40 bg-gray-200 rounded" />
                          <div className="h-4 w-64 bg-gray-100 rounded" />
                        </CardHeader>
                        <CardContent>
                          <div className="h-9 w-full bg-gray-100 rounded" />
                        </CardContent>
                      </Card>
                    ))
                  : collections.map((c) => (
                      <Card key={c.id} className="rounded-2xl">
                        <CardHeader>
                          <CardTitle className="truncate">{c.name}</CardTitle>
                          <CardDescription className="line-clamp-2">{c.description || 'No description'}</CardDescription>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="px-2 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200">
                              {c.is_owner ? 'Owner' : `Collaborator${c.collaborator_role ? `: ${c.collaborator_role}` : ''}`}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2">
                          <Button asChild className="bg-[#e27d0f] hover:bg-[#c96a0a] text-white">
                            <Link href={`/collections/${c.id}/launch`}>Edit Mint Settings</Link>
                          </Button>
                          <Button asChild variant="outline">
                            <Link href={`/launchpad/${c.id}`}>View Mint Page</Link>
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
              </div>

              {!loading && collections.length === 0 && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>No collections found</CardTitle>
                    <CardDescription>Create a collection, or accept a collaboration invite to see it here.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Button asChild className="bg-[#4561ad] hover:bg-[#3a5294] text-white">
                      <Link href="/collections/create">Create Collection</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/profile">View Profile</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

