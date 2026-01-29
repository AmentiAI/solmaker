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

/**
 * GET /api/rewards/ordinals
 * Get all ordinals in the community payout wallet via Magic Eden API
 */
export async function GET(request: NextRequest) {
  try {
    // Check for PHRASE environment variable
    const phrase = process.env.PHRASE
    if (!phrase) {
      return NextResponse.json(
        { error: 'PHRASE environment variable is not set' },
        { status: 500 }
      )
    }

    // Derive P2TR wallet (same as community payouts)
    const wallet = deriveP2TRWallet(phrase)

    // Build Magic Eden API headers
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

    // Fetch all ordinals for this wallet address
    let allOrdinals: any[] = []
    let offset = 0
    const limit = 100
    let hasMore = true

    console.log(`🔍 Fetching ordinals for payout wallet: ${wallet.address}`)

    while (hasMore) {
      try {
        const params = new URLSearchParams({
          ownerAddress: wallet.address,
          showAll: 'true',
          limit: limit.toString(),
          offset: offset.toString(),
        })

        // Try different Magic Eden API endpoints
        let url = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?${params.toString()}`
        let response = await fetch(url, { headers })

        // If that doesn't work, try alternative endpoint
        if (!response.ok) {
          url = `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${wallet.address}/tokens?${params.toString()}`
          response = await fetch(url, { headers })
        }

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Magic Eden API error (offset ${offset}):`, response.status, errorText)
          
          // If we get 404 or similar, we might have reached the end
          if (response.status === 404 && offset === 0) {
            // No ordinals found
            hasMore = false
            break
          }
          
          if (response.status === 404) {
            // Reached end of pagination
            hasMore = false
            break
          }

          throw new Error(`Magic Eden API error: ${response.status} - ${errorText}`)
        }

        const data = await response.json()
        
        // Handle different response formats
        let tokens: any[] = []
        if (Array.isArray(data)) {
          tokens = data
        } else if (data.tokens && Array.isArray(data.tokens)) {
          tokens = data.tokens
        } else if (data.data && Array.isArray(data.data)) {
          tokens = data.data
        }

        if (tokens.length === 0) {
          hasMore = false
          break
        }

        allOrdinals = allOrdinals.concat(tokens)
        
        // Check if we have more pages
        const total = data.total ?? allOrdinals.length
        if (tokens.length < limit || allOrdinals.length >= total) {
          hasMore = false
        } else {
          offset += limit
        }

        console.log(`   ✅ Fetched ${tokens.length} ordinals (total: ${allOrdinals.length})`)
      } catch (error: any) {
        console.error(`Error fetching ordinals at offset ${offset}:`, error)
        // If it's a network error, break to avoid infinite loop
        if (error.message?.includes('fetch')) {
          hasMore = false
          break
        }
        throw error
      }
    }

    console.log(`✅ Total ordinals found: ${allOrdinals.length}`)

    // Filter out ordinals that have been won (from reward_attempts table)
    let wonOrdinalIds: Set<string> = new Set()
    let wonInscriptionNumbers: Set<number> = new Set()
    let wonInscriptionIds: Set<string> = new Set()

    if (sql) {
      try {
        const wonOrdinals = await sql`
          SELECT DISTINCT 
            won_ordinal_inscription_id,
            won_ordinal_inscription_number,
            won_ordinal_id
          FROM reward_attempts
          WHERE result = 'win'
            AND (won_ordinal_inscription_id IS NOT NULL 
                 OR won_ordinal_inscription_number IS NOT NULL
                 OR won_ordinal_id IS NOT NULL)
        ` as any[]

        if (Array.isArray(wonOrdinals)) {
          for (const won of wonOrdinals) {
            if (won.won_ordinal_inscription_id) {
              wonInscriptionIds.add(won.won_ordinal_inscription_id)
            }
            if (won.won_ordinal_inscription_number) {
              wonInscriptionNumbers.add(won.won_ordinal_inscription_number)
            }
            if (won.won_ordinal_id) {
              wonOrdinalIds.add(won.won_ordinal_id)
            }
          }
        }

        console.log(`🚫 Filtering out ${wonInscriptionIds.size + wonInscriptionNumbers.size + wonOrdinalIds.size} won ordinal(s)`)
      } catch (error: any) {
        console.error('Error fetching won ordinals:', error)
        // Continue anyway - better to show all ordinals than fail
      }
    }

    // Filter out won ordinals
    const availableOrdinals = allOrdinals.filter((ordinal: any) => {
      const inscriptionId = ordinal.id || ordinal.inscriptionId
      const inscriptionNumber = ordinal.inscriptionNumber || ordinal.inscription_number
      
      // Check if this ordinal has been won
      if (inscriptionId && wonInscriptionIds.has(inscriptionId)) {
        return false
      }
      if (inscriptionNumber && wonInscriptionNumbers.has(inscriptionNumber)) {
        return false
      }
      if (inscriptionId && wonOrdinalIds.has(inscriptionId)) {
        return false
      }
      
      return true
    })

    console.log(`✅ Available ordinals (after filtering won): ${availableOrdinals.length}`)

    return NextResponse.json({
      success: true,
      wallet_address: wallet.address,
      ordinals: availableOrdinals,
      total: availableOrdinals.length,
      total_in_wallet: allOrdinals.length,
      won_count: allOrdinals.length - availableOrdinals.length,
    })
  } catch (error: any) {
    console.error('Error fetching ordinals:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch ordinals',
      details: error.message 
    }, { status: 500 })
  }
}
