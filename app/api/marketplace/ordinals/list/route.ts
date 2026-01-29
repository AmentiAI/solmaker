import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { getBitcoinNetwork } from '@/lib/inscription-utils'

// Initialize ECC library
bitcoin.initEccLib(ecc)

// Platform fee: 2% of price or minimum 330 sats (dust threshold)
const MIN_PLATFORM_FEE_SATS = 330
const PLATFORM_FEE_PERCENT = 0.02 // 2%
const PLATFORM_FEE_WALLET = process.env.FEE_WALLET || 'bc1p693zz6n9cvmsewemg4j0pmvfvs4th3ft9c74afrc90l6sah300uqt99vee'

function calculatePlatformFee(priceSats: number): number {
  const percentFee = Math.floor(priceSats * PLATFORM_FEE_PERCENT)
  return Math.max(MIN_PLATFORM_FEE_SATS, percentFee)
}

/**
 * POST /api/marketplace/ordinals/list
 * Creates a listing for an ordinal with a seller-signed partial PSBT
 *
 * Flow:
 * 1. Seller provides ordinal UTXO info (txid, vout, value)
 * 2. We create a PSBT with:
 *    - Input 0: Ordinal UTXO (seller will sign this)
 *    - Input 1: Placeholder for buyer's payment UTXO (unsigned)
 *    - Output 0: Seller receives payment (price_sats)
 *    - Output 1: Platform fee (PLATFORM_FEE_SATS)
 *    - Output 2: Buyer receives ordinal (UTXO value, usually 330-546 sats)
 *    - Output 3: Placeholder for buyer's change (will be added during purchase)
 * 3. Seller signs Input 0 (ordinal) via their wallet
 * 4. We store the partial PSBT in database
 * 5. Buyer later completes the PSBT by:
 *    - Adding their payment UTXO as Input 1
 *    - Adding change output
 *    - Signing Input 1
 *    - Broadcasting the complete transaction
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

    let inscription_id: string | undefined // Store outside try for error handling
  try {
    const body = await request.json()
    const {
      inscription_id: id,
      inscription_number,
      collection_symbol,
      utxo_txid,
      utxo_vout,
      utxo_value,
      price_sats,
      seller_wallet,
      seller_payment_address, // Seller's payment wallet (for receiving payment, different from ordinal wallet)
      seller_pubkey, // tapInternalKey for p2tr addresses (64 hex chars, no prefix)
      title,
      description,
      image_url,
      metadata_url,
    } = body

    inscription_id = id // Assign to outer variable

    // Log received payload for debugging
    console.log('Received listing request:', {
      inscription_id,
      seller_wallet: seller_wallet?.substring(0, 20) + '...',
      seller_payment_address: seller_payment_address?.substring(0, 20) + '...' || 'MISSING',
      has_payment_address: !!seller_payment_address
    })

    // Fetch content_type from ordinals.com API if not provided
    let content_type: string | null = body.content_type || null
    if (!content_type && inscription_id) {
      try {
        console.log(`📡 Fetching content type for inscription ${inscription_id}...`)
        const ordinalsResponse = await fetch(`https://ordinals.com/content/${inscription_id}`, {
          method: 'HEAD', // Use HEAD to get headers without downloading content
          next: { revalidate: 3600 }, // Cache for 1 hour
        })
        
        if (ordinalsResponse.ok) {
          const contentTypeHeader = ordinalsResponse.headers.get('content-type')
          if (contentTypeHeader) {
            content_type = contentTypeHeader.split(';')[0].trim() // Remove charset, etc.
            console.log(`✅ Found content type: ${content_type}`)
          }
        } else {
          // Try alternative endpoint
          try {
            const previewResponse = await fetch(`https://ordinals.com/preview/${inscription_id}`, {
              method: 'HEAD',
              next: { revalidate: 3600 },
            })
            if (previewResponse.ok) {
              const contentTypeHeader = previewResponse.headers.get('content-type')
              if (contentTypeHeader) {
                content_type = contentTypeHeader.split(';')[0].trim()
                console.log(`✅ Found content type from preview: ${content_type}`)
              }
            }
          } catch (previewError) {
            console.warn(`⚠️ Could not fetch content type from preview endpoint:`, previewError)
          }
        }
      } catch (contentTypeError: any) {
        console.warn(`⚠️ Could not fetch content type:`, contentTypeError.message)
        // Don't fail listing creation if content type fetch fails
      }
    }

    // Validation
    if (!inscription_id) {
      return NextResponse.json({ error: 'inscription_id is required' }, { status: 400 })
    }

    if (!utxo_txid || utxo_vout === undefined || !utxo_value) {
      return NextResponse.json({ error: 'UTXO info (txid, vout, value) is required' }, { status: 400 })
    }

    if (!price_sats || price_sats <= 0) {
      return NextResponse.json({ error: 'price_sats must be greater than 0' }, { status: 400 })
    }

    if (!seller_wallet) {
      return NextResponse.json({ error: 'seller_wallet is required' }, { status: 400 })
    }

    if (!seller_payment_address) {
      return NextResponse.json({ error: 'seller_payment_address is required' }, { status: 400 })
    }

    // Check if ordinal is already listed (any status)
    const existingListing = await sql`
      SELECT id, status, seller_wallet
      FROM ordinal_listings
      WHERE inscription_id = ${inscription_id}
    ` as any[]

    if (existingListing.length > 0) {
      const existing = existingListing[0]
      
      // If it's sold, can't relist
      if (existing.status === 'sold') {
        return NextResponse.json({
          error: 'This ordinal has already been sold',
          listing_id: existing.id
        }, { status: 409 })
      }
      
      // If it's active, can't duplicate
      if (existing.status === 'active') {
        return NextResponse.json({
          error: 'This ordinal is already listed',
          listing_id: existing.id
        }, { status: 409 })
      }
      
      // If it's pending/cancelled/expired and same seller, we'll update it
      // Otherwise, it's a different seller trying to list the same inscription (shouldn't happen but handle it)
      if (existing.seller_wallet !== seller_wallet) {
        return NextResponse.json({
          error: 'This ordinal is already listed by another seller',
          listing_id: existing.id
        }, { status: 409 })
      }
      
      // Same seller, cancelled/pending/expired - we'll delete the old one and create new
      console.log(`   Found existing ${existing.status} listing, will replace it`)
      await sql`
        DELETE FROM ordinal_listings
        WHERE id = ${existing.id}
      `
    }

    // Check if UTXO is already being used in another listing
    const existingUtxo = await sql`
      SELECT id, inscription_id
      FROM ordinal_listings
      WHERE utxo_txid = ${utxo_txid}
      AND utxo_vout = ${utxo_vout}
      AND status = 'active'
    ` as any[]

    if (existingUtxo.length > 0) {
      return NextResponse.json({
        error: 'This UTXO is already listed',
        listing_id: existingUtxo[0].id,
        inscription_id: existingUtxo[0].inscription_id
      }, { status: 409 })
    }

    console.log(`📝 Creating listing for inscription ${inscription_id}`)
    console.log(`   UTXO: ${utxo_txid}:${utxo_vout} (${utxo_value} sats)`)
    console.log(`   Price: ${price_sats} sats`)
    console.log(`   Seller: ${seller_wallet}`)

    // Create PSBT
    const network = getBitcoinNetwork()
    const psbt = new bitcoin.Psbt({ network })

    // Input 0: Ordinal UTXO (seller will sign this)
    // We need witnessUtxo and tapInternalKey for Taproot addresses
    const ordinalInput: any = {
      hash: utxo_txid,
      index: utxo_vout,
      witnessUtxo: {
        script: bitcoin.address.toOutputScript(seller_wallet, network),
        value: utxo_value,
      },
    }

    // Add tapInternalKey if seller provided pubkey (for p2tr addresses)
    if (seller_pubkey) {
      let keyBuffer = Buffer.from(seller_pubkey, 'hex')
      // Ensure it's 32 bytes (remove 0x02/0x03 prefix if present)
      if (keyBuffer.length === 33) {
        keyBuffer = keyBuffer.subarray(1)
      }
      ordinalInput.tapInternalKey = keyBuffer
    }

    psbt.addInput(ordinalInput)
    console.log(`   Added Input 0: Ordinal UTXO`)

    // CRITICAL: Structure outputs so seller's signature aligns after padding is added
    // At listing time: Seller signs Input[0] with SIGHASH_SINGLE | ANYONECANPAY
    //   - Signature commits to: Input[0] ↔ Output[0]
    // At purchase time: Buyer padding inputs added BEFORE seller's input
    //   - Seller's input becomes Input[2] (after 2 padding inputs)
    //   - We need Output[2] to be seller payment (protected by signature)
    //   - So at listing time, Output[0] should be seller payment
    //
    // Final structure after padding:
    // - Input[0-1]: Buyer padding inputs
    // - Input[2]: Seller ordinal (signed, commits to output[2] = seller payment)
    // - Input[3+]: Buyer payment inputs
    // - Output[0]: Buyer padding/change (added at purchase)
    // - Output[1]: Ordinal to buyer (buyer-controlled, NOT signed) (added at purchase)
    // - Output[2]: Seller payment (protected by signature) (from listing, was output[0])
    // - Output[3]: Platform fee (from listing, was output[1])
    
    // Output[0]: Seller payment (protected by seller's signature)
    // Seller signs Input[0] ↔ Output[0] at listing time
    // After padding, this becomes Input[2] ↔ Output[2]
    psbt.addOutput({
      address: seller_payment_address,
      value: price_sats,
    })
    console.log(`   Output 0: ${price_sats} sats → ${seller_payment_address.substring(0, 20)}... (seller payment - will be output[2] after padding)`)

    // Output[1]: Platform fee (2% or 330 sats minimum)
    // This will become output[3] after padding outputs are added
    const platformFeeSats = calculatePlatformFee(price_sats)
    psbt.addOutput({
      address: PLATFORM_FEE_WALLET,
      value: platformFeeSats,
    })
    console.log(`   Output 1: ${platformFeeSats} sats (${(platformFeeSats / price_sats * 100).toFixed(2)}%) → ${PLATFORM_FEE_WALLET.substring(0, 20)}... (platform fee - will be output[3] after padding)`)
    
    // Note: Output[0] (buyer padding/change) and Output[1] (ordinal to buyer) will be added at purchase time
    // This ensures the ordinal sat lands in output[1] after FIFO sat assignment across all inputs

    // Set SIGHASH flags for Input 0: SIGHASH_SINGLE | SIGHASH_ANYONECANPAY
    // This is the standard ordinal marketplace pattern with padding inputs:
    // - SIGHASH_SINGLE (0x03): Signs Input 0 and Output 0 (at listing time)
    // - SIGHASH_ANYONECANPAY (0x80): Allows others to add inputs (buyer's padding and payment inputs)
    // Combined: 0x83
    // 
    // HOW IT WORKS:
    // - At listing time: Seller signs Input[0] with SIGHASH_SINGLE | ANYONECANPAY
    //   - Signature commits to: Input[0] ↔ Output[0] (seller payment at listing time)
    // - At purchase time: Buyer padding inputs are added BEFORE seller's input
    //   - Seller's input becomes Input[2] (after 2 padding inputs)
    //   - Buyer adds Output[0] (padding/change) and Output[1] (ordinal to buyer) BEFORE seller payment
    //   - Seller payment (from listing Output[0]) becomes Output[2]
    //   - Platform fee (from listing Output[1]) becomes Output[3]
    //   - The signature from Input[0] ↔ Output[0] needs to work with Input[2] ↔ Output[2]
    //
    // CRITICAL: With SIGHASH_SINGLE, signature commits to input[i] ↔ output[i]
    // At listing: Input[0] ↔ Output[0] (seller payment)
    // After padding: Input[2] ↔ Output[2] (seller payment) - signature must align
    // Output[1] (ordinal to buyer) is NOT protected, allowing buyer to set address
    const SIGHASH_SINGLE = 0x03
    const SIGHASH_ANYONECANPAY = 0x80
    const sighashType = SIGHASH_SINGLE | SIGHASH_ANYONECANPAY

    // Set the sighash type in the PSBT input data
    // The wallet should respect this when signing
    psbt.updateInput(0, {
      sighashType: sighashType
    })
    console.log(`   ✅ Set SIGHASH flags: SIGHASH_SINGLE | SIGHASH_ANYONECANPAY (0x${sighashType.toString(16)})`)
    console.log(`   🔒 Signature at listing: Input[0] ↔ Output[0] (placeholder)`)
    console.log(`   🔒 Signature after padding: Input[2] ↔ Output[2] (seller payment - protected)`)
    console.log(`   ✅ Output[1] (ordinal to buyer) is NOT protected, allowing buyer to set address`)
    console.log(`   ⚠️  Marketplace must validate outputs match listing when building purchase PSBT`)

    // Convert PSBT to base64 for seller to sign
    const psbtBase64 = psbt.toBase64()
    const psbtHex = psbt.toHex()

    console.log(`✅ Created partial PSBT (seller must sign)`)

    // Store listing in database (status = 'pending' until seller signs and confirms)
    // For now, we'll create it as 'pending' and update to 'active' after seller provides signed PSBT
    // Actually, let's return the PSBT to the frontend, seller signs it, then frontend calls a confirm endpoint

    // For simplicity, we'll just save the listing as 'active' and include the unsigned PSBT
    // The seller will sign it on the frontend and we'll update the listing with the signed PSBT

    // Calculate BTC price
    const price_btc = price_sats / 100000000

    const result = await sql`
      INSERT INTO ordinal_listings (
        inscription_id,
        ordinal_number,
        collection_symbol,
        utxo_txid,
        utxo_vout,
        utxo_value,
        price_sats,
        price_btc,
        seller_wallet,
        seller_pubkey,
        platform_fee_sats,
        platform_fee_wallet,
        partial_psbt_base64,
        partial_psbt_hex,
        title,
        description,
        image_url,
        metadata_url,
        content_type,
        status
      ) VALUES (
        ${inscription_id},
        ${inscription_number || null},
        ${collection_symbol || null},
        ${utxo_txid},
        ${utxo_vout},
        ${utxo_value},
        ${price_sats},
        ${price_btc},
        ${seller_wallet},
        ${seller_pubkey || null},
        ${platformFeeSats},
        ${PLATFORM_FEE_WALLET},
        ${psbtBase64},
        ${psbtHex},
        ${title || `Ordinal #${inscription_number || inscription_id.substring(0, 8)}`},
        ${description || null},
        ${image_url || null},
        ${metadata_url || null},
        ${content_type || null},
        'pending'
      )
      RETURNING id, inscription_id, price_sats, status
    ` as any[]

    const listing = result[0]

    console.log(`✅ Created listing ${listing.id}`)

    // If collection_symbol exists, check and save collection metadata
    if (collection_symbol) {
      try {
        // Check if collection already exists in our database
        const existingCollection = await sql`
          SELECT id FROM ordinal_collections WHERE symbol = ${collection_symbol}
        ` as any[]

        if (existingCollection.length === 0) {
          console.log(`📦 Collection ${collection_symbol} not found in database, fetching from Magic Eden...`)
          
          // Fetch collection metadata from Magic Eden
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

          try {
            const magicEdenUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${encodeURIComponent(collection_symbol)}`
            const meResponse = await fetch(magicEdenUrl, {
              headers,
              next: { revalidate: 3600 }, // Cache for 1 hour
            })

            if (meResponse.ok) {
              const collectionData = await meResponse.json()
              
              // Save collection to database
              await sql`
                INSERT INTO ordinal_collections (
                  symbol,
                  name,
                  description,
                  image_uri,
                  chain,
                  supply,
                  min_inscription_number,
                  max_inscription_number,
                  website_link,
                  twitter_link,
                  discord_link,
                  magic_eden_created_at
                ) VALUES (
                  ${collectionData.symbol || collection_symbol},
                  ${collectionData.name || null},
                  ${collectionData.description || null},
                  ${collectionData.imageURI || null},
                  ${collectionData.chain || 'btc'},
                  ${collectionData.supply || null},
                  ${collectionData.min_inscription_number || null},
                  ${collectionData.max_inscription_number || null},
                  ${collectionData.websiteLink || null},
                  ${collectionData.twitterLink || null},
                  ${collectionData.discordLink || null},
                  ${collectionData.createdAt ? new Date(collectionData.createdAt) : null}
                )
                ON CONFLICT (symbol) DO UPDATE SET
                  name = EXCLUDED.name,
                  description = EXCLUDED.description,
                  image_uri = EXCLUDED.image_uri,
                  chain = EXCLUDED.chain,
                  supply = EXCLUDED.supply,
                  min_inscription_number = EXCLUDED.min_inscription_number,
                  max_inscription_number = EXCLUDED.max_inscription_number,
                  website_link = EXCLUDED.website_link,
                  twitter_link = EXCLUDED.twitter_link,
                  discord_link = EXCLUDED.discord_link,
                  magic_eden_created_at = EXCLUDED.magic_eden_created_at,
                  updated_at = CURRENT_TIMESTAMP
              `
              
              console.log(`✅ Saved collection metadata for ${collection_symbol}`)
            } else {
              console.warn(`⚠️ Failed to fetch collection metadata from Magic Eden: ${meResponse.status}`)
            }
          } catch (fetchError: any) {
            console.error(`❌ Error fetching collection metadata:`, fetchError.message)
            // Don't fail the listing creation if collection fetch fails
          }
        } else {
          console.log(`✅ Collection ${collection_symbol} already exists in database`)
        }
      } catch (collectionError: any) {
        console.error(`❌ Error saving collection metadata:`, collectionError.message)
        // Don't fail the listing creation if collection save fails
      }
    }

    return NextResponse.json({
      success: true,
      listing_id: listing.id,
      inscription_id: listing.inscription_id,
      price_sats: listing.price_sats,
      platform_fee_sats: platformFeeSats,
      status: listing.status,
      psbt_to_sign: psbtBase64, // Seller needs to sign this
      message: 'Please sign the PSBT to list your ordinal.',
    })

  } catch (error: any) {
    console.error('Error creating ordinal listing:', error)
    
    // Handle duplicate key constraint violation
    if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
      // Try to find the existing listing
      try {
        if (!inscription_id) {
          throw new Error('Cannot check for existing listing without inscription_id')
        }
        
        const existing = await sql`
          SELECT id, status, seller_wallet
          FROM ordinal_listings
          WHERE inscription_id = ${inscription_id}
        ` as any[]
        
        if (existing.length > 0) {
          const existingListing = existing[0]
          if (existingListing.status === 'active') {
            return NextResponse.json({
              error: 'This ordinal is already listed',
              listing_id: existingListing.id
            }, { status: 409 })
          } else if (existingListing.status === 'sold') {
            return NextResponse.json({
              error: 'This ordinal has already been sold',
              listing_id: existingListing.id
            }, { status: 409 })
          } else {
            return NextResponse.json({
              error: 'This ordinal already has a listing',
              listing_id: existingListing.id,
              status: existingListing.status
            }, { status: 409 })
          }
        }
      } catch (lookupError) {
        // Fall through to generic error
      }
      
      return NextResponse.json({
        error: 'This ordinal is already listed',
        details: 'A listing with this inscription ID already exists'
      }, { status: 409 })
    }
    
    return NextResponse.json({
      error: 'Failed to create listing',
      details: error.message
    }, { status: 500 })
  }
}
