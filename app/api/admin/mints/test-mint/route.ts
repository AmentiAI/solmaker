import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'
import sharp from 'sharp'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import {
  generatePrivateKey,
  createInscriptionRevealAddressAndKeys,
  estimateInscriptionCost,
  getBitcoinNetwork,
  getMinimumOutputValue,
} from '@/lib/inscription-utils'
import { Tap } from '@cmdcode/tapscript'
import { ECPairFactory } from 'ecpair'
import { fetchUtxos, filterAndSortUtxos, convertSandshrewToMempoolFormat, validateSufficientFunds } from '@/lib/utxo-fetcher'
import { addInputSigningInfo, getAddressType } from '@/lib/bitcoin-utils'

// Initialize ECC library
bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)

/**
 * POST /api/admin/mints/test-mint - Create a test mint for an ordinal
 * This creates the commit transaction data without actually broadcasting
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const {
      admin_wallet,
      ordinal_id,
      collection_id,
      receiving_address,
      payment_address,
      payment_pubkey,
      fee_rate = 1,
      dry_run = true, // Default to dry run for safety
    } = body

    console.log('🔍 Test mint request:', {
      admin_wallet: admin_wallet?.substring(0, 20),
      collection_id,
      dry_run,
      dry_run_from_body: body.dry_run,
      payment_address: payment_address?.substring(0, 20),
      has_payment_pubkey: !!payment_pubkey,
    })

    if (!admin_wallet || !isAdmin(admin_wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!ordinal_id && !collection_id) {
      return NextResponse.json({ error: 'Either ordinal_id or collection_id is required' }, { status: 400 })
    }

    if (!receiving_address) {
      return NextResponse.json({ error: 'Receiving address is required' }, { status: 400 })
    }

    // Get the ordinal to test mint
    let ordinal: Record<string, any> | null = null
    if (ordinal_id) {
      const result = await sql`
        SELECT * FROM generated_ordinals WHERE id = ${ordinal_id}
      `
      ordinal = Array.isArray(result) ? result[0] : null
    } else {
      // Get a random ordinal from the collection
      const result = await sql`
        SELECT * FROM generated_ordinals 
        WHERE collection_id = ${collection_id}
        AND is_minted = false
        ORDER BY RANDOM()
        LIMIT 1
      `
      ordinal = Array.isArray(result) ? result[0] : null
    }

    if (!ordinal) {
      return NextResponse.json({ error: 'No ordinal found' }, { status: 404 })
    }

    // Check if already minted
    if (ordinal.is_minted) {
      return NextResponse.json({ error: 'Ordinal is already minted' }, { status: 400 })
    }

    // Fetch and compress the image
    console.log('📸 Fetching image:', ordinal.image_url)
    
    let imageBuffer: Buffer
    let compressedBase64: string
    let originalSize: number
    let compressedSize: number

    try {
      const imageResponse = await fetch(ordinal.image_url)
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`)
      }
      
      const arrayBuffer = await imageResponse.arrayBuffer()
      imageBuffer = Buffer.from(arrayBuffer)
      originalSize = imageBuffer.length

      // Compress to WebP 666x666
      const compressedBuffer = await sharp(imageBuffer)
        .resize(666, 666, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: 70,
          effort: 6,
        })
        .toBuffer()

      compressedSize = compressedBuffer.length
      compressedBase64 = compressedBuffer.toString('base64')

      console.log(`📦 Compression: ${originalSize} bytes → ${compressedSize} bytes (${((1 - compressedSize/originalSize) * 100).toFixed(1)}% reduction)`)
    } catch (error) {
      console.error('Error processing image:', error)
      return NextResponse.json({ error: 'Failed to process image' }, { status: 500 })
    }

    // Generate inscription keypair
    const privKey = generatePrivateKey()
    const keyPair = ECPair.fromPrivateKey(privKey)
    const pubKeyHex = keyPair.publicKey.toString('hex')

    // Prepare inscription data
    const inscriptionData = [{
      content: compressedBase64,
      mimeType: 'image/webp',
    }]

    // Create taproot address from pubkey hex
    const { inscriberAddress, tpubkey, tapleaf, script } = createInscriptionRevealAddressAndKeys(
      { hex: pubKeyHex },
      inscriptionData
    )
    
    // Get control block (cblock) - REQUIRED for reveal witness data
    const [, cblock] = Tap.getPubKey(pubKeyHex, { target: tapleaf })

    // Estimate costs with address-aware calculation
    const contentSize = Buffer.from(compressedBase64, 'base64').length
    const effectivePaymentAddress = payment_address || admin_wallet
    const costs = estimateInscriptionCost(
      contentSize, 
      1, 
      fee_rate,
      effectivePaymentAddress,
      receiving_address,
      1 // Default 1 input, will be recalculated when UTXOs are fetched
    )

    console.log(`💰 Fee calculation for ${effectivePaymentAddress.substring(0, 10)}...:`)
    console.log(`   Commit vSize: ${costs.commitVSize} vB`)
    console.log(`   Reveal vSize: ${costs.revealVSize} vB`)
    console.log(`   Fee rate: ${fee_rate} sat/vB`)
    console.log(`   Commit fee: ${costs.commitFee} sats`)
    console.log(`   Reveal fee: ${costs.revealFee} sats`)

    // Calculate reveal transaction details
    // For test mints, use minimal fixed buffer for accurate fee rates
    // The reveal vSize estimate is quite accurate, so we only need ~50 sats padding
    const revealTxFee = Math.ceil(costs.revealFee)
    // Use address-aware minimum output value (330 for Taproot, 546 for others)
    const outputValue = getMinimumOutputValue(receiving_address)
    
    // Minimal fixed buffer - just enough to cover any vSize variance
    // This keeps the actual fee rate very close to requested
    const safetyBuffer = 20 
    const revealSatsNeeded = revealTxFee + outputValue + safetyBuffer
    
    console.log(`   Reveal sats needed: ${revealTxFee} fee + ${outputValue} output + ${safetyBuffer} buffer = ${revealSatsNeeded} sats`)
    console.log(`   Expected reveal fee rate: ~${(revealTxFee / costs.revealVSize).toFixed(3)} sat/vB`)

    // Create test mint record in database
    const testMintResult = await sql`
      INSERT INTO mint_inscriptions (
        collection_id,
        ordinal_id,
        minter_wallet,
        payment_wallet,
        receiving_wallet,
        original_image_url,
        compressed_base64,
        content_size_bytes,
        content_type,
        taproot_address,
        fee_rate,
        commit_fee_sats,
        reveal_fee_sats,
        total_cost_sats,
        mint_status,
        is_test_mint,
        is_admin_mint,
        reveal_data
      )
      VALUES (
        ${ordinal.collection_id},
        ${ordinal.id},
        ${admin_wallet},
        ${payment_address || admin_wallet},
        ${receiving_address},
        ${ordinal.image_url},
        ${dry_run ? null : compressedBase64},
        ${compressedSize},
        'image/webp',
        ${inscriberAddress},
        ${fee_rate},
        ${Math.ceil(costs.commitFee)},
        ${Math.ceil(revealTxFee)},
        ${Math.ceil(costs.totalCost)},
        ${dry_run ? 'pending' : 'commit_created'},
        true,
        true,
        ${JSON.stringify({
          inscriptionScript: tapleaf,
          rawScript: script, // Store raw script array for reveal witness
          inscriptionPrivKey: Buffer.from(privKey).toString('hex'),
          inscriptionPubKey: pubKeyHex,
          taprootInfo: {
            tapkey: tpubkey,
            cblock: cblock, // Control block for reveal witness
            address: inscriberAddress,
          },
          outputs: [{ address: receiving_address, value: outputValue }],
          fees: {
            commitTxFee: Math.ceil(costs.commitFee),
            revealTxFee: Math.ceil(revealTxFee),
          },
          commitOutputValue: revealSatsNeeded,
          contentBase64: compressedBase64,
          contentType: 'image/webp',
        })}::jsonb
      )
      RETURNING id
    `
    const testMintRecord = (Array.isArray(testMintResult) ? testMintResult[0] : null) as Record<string, any> | null

    if (!testMintRecord) {
      return NextResponse.json({ error: 'Failed to create test mint record' }, { status: 500 })
    }

    // Log activity
    await sql`
      INSERT INTO mint_activity_log (
        mint_inscription_id,
        collection_id,
        actor_wallet,
        actor_type,
        action_type,
        action_data,
        success
      ) VALUES (
        ${testMintRecord.id},
        ${ordinal.collection_id},
        ${admin_wallet},
        'admin',
        'test_mint_created',
        ${JSON.stringify({
          ordinal_id: ordinal.id,
          ordinal_number: ordinal.ordinal_number,
          dry_run,
          fee_rate,
          costs,
        })}::jsonb,
        true
      )
    `

    // If not dry run, create commit PSBT for signing
    let commitPsbtBase64: string | null = null
    let commitPsbtHex: string | null = null
    
    if (!dry_run && payment_address) {
      try {
        console.log('📦 Creating commit PSBT for signing...')
        
        // Calculate total amount needed for commit
        const commitOutputValue = Math.ceil(revealSatsNeeded)
        const estimatedCommitSize = 250 // vB for typical commit
        const commitFee = Math.ceil(estimatedCommitSize * fee_rate)
        const totalNeeded = commitOutputValue + commitFee + 1000 // Extra buffer
        
        console.log(`   Commit output: ${commitOutputValue} sats`)
        console.log(`   Commit fee: ${commitFee} sats`)
        console.log(`   Total needed: ${totalNeeded} sats`)
        
        // Fetch UTXOs from payment address
        const paymentAddr = payment_address || admin_wallet
        const { utxos: rawUtxos, excludedCount } = await fetchUtxos(paymentAddr, [])
        const mempoolUtxos = convertSandshrewToMempoolFormat(rawUtxos)
        const sortedUtxos = filterAndSortUtxos(mempoolUtxos)
        validateSufficientFunds(sortedUtxos, totalNeeded, excludedCount)
        
        console.log(`   Found ${sortedUtxos.length} UTXOs`)
        
        // Select UTXOs for commit
        const selectedUtxos: any[] = []
        let selectedTotal = 0
        
        for (const utxo of sortedUtxos) {
          selectedUtxos.push(utxo)
          selectedTotal += utxo.value
          if (selectedTotal >= totalNeeded) break
        }
        
        console.log(`   Selected ${selectedUtxos.length} UTXOs totaling ${selectedTotal} sats`)
        
        // Create PSBT
        const network = getBitcoinNetwork()
        const psbt = new bitcoin.Psbt({ network })
        const addrType = getAddressType(paymentAddr)
        
        console.log(`   Payment address type: ${addrType}`)
        
        // Add inputs with proper signing info for address type
        for (let i = 0; i < selectedUtxos.length; i++) {
          const utxo = selectedUtxos[i]
          const inputData: any = {
            hash: utxo.txid,
            index: utxo.vout,
          }
          
          if (addrType === 'p2tr') {
            // P2TR (Taproot) - needs witnessUtxo and tapInternalKey
            inputData.witnessUtxo = {
              script: bitcoin.address.toOutputScript(paymentAddr, network),
              value: utxo.value,
            }
            if (payment_pubkey) {
              let keyBuffer = Buffer.from(payment_pubkey, 'hex')
              if (keyBuffer.length === 33) {
                keyBuffer = keyBuffer.subarray(1) // Remove prefix for 32-byte internal key
              }
              inputData.tapInternalKey = keyBuffer
            }
          } else if (addrType === 'p2sh') {
            // P2SH-P2WPKH (SegWit wrapped in P2SH) - needs witnessUtxo AND redeemScript
            console.log(`   Adding P2SH input with redeemScript...`)
            if (!payment_pubkey) {
              throw new Error('payment_pubkey required for P2SH addresses')
            }
            const pubkeyBuffer = Buffer.from(payment_pubkey, 'hex')
            
            // Create P2SH-P2WPKH payment structure
            const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: pubkeyBuffer, network })
            const p2sh = bitcoin.payments.p2sh({ redeem: p2wpkh, network })
            
            inputData.witnessUtxo = {
              script: p2sh.output!,
              value: utxo.value,
            }
            inputData.redeemScript = p2wpkh.output! // The P2WPKH script that P2SH wraps
            
            console.log(`   ✅ P2SH redeemScript: ${p2wpkh.output!.toString('hex')}`)
          } else if (addrType === 'p2wpkh') {
            // Native SegWit P2WPKH - just needs witnessUtxo
            inputData.witnessUtxo = {
              script: bitcoin.address.toOutputScript(paymentAddr, network),
              value: utxo.value,
            }
          } else {
            // Legacy P2PKH - needs nonWitnessUtxo (full previous tx)
            // For now, try witnessUtxo approach
            inputData.witnessUtxo = {
              script: bitcoin.address.toOutputScript(paymentAddr, network),
              value: utxo.value,
            }
          }
          
          psbt.addInput(inputData)
        }
        
        // Add outputs
        // 1. Inscription taproot address (commit output)
        psbt.addOutput({
          address: inscriberAddress,
          value: commitOutputValue,
        })
        
        // 2. Change output (if any)
        // Recalculate commit fee with actual input count and address type
        const { calculateCommitVSize } = await import('@/lib/inscription-utils')
        const actualCommitVSize = calculateCommitVSize(paymentAddr, selectedUtxos.length)
        const actualCommitFee = Math.ceil(actualCommitVSize * fee_rate)
        console.log(`   Actual commit vSize: ${actualCommitVSize} vB (${selectedUtxos.length} inputs)`)
        console.log(`   Actual commit fee: ${actualCommitFee} sats at ${fee_rate} sat/vB`)
        
        const change = selectedTotal - commitOutputValue - actualCommitFee
        
        if (change > 546) { // Dust threshold
          psbt.addOutput({
            address: paymentAddr,
            value: change,
          })
          console.log(`   Change output: ${change} sats`)
        }
        
        // Convert to base64 for wallet signing
        commitPsbtBase64 = psbt.toBase64()
        commitPsbtHex = psbt.toHex()
        
        console.log('✅ Commit PSBT created successfully')
        
        // Update database with PSBT
        await sql`
          UPDATE mint_inscriptions 
          SET commit_psbt = ${commitPsbtBase64},
              commit_output_value = ${commitOutputValue},
              commit_output_index = 0
          WHERE id = ${testMintRecord.id}
        `
        
      } catch (psbtError) {
        console.error('Error creating commit PSBT:', psbtError)
        // Don't fail the whole request, just note that PSBT creation failed
      }
    }

    return NextResponse.json({
      success: true,
      test_mint_id: testMintRecord.id,
      dry_run,
      ordinal: {
        id: ordinal.id,
        ordinal_number: ordinal.ordinal_number,
        collection_id: ordinal.collection_id,
        original_image_url: ordinal.image_url,
      },
      compression: {
        original_size: originalSize,
        compressed_size: compressedSize,
        reduction_percent: ((1 - compressedSize / originalSize) * 100).toFixed(1),
      },
      inscription: {
        taproot_address: inscriberAddress,
        content_type: 'image/webp',
        content_size: compressedSize,
      },
      costs: {
        commit_fee: Math.ceil(costs.commitFee),
        reveal_fee: Math.ceil(revealTxFee),
        output_value: 330,
        safety_buffer: Math.ceil(safetyBuffer),
        reveal_sats_needed: Math.ceil(revealSatsNeeded),
        total_cost: Math.ceil(costs.totalCost),
        fee_rate: fee_rate,
      },
      addresses: {
        receiving: receiving_address,
        payment: payment_address || admin_wallet,
        inscription_taproot: inscriberAddress,
      },
      // Include PSBT if created (for non-dry-run)
      ...(commitPsbtBase64 && {
        commit_psbt: {
          base64: commitPsbtBase64,
          hex: commitPsbtHex,
        },
      }),
      message: dry_run
        ? 'Test mint created (dry run - no transaction broadcast)'
        : commitPsbtBase64 
          ? 'Test mint created. Sign the commit PSBT with your wallet.'
          : 'Test mint created but PSBT creation failed. Check payment address.',
    })
  } catch (error) {
    console.error('Error creating test mint:', error)
    return NextResponse.json({ error: 'Failed to create test mint' }, { status: 500 })
  }
}

/**
 * GET /api/admin/mints/test-mint - Get test mint status/history
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')
    const testMintId = searchParams.get('test_mint_id')

    if (!adminWallet || !isAuthorized(adminWallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (testMintId) {
      // Get specific test mint
      const testMintResult = await sql`
        SELECT 
          mi.*,
          c.name as collection_name,
          go.ordinal_number,
          go.thumbnail_url
        FROM mint_inscriptions mi
        LEFT JOIN collections c ON mi.collection_id = c.id
        LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
        WHERE mi.id = ${testMintId} AND mi.is_test_mint = true
      `
      const testMint = Array.isArray(testMintResult) ? testMintResult[0] : null

      if (!testMint) {
        return NextResponse.json({ error: 'Test mint not found' }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        test_mint: testMint,
      })
    }

    // Pagination and sorting params
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const status = searchParams.get('status') // Filter by specific status
    const sortBy = searchParams.get('sort_by') || 'created_at' // created_at, status, fee_rate
    const sortOrder = searchParams.get('sort_order') || 'desc' // asc or desc
    
    const offset = (page - 1) * limit
    const validSortFields = ['created_at', 'mint_status', 'fee_rate', 'total_cost_sats', 'completed_at']
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at'
    const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC'

    // Get total count for pagination
    let totalCount: number
    if (status) {
      const countResult = await sql`
        SELECT COUNT(*) as count FROM mint_inscriptions 
        WHERE is_test_mint = true AND mint_status = ${status}
      `
      const countArr = Array.isArray(countResult) ? countResult : []
      totalCount = Number((countArr[0] as any)?.count || 0)
    } else {
      const countResult = await sql`
        SELECT COUNT(*) as count FROM mint_inscriptions WHERE is_test_mint = true
      `
      const countArr = Array.isArray(countResult) ? countResult : []
      totalCount = Number((countArr[0] as any)?.count || 0)
    }

    // Build query based on filters
    let testMints
    if (status) {
      // With status filter - need to use raw SQL for dynamic ORDER BY
      if (safeSortBy === 'created_at' && safeSortOrder === 'DESC') {
        testMints = await sql`
          SELECT 
            mi.id, mi.collection_id, mi.ordinal_id, mi.minter_wallet, mi.receiving_wallet,
            mi.mint_status, mi.commit_tx_id, mi.commit_broadcast_at, mi.commit_confirmed_at,
            mi.reveal_tx_id, mi.reveal_hex, mi.reveal_broadcast_at, mi.inscription_id,
            mi.inscription_address, mi.fee_rate, mi.total_cost_sats, mi.content_size_bytes,
            mi.error_message, mi.created_at, mi.completed_at,
            c.name as collection_name, go.ordinal_number, go.thumbnail_url
          FROM mint_inscriptions mi
          LEFT JOIN collections c ON mi.collection_id = c.id
          LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
          WHERE mi.is_test_mint = true AND mi.mint_status = ${status}
          ORDER BY mi.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `
      } else if (safeSortBy === 'mint_status' && safeSortOrder === 'ASC') {
        testMints = await sql`
          SELECT 
            mi.id, mi.collection_id, mi.ordinal_id, mi.minter_wallet, mi.receiving_wallet,
            mi.mint_status, mi.commit_tx_id, mi.commit_broadcast_at, mi.commit_confirmed_at,
            mi.reveal_tx_id, mi.reveal_hex, mi.reveal_broadcast_at, mi.inscription_id,
            mi.inscription_address, mi.fee_rate, mi.total_cost_sats, mi.content_size_bytes,
            mi.error_message, mi.created_at, mi.completed_at,
            c.name as collection_name, go.ordinal_number, go.thumbnail_url
          FROM mint_inscriptions mi
          LEFT JOIN collections c ON mi.collection_id = c.id
          LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
          WHERE mi.is_test_mint = true AND mi.mint_status = ${status}
          ORDER BY mi.mint_status ASC, mi.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `
      } else if (safeSortBy === 'mint_status' && safeSortOrder === 'DESC') {
        testMints = await sql`
          SELECT 
            mi.id, mi.collection_id, mi.ordinal_id, mi.minter_wallet, mi.receiving_wallet,
            mi.mint_status, mi.commit_tx_id, mi.commit_broadcast_at, mi.commit_confirmed_at,
            mi.reveal_tx_id, mi.reveal_hex, mi.reveal_broadcast_at, mi.inscription_id,
            mi.inscription_address, mi.fee_rate, mi.total_cost_sats, mi.content_size_bytes,
            mi.error_message, mi.created_at, mi.completed_at,
            c.name as collection_name, go.ordinal_number, go.thumbnail_url
          FROM mint_inscriptions mi
          LEFT JOIN collections c ON mi.collection_id = c.id
          LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
          WHERE mi.is_test_mint = true AND mi.mint_status = ${status}
          ORDER BY mi.mint_status DESC, mi.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `
      } else {
        testMints = await sql`
          SELECT 
            mi.id, mi.collection_id, mi.ordinal_id, mi.minter_wallet, mi.receiving_wallet,
            mi.mint_status, mi.commit_tx_id, mi.commit_broadcast_at, mi.commit_confirmed_at,
            mi.reveal_tx_id, mi.reveal_hex, mi.reveal_broadcast_at, mi.inscription_id,
            mi.inscription_address, mi.fee_rate, mi.total_cost_sats, mi.content_size_bytes,
            mi.error_message, mi.created_at, mi.completed_at,
            c.name as collection_name, go.ordinal_number, go.thumbnail_url
          FROM mint_inscriptions mi
          LEFT JOIN collections c ON mi.collection_id = c.id
          LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
          WHERE mi.is_test_mint = true AND mi.mint_status = ${status}
          ORDER BY mi.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `
      }
    } else {
      // No status filter
      if (safeSortBy === 'mint_status' && safeSortOrder === 'ASC') {
        testMints = await sql`
          SELECT 
            mi.id, mi.collection_id, mi.ordinal_id, mi.minter_wallet, mi.receiving_wallet,
            mi.mint_status, mi.commit_tx_id, mi.commit_broadcast_at, mi.commit_confirmed_at,
            mi.reveal_tx_id, mi.reveal_hex, mi.reveal_broadcast_at, mi.inscription_id,
            mi.inscription_address, mi.fee_rate, mi.total_cost_sats, mi.content_size_bytes,
            mi.error_message, mi.created_at, mi.completed_at,
            c.name as collection_name, go.ordinal_number, go.thumbnail_url
          FROM mint_inscriptions mi
          LEFT JOIN collections c ON mi.collection_id = c.id
          LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
          WHERE mi.is_test_mint = true
          ORDER BY mi.mint_status ASC, mi.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `
      } else if (safeSortBy === 'mint_status' && safeSortOrder === 'DESC') {
        testMints = await sql`
          SELECT 
            mi.id, mi.collection_id, mi.ordinal_id, mi.minter_wallet, mi.receiving_wallet,
            mi.mint_status, mi.commit_tx_id, mi.commit_broadcast_at, mi.commit_confirmed_at,
            mi.reveal_tx_id, mi.reveal_hex, mi.reveal_broadcast_at, mi.inscription_id,
            mi.inscription_address, mi.fee_rate, mi.total_cost_sats, mi.content_size_bytes,
            mi.error_message, mi.created_at, mi.completed_at,
            c.name as collection_name, go.ordinal_number, go.thumbnail_url
          FROM mint_inscriptions mi
          LEFT JOIN collections c ON mi.collection_id = c.id
          LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
          WHERE mi.is_test_mint = true
          ORDER BY mi.mint_status DESC, mi.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `
      } else if (safeSortBy === 'created_at' && safeSortOrder === 'ASC') {
        testMints = await sql`
          SELECT 
            mi.id, mi.collection_id, mi.ordinal_id, mi.minter_wallet, mi.receiving_wallet,
            mi.mint_status, mi.commit_tx_id, mi.commit_broadcast_at, mi.commit_confirmed_at,
            mi.reveal_tx_id, mi.reveal_hex, mi.reveal_broadcast_at, mi.inscription_id,
            mi.inscription_address, mi.fee_rate, mi.total_cost_sats, mi.content_size_bytes,
            mi.error_message, mi.created_at, mi.completed_at,
            c.name as collection_name, go.ordinal_number, go.thumbnail_url
          FROM mint_inscriptions mi
          LEFT JOIN collections c ON mi.collection_id = c.id
          LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
          WHERE mi.is_test_mint = true
          ORDER BY mi.created_at ASC
          LIMIT ${limit} OFFSET ${offset}
        `
      } else {
        // Default: created_at DESC
        testMints = await sql`
          SELECT 
            mi.id, mi.collection_id, mi.ordinal_id, mi.minter_wallet, mi.receiving_wallet,
            mi.mint_status, mi.commit_tx_id, mi.commit_broadcast_at, mi.commit_confirmed_at,
            mi.reveal_tx_id, mi.reveal_hex, mi.reveal_broadcast_at, mi.inscription_id,
            mi.inscription_address, mi.fee_rate, mi.total_cost_sats, mi.content_size_bytes,
            mi.error_message, mi.created_at, mi.completed_at,
            c.name as collection_name, go.ordinal_number, go.thumbnail_url
          FROM mint_inscriptions mi
          LEFT JOIN collections c ON mi.collection_id = c.id
          LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
          WHERE mi.is_test_mint = true
          ORDER BY mi.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `
      }
    }

    const totalPages = Math.ceil(totalCount / limit)

    return NextResponse.json({
      success: true,
      test_mints: testMints,
      pagination: {
        page,
        limit,
        total_count: totalCount,
        total_pages: totalPages,
        has_more: page < totalPages,
      },
      filters: {
        status: status || null,
        sort_by: safeSortBy,
        sort_order: safeSortOrder.toLowerCase(),
      },
    })
  } catch (error) {
    console.error('Error fetching test mints:', error)
    return NextResponse.json({ error: 'Failed to fetch test mints' }, { status: 500 })
  }
}

