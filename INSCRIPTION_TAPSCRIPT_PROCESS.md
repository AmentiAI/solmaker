# Bitcoin Inscription Process via Tapscript

This document outlines the complete process used by the Ordzaar platform to create Bitcoin inscriptions using the commit/reveal transaction pattern with Tapscript.

## Overview

The inscription process uses a two-phase approach:
1. **Commit Transaction**: Creates a taproot output that commits to the inscription data
2. **Reveal Transaction**: Spends the commit output and reveals the inscription content

This pattern allows for efficient fee management and enables large content inscriptions without bloating the mempool.

## Architecture Components

### Key Libraries Used
- `@cmdcode/tapscript`: For tapscript operations and transaction creation
- `@cmdcode/crypto-utils`: For cryptographic operations
- `bitcoinjs-lib`: For Bitcoin transaction handling

### Core Files
- `app/api/self-inscribe/utils/inscription.ts`: Inscription script creation
- `app/api/self-inscribe/utils/psbt.ts`: Commit transaction creation
- `app/api/self-inscribe/create-reveal-psbt/route.ts`: Reveal transaction creation
- `app/api/ondemand/reveal/route.ts`: On-demand reveal processing

## Phase 1: Commit Transaction Creation

### 1.1 Key Generation
```typescript
// Generate unique inscription keypair
const privKey = generatePrivateKey()
const pubKey = cmdEcc.keys.get_pubkey(privKey, true)
```

Each inscription gets its own unique keypair for security and isolation.

### 1.2 Inscription Script Creation
```typescript
export function createInscriptionScript(pubKey: string, inscriptions: Array<{content: string, mimeType: string, delegateAddress?: string}>): any[] {
  const ec = new TextEncoder()
  const marker = ec.encode('ord')
  const INSCRIPTION_SIZE = 330

  const script: any[] = [pubKey, 'OP_CHECKSIG']
  
  inscriptions.forEach((inscription, index) => {
    const { content, mimeType, delegateAddress } = inscription
    
    script.push('OP_0', 'OP_IF', marker)
    
    if (delegateAddress) {
      // Delegate inscription: use field 11 (0x0b)
      script.push('0b')
      // Convert inscription ID to binary format
      const delegateContent = convertInscriptionIdToBinary(delegateAddress)
      script.push(delegateContent)
    } else {
      // Regular inscription: use field 1 for content type, field 0 for content
      script.push('01', ec.encode(mimeType), 'OP_0')
      
      if (index > 0) {
        const pointer = INSCRIPTION_SIZE * (index + 1)
        script.push(Buffer.from([0x02]), Buffer.from([pointer]))
      }
      
      const contentChunks = createContentChunks(content, mimeType)
      script.push(...contentChunks.map((chunk) => chunk))
    }
    
    script.push('OP_ENDIF')
  })

  return script
}
```

### 1.3 Taproot Address Generation
```typescript
export function createInscriptionRevealAddressAndKeys(pubKey: string, inscriptions: Array<{content: string, mimeType: string, delegateAddress?: string}>) {
  const script = createInscriptionScript(pubKey, inscriptions)
  const tapleaf = Tap.encodeScript(script)
  const [tpubkey] = Tap.getPubKey(pubKey, { target: tapleaf })
  const inscriberAddress = bitcoin.address.fromOutputScript(
    bitcoin.script.compile([bitcoin.opcodes.OP_1, Buffer.from(tpubkey, 'hex')]),
    getBitcoinNetwork()
  )

  return {
    inscriberAddress,
    tpubkey,
    tapleaf,
  }
}
```

### 1.4 Commit Transaction Structure
The commit transaction:
- Takes user UTXOs as inputs
- Creates taproot outputs pointing to inscription addresses
- Includes tool fees and change outputs
- Uses P2SH-P2WPKH addresses (starting with "3") for compatibility

```typescript
// Commit transaction output structure
psbt.addOutput({
  value: BigInt(outputValue), // revealTxFee + 330 sats
  address: inscriptionAddress, // Generated taproot address
})
```

## Phase 2: Reveal Transaction Creation

### 2.1 Transaction Input
The reveal transaction spends the commit output:
```typescript
const txData = Tx.create({
  vin: [
    {
      txid: commitTxId,
      vout: commitOutputIndex,
      prevout: {
        value: commitOutputValue,
        scriptPubKey: ['OP_1', tapkey], // Taproot output
      },
    },
  ],
  vout: outputs.map((output: any) => ({
    value: output.value,
    scriptPubKey: Address.toScriptPubKey(output.address),
  }))
})
```

