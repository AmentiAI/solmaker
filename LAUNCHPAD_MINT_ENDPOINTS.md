# Launchpad Mint Broadcasting: Instruction Manual

## Quick Reference

**Broadcasting Service:** mempool.space API
- Mainnet: `https://mempool.space/api/tx`
- Testnet: `https://mempool.space/testnet/api/tx`

**Both commit and reveal transactions use the same `broadcastTransaction()` function which sends to mempool.space API.**

**Note:** This implementation uses mempool.space for ALL transactions, including sub-1 sat/vB transactions (e.g., 0.25 sat/vB). mempool.space supports sub-1 sat/vB transactions, so no fallback to Sandshrew is needed.

---

## Step 1: Create Commit Transaction

### Endpoint
```
POST /api/mint/create-commit
```

### Request
```json
{
  "ordinal_ids": ["uuid-1", "uuid-2"],
  "minter_address": "bc1p...",
  "payment_address": "bc1p...",
  "payment_pubkey": "02...",
  "fee_rate": 0.25,
  "phase_id": "phase-uuid"
}
```

### Response
```json
{
  "session_id": "session-uuid",
  "commit_psbt": "base64-encoded-psbt",
  "inscription_ids": ["inscription-uuid-1", "inscription-uuid-2"]
}
```

### What to Do
1. Call endpoint with ordinal IDs and phase ID
2. Save `session_id` and `inscription_ids` for later steps
3. Get `commit_psbt` to sign with wallet

---

## Step 2: Sign Commit PSBT

### What to Do
1. Take `commit_psbt` from Step 1
2. Sign it with user's wallet
3. Get back signed PSBT (base64, hex, or tx_hex)

**Example:**
```typescript
const signedPsbt = await wallet.signPsbt(commit_psbt, true, false)
// Returns: signed_psbt_base64, signed_psbt_hex, or tx_hex
```

---

## Step 3: Broadcast Commit Transaction

### Endpoint
```
POST /api/mint/broadcast-commit
```

### Request
```json
{
  "session_id": "session-uuid",
  "signed_psbt_base64": "base64-string",
  "signed_psbt_hex": "hex-string",
  "tx_hex": "hex-string"
}
```

**Note:** Provide at least one of: `signed_psbt_base64`, `signed_psbt_hex`, or `tx_hex`

### Response
```json
{
  "success": true,
  "commit_tx_id": "transaction-id",
  "mempool_url": "https://mempool.space/tx/transaction-id"
}
```

### Implementation Steps

1. **Extract Transaction from PSBT** (if needed)
   - If wallet returned `tx_hex`, use it directly
   - If wallet returned PSBT, extract transaction:
     ```typescript
     const psbt = bitcoin.Psbt.fromBase64(signed_psbt_base64)
     const tx = psbt.extractTransaction()
     const txHex = tx.toHex()
     ```

2. **Broadcast to mempool.space**
   ```typescript
   const response = await fetch('https://mempool.space/api/tx', {
     method: 'POST',
     body: txHex,
     headers: {
       'Content-Type': 'text/plain',
     },
   })
   
   if (!response.ok) {
     const errorText = await response.text()
     throw new Error(`Broadcast failed: ${errorText}`)
   }
   
   const txId = await response.text() // Returns transaction ID
   ```

3. **Update Database**
   - Update `mint_sessions`: set `commit_tx_id`, `status = 'commit_broadcasted'`
   - Update `mint_inscriptions`: set `commit_tx_id`, `mint_status = 'commit_broadcast'`
   - Update `generated_ordinals`: set `is_minted = true`
   - Update `mint_phases`: increment `phase_minted` count

