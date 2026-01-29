import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { ECPairFactory } from 'ecpair'
import { getBitcoinNetwork } from '@/lib/bitcoin-utils'

// Initialize ECC library
bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)
const bip32 = BIP32Factory(ecc)

/**
 * Derive P2TR wallet from seed phrase (same as community payouts)
 */
function deriveP2TRWallet(phrase: string): { address: string } {
  if (!bip39.validateMnemonic(phrase)) {
    throw new Error('Invalid mnemonic phrase')
  }

  const seed = bip39.mnemonicToSeedSync(phrase)
  const seedBuffer = Buffer.isBuffer(seed) ? seed : Buffer.from(seed)
  const root = bip32.fromSeed(seedBuffer)
  const network = getBitcoinNetwork()

  const ensureBuffer = (key: Buffer | Uint8Array | undefined): Buffer => {
    if (!key) throw new Error('Private key is undefined')
    return Buffer.isBuffer(key) ? key : Buffer.from(key)
  }

  const p2trPath = "m/86'/0'/0'/0/0"
  const p2trNode = root.derivePath(p2trPath)
  const p2trPrivateKey = ensureBuffer(p2trNode.privateKey)
  const p2trKeyPair = ECPair.fromPrivateKey(p2trPrivateKey)
  const p2trAddress = bitcoin.payments.p2tr({
    internalPubkey: p2trKeyPair.publicKey.subarray(1, 33),
    network,
  }).address!

  return { address: p2trAddress }
}

// TESTING: Set to 1.0 (100%) for testing, 0.002 (0.2%) for production
const BASE_WIN_CHANCE = process.env.REWARD_WIN_CHANCE ? parseFloat(process.env.REWARD_WIN_CHANCE) : 0.001 // 0.1% base chance (or set REWARD_WIN_CHANCE env var for testing)
const LUCK_MULTIPLIER = 0.0005 // 0.05% per ordmaker (0.0005 = 0.05% / 100)
const LUCK_DIVISOR = 50 // Every 50 luck = 0.05% more chance
const COOLDOWN_HOURS = 24
const ORDMAKER_COLLECTION = 'ordmaker' // Collection symbol on Magic Eden

/**
 * Verify ordmaker count from Magic Eden API (server-side verification)
 * This prevents users from lying about their holdings
 */
async function verifyOrdmakerCount(walletAddress: string): Promise<number> {
  const apiKey = process.env.MAGIC_EDEN_API_KEY
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'OrdMaker/1.0',
  }

  if (apiKey) {
    headers['X-API-Key'] = apiKey
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  let ordmakerCount = 0
  let offset = 0
  const limit = 100
  let hasMore = true

  console.log(`🔍 Verifying ordmaker count for wallet: ${walletAddress}`)

  // Paginate through all pieces to find user's holdings
  while (hasMore) {
    try {
      const params = new URLSearchParams({
        collectionSymbol: ORDMAKER_COLLECTION,
        limit: limit.toString(),
        offset: offset.toString(),
      })

      let url = `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${ORDMAKER_COLLECTION}/tokens?${params.toString()}`
      let response = await fetch(url, { headers })

      if (!response.ok) {
        url = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=${ORDMAKER_COLLECTION}&limit=${limit}&offset=${offset}`
        response = await fetch(url, { headers })
      }

      if (!response.ok) {
        if (response.status === 404) {
          url = `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${ORDMAKER_COLLECTION}?limit=${limit}&offset=${offset}`
          response = await fetch(url, { headers })
        }

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Magic Eden API error: ${response.status} - ${errorText}`)
        }
      }

      const data = await response.json()
      
      let tokens: any[] = []
      if (Array.isArray(data)) {
        tokens = data
      } else if (data.tokens && Array.isArray(data.tokens)) {
        tokens = data.tokens
      } else if (data.items && Array.isArray(data.items)) {
        tokens = data.items
      }

      // Count tokens owned by this wallet
      for (const token of tokens) {
        const ownerAddress = token.owner || token.ownerAddress || token.currentOwner || token.owner_address
        
        if (ownerAddress && typeof ownerAddress === 'string' && ownerAddress.toLowerCase() === walletAddress.toLowerCase()) {
          ordmakerCount++
        }
      }

      // Check if there are more pages
      if (tokens.length < limit) {
        hasMore = false
      } else {
        offset += limit
        // Safety limit to prevent infinite loops
        if (offset >= 10000) {
          hasMore = false
        }
      }
    } catch (error: any) {
      console.error(`Error verifying ordmaker count (offset ${offset}):`, error)
      // Continue with what we have
      hasMore = false
    }
  }

  console.log(`✅ Verified ordmaker count: ${ordmakerCount}`)
  return ordmakerCount
}

