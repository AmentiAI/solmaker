/**
 * PSBT and transaction broadcast utilities.
 */

const MEMPOOL_BASE = 'https://mempool.space/api'

/**
 * Broadcast a signed transaction hex to the Bitcoin network via mempool.space.
 * @param txHex - Raw transaction hex
 * @param _network - 'mainnet' | 'testnet' (mainnet uses mempool.space; testnet could use different endpoint)
 * @returns Transaction ID (txid)
 */
export async function broadcastTransaction(
  txHex: string,
  _network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<string> {
  const res = await fetch(`${MEMPOOL_BASE}/tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: txHex,
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Broadcast failed: ${res.status} ${text}`)
  }
  const txId = await res.text()
  return txId.trim()
}