### Complete Code Example
```typescript
async function broadcastCommit(
  sessionId: string,
  signedPsbtBase64: string
): Promise<string> {
  // Extract transaction from PSBT
  const psbt = bitcoin.Psbt.fromBase64(signedPsbtBase64)
  const tx = psbt.extractTransaction()
  const txHex = tx.toHex()
  
  // Broadcast to mempool.space
  const response = await fetch('https://mempool.space/api/tx', {
    method: 'POST',
    body: txHex,
    headers: { 'Content-Type': 'text/plain' },
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Broadcast failed: ${error}`)
  }
  
  const commitTxId = await response.text()
  
  // Update database
  await updateMintSession(sessionId, {
    commit_tx_id: commitTxId,
    status: 'commit_broadcasted',
  })
  
  await updateMintInscriptions(sessionId, {
    commit_tx_id: commitTxId,
    mint_status: 'commit_broadcast',
  })
  
  return commitTxId
}
```

---

## Step 4: Wait for Commit Propagation

### What to Do
Wait 2-3 seconds after broadcasting commit before creating reveals.

```typescript
await new Promise(resolve => setTimeout(resolve, 2000))
```

**Why:** Transaction needs time to propagate through the network before reveal can reference it.

---

## Step 5: Create and Broadcast Reveal Transaction

### Endpoint
```
POST /api/mint/reveal
```

### Request
```json
{
  "mint_inscription_id": "inscription-uuid",
  "commit_tx_id": "commit-transaction-id"
}
```

### Response
```json
{
  "success": true,
  "reveal_tx_id": "reveal-transaction-id",
  "inscription_id": "txidi0",
  "mempool_url": "https://mempool.space/tx/reveal-transaction-id"
}
```

### Implementation Steps

1. **Fetch Reveal Data from Database**
   ```typescript
   const inscription = await getMintInscription(mintInscriptionId)
   // Contains: reveal_data (private key, script, content, etc.)
   // Contains: commit_output_index, commit_output_value
   // Contains: receiving_wallet, fee_rate
   ```

2. **Create Reveal Transaction**
   ```typescript
   const revealTx = createRevealTransaction(
     commitTxId,                    // From Step 3
     inscription.commit_output_index, // Usually 0
     inscription.commit_output_value, // Value in sats
     inscription.reveal_data.inscriptionPrivKey,
     inscription.reveal_data.inscriptionPubKey,
     [{
       content: inscription.reveal_data.contentBase64,
       mimeType: inscription.reveal_data.contentType
     }],
     inscription.receiving_wallet,
     inscription.fee_rate
   )
   // Returns: { txHex, inscriptionIds }
   ```

3. **Broadcast to mempool.space**
   ```typescript
   const response = await fetch('https://mempool.space/api/tx', {
     method: 'POST',
     body: revealTx.txHex,
     headers: {
       'Content-Type': 'text/plain',
     },
   })
   
   if (!response.ok) {
     const errorText = await response.text()
     throw new Error(`Broadcast failed: ${errorText}`)
   }
   
   const revealTxId = await response.text()
   ```

4. **Update Database**
   ```typescript
   await updateMintInscription(mintInscriptionId, {
     reveal_tx_id: revealTxId,
     inscription_id: `${revealTxId}i0`,
     mint_status: 'completed',
     reveal_broadcast_at: new Date(),
   })
   ```

### Complete Code Example
```typescript
async function broadcastReveal(
  mintInscriptionId: string,
  commitTxId: string
): Promise<{ revealTxId: string, inscriptionId: string }> {
  // 1. Fetch reveal data
  const inscription = await getMintInscription(mintInscriptionId)
  
  if (!inscription.reveal_data) {
    throw new Error('No reveal data found')
  }
  
  // 2. Create reveal transaction
  const { txHex, inscriptionIds } = createRevealTransaction(
    commitTxId,
    inscription.commit_output_index || 0,
    inscription.commit_output_value,
    inscription.reveal_data.inscriptionPrivKey,
    inscription.reveal_data.inscriptionPubKey,
    [{
      content: inscription.reveal_data.contentBase64,
      mimeType: inscription.reveal_data.contentType || 'image/webp'
    }],
    inscription.receiving_wallet,
    inscription.fee_rate || 1
  )
  
  // 3. Broadcast
  const response = await fetch('https://mempool.space/api/tx', {
    method: 'POST',
    body: txHex,
    headers: { 'Content-Type': 'text/plain' },
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Broadcast failed: ${error}`)
  }
  
  const revealTxId = await response.text()
  const inscriptionId = inscriptionIds[0] || `${revealTxId}i0`
  
  // 4. Update database
  await updateMintInscription(mintInscriptionId, {
    reveal_tx_id: revealTxId,
    inscription_id: inscriptionId,
    mint_status: 'completed',
  })
  
  return { revealTxId, inscriptionId }
}
```

---

## Complete Flow Implementation

```typescript
async function mintLaunchpadOrdinals(
  ordinalIds: string[],
  phaseId: string,
  minterAddress: string,
  paymentAddress: string,
  paymentPubkey: string,
  feeRate: number
) {
  // Step 1: Create commit
  const commitRes = await fetch('/api/mint/create-commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ordinal_ids: ordinalIds,
      minter_address: minterAddress,
      payment_address: paymentAddress,
      payment_pubkey: paymentPubkey,
      fee_rate: feeRate,
      phase_id: phaseId,
    }),
  })
  
  const { session_id, commit_psbt, inscription_ids } = await commitRes.json()
  
  // Step 2: Sign PSBT
  const signedPsbt = await wallet.signPsbt(commit_psbt, true, false)
  
  // Step 3: Broadcast commit
  const commitTxId = await broadcastCommit(session_id, signedPsbt)
  console.log('Commit broadcasted:', commitTxId)
  
  // Step 4: Wait for propagation
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Step 5: Broadcast reveals (one per ordinal)
  const results = []
  for (let i = 0; i < inscription_ids.length; i++) {
    const { revealTxId, inscriptionId } = await broadcastReveal(
      inscription_ids[i],
      commitTxId
    )
    
    results.push({ revealTxId, inscriptionId })
    console.log(`Revealed ${i + 1}/${inscription_ids.length}: ${inscriptionId}`)
    
    // Small delay between reveals
    if (i < inscription_ids.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  return {
    commitTxId,
    reveals: results,
  }
}
```

---

## Broadcasting Utility Function

Create a reusable broadcasting function:

```typescript
/**
 * Broadcasts a transaction to Bitcoin network via mempool.space
 * @param txHex - Transaction hex string
 * @param network - 'mainnet' or 'testnet'
 * @returns Transaction ID
 */
export async function broadcastTransaction(
  txHex: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<string> {
  const mempoolUrl = network === 'mainnet'
    ? 'https://mempool.space/api/tx'
    : 'https://mempool.space/testnet/api/tx'

  const response = await fetch(mempoolUrl, {
    method: 'POST',
    body: txHex,
    headers: {
      'Content-Type': 'text/plain',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to broadcast transaction: ${errorText}`)
  }

  const txId = await response.text()
  return txId.trim() // Remove any whitespace
}
```

**Usage:**
```typescript
// For commit
const commitTxId = await broadcastTransaction(commitTxHex, 'mainnet')

