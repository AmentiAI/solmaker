import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { broadcastTransaction } from '@/lib/wallet/psbt-utils'

// Initialize ECC library
bitcoin.initEccLib(ecc)

/**
 * POST /api/admin/mints/test-mint/commit - Handle signed commit PSBT
 * Finalizes and broadcasts the commit transaction
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
      signed_psbt_base64,
      signed_psbt_hex,
      tx_hex, // Some wallets return finalized tx hex directly
    } = body

    if (!admin_wallet || !isAdmin(admin_wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!test_mint_id) {
      return NextResponse.json({ error: 'test_mint_id is required' }, { status: 400 })
    }

    if (!signed_psbt_base64 && !signed_psbt_hex && !tx_hex) {
      return NextResponse.json({ error: 'signed_psbt_base64, signed_psbt_hex, or tx_hex is required' }, { status: 400 })
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

    if (mint.commit_tx_id) {
      return NextResponse.json({ 
        error: 'Commit already broadcast',
        commit_tx_id: mint.commit_tx_id,
      }, { status: 400 })
    }

    let txHex: string
    let txId: string

    try {
      const network = bitcoin.networks.bitcoin

      if (tx_hex) {
        // Wallet returned finalized transaction hex
        console.log('📥 Received finalized transaction hex')
        txHex = tx_hex
        const tx = bitcoin.Transaction.fromHex(txHex)
        txId = tx.getId()
      } else {
        // Parse and finalize PSBT
        let psbt: bitcoin.Psbt

        if (signed_psbt_base64) {
          console.log('📥 Received signed PSBT (base64)')
          psbt = bitcoin.Psbt.fromBase64(signed_psbt_base64, { network })
        } else {
          console.log('📥 Received signed PSBT (hex)')
          psbt = bitcoin.Psbt.fromHex(signed_psbt_hex!, { network })
        }

        // Try to finalize all inputs
        console.log('🔧 Finalizing PSBT inputs...')
        console.log(`   Input count: ${psbt.data.inputs.length}`)
        
        // Check each input's status
        for (let i = 0; i < psbt.data.inputs.length; i++) {
          const input = psbt.data.inputs[i]
          console.log(`   Input ${i}: partialSig=${!!input.partialSig?.length}, finalScriptWitness=${!!input.finalScriptWitness}, finalScriptSig=${!!input.finalScriptSig}`)
        }
        
        // Try different finalization approaches
        let finalized = false
        
        // Method 1: Try standard finalizeAllInputs
        try {
          psbt.finalizeAllInputs()
          finalized = true
          console.log('   ✅ Standard finalization succeeded')
        } catch (e1: any) {
          console.log(`   ⚠️ Standard finalization failed: ${e1.message}`)
          
          // Method 2: Try to finalize each input individually with custom finalizer for P2WPKH
          try {
            for (let i = 0; i < psbt.data.inputs.length; i++) {
              const input = psbt.data.inputs[i]
              
              // Check if already finalized
              if (input.finalScriptWitness || input.finalScriptSig) {
                console.log(`   Input ${i} already finalized`)
                continue
              }
              
              // For P2WPKH, we need partialSig
              if (input.partialSig && input.partialSig.length > 0) {
                psbt.finalizeInput(i, (inputIndex, psbtInput) => {
                  if (!psbtInput.partialSig || psbtInput.partialSig.length === 0) {
                    throw new Error(`Input ${inputIndex} has no partial signature`)
                  }
                  const signature = psbtInput.partialSig[0].signature
                  const pubkey = psbtInput.partialSig[0].pubkey
                  
                  return {
                    finalScriptSig: undefined,
                    finalScriptWitness: {
                      stack: [signature, pubkey]
                    }
                  }
                })
                console.log(`   ✅ Input ${i} finalized with custom P2WPKH finalizer`)
              }
            }
            finalized = true
          } catch (e2: any) {
            console.log(`   ⚠️ Individual finalization failed: ${e2.message}`)
          }
        }
        
        if (!finalized) {
          // Method 3: Check if already finalized by wallet
          let allFinalized = true
          for (const input of psbt.data.inputs) {
            if (!input.finalScriptWitness && !input.finalScriptSig) {
              allFinalized = false
              break
            }
          }
          if (allFinalized) {
            console.log('   ✅ All inputs were already finalized by wallet')
            finalized = true
          }
        }
        
        if (!finalized) {
          throw new Error('Could not finalize PSBT inputs. Make sure wallet properly signed the transaction.')
        }

        // Extract transaction
        const tx = psbt.extractTransaction()
        txHex = tx.toHex()
        txId = tx.getId()
        console.log(`   ✅ Transaction extracted: ${txId}`)
      }

      console.log(`📤 Broadcasting commit transaction: ${txId}`)

      // Broadcast transaction
      const broadcastTxId = await broadcastTransaction(txHex, 'mainnet')
      console.log(`✅ Commit broadcast successful: ${broadcastTxId}`)

      // Update database
      await sql`
        UPDATE mint_inscriptions 
        SET 
          commit_tx_id = ${broadcastTxId},
          commit_broadcast_at = NOW(),
          mint_status = 'commit_broadcast'
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
          'commit_broadcast',
          ${JSON.stringify({
            tx_id: broadcastTxId,
          })}::jsonb,
          true
        )
      `

      return NextResponse.json({
        success: true,
        commit_tx_id: broadcastTxId,
        message: 'Commit transaction broadcast successfully. Wait for confirmation then create reveal.',
        mempool_link: `https://mempool.space/tx/${broadcastTxId}`,
      })

    } catch (broadcastError: any) {
      console.error('❌ Broadcast error:', broadcastError)

      // Log the failure
      await sql`
        INSERT INTO mint_activity_log (
          mint_inscription_id,
          collection_id,
          actor_wallet,
          actor_type,
          action_type,
          action_data,
          success,
          error_message
        ) VALUES (
          ${test_mint_id},
          ${mint.collection_id},
          ${admin_wallet},
          'admin',
          'commit_broadcast_failed',
          ${JSON.stringify({
            error: broadcastError.message,
          })}::jsonb,
          false,
          ${broadcastError.message}
        )
      `

      return NextResponse.json({
        error: 'Failed to broadcast commit transaction',
        details: broadcastError.message,
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Error handling signed commit:', error)
    return NextResponse.json({ error: 'Failed to process signed commit' }, { status: 500 })
  }
}

/**
 * GET /api/admin/mints/test-mint/commit - Check commit status
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

    if (!testMintId) {
      return NextResponse.json({ error: 'test_mint_id is required' }, { status: 400 })
    }

    // Get the test mint record
    const mintResult = await sql`
      SELECT 
        id,
        commit_tx_id,
        commit_broadcast_at,
        commit_confirmed_at,
        commit_confirmations,
        mint_status
      FROM mint_inscriptions 
      WHERE id = ${testMintId} AND is_test_mint = true
    `
    const mint = Array.isArray(mintResult) ? mintResult[0] : null

    if (!mint) {
      return NextResponse.json({ error: 'Test mint not found' }, { status: 404 })
    }

    // If we have a commit tx, check its confirmation status
    if (mint.commit_tx_id) {
      try {
        const mempoolResponse = await fetch(`https://mempool.space/api/tx/${mint.commit_tx_id}`)
        
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
          if (confirmed && !mint.commit_confirmed_at) {
            await sql`
              UPDATE mint_inscriptions 
              SET 
                commit_confirmed_at = NOW(),
                commit_confirmations = ${confirmations},
                mint_status = 'commit_confirmed'
              WHERE id = ${testMintId}
            `
          } else if (confirmations !== mint.commit_confirmations) {
            await sql`
              UPDATE mint_inscriptions 
              SET commit_confirmations = ${confirmations}
              WHERE id = ${testMintId}
            `
          }

          return NextResponse.json({
            success: true,
            commit_tx_id: mint.commit_tx_id,
            confirmed,
            confirmations,
            block_height: blockHeight,
            mint_status: confirmed ? 'commit_confirmed' : 'commit_broadcast',
            ready_for_reveal: confirmed,
            mempool_link: `https://mempool.space/tx/${mint.commit_tx_id}`,
          })
        }
      } catch (mempoolError) {
        console.error('Error checking mempool:', mempoolError)
      }
    }

    return NextResponse.json({
      success: true,
      commit_tx_id: mint.commit_tx_id,
      confirmed: !!mint.commit_confirmed_at,
      confirmations: mint.commit_confirmations || 0,
      mint_status: mint.mint_status,
      ready_for_reveal: !!mint.commit_confirmed_at,
    })

  } catch (error) {
    console.error('Error checking commit status:', error)
    return NextResponse.json({ error: 'Failed to check commit status' }, { status: 500 })
  }
}