### 2.2 Script Recreation
Critical step: The inscription script must be recreated identically:
```typescript
// Recreate the script from original inscription data
const inscriptions = [{
  content: inscription.content,
  mimeType: inscription.mimeType
}];

const script = createInscriptionScript(pubKeyHex, inscriptions);
const tapleaf = Tap.encodeScript(script);
```

### 2.3 Taproot Signing
```typescript
const secKey = cmdEcc.keys.get_seckey(inscriptionPrivKey);
const sig = Signer.taproot.sign(secKey, txData, 0, { extension: tapleaf });

// Set witness data: [signature, script, control_block]
txData.vin[0].witness = [sig, script, cblock];
```

### 2.4 Witness Structure
The witness contains three elements:
1. **Signature**: Taproot signature for the transaction
2. **Script**: The complete inscription script
3. **Control Block**: Taproot control block (cblock)

## Content Handling

### Content Chunking
Large content is split into 520-byte chunks:
```typescript
export function createContentChunks(contentBase64: string, mimeType: string) {
  let contentBuffer: Buffer
  
  if (mimeType === 'text/plain') {
    const decodedText = Buffer.from(contentBase64, 'base64').toString('utf-8')
    contentBuffer = Buffer.from(decodedText, 'utf-8')
  } else {
    contentBuffer = Buffer.from(contentBase64, 'base64')
  }

  const contentChunks = []
  for (let i = 0; i < contentBuffer.length; i += 520) {
    contentChunks.push(contentBuffer.slice(i, i + 520))
  }
  return contentChunks
}
```

### MIME Type Encoding
Content types are encoded as UTF-8 bytes in the script:
```typescript
script.push('01', ec.encode(mimeType), 'OP_0')
```

## Fee Calculation

### Commit Transaction Fees
- Based on transaction size and fee rate
- Includes tool fees for platform revenue
- Accounts for rare sat preservation when applicable

### Reveal Transaction Fees
- Calculated based on content size and script complexity
- Separate fee calculation for each inscription
- Minimum 330 sats per inscription output

```typescript
const revealSatsNeeded = totalRevealTxFee + 330 * finalInscriptions.length
```

## Inscription ID Generation

Inscription IDs follow the format: `{revealTxId}i{outputIndex}`

```typescript
// Calculate inscription ID EARLY (before broadcasting)
const inscriptionId = `${commitTxId}i${commitOutputIndex}`;
```

## Security Considerations

### Private Key Management
- Inscription private keys are generated server-side
- Never exposed to client wallets
- Used only for signing reveal transactions

### Address Compatibility
- Uses P2SH-P2WPKH addresses (starting with "3")
- Compatible with most Bitcoin wallets
- Supports both legacy and SegWit features

### Anti-Farming Measures
- Images are locked immediately upon selection
- Prevents multiple users from claiming same content
- Implements timeout mechanisms for failed transactions

## Error Handling

### Transaction Validation
- Fee rate validation against available funds
- UTXO sufficiency checks
- Content size limitations

### Rollback Mechanisms
- Failed PSBT creation triggers image unlock
- Preserves anti-farming state for touched images
- Maintains transaction integrity

## Broadcasting Process

### Commit Transaction
- Signed by user's wallet
- Broadcast via wallet's preferred method
- Confirmation required before reveal

### Reveal Transaction
- Server-signed with inscription private key
- Broadcast via mempool.space API
- Immediate inscription ID prediction

```typescript
// Broadcast the server-signed reveal transaction
revealTxId = await InscriptionService.broadcastTransaction(revealResponse.signedTxHex)

// Predict inscription ID: {revealTxId}i0
const predictedInscriptionId = `${revealTxId}i0`
```

## Multi-Inscription Batching

For multiple inscriptions:
- Maximum 10 inscriptions per batch
- Separate commit transactions for each batch
- Individual reveal transactions for each inscription
- Efficient UTXO management across batches

## Platform Integration

### Tool Fees
- Configurable platform fees
- Ordzaar Pass holders get fee discounts
- Fee collection via dedicated outputs

### Collection Support
- Inscribe-on-demand functionality
- Anti-farming image selection
- Supply limit enforcement
- Whitelist integration

This process ensures efficient, secure, and scalable Bitcoin inscription creation while maintaining compatibility with existing Bitcoin infrastructure and wallet software.
