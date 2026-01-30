'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/compatibility'
import { calculateOptimalFeeRate } from '@/lib/mempool-fee-calculator'

interface Collection {
  id: string
  name: string
  description?: string
  wallet_address: string
  launch_status: string
  total_supply?: number
  total_minted?: number
}

export default function SelfInscribePage() {
  const params = useParams()
  const router = useRouter()
  const { currentAddress, paymentAddress, paymentPublicKey, signPsbt, isConnected } = useWallet()
  const collectionId = params.id as string

  const [collection, setCollection] = useState<Collection | null>(null)
  const [loading, setLoading] = useState(true)

  // Self-inscribe state
  const [ordinals, setOrdinals] = useState<any[]>([])
  const [loadingOrdinals, setLoadingOrdinals] = useState(false)
  const [selectedBatches, setSelectedBatches] = useState<Set<number>>(new Set())
  const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set())
  const [selectedOrdinals, setSelectedOrdinals] = useState<Set<string>>(new Set())
  const [selectedFeeRate, setSelectedFeeRate] = useState(0.9)
  const [customFeeRate, setCustomFeeRate] = useState('0.9')
  const [mempoolHealth, setMempoolHealth] = useState<{ suggestedFeeRate: number; healthRating: string; healthMessage: string; blocksWithSub1Sat: number; totalBlocks: number } | null>(null)
  const mempoolLoadingRef = useRef(false)
  const [walletBalance, setWalletBalance] = useState(0)
  const [walletUtxoCount, setWalletUtxoCount] = useState(1)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [selfInscribeInitialized, setSelfInscribeInitialized] = useState(false)
  const [inscribing, setInscribing] = useState(false)
  const [metadataModal, setMetadataModal] = useState<{ show: boolean; batchIndex: number | null; metadata: any[] }>({ show: false, batchIndex: null, metadata: [] })
  const [batchCosts, setBatchCosts] = useState<Map<number, any>>(new Map())
  const [batchOrdinalDetails, setBatchOrdinalDetails] = useState<Map<number, any[]>>(new Map())
  const [loadingCosts, setLoadingCosts] = useState(false)
  const [pendingInscriptions, setPendingInscriptions] = useState<Map<string, any>>(new Map())
  
  // Destination address modal state
  const [destinationModal, setDestinationModal] = useState<{ show: boolean; action: 'single' | 'batch' | null }>({ show: false, action: null })
  const [revealDestinationAddress, setRevealDestinationAddress] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const collRes = await fetch(`/api/launchpad/${collectionId}`)
      if (collRes.ok) {
        const collData = await collRes.json()
        setCollection(collData.collection)
      } else {
        const errorData = await collRes.json()
        console.error('Error loading collection:', errorData)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }, [collectionId])

  const loadMempoolHealth = useCallback(async () => {
    // Prevent duplicate calls
    if (mempoolLoadingRef.current) {
      console.log('[Mempool] Already loading, skipping duplicate call')
      return
    }

    mempoolLoadingRef.current = true
    try {
      const health = await calculateOptimalFeeRate()
      setMempoolHealth(health)
      // Set default fee rate to suggested
      setSelectedFeeRate(health.suggestedFeeRate)
      setCustomFeeRate(health.suggestedFeeRate.toFixed(2))
    } catch (error) {
      console.error('Error loading mempool health:', error)
    } finally {
      mempoolLoadingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (collectionId) {
      loadData()
      setSelfInscribeInitialized(true)
      void loadOrdinals()
      void loadWalletBalance()
      loadMempoolHealth()
    }
  }, [collectionId, loadData, loadMempoolHealth])

  useEffect(() => {
    if (paymentAddress) {
      void loadWalletBalance()
    }
  }, [paymentAddress])

  // Initialize reveal destination address to connected wallet
  useEffect(() => {
    if (currentAddress && !revealDestinationAddress) {
      setRevealDestinationAddress(currentAddress)
    }
  }, [currentAddress, revealDestinationAddress])

  const loadOrdinals = async () => {
    if (!collectionId) return
    setLoadingOrdinals(true)
    try {
      let allOrdinals: any[] = []
      let page = 1
      let hasMore = true

      while (hasMore) {
        const res = await fetch(`/api/collections/${collectionId}/ordinals?page=${page}&limit=100`)
        const data = await res.json()

        if (res.ok && data.ordinals) {
          allOrdinals = [...allOrdinals, ...data.ordinals]
          hasMore = data.pagination && page < data.pagination.totalPages
          page++
        } else {
          hasMore = false
        }
      }

      setOrdinals(allOrdinals)
      await loadPendingInscriptions(allOrdinals.map((o: any) => o.id))
    } catch (error) {
      console.error('Error loading ordinals:', error)
    } finally {
      setLoadingOrdinals(false)
    }
  }

  const loadPendingInscriptions = async (ordinalIds: string[]) => {
    if (ordinalIds.length === 0) return
    try {
      const res = await fetch(`/api/mint/pending-inscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordinal_ids: ordinalIds }),
      })
      if (res.ok) {
        const data = await res.json()
        const pendingMap = new Map<string, any>()
        if (data.inscriptions && Array.isArray(data.inscriptions)) {
          data.inscriptions.forEach((insc: any) => {
            if (insc.ordinal_id) {
              pendingMap.set(insc.ordinal_id, insc)
            }
          })
        }
        setPendingInscriptions(pendingMap)
      }
    } catch (error) {
      console.error('Error loading pending inscriptions:', error)
    }
  }

  const loadWalletBalance = async () => {
    if (!paymentAddress) return
    setLoadingBalance(true)
    try {
      const res = await fetch(`/api/utxos?address=${encodeURIComponent(paymentAddress)}`)
      const data = await res.json()
      if (res.ok && data.totalValue !== undefined) {
        setWalletBalance(data.totalValue)
        if (data.utxos && Array.isArray(data.utxos)) {
          setWalletUtxoCount(data.utxos.length || 1)
        }
      }
    } catch (error) {
      console.error('Error loading wallet balance:', error)
    } finally {
      setLoadingBalance(false)
    }
  }

  const batches = useMemo(() => {
    const result: any[][] = []
    for (let i = 0; i < ordinals.length; i += 10) {
      result.push(ordinals.slice(i, i + 10))
    }
    return result
  }, [ordinals])

  const actualMintedCount = useMemo(() => {
    return ordinals.filter((o: any) => o.is_minted).length
  }, [ordinals])

  useEffect(() => {
    if (batches.length > 0 && walletUtxoCount > 0) {
      void loadBatchCosts()
    }
  }, [batches, selectedFeeRate, walletUtxoCount])

  const loadBatchCosts = async () => {
    if (batches.length === 0) return

    setLoadingCosts(true)
    const newCosts = new Map()
    const newDetails = new Map()
    const estimatedInputCount = Math.min(walletUtxoCount, 10)

    await Promise.all(
      batches.map(async (batch, batchIndex) => {
        try {
          const ordinalIds = batch.map((o: any) => o.id)
          const response = await fetch('/api/mint/estimate-cost', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ordinalIds,
              feeRate: selectedFeeRate,
              receivingAddress: currentAddress,
              paymentAddress: paymentAddress,
              inputCount: estimatedInputCount,
            }),
          })

          if (response.ok) {
            const data = await response.json()
            newCosts.set(batchIndex, data.estimate)
            if (data.ordinalDetails) {
              newDetails.set(batchIndex, data.ordinalDetails)
            }
          }
        } catch (error) {
          console.error(`Error estimating cost for batch ${batchIndex}:`, error)
        }
      })
    )

    setBatchCosts(newCosts)
    setBatchOrdinalDetails(newDetails)
    setLoadingCosts(false)
  }

  const toggleBatchExpand = (batchIndex: number) => {
    const newExpanded = new Set(expandedBatches)
    if (newExpanded.has(batchIndex)) {
      newExpanded.delete(batchIndex)
    } else {
      newExpanded.add(batchIndex)
    }
    setExpandedBatches(newExpanded)
  }

  const toggleOrdinalSelect = (ordinalId: string) => {
    const newSelected = new Set(selectedOrdinals)
    if (newSelected.has(ordinalId)) {
      newSelected.delete(ordinalId)
    } else {
      newSelected.add(ordinalId)
    }
    setSelectedOrdinals(newSelected)
  }

  const selectAllInBatch = (batch: any[]) => {
    const newSelected = new Set(selectedOrdinals)
    batch.forEach((o: any) => {
      if (!o.is_minted) {
        newSelected.add(o.id)
      }
    })
    setSelectedOrdinals(newSelected)
  }

  const clearBatchSelection = (batch: any[]) => {
    const newSelected = new Set(selectedOrdinals)
    batch.forEach((o: any) => {
      newSelected.delete(o.id)
    })
    setSelectedOrdinals(newSelected)
  }

  // Show destination modal before inscribing
  const showDestinationModal = (action: 'single' | 'batch') => {
    // Reset to current address each time modal opens
    setRevealDestinationAddress(currentAddress || '')
    setDestinationModal({ show: true, action })
  }

  // Handle destination confirmation
  const confirmDestination = () => {
    if (!revealDestinationAddress || revealDestinationAddress.trim().length < 30) {
      alert('Please enter a valid taproot address')
      return
    }
    
    const action = destinationModal.action
    setDestinationModal({ show: false, action: null })
    
    if (action === 'single') {
      executeInscribeSelected(revealDestinationAddress.trim())
    } else if (action === 'batch') {
      executeBatchInscribe(revealDestinationAddress.trim())
    }
  }

  // Wrapper to show modal first
  const inscribeSelectedOrdinals = () => {
    if (selectedOrdinals.size === 0) {
      alert('Please select at least one ordinal to inscribe')
      return
    }

    if (!isConnected || !currentAddress || !paymentAddress) {
      alert('Please connect your wallet first')
      return
    }
    
    showDestinationModal('single')
  }

  // Actual inscribe execution after modal confirmation
  const executeInscribeSelected = async (destinationAddress: string) => {
    if (selectedOrdinals.size === 0) {
      alert('Please select at least one ordinal to inscribe')
      return
    }

    if (!isConnected || !currentAddress || !paymentAddress) {
      alert('Please connect your wallet first')
      return
    }

    setInscribing(true)
    const ordinalIds = Array.from(selectedOrdinals)

    try {
      const commitResponse = await fetch('/api/mint/create-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ordinal_ids: ordinalIds,
          minter_address: currentAddress,
          payment_address: paymentAddress,
          payment_pubkey: paymentPublicKey,
          fee_rate: selectedFeeRate,
          is_bulk_inscribe: true,
          receiving_wallet: destinationAddress,
        }),
      })

      if (!commitResponse.ok) {
        const error = await commitResponse.json()
        throw new Error(error.error || 'Failed to create commit transaction')
      }

      const commitData = await commitResponse.json()
      const signedCommit = await signPsbt(commitData.commit_psbt, true, false)

      let signedPsbtBase64: string | undefined
      let signedPsbtHex: string | undefined
      let txHex: string | undefined

      if (typeof signedCommit === 'string') {
        signedPsbtBase64 = signedCommit
      } else if (signedCommit && typeof signedCommit === 'object') {
        signedPsbtBase64 = signedCommit.signedPsbtBase64 || signedCommit.psbtBase64 || signedCommit.psbt
        signedPsbtHex = signedCommit.signedPsbtHex || signedCommit.hex
        txHex = signedCommit.txHex || signedCommit.tx
      }

      if (!signedPsbtBase64 && !signedPsbtHex && !txHex) {
        throw new Error('Wallet did not return signed PSBT or transaction')
      }

      const broadcastResponse = await fetch('/api/mint/broadcast-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: commitData.session_id,
          signed_psbt_base64: signedPsbtBase64,
          signed_psbt_hex: signedPsbtHex,
          tx_hex: txHex,
        }),
      })

      if (!broadcastResponse.ok) {
        const errorData = await broadcastResponse.json()
        throw new Error(errorData.error || 'Failed to broadcast commit transaction')
      }

      const broadcastData = await broadcastResponse.json()
      const commitTxId = broadcastData.commit_tx_id

      if (!commitTxId) {
        throw new Error('No commit transaction ID returned from broadcast')
      }

      await new Promise(resolve => setTimeout(resolve, 3000))

      const inscriptionIds = commitData.inscription_ids || []
      let successCount = 0

      for (let i = 0; i < inscriptionIds.length; i++) {
        const revealResponse = await fetch('/api/mint/reveal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mint_inscription_id: inscriptionIds[i],
            commit_tx_id: commitTxId,
          }),
        })

        if (revealResponse.ok) {
          successCount++
        }

        if (i < inscriptionIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      alert(`Successfully inscribed ${successCount}/${ordinalIds.length} ordinal(s)!`)
      setSelectedOrdinals(new Set())
      await loadOrdinals()
      await loadWalletBalance()
    } catch (error: any) {
      console.error('Inscription error:', error)
      alert(`Inscription failed: ${error.message}`)
    } finally {
      setInscribing(false)
    }
  }

  const totalSelectedCost = useMemo(() => {
    let total = 0
    selectedBatches.forEach(batchIndex => {
      const cost = batchCosts.get(batchIndex)
      if (cost) {
        total += cost.totalCost
      }
    })
    return total
  }, [selectedBatches, batchCosts])

  const isBatchCompleteCheck = (batch: any[]) => {
    if (batch.length === 0) return false
    return batch.every((o: any) => {
      if (o.is_minted) return true
      const pendingInsc = pendingInscriptions.get(o.id)
      return pendingInsc && pendingInsc.reveal_tx_id
    })
  }

  const affordableBatches = useMemo(() => {
    const affordable: number[] = []
    let runningCost = 0
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      if (isBatchCompleteCheck(batch)) {
        continue
      }
      const cost = batchCosts.get(i)
      if (cost && runningCost + cost.totalCost <= walletBalance) {
        affordable.push(i)
        runningCost += cost.totalCost
      } else if (!cost) {
        affordable.push(i)
      } else {
        break
      }
    }
    return affordable
  }, [batches, batchCosts, walletBalance, pendingInscriptions])

  const toggleBatch = (batchIndex: number) => {
    const newSelected = new Set(selectedBatches)
    if (newSelected.has(batchIndex)) {
      newSelected.delete(batchIndex)
    } else {
      newSelected.add(batchIndex)
    }
    setSelectedBatches(newSelected)
  }

  const selectAllAffordable = () => {
    setSelectedBatches(new Set(affordableBatches))
  }

  const clearSelection = () => {
    setSelectedBatches(new Set())
  }

  // Wrapper to show modal first for batch inscribe
  const handleBatchInscribe = () => {
    if (selectedBatches.size === 0) {
      alert('Please select at least one batch to inscribe')
      return
    }

    if (!isConnected || !currentAddress) {
      alert('Please connect your wallet first')
      return
    }

    if (!paymentAddress) {
      alert('Please connect your payment wallet')
      return
    }

    showDestinationModal('batch')
  }

  // Actual batch inscribe execution after modal confirmation
  const executeBatchInscribe = async (destinationAddress: string) => {
    if (selectedBatches.size === 0) {
      alert('Please select at least one batch to inscribe')
      return
    }

    if (!isConnected || !currentAddress) {
      alert('Please connect your wallet first')
      return
    }

    if (!paymentAddress) {
      alert('Please connect your payment wallet')
      return
    }

    setInscribing(true)
    const batchArray = Array.from(selectedBatches).sort((a, b) => a - b)

    try {
      let totalInscribed = 0

      for (const batchIndex of batchArray) {
        const batch = batches[batchIndex]
        const ordinalIds = batch.map((o: any) => o.id)

        const commitResponse = await fetch('/api/mint/create-commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ordinal_ids: ordinalIds,
            minter_address: currentAddress,
            payment_address: paymentAddress,
            payment_pubkey: paymentPublicKey,
            fee_rate: selectedFeeRate,
            is_bulk_inscribe: true,
            receiving_wallet: destinationAddress,
          }),
        })

        if (!commitResponse.ok) {
          const error = await commitResponse.json()
          throw new Error(error.error || 'Failed to create commit transaction')
        }

        const commitData = await commitResponse.json()
        const signedCommit = await signPsbt(commitData.commit_psbt, true, false)

        let signedPsbtBase64: string | undefined
        let signedPsbtHex: string | undefined
        let txHex: string | undefined

        if (typeof signedCommit === 'string') {
          signedPsbtBase64 = signedCommit
        } else if (signedCommit && typeof signedCommit === 'object') {
          signedPsbtBase64 = signedCommit.signedPsbtBase64 || signedCommit.psbtBase64 || signedCommit.psbt
          signedPsbtHex = signedCommit.signedPsbtHex || signedCommit.hex
          txHex = signedCommit.txHex || signedCommit.tx
        }

        if (!signedPsbtBase64 && !signedPsbtHex && !txHex) {
          throw new Error('Wallet did not return signed PSBT or transaction')
        }

        const broadcastResponse = await fetch('/api/mint/broadcast-commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: commitData.session_id,
            signed_psbt_base64: signedPsbtBase64,
            signed_psbt_hex: signedPsbtHex,
            tx_hex: txHex,
          }),
        })

        if (!broadcastResponse.ok) {
          const errorData = await broadcastResponse.json()
          throw new Error(errorData.error || 'Failed to broadcast commit transaction')
        }

        const broadcastData = await broadcastResponse.json()
        const commitTxId = broadcastData.commit_tx_id

        if (!commitTxId) {
          throw new Error('No commit transaction ID returned from broadcast')
        }

        await new Promise(resolve => setTimeout(resolve, 3000))

        const inscriptionIds = commitData.inscription_ids || []

        for (let i = 0; i < inscriptionIds.length; i++) {
          const mintInscriptionId = inscriptionIds[i]

          const revealResponse = await fetch('/api/mint/reveal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mint_inscription_id: mintInscriptionId,
              commit_tx_id: commitTxId,
            }),
          })

          if (revealResponse.ok) {
            totalInscribed++
          }

          if (i < inscriptionIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
      }

      alert(`Successfully inscribed ${totalInscribed} ordinal(s) from ${batchArray.length} batch(es)!`)
      setSelectedBatches(new Set())
      await loadOrdinals()
      await loadWalletBalance()
    } catch (error: any) {
      console.error('Batch inscription error:', error)
      alert(`Inscription failed: ${error.message}`)
    } finally {
      setInscribing(false)
    }
  }

  const showAllMetadata = () => {
    const completedOrdinals = ordinals.filter((ordinal: any) => {
      if (ordinal.is_minted) return true
      const pendingInsc = pendingInscriptions.get(ordinal.id)
      return pendingInsc && pendingInsc.reveal_tx_id
    })

    const metadata = completedOrdinals.map((ordinal: any) => {
      const pendingInsc = pendingInscriptions.get(ordinal.id)
      return {
        name: `${collection?.name || 'Ordinal'} #${ordinal.ordinal_number}`,
        ordinal_number: ordinal.ordinal_number,
        inscription_id: pendingInsc?.inscription_id || ordinal.inscription_id || null,
        commit_tx: pendingInsc?.commit_tx_id || null,
        reveal_tx: pendingInsc?.reveal_tx_id || null,
        attributes: ordinal.attributes || ordinal.traits || [],
        image_url: ordinal.compressed_image_url || ordinal.thumbnail_url || ordinal.image_url,
      }
    })
    setMetadataModal({ show: true, batchIndex: null, metadata })
  }

  const handleRetryReveal = async (inscription: any) => {
    if (!inscription.commit_tx_id || !inscription.id) {
      alert('Missing commit transaction or inscription ID')
      return
    }

    try {
      setInscribing(true)
      const revealResponse = await fetch('/api/mint/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint_inscription_id: inscription.id,
          commit_tx_id: inscription.commit_tx_id,
        }),
      })

      if (!revealResponse.ok) {
        const error = await revealResponse.json()
        throw new Error(error.error || error.details || 'Failed to reveal')
      }

      const revealData = await revealResponse.json()
      alert(`Successfully revealed! Inscription ID: ${revealData.inscription_id}`)
      await loadOrdinals()
    } catch (error: any) {
      console.error('Reveal retry error:', error)
      alert(`Reveal failed: ${error.message}`)
    } finally {
      setInscribing(false)
    }
  }

  const handleRetryBatchReveals = async (batchOrdinalIds: string[]) => {
    const pendingForBatch = batchOrdinalIds
      .map(id => pendingInscriptions.get(id))
      .filter(insc => insc && insc.commit_tx_id && !insc.reveal_tx_id)

    if (pendingForBatch.length === 0) {
      alert('No pending reveals for this batch')
      return
    }

    try {
      setInscribing(true)
      let successCount = 0

      for (const inscription of pendingForBatch) {
        const revealResponse = await fetch('/api/mint/reveal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mint_inscription_id: inscription.id,
            commit_tx_id: inscription.commit_tx_id,
          }),
        })

        if (revealResponse.ok) {
          successCount++
        }

        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      alert(`Revealed ${successCount}/${pendingForBatch.length} inscriptions!`)
      await loadOrdinals()
    } catch (error: any) {
      console.error('Batch reveal retry error:', error)
      alert(`Reveal failed: ${error.message}`)
    } finally {
      setInscribing(false)
    }
  }

  if (loading || !collection) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-[#4561ad] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-6 py-12">
      <div className="max-w-7xl mx-auto">
        {/* Info Notice */}
        <div className="mb-6 p-4 rounded-lg bg-[#8b5cf6]/20 border border-[#8b5cf6]/50 backdrop-blur-sm">
          <p className="text-[#a78bfa] text-sm flex items-center gap-2">
            <span>ℹ️</span>
            <span><strong>Note:</strong> This is not required to launch a collection. Self-inscribing is optional for creators who want to inscribe their own ordinals.</span>
          </p>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] bg-clip-text text-transparent">
                ⚡ Self-Inscribe
              </h1>
              <p className="text-[#a8a8b8]/80 mt-1">{collection.name}</p>
            </div>
            <Link
              href={`/collections/${collectionId}`}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-semibold transition-colors border border-[rgba(0,212,255,0.3)]"
            >
              ← Back to Collection
            </Link>
          </div>

          {/* Status Banner */}
          <div className={`mt-4 p-4 rounded-lg backdrop-blur-sm ${
            actualMintedCount === collection.total_supply 
              ? 'bg-green-500/20 border border-green-500/50' 
              : actualMintedCount > 0
              ? 'bg-[#9945FF]/20 border border-[#9945FF]/50'
              : 'bg-white/5 border border-white/20'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {actualMintedCount === collection.total_supply ? '✅' : actualMintedCount > 0 ? '🔵' : '⚪'}
              </span>
              <span className={`font-medium ${
                actualMintedCount === collection.total_supply 
                  ? 'text-green-400' 
                  : actualMintedCount > 0
                  ? 'text-[#9945FF]'
                  : 'text-[#a8a8b8]'
              }`}>
                {actualMintedCount === collection.total_supply
                  ? 'All Inscriptions Complete!'
                  : actualMintedCount > 0
                  ? 'Self-Inscribing in Progress'
                  : 'Ready to Self-Inscribe'}
              </span>
            </div>
            <div className="flex items-center justify-between mt-2">
              {collection.total_supply && (
                <p className="text-sm text-white/70">
                  <span className="font-semibold text-green-400">{actualMintedCount}</span> / {collection.total_supply} inscribed
                </p>
              )}
              {actualMintedCount > 0 && (
                <button
                  onClick={showAllMetadata}
                  className="px-3 py-1 bg-[#8b5cf6]/30 hover:bg-[#8b5cf6]/50 text-[#a78bfa] rounded-lg text-sm font-medium transition-colors border border-[#8b5cf6]/50"
                >
                  📋 Export Metadata JSON
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Self-Inscribe Interface */}
        <div className="space-y-6">
          {/* Loading Screen */}
          {(!selfInscribeInitialized || loadingOrdinals || loadingBalance) && (
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-xl p-8">
              <div className="flex flex-col items-center justify-center min-h-[300px]">
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-full border-4 border-white/20"></div>
                  <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-t-[#DC1FFF] border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
                  <div className="absolute inset-2 w-12 h-12 rounded-full border-4 border-t-transparent border-r-[#9945FF] border-b-transparent border-l-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Preparing Your Collection</h3>
                <p className="text-[#a8a8b8]/80 text-sm mb-6 text-center max-w-md">
                  Loading wallet balance and ordinal data from the blockchain...
                </p>
              </div>
            </div>
          )}

          {/* Main Interface */}
          {selfInscribeInitialized && !loadingOrdinals && !loadingBalance && (
            <>
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-xl p-6">
                {!paymentAddress && (
                  <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 mb-6">
                    <p className="text-sm text-yellow-200">
                      <strong>⚠️ Payment Wallet Required:</strong> Please connect your payment wallet to view balance and inscribe batches.
                    </p>
                  </div>
                )}

                {/* Wallet Info & Controls */}
                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <div className="text-lg font-bold text-white">
                      {(walletBalance / 100000000).toFixed(8)} BTC
                    </div>
                    <div className="text-xs text-white/50">{walletBalance.toLocaleString()} sats</div>
                  </div>

                  <div className="bg-[#9945FF]/10 border border-[#9945FF]/30 rounded-lg p-4">
                    <div className="text-lg font-bold text-[#9945FF]">
                      {ordinals.length} ordinals
                    </div>
                    <div className="text-xs text-white/50">{batches.length} batches of 10</div>
                  </div>

                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <div className="text-lg font-bold text-green-400">
                      {affordableBatches.length} affordable
                    </div>
                    <div className="text-xs text-white/50">
                      {affordableBatches.reduce((sum, idx) => sum + (batches[idx]?.length || 0), 0)} ordinals
                    </div>
                  </div>
                </div>

                {/* Fee Rate Control */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-[#a8a8b8] mb-2">
                    Network Fee (sat/vB)
                  </label>
                  {mempoolHealth && (
                    <div className="mb-3 p-3 bg-[#9945FF]/10 border border-[#9945FF]/30 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-[#a8a8b8]">
                          Mempool Health: 
                          <span className={`ml-2 ${
                            mempoolHealth.healthRating === 'excellent' ? 'text-green-400' :
                            mempoolHealth.healthRating === 'good' ? 'text-[#9945FF]' :
                            mempoolHealth.healthRating === 'fair' ? 'text-[#FBBF24]' :
                            'text-[#EF4444]'
                          }`}>
                            {mempoolHealth.healthRating.toUpperCase()}
                          </span>
                        </span>
                        <span className="text-xs text-[#a8a8b8]/80">
                          {mempoolHealth.blocksWithSub1Sat}/{mempoolHealth.totalBlocks} blocks
                        </span>
                      </div>
                      <p className="text-xs text-[#a8a8b8]/80 mb-1">{mempoolHealth.healthMessage}</p>
                      <p className="text-xs text-[#a8a8b8]">
                        Suggested: <span className="font-bold text-[#9945FF]">{mempoolHealth.suggestedFeeRate.toFixed(2)} sat/vB</span> (avg + 0.02)
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const current = parseFloat(customFeeRate) || selectedFeeRate
                        const newValue = Math.max(0.1, Math.round((current - 0.1) * 10) / 10)
                        setCustomFeeRate(newValue.toString())
                        setSelectedFeeRate(newValue)
                      }}
                      disabled={inscribing}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 border border-white/20"
                    >
                      −
                    </button>

                    <div className="flex-1">
                      <input
                        type="number"
                        value={customFeeRate}
                        onChange={(e) => {
                          const value = e.target.value
                          setCustomFeeRate(value)
                          const parsed = parseFloat(value)
                          if (!isNaN(parsed) && parsed >= 0.1) {
                            setSelectedFeeRate(parsed)
                          } else if (value === '' || value === '0' || value === '0.') {
                            setSelectedFeeRate(0.1)
                          }
                        }}
                        onBlur={(e) => {
                          const value = parseFloat(e.target.value)
                          if (isNaN(value) || value < 0.1) {
                            setCustomFeeRate('0.1')
                            setSelectedFeeRate(0.1)
                          }
                        }}
                        className="w-full px-4 py-2 bg-[rgba(15,23,42,0.9)] border border-[rgba(0,212,255,0.3)] rounded-lg text-center font-mono text-lg text-white focus:ring-2 focus:ring-[#9945FF] focus:border-transparent"
                        min="0.1"
                        step="0.1"
                      />
                    </div>

                    <button
                      onClick={() => {
                        const current = parseFloat(customFeeRate) || selectedFeeRate
                        const newValue = Math.round((current + 0.1) * 10) / 10
                        setCustomFeeRate(newValue.toString())
                        setSelectedFeeRate(newValue)
                      }}
                      disabled={inscribing}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 border border-white/20"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-xs text-white/50 text-center mt-2">
                    Minimum: 0.13 sat/vB • Normal: 0.2-0.3 • Fast: 1+
                  </p>
                </div>

                {/* Batch Selection Controls */}
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={selectAllAffordable}
                      disabled={affordableBatches.length === 0}
                      className="px-4 py-2 bg-[#9945FF] hover:bg-[#00b8e0] text-[#0a0e27] rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Select All Affordable
                    </button>
                    <button
                      onClick={clearSelection}
                      disabled={selectedBatches.size === 0}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/20"
                    >
                      Clear Selection
                    </button>
                  </div>
                  {selectedBatches.size > 0 && (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-sm text-[#a8a8b8]/80">{selectedBatches.size} batch{selectedBatches.size !== 1 ? 'es' : ''}</span>
                        <span className="mx-2 text-white/30">|</span>
                        <span className="font-semibold text-white">{totalSelectedCost.toLocaleString()} sats</span>
                        {totalSelectedCost > walletBalance && (
                          <span className="ml-2 text-[#EF4444] text-sm">⚠️</span>
                        )}
                      </div>
                      <button
                        onClick={handleBatchInscribe}
                        disabled={selectedBatches.size === 0 || inscribing || totalSelectedCost > walletBalance}
                        className="px-5 py-2 bg-[#DC1FFF] hover:bg-[#e55a2b] text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {inscribing ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Inscribing...
                          </span>
                        ) : (
                          `Inscribe ${selectedBatches.size}`
                        )}
                      </button>
                    </div>
                  )}
                  {selectedBatches.size === 0 && (
                    <div className="text-sm text-white/50">
                      Select batches to inscribe
                    </div>
                  )}
                </div>
              </div>

              {/* Batch Table */}
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-xl overflow-hidden">
                {loadingOrdinals ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-12 h-12 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : batches.length === 0 ? (
                  <div className="text-center py-12 text-white/40">
                    <div className="text-4xl mb-3">📦</div>
                    <p className="font-semibold">No uninscribed ordinals found</p>
                    <p className="text-sm mt-1">All ordinals in this collection are already inscribed</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-white/5 border-b border-white/10">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-[#a8a8b8]/80 uppercase w-12"></th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-[#a8a8b8]/80 uppercase w-16">Batch</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-[#a8a8b8]/80 uppercase">Preview</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-[#a8a8b8]/80 uppercase w-16">Qty</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-[#a8a8b8]/80 uppercase w-20">Size</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-[#a8a8b8]/80 uppercase w-28">Cost</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-[#a8a8b8]/80 uppercase w-24">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {batches.map((batch, batchIndex) => {
                          const costEstimate = batchCosts.get(batchIndex)
                          const ordinalDetails = batchOrdinalDetails.get(batchIndex) || []
                          const batchCost = costEstimate?.totalCost || 0
                          const isAffordable = affordableBatches.includes(batchIndex)
                          const isSelected = selectedBatches.has(batchIndex)
                          const isExpanded = expandedBatches.has(batchIndex)
                          
                          const completedCount = batch.filter((o: any) => {
                            if (o.is_minted) return true
                            const pendingInsc = pendingInscriptions.get(o.id)
                            return pendingInsc && pendingInsc.reveal_tx_id
                          }).length
                          const isBatchComplete = completedCount === batch.length && batch.length > 0
                          const pendingRevealCount = batch.filter((o: any) => {
                            const pendingInsc = pendingInscriptions.get(o.id)
                            return pendingInsc && pendingInsc.commit_tx_id && !pendingInsc.reveal_tx_id
                          }).length

                          return (
                            <React.Fragment key={batchIndex}>
                              <tr
                                className={`${
                                  isBatchComplete 
                                    ? 'bg-green-500/10 border-l-4 border-l-green-500' 
                                    : pendingRevealCount > 0 
                                      ? 'bg-yellow-500/10 border-l-4 border-l-yellow-500'
                                      : isSelected 
                                        ? 'bg-[#9945FF]/10' 
                                        : 'hover:bg-white/5'
                                } transition-colors cursor-pointer`}
                                onClick={() => toggleBatchExpand(batchIndex)}
                              >
                                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                  {isBatchComplete ? (
                                    <span className="text-green-400 text-lg">✓</span>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleBatch(batchIndex)}
                                      disabled={!isAffordable || !costEstimate || isBatchComplete}
                                      className="w-4 h-4 rounded border-white/30 bg-white/10 text-[#9945FF] focus:ring-[#9945FF] disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1">
                                    <span className={`text-white/40 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                    <span className="font-semibold text-white">#{batchIndex + 1}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-0.5">
                                    {batch.slice(0, 10).map((o: any) => (
                                      <img
                                        key={o.id}
                                        src={o.thumbnail_url || o.compressed_image_url || o.image_url}
                                        alt=""
                                        className="w-5 h-5 rounded-sm object-cover flex-shrink-0 border border-white/10"
                                        title={`#${o.ordinal_number}`}
                                      />
                                    ))}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className="font-medium text-white">{batch.length}</span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {costEstimate ? (
                                    <span className="font-medium text-white">
                                      {(costEstimate.totalSizeBytes / 1024).toFixed(0)} KB
                                    </span>
                                  ) : (
                                    <span className="text-white/40">...</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {costEstimate ? (
                                    <span className="font-semibold text-white">
                                      {batchCost.toLocaleString()} <span className="text-white/50 font-normal text-xs">sats</span>
                                    </span>
                                  ) : (
                                    <span className="text-white/40">...</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {isBatchComplete ? (
                                    <span className="px-2 py-0.5 bg-green-500 text-white rounded text-xs font-bold">
                                      ✓ {completedCount}/{batch.length}
                                    </span>
                                  ) : pendingRevealCount > 0 ? (
                                    <span className="px-2 py-0.5 bg-yellow-500 text-white rounded text-xs font-bold">
                                      ⏳ {completedCount}/{batch.length}
                                    </span>
                                  ) : !costEstimate ? (
                                    <span className="text-white/40 text-xs">...</span>
                                  ) : isAffordable ? (
                                    <span className="px-2 py-0.5 bg-green-500/30 text-green-400 rounded text-xs font-medium border border-green-500/50">
                                      Ready
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-red-500/30 text-[#EF4444] rounded text-xs font-medium border border-red-500/50">
                                      ✗
                                    </span>
                                  )}
                                </td>
                              </tr>
                              {/* Expanded Row - Individual Ordinal Details */}
                              {isExpanded && (() => {
                                // Sort ordinalDetails to match batch order by matching IDs
                                const sortedOrdinalDetails = batch.map((ordinal: any) => 
                                  ordinalDetails.find((detail: any) => detail.id === ordinal.id)
                                ).filter(Boolean)
                                
                                return (
                                <tr className="bg-white/5">
                                  <td colSpan={7} className="px-4 py-3">
                                    <div className="ml-8 border border-white/10 rounded-lg overflow-hidden bg-[rgba(15,23,42,0.9)]">
                                      <div className="px-4 py-2 bg-white/5 border-b border-white/10 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); selectAllInBatch(batch); }}
                                            className="px-2 py-1 bg-[#9945FF]/20 hover:bg-[#9945FF]/30 text-[#9945FF] rounded text-xs font-medium border border-[#9945FF]/30"
                                          >
                                            Select All
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); clearBatchSelection(batch); }}
                                            className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white/70 rounded text-xs font-medium border border-white/20"
                                          >
                                            Clear
                                          </button>
                                          <span className="text-xs text-white/50 ml-2">
                                            {batch.filter((o: any) => selectedOrdinals.has(o.id)).length} selected
                                          </span>
                                        </div>
                                      </div>
                                      <table className="w-full">
                                        <thead className="bg-white/5 text-sm">
                                          <tr>
                                            <th className="px-2 py-2 text-left font-medium text-white/50 w-8"></th>
                                            <th className="px-2 py-2 text-left font-medium text-white/50 w-8">#</th>
                                            <th className="px-2 py-2 text-left font-medium text-white/50 w-14"></th>
                                            <th className="px-2 py-2 text-left font-medium text-white/50">Ordinal</th>
                                            <th className="px-2 py-2 text-left font-medium text-white/50">is_minted</th>
                                            <th className="px-2 py-2 text-left font-medium text-white/50">Size</th>
                                            <th className="px-2 py-2 text-left font-medium text-white/50">Fee</th>
                                            <th className="px-2 py-2 text-left font-medium text-white/50">Total</th>
                                            <th className="px-2 py-2 text-left font-medium text-white/50 w-24">Status</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {sortedOrdinalDetails.length > 0 ? (
                                            sortedOrdinalDetails.map((detail: any, idx: number) => {
                                              // Now ordinal and detail are guaranteed to be aligned by batch order
                                              const ordinal = batch[idx]
                                              const isMinted = ordinal?.is_minted
                                              const isOrdinalSelected = selectedOrdinals.has(detail.id)
                                              const exceedsLimit = detail.exceedsLimit || parseFloat(detail.fileSizeKB) > 350
                                              const pendingInsc = pendingInscriptions.get(ordinal?.id)
                                              const hasPendingCommit = pendingInsc && pendingInsc.commit_tx_id && !pendingInsc.reveal_tx_id
                                              const hasCompletedReveal = pendingInsc && pendingInsc.reveal_tx_id
                                              return (
                                                <React.Fragment key={detail.id}>
                                                  <tr 
                                                    className={`${isMinted ? 'bg-white/5 opacity-60' : hasPendingCommit ? 'bg-yellow-500/10' : isOrdinalSelected ? 'bg-[#9945FF]/10' : 'hover:bg-white/5'} border-b border-white/5`}
                                                  >
                                                    <td className="px-2 py-2">
                                                      <input
                                                        type="checkbox"
                                                        checked={isOrdinalSelected}
                                                        onChange={() => toggleOrdinalSelect(detail.id)}
                                                        disabled={isMinted}
                                                        className="w-3 h-3 rounded border-white/30 bg-white/10 text-[#9945FF] focus:ring-[#9945FF] disabled:opacity-30"
                                                      />
                                                    </td>
                                                    <td className="px-2 py-2 text-white/50 text-sm">{idx + 1}</td>
                                                    <td className="px-2 py-2">
                                                      <img 
                                                        src={ordinal?.thumbnail_url || ordinal?.compressed_image_url || ordinal?.image_url} 
                                                        alt={`#${ordinal?.ordinal_number || idx + 1}`}
                                                        width={40}
                                                        height={40}
                                                        style={{ width: '40px', height: '40px', objectFit: 'cover' }}
                                                        className="rounded cursor-pointer border border-white/20 bg-white/10"
                                                      />
                                                    </td>
                                                    <td className="px-2 py-2 font-mono text-[#a8a8b8] text-sm">
                                                      #{ordinal?.ordinal_number || (batchIndex * 10) + idx + 1}
                                                    </td>
                                                    <td className="px-2 py-2 text-sm">
                                                      {isMinted ? (
                                                        <span className="px-2 py-0.5 bg-green-500/30 text-green-400 rounded text-xs font-bold">TRUE</span>
                                                      ) : (
                                                        <span className="px-2 py-0.5 bg-red-500/30 text-[#EF4444] rounded text-xs font-bold">FALSE</span>
                                                      )}
                                                    </td>
                                                    <td className={`px-2 py-2 text-sm ${exceedsLimit ? 'text-[#EF4444] font-medium' : 'text-white'}`}>
                                                      {detail.fileSizeKB} KB
                                                      {exceedsLimit && <span className="ml-1" title="Exceeds 350KB limit">⚠️</span>}
                                                    </td>
                                                    <td className="px-2 py-2 font-medium text-sm text-[#DC1FFF]">
                                                      {detail.revealFee?.toLocaleString()}
                                                    </td>
                                                    <td className="px-2 py-2 font-semibold text-sm text-green-400">
                                                      {detail.revealSatsNeeded?.toLocaleString()}
                                                    </td>
                                                    <td className="px-2 py-2 text-sm">
                                                      {isMinted || hasCompletedReveal ? (
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                          <span className="text-green-400 font-semibold">✓</span>
                                                          {pendingInsc?.commit_tx_id && (
                                                            <a 
                                                              href={`https://mempool.space/tx/${pendingInsc.commit_tx_id}`}
                                                              target="_blank"
                                                              rel="noopener noreferrer"
                                                              className="text-[#9945FF] hover:text-[#00b8e0] text-xs"
                                                              title={pendingInsc.commit_tx_id}
                                                            >
                                                              C
                                                            </a>
                                                          )}
                                                          {pendingInsc?.reveal_tx_id && (
                                                            <a 
                                                              href={`https://mempool.space/tx/${pendingInsc.reveal_tx_id}`}
                                                              target="_blank"
                                                              rel="noopener noreferrer"
                                                              className="text-[#9945FF] hover:text-[#00b8e0] text-xs"
                                                              title={pendingInsc.reveal_tx_id}
                                                            >
                                                              R
                                                            </a>
                                                          )}
                                                          {pendingInsc?.inscription_id && (
                                                            <a 
                                                              href={`https://ordinals.com/inscription/${pendingInsc.inscription_id}`}
                                                              target="_blank"
                                                              rel="noopener noreferrer"
                                                              className="text-[#8b5cf6] hover:text-[#a78bfa] text-xs"
                                                              title={pendingInsc.inscription_id}
                                                            >
                                                              Ord
                                                            </a>
                                                          )}
                                                        </div>
                                                      ) : hasPendingCommit ? (
                                                        <div className="flex items-center gap-2">
                                                          <span className="text-[#FBBF24]">⏳</span>
                                                          <a 
                                                            href={`https://mempool.space/tx/${pendingInsc.commit_tx_id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[#9945FF] hover:text-[#00b8e0] text-xs"
                                                            title={pendingInsc.commit_tx_id}
                                                          >
                                                            C✓
                                                          </a>
                                                          <button
                                                            onClick={(e) => { e.stopPropagation(); handleRetryReveal(pendingInsc); }}
                                                            disabled={inscribing}
                                                            className="px-2 py-0.5 bg-[#DC1FFF] hover:bg-[#e55a2b] text-white rounded text-xs font-medium disabled:opacity-50"
                                                          >
                                                            Reveal
                                                          </button>
                                                        </div>
                                                      ) : (
                                                        <span className="text-white/30">—</span>
                                                      )}
                                                    </td>
                                                  </tr>
                                                  {/* Details Row */}
                                                  <tr className="bg-[rgba(15,23,42,0.5)]">
                                                    <td colSpan={9} className="px-4 py-2 text-xs">
                                                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[#a8a8b8]/80">
                                                        <div>
                                                          <span className="text-white/40">UUID:</span>{' '}
                                                          <span className="font-mono text-[#9945FF]">{ordinal?.id || detail.id}</span>
                                                        </div>
                                                        <div>
                                                          <span className="text-white/40">is_minted:</span>{' '}
                                                          <span className={isMinted ? 'text-green-400' : 'text-[#EF4444]'}>{String(isMinted)}</span>
                                                        </div>
                                                        {pendingInsc && (
                                                          <>
                                                            <div>
                                                              <span className="text-white/40">mint_status:</span>{' '}
                                                              <span className={`font-medium ${
                                                                pendingInsc.mint_status === 'completed' ? 'text-green-400' :
                                                                pendingInsc.mint_status === 'failed' ? 'text-[#EF4444]' :
                                                                'text-[#FBBF24]'
                                                              }`}>{pendingInsc.mint_status || 'unknown'}</span>
                                                            </div>
                                                            {pendingInsc.commit_tx_id && (
                                                              <div>
                                                                <span className="text-white/40">commit:</span>{' '}
                                                                <a href={`https://mempool.space/tx/${pendingInsc.commit_tx_id}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[#9945FF] hover:underline">
                                                                  {pendingInsc.commit_tx_id.substring(0, 12)}...
                                                                </a>
                                                              </div>
                                                            )}
                                                            {pendingInsc.reveal_tx_id && (
                                                              <div>
                                                                <span className="text-white/40">reveal:</span>{' '}
                                                                <a href={`https://mempool.space/tx/${pendingInsc.reveal_tx_id}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[#9945FF] hover:underline">
                                                                  {pendingInsc.reveal_tx_id.substring(0, 12)}...
                                                                </a>
                                                              </div>
                                                            )}
                                                            {pendingInsc.inscription_id && (
                                                              <div>
                                                                <span className="text-white/40">inscription:</span>{' '}
                                                                <a href={`https://ordinals.com/inscription/${pendingInsc.inscription_id}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[#8b5cf6] hover:underline">
                                                                  {pendingInsc.inscription_id.substring(0, 12)}...
                                                                </a>
                                                              </div>
                                                            )}
                                                          </>
                                                        )}
                                                        {!pendingInsc && !isMinted && (
                                                          <div className="text-white/40 italic">No mint record</div>
                                                        )}
                                                      </div>
                                                    </td>
                                                  </tr>
                                                </React.Fragment>
                                              )
                                            })
                                          ) : (
                                            <tr>
                                              <td colSpan={9} className="px-3 py-4 text-center text-white/40 italic">
                                                Loading ordinal details...
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                      {batch.filter((o: any) => selectedOrdinals.has(o.id)).length > 0 && (
                                        <div className="px-4 py-3 bg-white/5 border-t border-white/10 flex items-center justify-between">
                                          <div className="text-sm text-[#a8a8b8]/80">
                                            <span className="font-semibold text-white">{batch.filter((o: any) => selectedOrdinals.has(o.id)).length}</span> ordinal(s) selected
                                          </div>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); inscribeSelectedOrdinals(); }}
                                            disabled={inscribing}
                                            className="px-4 py-2 bg-[#DC1FFF] hover:bg-[#e55a2b] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                                          >
                                            {inscribing ? 'Inscribing...' : `Inscribe ${batch.filter((o: any) => selectedOrdinals.has(o.id)).length} Selected`}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                )
                              })()}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Inscribe Button & Summary - Bottom */}
              {batches.length > 0 && selectedBatches.size > 0 && (
                <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-[#a8a8b8]/80">{selectedBatches.size} batch{selectedBatches.size !== 1 ? 'es' : ''} selected</span>
                      <span className="text-white/30">|</span>
                      <span className="font-bold text-white">{totalSelectedCost.toLocaleString()} sats</span>
                      <span className="text-white/50 text-sm">({(totalSelectedCost / 100000000).toFixed(8)} BTC)</span>
                      {totalSelectedCost > walletBalance && (
                        <span className="text-[#EF4444] text-sm">⚠️ Insufficient balance</span>
                      )}
                    </div>
                    <button
                      onClick={handleBatchInscribe}
                      disabled={selectedBatches.size === 0 || inscribing || totalSelectedCost > walletBalance}
                      className="px-6 py-2 bg-[#DC1FFF] hover:bg-[#e55a2b] text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {inscribing ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Inscribing...
                        </span>
                      ) : (
                        `Inscribe ${selectedBatches.size} Batch${selectedBatches.size !== 1 ? 'es' : ''}`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Destination Address Modal */}
        {destinationModal.show && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setDestinationModal({ show: false, action: null })}
          >
            <div
              className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-xl shadow-xl max-w-lg w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-white/10 bg-white/5">
                <h3 className="text-lg font-bold text-white">Confirm Reveal Destination</h3>
                <p className="text-sm text-white/50 mt-1">Where should the inscriptions be sent?</p>
              </div>
              <div className="p-6">
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Taproot Address (bc1p...)
                </label>
                <input
                  type="text"
                  value={revealDestinationAddress}
                  onChange={(e) => setRevealDestinationAddress(e.target.value)}
                  placeholder="bc1p..."
                  className="w-full px-3 py-2.5 bg-[#0a0e27] border border-white/20 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#9945FF] transition-colors"
                />
                <p className="text-xs text-white/40 mt-2">
                  By default, inscriptions will be sent to your connected wallet. Edit the address above to send them elsewhere.
                </p>
                {revealDestinationAddress !== currentAddress && revealDestinationAddress.trim() && (
                  <div className="mt-3 p-3 bg-[#DC1FFF]/20 border border-[#DC1FFF]/30 rounded-lg">
                    <p className="text-sm text-[#DC1FFF]">
                      ⚠️ You are sending to a different wallet than your connected wallet. Make sure this address is correct!
                    </p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-white/10 flex items-center justify-between bg-white/5">
                <button
                  onClick={() => setDestinationModal({ show: false, action: null })}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDestination}
                  disabled={!revealDestinationAddress || revealDestinationAddress.trim().length < 30}
                  className="px-6 py-2 bg-[#9945FF] hover:bg-[#00b8e0] disabled:bg-gray-600 disabled:cursor-not-allowed text-[#0a0e27] rounded-lg font-semibold transition-colors"
                >
                  Confirm & Proceed
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Metadata JSON Modal */}
        {metadataModal.show && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setMetadataModal({ show: false, batchIndex: null, metadata: [] })}
          >
            <div
              className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {collection?.name} - Inscription Metadata
                  </h3>
                  <p className="text-sm text-white/50">{metadataModal.metadata.length} completed inscriptions</p>
                </div>
                <button
                  onClick={() => setMetadataModal({ show: false, batchIndex: null, metadata: [] })}
                  className="text-white/40 hover:text-white text-2xl font-bold leading-none"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <pre className="bg-[rgba(10,14,39,0.9)] text-green-400 p-4 rounded-lg text-sm overflow-x-auto font-mono whitespace-pre-wrap border border-white/10">
                  {JSON.stringify(metadataModal.metadata, null, 2)}
                </pre>
              </div>
              <div className="p-4 border-t border-white/10 flex items-center justify-between bg-white/5">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(metadataModal.metadata, null, 2))
                    alert('Metadata copied to clipboard!')
                  }}
                  className="px-4 py-2 bg-[#9945FF] hover:bg-[#00b8e0] text-[#0a0e27] rounded-lg font-semibold transition-colors"
                >
                  📋 Copy JSON
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(metadataModal.metadata, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    const safeName = (collection?.name || 'collection').toLowerCase().replace(/[^a-z0-9]/g, '-')
                    a.download = `${safeName}-metadata.json`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="px-4 py-2 bg-[#DC1FFF] hover:bg-[#e55a2b] text-white rounded-lg font-semibold transition-colors"
                >
                  💾 Download JSON
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

