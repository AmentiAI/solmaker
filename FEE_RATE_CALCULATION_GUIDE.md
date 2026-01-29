# Bitcoin Fee Rate Calculation: Quick How-To

## Core Formula

```
Fee (sats) = Virtual Size (vB) × Fee Rate (sat/vB)
```

Always round up: `Math.ceil(vSize * feeRate)`

---

## Commit Transaction Fee

### Formula
```
Commit vSize = Base + (Inputs × Input Size) + (Outputs × Output Size)
Commit Fee = Math.ceil(Commit vSize × feeRate)
```

### Size Constants

**Base Transaction:**
- Base: `10.5 vB` (version + locktime + varints)

**Input Sizes (by address type):**
| Type | Prefix | vSize |
|------|--------|-------|
| P2TR | `bc1p...` | 57.5 vB |
| P2WPKH | `bc1q...` | 68 vB |
| P2SH | `3...`, `2...` | 91 vB |
| P2PKH | `1...` | 148 vB |

**Output Sizes:**
| Type | vSize |
|------|-------|
| P2TR | 43 vB |
| P2WPKH | 31 vB |
| P2SH | 32 vB |
| P2PKH | 34 vB |

### Example
```typescript
// 1 P2TR input, 3 P2TR outputs (2 inscriptions + 1 change)
const base = 10.5
const inputSize = 57.5  // P2TR
const outputSize = 43   // P2TR
const outputs = 3

const commitVSize = base + (1 * inputSize) + (outputs * outputSize)
// = 10.5 + 57.5 + 129 = 197 vB

const commitFee = Math.ceil(197 * 0.25) // 0.25 sat/vB
// = 50 sats
```

---

## Reveal Transaction Fee

### Formula
```
Weight = (Non-Witness × 4) + Witness
vSize = Math.ceil(Weight / 4)
Reveal Fee = Math.ceil(vSize × feeRate)
```

### Size Components

**Non-Witness Data (50 bytes base + output size):**
- Version: 4 bytes
- Input count: 1 byte
- Input prevout: 36 bytes (txid + vout)
- Sequence: 4 bytes
- Output count: 1 byte
- Locktime: 4 bytes
- Output: 43 vB (P2TR) or 31-34 vB (other types)

**Witness Data:**
- Signature: 65 bytes
- Script overhead: `100 + mimeType.length` bytes
- Content: `contentSizeBytes` (actual data size)
- Control block: 33 bytes
- Stack overhead: 3 bytes
- Push opcodes: `Math.ceil(contentSizeBytes / 520) × 2` bytes

### Example
```typescript
// 50KB image, P2TR address, "image/webp" (10 bytes)
const contentSize = 50000
const mimeType = "image/webp"
const numChunks = Math.ceil(contentSize / 520) // 97

// Non-witness
const baseNonWitness = 50
const outputSize = 43  // P2TR
const nonWitness = baseNonWitness + outputSize // 93 bytes

// Witness
const signature = 65
const scriptOverhead = 100 + mimeType.length // 110
const controlBlock = 33
const stackOverhead = 3
const pushOpcodes = numChunks * 2 // 194
const witness = signature + scriptOverhead + contentSize + controlBlock + stackOverhead + pushOpcodes
// = 65 + 110 + 50000 + 33 + 3 + 194 = 50,405 bytes

// Calculate
const weight = (nonWitness * 4) + witness
// = (93 * 4) + 50405 = 50,777
const revealVSize = Math.ceil(weight / 4) // 12,695 vB

const revealFee = Math.ceil(12695 * 0.25) // 0.25 sat/vB
// = 3,174 sats
```

---

## Implementation Checklist

### 1. Calculate Commit vSize
```typescript
function calculateCommitVSize(
  paymentAddress: string,
  inputCount: number,
  outputCount: number
): number {
  const base = 10.5
  const inputSize = getInputVSize(paymentAddress)
  const outputSize = getOutputVSize(paymentAddress)
  
  return Math.ceil(base + (inputCount * inputSize) + (outputCount * outputSize))
}

function getInputVSize(address: string): number {
  if (address.startsWith('bc1p')) return 57.5  // P2TR
  if (address.startsWith('bc1q')) return 68   // P2WPKH
  if (address.startsWith('3') || address.startsWith('2')) return 91  // P2SH
  if (address.startsWith('1')) return 148  // P2PKH
  return 68  // default P2WPKH
}

function getOutputVSize(address: string): number {
  if (address.startsWith('bc1p')) return 43   // P2TR
  if (address.startsWith('bc1q')) return 31    // P2WPKH
  if (address.startsWith('3') || address.startsWith('2')) return 32  // P2SH
  if (address.startsWith('1')) return 34  // P2PKH
  return 31  // default P2WPKH
}
```

### 2. Calculate Reveal vSize
```typescript
function calculateRevealVSize(
  contentSizeBytes: number,
  receivingAddress: string,
  mimeType: string = 'image/webp'
): number {
  // Non-witness
  const baseNonWitness = 50
  const outputSize = getOutputVSize(receivingAddress)
  const nonWitnessSize = baseNonWitness + outputSize
  
  // Witness
  const signature = 65
  const scriptOverhead = 100 + mimeType.length
  const controlBlock = 33
  const stackOverhead = 3
  const numChunks = Math.ceil(contentSizeBytes / 520)
  const pushOpcodeOverhead = numChunks * 2
  
  const witnessSize = signature + scriptOverhead + contentSizeBytes + 
                      controlBlock + stackOverhead + pushOpcodeOverhead
  
  // Weight and vSize
  const weight = (nonWitnessSize * 4) + witnessSize
  return Math.ceil(weight / 4)
}
```

### 3. Apply Fee Rate
```typescript
const commitVSize = calculateCommitVSize(paymentAddress, inputCount, outputCount)
const commitFee = Math.ceil(commitVSize * feeRate)

const revealVSize = calculateRevealVSize(contentSize, receivingAddress, mimeType)
const revealFee = Math.ceil(revealVSize * feeRate)
```

### 4. Safety Buffer (Optional)
```typescript
// Add small buffer to reveal output to account for rounding
const safetyBuffer = 20
const revealOutputValue = revealFee + minOutputValue + safetyBuffer
```

---

## Quick Reference

| Component | Size |
|-----------|------|
| Base tx | 10.5 vB |
| P2TR input | 57.5 vB |
| P2TR output | 43 vB |
| Reveal base non-witness | 50 bytes |
| Reveal signature | 65 bytes |
| Reveal script overhead | 100 + mimeType.length |
| Reveal control block | 33 bytes |
| Reveal stack overhead | 3 bytes |
| Push opcode per chunk | 2 bytes |

**Key Points:**
- Always use `Math.ceil()` for rounding
- Non-witness data counts 4× in weight calculation
- Witness data counts 1× in weight calculation
- vSize = weight / 4
- Fee = vSize × feeRate

---

## Common Pitfalls

1. **Not accounting for address type** - Different address types have different input/output sizes
2. **Forgetting witness discount** - Must use weight calculation, not raw byte count
3. **Missing push opcodes** - Content chunks need OP_PUSHDATA overhead
4. **Not rounding up** - Always use `Math.ceil()` to ensure sufficient fees
5. **Incorrect base sizes** - Commit base is 10.5 vB, reveal non-witness base is 50 bytes