// For reveal
const revealTxId = await broadcastTransaction(revealTxHex, 'mainnet')
```

---

## Error Handling

### Commit Broadcast Errors

```typescript
try {
  const commitTxId = await broadcastCommit(sessionId, signedPsbt)
} catch (error) {
  // Handle errors:
  // - "Failed to broadcast transaction: <mempool error>"
  // - "Session not found"
  // - "PSBT extraction failed"
  
  // Update database with error status
  await updateMintSession(sessionId, {
    status: 'failed',
    error_message: error.message,
  })
}
```

### Reveal Broadcast Errors

```typescript
try {
  const { revealTxId } = await broadcastReveal(mintInscriptionId, commitTxId)
} catch (error) {
  // Handle errors:
  // - "No reveal data found"
  // - "Missing commit output value"
  // - "Failed to broadcast transaction"
  // - "Inscription already revealed"
  
  // Update database with error status
  await updateMintInscription(mintInscriptionId, {
    mint_status: 'failed',
    error_message: error.message,
  })
  
  // Can retry later - commit is already broadcast
}
```

---

## Retry Logic

If reveal broadcast fails, you can retry:

```typescript
async function retryReveal(
  mintInscriptionId: string,
  commitTxId: string,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { revealTxId } = await broadcastReveal(mintInscriptionId, commitTxId)
      return revealTxId
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
  
  throw new Error('Max retries exceeded')
}
```

---

## Key Points to Remember

1. **Always use mempool.space API** - Works for all fee rates including sub-1 sat/vB (e.g., 0.25 sat/vB)
2. **POST raw transaction hex** - Content-Type: text/plain, body is just the hex string
3. **Response is transaction ID** - Returns as plain text, not JSON
4. **Wait after commit** - 2-3 seconds before revealing
5. **One reveal per inscription** - Each ordinal needs its own reveal transaction
6. **Database updates are critical** - Update status after each broadcast
7. **Reveals can be retried** - Commit success means ordinals are minted, reveals can be retried if they fail

---

## Testing

### Test Broadcast Function
```typescript
// Test with a simple transaction
const testTxHex = "0100000001..." // Your test transaction hex

try {
  const txId = await broadcastTransaction(testTxHex, 'testnet')
  console.log('Broadcast successful:', txId)
} catch (error) {
  console.error('Broadcast failed:', error.message)
}
```

### Verify on mempool.space
After broadcasting, check:
- Mainnet: `https://mempool.space/tx/{txId}`
- Testnet: `https://mempool.space/testnet/tx/{txId}`
