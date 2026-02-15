import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { PLATFORM_FEES } from '@/lib/solana/platform-wallet'

/**
 * GET /api/launchpad/[collectionId]/agent/skill
 * Returns a dynamic skill.md (text/markdown) with live collection data
 * and step-by-step instructions for an AI agent to mint an NFT.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return new Response('Database not available', { status: 500 })
  }

  try {
    const { collectionId } = await params

    // Get collection data
    const collections = await sql`
      SELECT
        c.id, c.name, c.description, c.mint_type, c.collection_status,
        c.candy_machine_address, c.launched_at,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
        (SELECT COUNT(*) FROM solana_nft_mints WHERE collection_id = c.id AND mint_status = 'confirmed') as minted_count
      FROM collections c
      WHERE c.id = ${collectionId}::uuid
    ` as any[]

    if (!collections.length) {
      return new Response('Collection not found', { status: 404 })
    }

    const collection = collections[0]

    if (collection.mint_type !== 'agent_only' && collection.mint_type !== 'agent_and_human') {
      return new Response('This collection does not support agent minting', { status: 400 })
    }

    const totalSupply = parseInt(collection.total_supply || '0', 10)
    const mintedCount = parseInt(collection.minted_count || '0', 10)
    const remaining = totalSupply - mintedCount
    const isLive = collection.collection_status === 'launchpad_live'
    const baseUrl = request.nextUrl.origin

    // Load network settings from site_settings
    const networkSettings = await sql`
      SELECT setting_key, setting_value FROM site_settings
      WHERE setting_key IN ('solana_network', 'solana_rpc_devnet', 'solana_rpc_mainnet')
    ` as any[]

    const settingsMap: Record<string, string> = {}
    for (const s of networkSettings) {
      const val = typeof s.setting_value === 'string' ? JSON.parse(s.setting_value) : s.setting_value
      settingsMap[s.setting_key] = val
    }

    const solanaNetwork = settingsMap['solana_network'] || 'devnet'
    const rpcUrl = solanaNetwork === 'mainnet-beta'
      ? (settingsMap['solana_rpc_mainnet'] || 'https://api.mainnet-beta.solana.com')
      : (settingsMap['solana_rpc_devnet'] || 'https://api.devnet.solana.com')
    const explorerBase = solanaNetwork === 'mainnet-beta'
      ? 'https://explorer.solana.com'
      : 'https://explorer.solana.com'
    const explorerSuffix = solanaNetwork === 'mainnet-beta' ? '' : '?cluster=devnet'

    // Get active phase info (mint price lives on phases, not collections)
    const phases = await sql`
      SELECT id, name, mint_price_sol, start_time, end_time, phase_allocation, phase_minted
      FROM mint_phases
      WHERE collection_id = ${collectionId}::uuid
        AND start_time <= NOW()
        AND (end_time IS NULL OR end_time > NOW())
      ORDER BY start_time
      LIMIT 1
    ` as any[]

    const activePhase = phases.length ? phases[0] : null
    const mintPrice = activePhase?.mint_price_sol ? parseFloat(String(activePhase.mint_price_sol)) : 0
    const platformFee = PLATFORM_FEES.MINT_FEE_SOL
    const totalCost = mintPrice + platformFee
    const phaseSection = activePhase
      ? `
## Active Phase
- **Name**: ${activePhase.name}
- **Phase ID**: ${activePhase.id}
- **Phase Price**: ${mintPrice} SOL
- **Ends**: ${activePhase.end_time ? new Date(activePhase.end_time).toISOString() : 'No end time'}
`
      : ''

    const markdown = `---
skill: solmaker-agent-mint
version: 1.0.0
collection_id: ${collectionId}
collection_name: ${collection.name || 'Untitled'}
status: ${isLive ? 'live' : collection.collection_status}
supply: ${totalSupply}
minted: ${mintedCount}
remaining: ${remaining}
mint_price_sol: ${mintPrice}
platform_fee_sol: ${platformFee}
total_cost_sol: ${totalCost}
network: ${solanaNetwork}
rpc_url: ${rpcUrl}
---

# ${collection.name || 'Untitled Collection'} — Agent Mint Instructions

${collection.description || ''}

## Collection Status
- **Status**: ${isLive ? 'LIVE — Ready to mint' : `NOT LIVE (${collection.collection_status})`}
- **Supply**: ${mintedCount} / ${totalSupply} minted (${remaining} remaining)
- **Mint Price**: ${mintPrice} SOL + ${platformFee} SOL platform fee = **${totalCost} SOL total**
- **Network**: Solana \`${solanaNetwork}\`
- **RPC**: \`${rpcUrl}\`
${phaseSection}
## How to Mint

${!isLive ? '> This collection is not live yet. Minting instructions will work once the collection goes live.\n' : ''}
### Step 1: Get a Challenge

Request a time-limited challenge (expires in 60 seconds):

\`\`\`bash
curl "${baseUrl}/api/launchpad/${collectionId}/agent/challenge?wallet_address=YOUR_WALLET_ADDRESS"
\`\`\`

Response:
\`\`\`json
{
  "challenge": "hex_string",
  "timestamp": 1234567890,
  "expires_at": 1234567950
}
\`\`\`

### Step 2: Build Mint Transaction

Submit the challenge to get a partially-signed transaction:

\`\`\`bash
curl -X POST "${baseUrl}/api/launchpad/${collectionId}/mint/build" \\
  -H "Content-Type: application/json" \\
  -d '{
    "wallet_address": "YOUR_WALLET_ADDRESS",
    "agent_challenge": "CHALLENGE_FROM_STEP_1",
    "agent_timestamp": TIMESTAMP_FROM_STEP_1${activePhase ? `,\n    "phase_id": "${activePhase.id}"` : ''}
  }'
\`\`\`

Response includes a base64-encoded transaction:
\`\`\`json
{
  "success": true,
  "transaction": "base64_encoded_transaction",
  "nftMint": "new_nft_mint_address",
  "totalCost": ${totalCost}
}
\`\`\`

### Step 3: Sign and Send

1. Deserialize the base64 transaction
2. Sign it with your wallet keypair
3. Send the raw transaction to Solana RPC

\`\`\`typescript
import { VersionedTransaction, Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const tx = VersionedTransaction.deserialize(Buffer.from(transaction, 'base64'));
const keypair = Keypair.fromSecretKey(bs58.decode('YOUR_PRIVATE_KEY'));
tx.sign([keypair]);

const connection = new Connection('${rpcUrl}');
const sig = await connection.sendRawTransaction(tx.serialize());
console.log('Mint tx:', sig);
// Explorer: ${explorerBase}/tx/' + sig + '${explorerSuffix}
\`\`\`

### Step 4: Confirm

Poll for transaction confirmation:

\`\`\`bash
curl "${baseUrl}/api/launchpad/${collectionId}/poll?wallet_address=YOUR_WALLET_ADDRESS"
\`\`\`

Or check the explorer directly:
\`${explorerBase}/tx/YOUR_TX_SIGNATURE${explorerSuffix}\`

## Notes
- **Network**: This collection is on Solana \`${solanaNetwork}\`${solanaNetwork === 'devnet' ? ' — you can get free SOL from [sol-faucet.com](https://sol-faucet.com)' : ''}
- Challenge expires in **60 seconds** — get a new one if it expires
- Each challenge is bound to your wallet address and this collection
- You must have at least **${totalCost} SOL** in your wallet to mint
- The transaction is partially signed by the server (NFT mint keypair + agent co-signer)
- You only need to add your wallet signature
- RPC endpoint: \`${rpcUrl}\`
`

    return new Response(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })

  } catch (error: any) {
    console.error('[Agent Skill] Error:', error)
    return new Response(`Error: ${error.message}`, { status: 500 })
  }
}
