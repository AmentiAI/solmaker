# Bitcoin Ordinal Minting System

## Overview

This system implements a complete Bitcoin inscription minting platform using the commit/reveal transaction pattern with Tapscript. Users can mint generated ordinals directly onto the Bitcoin blockchain as inscriptions.

## Architecture

### Core Technologies

- **LaserEyes** (@omnisat/lasereyes): Bitcoin wallet connection library supporting multiple wallets (UniSat, Xverse, OYL, Leather, Magic Eden, OKX, Phantom, etc.)
- **Tapscript** (@cmdcode/tapscript): Bitcoin taproot scripting and transaction creation
- **Crypto Utils** (@cmdcode/crypto-utils): Cryptographic operations for Bitcoin
- **bitcoinjs-lib**: Bitcoin transaction handling
- **Neon Database**: PostgreSQL database for tracking mint sessions and ordinals

### Key Components

```
lib/inscription-utils.ts          - Core inscription utilities
app/api/bitcoin/fee-rates/         - Fee rate fetching from mempool.space
app/api/mint/create-commit/        - Commit transaction creation
app/api/mint/reveal/               - Reveal transaction creation and broadcast
app/api/mint/available-ordinals/   - Fetch unminted ordinals
app/mint/[collectionId]/           - Mint UI page
```

## Minting Flow

### Phase 1: Wallet Connection

Users connect their Bitcoin wallet using LaserEyes:

```typescript
const { connect, connected, address } = useLaserEyes()
await connect() // Opens wallet selection modal
```

Supported wallets:
- UniSat
- Xverse
- OYL
- Leather
- Magic Eden Wallet
- OKX Wallet
- Phantom
- Wizz
- Orange
- OP_NET

### Phase 2: Ordinal Selection

Users select ordinals to mint from the available pool:
- Maximum 10 ordinals per batch
- Only unminted ordinals are shown
- Selection interface with image previews

### Phase 3: Fee Rate Selection