/**
 * POST /api/rewards/attempt
 * Attempt to win an ordinal from the payout wallet
 * Requires: wallet_address
 * Enforces 24-hour cooldown
 * SECURITY: Verifies ordmaker count from Magic Eden API (doesn't trust client input)
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address } = body

    if (!wallet_address || typeof wallet_address !== 'string') {
      return NextResponse.json({ error: 'Valid wallet address is required' }, { status: 400 })
    }

    // SECURITY: Verify ordmaker count from Magic Eden API (don't trust client)
    const verifiedOrdmakerCount = await verifyOrdmakerCount(wallet_address)

    if (verifiedOrdmakerCount < 1) {
      return NextResponse.json({ 
        error: 'You must hold at least 1 ordmaker to attempt',
        verified_count: verifiedOrdmakerCount,
        required: '>= 1 ordmaker'
      }, { status: 403 })
    }

    // Check cooldown - get last attempt timestamp
    const lastAttempt = await sql`
      SELECT attempt_timestamp
      FROM reward_attempts
      WHERE wallet_address = ${wallet_address}
      ORDER BY attempt_timestamp DESC
      LIMIT 1
    ` as any[]

    if (Array.isArray(lastAttempt) && lastAttempt.length > 0) {
      const lastTimestamp = new Date(lastAttempt[0].attempt_timestamp)
      const now = new Date()
      const hoursSinceLastAttempt = (now.getTime() - lastTimestamp.getTime()) / (1000 * 60 * 60)

      if (hoursSinceLastAttempt < COOLDOWN_HOURS) {
        const hoursRemaining = COOLDOWN_HOURS - hoursSinceLastAttempt
        const minutesRemaining = Math.ceil(hoursRemaining * 60)
        return NextResponse.json({
          error: 'Cooldown active',
          message: `You must wait ${hoursRemaining.toFixed(1)} hours before trying again`,
          cooldown_remaining_hours: hoursRemaining,
          cooldown_remaining_minutes: minutesRemaining,
          next_attempt_at: new Date(lastTimestamp.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000).toISOString()
        }, { status: 429 })
      }
    }

    // Calculate luck and win chance using VERIFIED count
    const luck = verifiedOrdmakerCount * LUCK_DIVISOR
    const winChance = BASE_WIN_CHANCE + (verifiedOrdmakerCount * LUCK_MULTIPLIER)
    const winChancePercent = winChance * 100

    // Roll for win
    const roll = Math.random()
    const won = roll < winChance

    let wonOrdinal = null
    let wonOrdinalId = null
    let wonInscriptionId = null
    let wonInscriptionNumber = null

    if (won) {
      // Fetch available ordinals from payout wallet
      // We'll get them from the rewards/ordinals endpoint logic
      const phrase = process.env.PHRASE
      if (!phrase) {
        return NextResponse.json({ error: 'Payout wallet not configured' }, { status: 500 })
      }

      // Derive P2TR wallet (same as rewards/ordinals)
      const wallet = deriveP2TRWallet(phrase)
      const p2trAddress = wallet.address

      // Fetch ordinals from Magic Eden
      const apiKey = process.env.MAGIC_EDEN_API_KEY
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'OrdMaker/1.0',
      }

      if (apiKey) {
        headers['X-API-Key'] = apiKey
        headers['Authorization'] = `Bearer ${apiKey}`
      }

      // Get all ordinals (simplified - in production you might want to cache this)
      let allOrdinals: any[] = []
      let offset = 0
      const limit = 100
      let hasMore = true

      while (hasMore && allOrdinals.length < 500) { // Limit to 500 for performance
        try {
          const params = new URLSearchParams({
            ownerAddress: p2trAddress,
            showAll: 'true',
            limit: limit.toString(),
            offset: offset.toString(),
          })

          const url = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?${params.toString()}`
          const response = await fetch(url, { headers })

          if (!response.ok) {
            if (response.status === 404) {
              hasMore = false
              break
            }
            throw new Error(`Magic Eden API error: ${response.status}`)
          }

          const data = await response.json()
          let tokens: any[] = []
          if (Array.isArray(data)) {
            tokens = data
          } else if (data.tokens && Array.isArray(data.tokens)) {
            tokens = data.tokens
          }

          if (tokens.length === 0) {
            hasMore = false
            break
          }

          allOrdinals = allOrdinals.concat(tokens)
          offset += limit
          if (tokens.length < limit) {
            hasMore = false
          }
        } catch (error) {
          console.error('Error fetching ordinals for reward:', error)
          hasMore = false
        }
      }

      if (allOrdinals.length > 0) {
        // Randomly select an ordinal
        const randomIndex = Math.floor(Math.random() * allOrdinals.length)
        wonOrdinal = allOrdinals[randomIndex]
        wonOrdinalId = wonOrdinal.id
        wonInscriptionId = wonOrdinal.inscriptionId || wonOrdinal.id
        wonInscriptionNumber = wonOrdinal.inscriptionNumber
      } else {
        // No ordinals available to win
        console.warn('User won but no ordinals available in payout wallet')
        // Still record as win, but without ordinal assignment
      }
    }

    // Record the attempt (using VERIFIED count)
    const attemptResult = await sql`
      INSERT INTO reward_attempts (
        wallet_address,
        ordmaker_count,
        luck,
        win_chance,
        result,
        won_ordinal_id,
        won_ordinal_inscription_id,
        won_ordinal_inscription_number,
        attempt_timestamp
      ) VALUES (
        ${wallet_address},
        ${verifiedOrdmakerCount},
        ${luck},
        ${winChance},
        ${won ? 'win' : 'lose'},
        ${wonOrdinalId || null},
        ${wonInscriptionId || null},
        ${wonInscriptionNumber || null},
        CURRENT_TIMESTAMP
      )
      RETURNING id, attempt_timestamp
    ` as any[]

    return NextResponse.json({
      success: true,
      won,
      luck,
      win_chance: winChance,
      win_chance_percent: winChancePercent.toFixed(4),
      won_ordinal: wonOrdinal ? {
        id: wonOrdinalId,
        inscription_id: wonInscriptionId,
        inscription_number: wonInscriptionNumber,
        name: wonOrdinal.displayName || wonOrdinal.name || `Ordinal #${wonInscriptionNumber}`,
        image_url: wonOrdinal.contentURI || wonOrdinal.contentPreviewURI,
      } : null,
      attempt_id: attemptResult[0]?.id,
      next_attempt_at: new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000).toISOString()
    })

  } catch (error: any) {
    console.error('Error processing reward attempt:', error)
    return NextResponse.json({
      error: 'Failed to process attempt',
      details: error.message
    }, { status: 500 })
  }
}

/**
 * GET /api/rewards/attempt
 * Get last attempt info and cooldown status
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const wallet_address = searchParams.get('wallet_address')

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    const lastAttempt = await sql`
      SELECT 
        id,
        wallet_address,
        ordmaker_count,
        luck,
        win_chance,
        result,
        won_ordinal_id,
        won_ordinal_inscription_id,
        won_ordinal_inscription_number,
        claimed,
        claim_txid,
        claim_timestamp,
        attempt_timestamp,
        created_at
      FROM reward_attempts
      WHERE wallet_address = ${wallet_address}
      ORDER BY attempt_timestamp DESC
      LIMIT 1
    ` as any[]

    if (!lastAttempt || lastAttempt.length === 0) {
      return NextResponse.json({
        has_attempted: false,
        can_attempt: true
      })
    }

    const attempt = lastAttempt[0]
    const lastTimestamp = new Date(attempt.attempt_timestamp)
    const now = new Date()
    const hoursSinceLastAttempt = (now.getTime() - lastTimestamp.getTime()) / (1000 * 60 * 60)
    const canAttempt = hoursSinceLastAttempt >= COOLDOWN_HOURS
    const hoursRemaining = canAttempt ? 0 : COOLDOWN_HOURS - hoursSinceLastAttempt
    const nextAttemptAt = new Date(lastTimestamp.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000)

    return NextResponse.json({
      has_attempted: true,
      can_attempt: canAttempt,
      last_attempt: {
        id: attempt.id,
        result: attempt.result,
        luck: attempt.luck,
        win_chance: attempt.win_chance,
        won_ordinal_id: attempt.won_ordinal_id,
        won_ordinal_inscription_id: attempt.won_ordinal_inscription_id,
        won_ordinal_inscription_number: attempt.won_ordinal_inscription_number,
        claimed: attempt.claimed || false,
        claim_txid: attempt.claim_txid,
        claim_timestamp: attempt.claim_timestamp,
        attempt_timestamp: attempt.attempt_timestamp
      },
      cooldown: {
        hours_remaining: hoursRemaining,
        minutes_remaining: Math.ceil(hoursRemaining * 60),
        next_attempt_at: nextAttemptAt.toISOString()
      }
    })

  } catch (error: any) {
    console.error('Error fetching reward attempt status:', error)
    return NextResponse.json({
      error: 'Failed to fetch attempt status',
      details: error.message
    }, { status: 500 })
  }
}
