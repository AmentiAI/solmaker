'use client'

import { useEffect, useState } from 'react'
import { getSolscanUrl } from '@/lib/solscan'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Wallet, 
  Rocket, 
  Image as ImageIcon, 
  Users, 
  ShoppingCart,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  Search,
  Filter
} from 'lucide-react'
import Link from 'next/link'

export default function SolanaAdminPage() {
  const [stats, setStats] = useState<any>(null)
  const [collections, setCollections] = useState<any[]>([])
  const [mints, setMints] = useState<any[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [marketplace, setMarketplace] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTab, setSelectedTab] = useState('overview')

  useEffect(() => {
    loadData()
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      const [statsRes, collectionsRes, mintsRes, profilesRes, marketplaceRes] = await Promise.all([
        fetch('/api/admin/solana/stats'),
        fetch('/api/admin/solana/collections'),
        fetch('/api/admin/solana/mints'),
        fetch('/api/admin/solana/profiles'),
        fetch('/api/admin/solana/marketplace'),
      ])

      if (statsRes.ok) setStats(await statsRes.json())
      if (collectionsRes.ok) setCollections(await collectionsRes.json())
      if (mintsRes.ok) setMints(await mintsRes.json())
      if (profilesRes.ok) setProfiles(await profilesRes.json())
      if (marketplaceRes.ok) setMarketplace(await marketplaceRes.json())
    } catch (error) {
      console.error('Error loading admin data:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredCollections = collections.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.wallet_address?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredMints = mints.filter(m =>
    m.collection_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.minter_wallet?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.nft_mint_address?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] via-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent">Solana Admin Dashboard</h1>
          <p className="text-[#b4b4c8]">
            Monitor collections, mints, profiles, and marketplace
          </p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Platform Wallet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-500" />
              <div className="text-2xl font-bold">
                {stats?.platformWallet?.balance?.toFixed(4) || '0.0000'} SOL
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.platformWallet?.address?.substring(0, 12)}...
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Deployed Collections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-green-500" />
              <div className="text-2xl font-bold">{stats?.collections?.deployed || 0}</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.collections?.pending || 0} pending deployment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Mints
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-purple-500" />
              <div className="text-2xl font-bold">{stats?.mints?.confirmed || 0}</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.mints?.pending || 0} pending confirmation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-500" />
              <div className="text-2xl font-bold">{stats?.users?.total || 0}</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.users?.withCredits || 0} have credits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Marketplace
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-pink-500" />
              <div className="text-2xl font-bold">{stats?.marketplace?.listings || 0}</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.marketplace?.active || 0} active listings
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="mints">Mints</TabsTrigger>
          <TabsTrigger value="profiles">Profiles</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
        </TabsList>

        {/* Search Bar */}
        {selectedTab !== 'overview' && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${selectedTab}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        )}

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Collections */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Collections</CardTitle>
                <CardDescription>Latest deployed collections</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {collections.slice(0, 5).map((collection) => (
                    <div key={collection.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {collection.image_url && (
                          <img src={collection.image_url} alt="" className="h-10 w-10 rounded object-cover" />
                        )}
                        <div>
                          <p className="font-medium">{collection.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {collection.candy_machine_address?.substring(0, 12)}...
                          </p>
                        </div>
                      </div>
                      <Badge variant={collection.deployment_status === 'deployed' ? 'default' : 'secondary'}>
                        {collection.deployment_status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Mints */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Mints</CardTitle>
                <CardDescription>Latest confirmed mints</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mints.slice(0, 5).map((mint) => (
                    <div key={mint.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{mint.collection_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {mint.minter_wallet?.substring(0, 12)}...
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant={mint.mint_status === 'confirmed' ? 'default' : 'secondary'}>
                          {mint.mint_status}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(mint.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Collections Tab */}
        <TabsContent value="collections" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Collections ({filteredCollections.length})</CardTitle>
              <CardDescription>Manage deployed and pending collections</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredCollections.map((collection) => (
                  <div key={collection.id} className="p-4 border rounded-lg hover:bg-muted/50 transition">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        {collection.image_url && (
                          <img src={collection.image_url} alt="" className="h-16 w-16 rounded object-cover" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{collection.name}</h3>
                            <Badge variant={collection.deployment_status === 'deployed' ? 'default' : 'secondary'}>
                              {collection.deployment_status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{collection.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>Owner: {collection.wallet_address?.substring(0, 12)}...</span>
                            {collection.total_supply && <span>Supply: {collection.total_supply}</span>}
                            {collection.minted_count > 0 && <span>Minted: {collection.minted_count}</span>}
                          </div>
                          {collection.candy_machine_address && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-muted-foreground">CM:</span>
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {collection.candy_machine_address.substring(0, 20)}...
                              </code>
                              <a
                                href={getSolscanUrl(collection.candy_machine_address, 'account')}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#9945FF] hover:underline text-xs flex items-center gap-1"
                              >
                                View <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/collections/${collection.id}`}>
                            View
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mints Tab */}
        <TabsContent value="mints" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Mints ({filteredMints.length})</CardTitle>
              <CardDescription>Track NFT mints and transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredMints.map((mint) => (
                  <div key={mint.id} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{mint.collection_name}</h4>
                          <Badge 
                            variant={
                              mint.mint_status === 'confirmed' ? 'default' : 
                              mint.mint_status === 'failed' ? 'destructive' : 
                              'secondary'
                            }
                          >
                            {mint.mint_status === 'confirmed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {mint.mint_status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                            {mint.mint_status === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                            {mint.mint_status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Minter:</span>
                            <code className="ml-2 text-xs">{mint.minter_wallet?.substring(0, 16)}...</code>
                          </div>
                          {mint.nft_mint_address && (
                            <div>
                              <span className="text-muted-foreground">NFT:</span>
                              <code className="ml-2 text-xs">{mint.nft_mint_address.substring(0, 16)}...</code>
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground">Price:</span>
                            <span className="ml-2">{(mint.mint_price_lamports / 1e9).toFixed(4)} SOL</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Created:</span>
                            <span className="ml-2">{new Date(mint.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                        {mint.mint_tx_signature && (
                          <div className="mt-2">
                            <a
                              href={getSolscanUrl(mint.mint_tx_signature, 'tx')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#9945FF] hover:underline text-xs flex items-center gap-1"
                            >
                              View Transaction <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profiles Tab */}
        <TabsContent value="profiles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Profiles ({profiles.length})</CardTitle>
              <CardDescription>View user credits and activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {profiles.map((profile) => (
                  <div key={profile.wallet_address} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-medium">{profile.wallet_address.substring(0, 20)}...</code>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Credits:</span>
                            <span className="ml-2 font-semibold">{profile.credits || 0}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Collections:</span>
                            <span className="ml-2 font-semibold">{profile.collections_count || 0}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Mints:</span>
                            <span className="ml-2 font-semibold">{profile.mints_count || 0}</span>
                          </div>
                        </div>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={getSolscanUrl(profile.wallet_address, 'account')}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Marketplace Tab */}
        <TabsContent value="marketplace" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Marketplace Listings ({marketplace.length})</CardTitle>
              <CardDescription>Active and recent marketplace activity</CardDescription>
            </CardHeader>
            <CardContent>
              {marketplace.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No marketplace listings yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {marketplace.map((listing) => (
                    <div key={listing.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{listing.collection_name}</h4>
                          <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Price:</span>
                              <span className="ml-2 font-semibold">{listing.price} SOL</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Status:</span>
                              <Badge className="ml-2" variant="secondary">{listing.status}</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