Fee rates are fetched from [mempool.space API](https://mempool.space/api/v1/fees/recommended):

```typescript
{
  fastest: number,  // Next block
  fast: number,     // ~30 minutes
  medium: number,   // ~1 hour
  slow: number,     // Economy rate
  minimum: number   // Minimum accepted
}
```

Users can also specify a custom fee rate in sat/vB.

### Phase 4: Commit Transaction

**API: POST /api/mint/create-commit**

1. **Generate Inscription Keypair**
   ```typescript
   const privKey = generatePrivateKey()
   const pubKey = cmdEcc.keys.get_pubkey(privKey, true)
   ```

2. **Create Inscription Script**
   ```typescript
   const script = createInscriptionScript(pubKey, inscriptions)
   // Script format: [pubkey, OP_CHECKSIG, OP_0, OP_IF, "ord", ...]
   ```

3. **Generate Taproot Address**
   ```typescript
   const tapleaf = Tap.encodeScript(script)
   const [tpubkey] = Tap.getPubKey(pubKey, { target: tapleaf })
   const inscriberAddress = bitcoin.address.fromOutputScript(...)
   ```

4. **Create Mint Session**
   ```sql
   INSERT INTO mint_sessions (
     collection_id, ordinal_ids, minter_address,
     quantity, fee_rate, total_cost,
     inscription_priv_key, inscription_pub_key,
     taproot_address, status
   ) VALUES (...)
   ```

5. **Return Taproot Address**
   - User sends Bitcoin to this address
   - Amount = commit fee + reveal fee + 330 sats per inscription

### Phase 5: User Signs Commit Transaction

User's wallet sends Bitcoin to the taproot address:

```typescript
const commitTxId = await sendBitcoin(taprootAddress, totalCostSats)
```

This transaction:
- Creates a taproot output containing the inscription commitment
- Is signed by the user's wallet
- Is broadcast to the Bitcoin network

### Phase 6: Reveal Transaction

**API: POST /api/mint/reveal**

1. **Fetch Mint Session**
   ```sql
   SELECT * FROM mint_sessions WHERE id = session_id
   ```

2. **Recreate Inscription Script**
   ```typescript
   const script = createInscriptionScript(pubKeyHex, inscriptions)
   const tapleaf = Tap.encodeScript(script)
   ```

3. **Create Reveal Transaction**
   ```typescript
   const txData = Tx.create({
     vin: [{
       txid: commitTxId,
       vout: commitOutputIndex,
       prevout: {
         value: commitOutputValue,
         scriptPubKey: ['OP_1', tapkey]
       }
     }],
     vout: inscriptions.map(() => ({
       value: 330, // Dust limit
       address: minterAddress
     }))
   })
   ```

4. **Sign with Inscription Private Key**
   ```typescript
   const secKey = cmdEcc.keys.get_seckey(inscriptionPrivKey)
   const sig = Signer.taproot.sign(secKey, txData, 0, { extension: tapleaf })
   txData.vin[0].witness = [sig, script, cblock]
   ```

5. **Broadcast Reveal Transaction**
   ```typescript
   const response = await fetch('https://mempool.space/api/tx', {
     method: 'POST',
     body: txHex
   })
   const revealTxId = await response.text()
   ```

6. **Generate Inscription IDs**
   ```typescript
   const inscriptionIds = outputs.map((_, i) => `${revealTxId}i${i}`)
   ```

### Phase 7: Database Updates

```sql
-- Update ordinals as minted
UPDATE generated_ordinals
SET 
  is_minted = TRUE,
  inscription_id = inscriptionId,
  minter_address = minterAddress,
  mint_tx_id = revealTxId,
  minted_at = CURRENT_TIMESTAMP,
  inscription_data = jsonb_build_object(
    'commit_tx_id', commitTxId,
    'reveal_tx_id', revealTxId,
    'inscription_id', inscriptionId,
    'taproot_address', taprootAddress
  )
WHERE id = ordinalId
```

## Database Schema

### mint_sessions Table

```sql
CREATE TABLE mint_sessions (
  id UUID PRIMARY KEY,
  collection_id UUID REFERENCES collections(id),
  ordinal_ids UUID[],
  minter_address VARCHAR(255),
  quantity INTEGER,
  fee_rate INTEGER,
  total_cost BIGINT,
  commit_tx_id VARCHAR(255),
  reveal_tx_id VARCHAR(255),
  inscription_priv_key TEXT, -- Encrypted server-side
  inscription_pub_key TEXT,
  taproot_address TEXT,
  status VARCHAR(50), -- pending, commit_signed, revealed, completed, failed
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

### generated_ordinals Table (Extended)

```sql
ALTER TABLE generated_ordinals
ADD COLUMN is_minted BOOLEAN DEFAULT FALSE,
ADD COLUMN inscription_id VARCHAR(255),
ADD COLUMN minter_address VARCHAR(255),
ADD COLUMN mint_tx_id VARCHAR(255),
ADD COLUMN minted_at TIMESTAMP,
ADD COLUMN inscription_data JSONB
```

## Security Considerations

### Private Key Management

- Inscription private keys are generated server-side
- Stored in database (should be encrypted in production)
- Never exposed to client
- Used only for signing reveal transactions
- Different key pair for each mint session

### Wallet Integration

- LaserEyes handles wallet connection securely
- Private keys never leave user's wallet
- Users sign commit transactions in their wallet
- Server only signs reveal transactions with ephemeral keys

### Transaction Safety

- Ordinals are marked as selected during minting
- Prevents double-minting
- Rollback on failure
- Session-based tracking

## Cost Calculation

```typescript
// Commit transaction fee
commitFee = commitTxSize * feeRate

// Reveal transaction fee
revealFee = revealTxSize * feeRate

// Output values (dust limit per inscription)
outputValues = quantity * 330

// Total cost
totalCost = commitFee + revealFee + outputValues
```

## Content Handling

### Image to Base64 Conversion

Currently using placeholder:
```typescript
content: Buffer.from(ordinal.image_url).toString('base64')
```

**TODO**: Implement actual image fetching and conversion:
```typescript
const imageResponse = await fetch(ordinal.image_url)
const imageBuffer = await imageResponse.arrayBuffer()
const base64Content = Buffer.from(imageBuffer).toString('base64')
```

### Content Chunking

Large content is split into 520-byte chunks:
```typescript
for (let i = 0; i < contentBuffer.length; i += 520) {
  contentChunks.push(contentBuffer.slice(i, i + 520))
}
```

### MIME Type Support

- `image/png` - PNG images
- `image/jpeg` - JPEG images
- `image/gif` - GIF images
- `image/webp` - WebP images
- `text/plain` - Text inscriptions

## Inscription Script Structure

```
[pubKey, 'OP_CHECKSIG',
  'OP_0', 'OP_IF', 'ord',
  '01', mimeType, 'OP_0',
  ...contentChunks,
'OP_ENDIF']
```

## API Endpoints

### GET /api/bitcoin/fee-rates
Returns current Bitcoin fee rates from mempool.space.

### POST /api/mint/create-commit
Creates commit transaction and mint session.

**Request:**
```json
{
  "ordinal_ids": ["uuid1", "uuid2"],
  "minter_address": "bc1q...",
  "fee_rate": 10
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "taproot_address": "bc1p...",
  "total_cost_sats": 15000,
  "commit_fee": 2000,
  "reveal_fee": 3000,
  "per_inscription": 7500,
  "quantity": 2
}
```

### POST /api/mint/reveal
Creates and broadcasts reveal transaction.

**Request:**
```json
{
  "session_id": "uuid",
  "commit_tx_id": "txid",
  "commit_vout": 0
}
```

**Response:**
```json
{
  "success": true,
  "reveal_tx_id": "txid",
  "inscription_ids": ["txidi0", "txidi1"],
  "ordinals": [...]
}
```

### GET /api/mint/available-ordinals/[collectionId]
Returns unminted ordinals for a collection.

## Frontend Integration

### Wallet Connection

```typescript
import { useLaserEyes } from '@omnisat/lasereyes'

const { connect, disconnect, connected, address, sendBitcoin } = useLaserEyes()
```

### Minting Flow

```typescript
// 1. Create commit
const commitData = await fetch('/api/mint/create-commit', {...})

// 2. Send Bitcoin
const commitTxId = await sendBitcoin(
  commitData.taproot_address,
  commitData.total_cost_sats
)

// 3. Create reveal
const revealData = await fetch('/api/mint/reveal', {
  session_id, commit_tx_id
})
```

## Testing

### Prerequisites

1. Bitcoin wallet with funds (testnet or mainnet)
2. Database migration applied (`008_add_mint_tracking.sql`)
3. Environment variables:
   - `NEON_DATABASE` - Database connection string

### Testing Flow

1. Generate ordinals in a collection
2. Navigate to mint page: `/mint/{collectionId}`
3. Connect wallet
4. Select ordinals
5. Choose fee rate
6. Click "Mint"
7. Confirm transaction in wallet
8. Wait for reveal transaction
9. Verify inscriptions on blockchain explorer

## Known Limitations

1. **Image Content**: Currently using placeholder image URLs. Need to implement actual image fetching and base64 conversion.

2. **UTXO Management**: Placeholder for UTXO fetching. Need to implement proper UTXO selection.

3. **Encryption**: Inscription private keys should be encrypted at rest.

4. **Error Handling**: Need more robust error handling and retry logic.

5. **Transaction Confirmation**: No confirmation waiting implemented yet.

6. **Batch Size**: Limited to 10 inscriptions per batch (Bitcoin script size limits).

## Future Enhancements

1. **Delegate Inscriptions**: Support for parent-child relationships
2. **BRC-20 Support**: Token inscriptions
3. **Recursive Inscriptions**: Reference other inscriptions
4. **Metadata Standards**: Support for JSON metadata
5. **Collection Verification**: On-chain collection verification
6. **Rare Sats**: Preserve and track rare satoshis
7. **Multi-output**: Multiple outputs per reveal transaction

## Resources

- [LaserEyes Documentation](https://www.lasereyes.build/)
- [Ordinals Theory](https://docs.ordinals.com/)
- [Taproot Documentation](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki)
- [Mempool.space API](https://mempool.space/docs/api)

## Support

For issues or questions:
1. Check Bitcoin transaction on blockchain explorer
2. Review mint_sessions table for session status
3. Check browser console for errors
4. Verify wallet has sufficient balance
5. Ensure fee rate is reasonable (> 1 sat/vB)

