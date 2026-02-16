import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { createRevealTransaction } from '@/lib/inscription-utils'
import { broadcastTransaction } from '@/lib/wallet/psbt-utils'

/**
 * POST /api/admin/mints/test-mint/reveal - Create and broadcast reveal transaction
 * Uses the working createRevealTransaction function from inscription-utils
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const {
      admin_wallet,
      test_mint_id,
      auto_broadcast = true,
    } = body

    if (!admin_wallet) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const authResult = await checkAuthorizationServer(admin_wallet, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    if (!test_mint_id) {
      return NextResponse.json({ error: 'test_mint_id is required' }, { status: 400 })
    }

    // Get the test mint record
    const mintResult = await sql`
      SELECT * FROM mint_inscriptions 
      WHERE id = ${test_mint_id} AND is_test_mint = true
    `
    const mint = Array.isArray(mintResult) ? mintResult[0] : null

    if (!mint) {
      return NextResponse.json({ error: 'Test mint not found' }, { status: 404 })
    }

    if (!mint.commit_tx_id) {
      return NextResponse.json({ error: 'Commit transaction not yet broadcast' }, { status: 400 })
    }

    if (mint.reveal_tx_id) {
      return NextResponse.json({ 
        error: 'Reveal already broadcast',
        reveal_tx_id: mint.reveal_tx_id,
      }, { status: 400 })
    }

    // Parse reveal data
    const revealData = mint.reveal_data
    if (!revealData || !revealData.inscriptionPrivKey || !revealData.inscriptionPubKey) {
      return NextResponse.json({ error: 'Missing reveal data' }, { status: 400 })
    }

    console.log('🔧 Creating reveal transaction using createRevealTransaction...')

    // Get values from stored data
    const commitOutputValue = Number(mint.commit_output_value || revealData.commitOutputValue)
    const commitOutputIndex = Number(mint.commit_output_index || 0)
    const feeRate = mint.fee_rate || 1
    const pubKeyHex = revealData.inscriptionPubKey
    const contentBase64 = revealData.contentBase64 || mint.compressed_base64
    const contentType = revealData.contentType || 'image/webp'

    if (!commitOutputValue) {
      return NextResponse.json({ error: 'Missing commit output value' }, { status: 400 })
    }

    if (!contentBase64) {
      return NextResponse.json({ error: 'Missing inscription content' }, { status: 400 })
    }

    // Convert private key hex to Uint8Array
    const privKeyHex = revealData.inscriptionPrivKey
    const privKeyBuffer = Buffer.from(privKeyHex, 'hex')
    const inscriptionPrivKey = new Uint8Array(privKeyBuffer)

    // Create inscriptions array
    const inscriptions = [{
      content: contentBase64,
      mimeType: contentType,
    }]

    console.log(`   commit_tx_id: ${mint.commit_tx_id}`)
    console.log(`   commitOutputIndex: ${commitOutputIndex}`)
    console.log(`   commitOutputValue: ${commitOutputValue}`)
    console.log(`   pubKeyHex: ${pubKeyHex.substring(0, 20)}...`)
    console.log(`   content size: ${contentBase64.length} chars`)
    console.log(`   feeRate: ${feeRate}`)

    // Use the working createRevealTransaction function
    const { txHex, inscriptionIds } = createRevealTransaction(
      mint.commit_tx_id,
      commitOutputIndex,
      commitOutputValue,
      inscriptionPrivKey,
      pubKeyHex,
      inscriptions,
      mint.receiving_wallet,
      feeRate
    )

    const inscriptionId = inscriptionIds[0]
    console.log(`📝 Reveal transaction created`)
    console.log(`   Inscription ID: ${inscriptionId}`)

    // Broadcast if auto_broadcast is true
    let broadcastResult = null
    if (auto_broadcast) {
      try {
        console.log('📤 Broadcasting reveal transaction...')
        const broadcastTxId = await broadcastTransaction(txHex, 'mainnet')
        console.log(`✅ Reveal broadcast successful: ${broadcastTxId}`)
        broadcastResult = broadcastTxId

        // Update database
        await sql`
          UPDATE mint_inscriptions 
          SET 
            reveal_tx_id = ${broadcastTxId},
            reveal_hex = ${txHex},
            reveal_broadcast_at = NOW(),
            inscription_id = ${inscriptionId},
            mint_status = 'reveal_broadcast'
          WHERE id = ${test_mint_id}
        `

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
            ${test_mint_id},
            ${mint.collection_id},
            ${admin_wallet},
            'admin',
            'reveal_broadcast',
            ${JSON.stringify({
              reveal_tx_id: broadcastTxId,
              inscription_id: inscriptionId,
            })}::jsonb,
            true
          )
        `

      } catch (broadcastError: any) {
        console.error('❌ Reveal broadcast error:', broadcastError)
        
        // Save the reveal hex even if broadcast failed
        await sql`
          UPDATE mint_inscriptions 
          SET 
            reveal_hex = ${txHex},
            mint_status = 'reveal_created',
            error_message = ${broadcastError.message}
          WHERE id = ${test_mint_id}
        `

        return NextResponse.json({
          success: false,
          error: 'Failed to broadcast reveal transaction',
          details: broadcastError.message,
          reveal_tx_hex: txHex,
          inscription_id: inscriptionId,
          message: 'Reveal transaction created but broadcast failed. You can manually broadcast the hex.',
        }, { status: 500 })
      }
    } else {
      // Just save the reveal hex without broadcasting
      await sql`
        UPDATE mint_inscriptions 
        SET 
          reveal_hex = ${txHex},
          inscription_id = ${inscriptionId},
          mint_status = 'reveal_created'
        WHERE id = ${test_mint_id}
      `
    }

    return NextResponse.json({
      success: true,
      reveal_tx_id: broadcastResult || null,
      reveal_tx_hex: txHex,
      inscription_id: inscriptionId,
      broadcast: !!broadcastResult,
      message: broadcastResult 
        ? 'Reveal transaction broadcast successfully! Wait for confirmation.'
        : 'Reveal transaction created. Broadcast the hex to complete the inscription.',
      mempool_link: broadcastResult ? `https://mempool.space/tx/${broadcastResult}` : null,
      ordinals_link: broadcastResult ? `https://ordinals.com/inscription/${inscriptionId}` : null,
    })

  } catch (error: any) {
    console.error('Error creating reveal:', error)
    return NextResponse.json({ 
      error: 'Failed to create reveal transaction',
      details: error.message,
    }, { status: 500 })
  }
}

/**
 * GET /api/admin/mints/test-mint/reveal - Check reveal status
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')
    const testMintId = searchParams.get('test_mint_id')

    if (!adminWallet) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const getAuthResult = await checkAuthorizationServer(adminWallet, sql)
    if (!getAuthResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    if (!testMintId) {
      return NextResponse.json({ error: 'test_mint_id is required' }, { status: 400 })
    }

    // Get the test mint record
    const mintResult = await sql`
      SELECT 
        id,
        reveal_tx_id,
        reveal_broadcast_at,
        reveal_confirmed_at,
        reveal_confirmations,
        inscription_id,
        mint_status
      FROM mint_inscriptions 
      WHERE id = ${testMintId} AND is_test_mint = true
    `
    const mint = Array.isArray(mintResult) ? mintResult[0] : null

    if (!mint) {
      return NextResponse.json({ error: 'Test mint not found' }, { status: 404 })
    }

    // If we have a reveal tx, check its confirmation status
    if (mint.reveal_tx_id) {
      try {
        const mempoolResponse = await fetch(`https://mempool.space/api/tx/${mint.reveal_tx_id}`)
        
        if (mempoolResponse.ok) {
          const txData = await mempoolResponse.json()
          const confirmed = txData.status?.confirmed || false
          const blockHeight = txData.status?.block_height
          
          // Get current block height for confirmation count
          let confirmations = 0
          if (confirmed && blockHeight) {
            const tipResponse = await fetch('https://mempool.space/api/blocks/tip/height')
            if (tipResponse.ok) {
              const currentHeight = parseInt(await tipResponse.text())
              confirmations = currentHeight - blockHeight + 1
            }
          }

          // Update database if confirmed
          if (confirmed && !mint.reveal_confirmed_at) {
            await sql`
              UPDATE mint_inscriptions 
              SET 
                reveal_confirmed_at = NOW(),
                reveal_confirmations = ${confirmations},
                mint_status = 'completed',
                completed_at = NOW()
              WHERE id = ${testMintId}
            `
          } else if (confirmations !== mint.reveal_confirmations) {
            await sql`
              UPDATE mint_inscriptions 
              SET reveal_confirmations = ${confirmations}
              WHERE id = ${testMintId}
            `
          }

          return NextResponse.json({
            success: true,
            reveal_tx_id: mint.reveal_tx_id,
            inscription_id: mint.inscription_id,
            confirmed,
            confirmations,
            block_height: blockHeight,
            mint_status: confirmed ? 'completed' : 'reveal_broadcast',
            mempool_link: `https://mempool.space/tx/${mint.reveal_tx_id}`,
            ordinals_link: mint.inscription_id ? `https://ordinals.com/inscription/${mint.inscription_id}` : null,
          })
        }
      } catch (mempoolError) {
        console.error('Error checking mempool:', mempoolError)
      }
    }

    return NextResponse.json({
      success: true,
      reveal_tx_id: mint.reveal_tx_id,
      inscription_id: mint.inscription_id,
      confirmed: !!mint.reveal_confirmed_at,
      confirmations: mint.reveal_confirmations || 0,
      mint_status: mint.mint_status,
    })

  } catch (error) {
    console.error('Error checking reveal status:', error)
    return NextResponse.json({ error: 'Failed to check reveal status' }, { status: 500 })
  }
}
