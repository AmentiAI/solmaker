/**
 * UTXO fetching and filtering. Fetches from mempool.space; supports Sandshrew-style format conversion.
 */

const MEMPOOL_BASE = 'https://mempool.space/api'

export interface MempoolUtxo {
  txid: string
  vout: number
  value: number
  status?: { confirmed: boolean; block_height?: number }
  scriptpubkey?: string
  scriptpubkey_address?: string
  scriptpubkey_type?: string
}

const MIN_SPENDABLE_SATS = 801

/**
 * Fetch UTXOs for an address from mempool.space.
 * Returns { utxos } - array may be in mempool format or Sandshrew-like format.
 */
export async function fetchUtxos(
  address: string,
  _exclude: { txid: string; vout: number }[] = []
): Promise<{ utxos: MempoolUtxo[] }> {
  const res = await fetch(`${MEMPOOL_BASE}/address/${address}/utxo`, {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to fetch UTXOs: ${res.status} ${text}`)
  }
  const data = await res.json()
  const utxos = Array.isArray(data) ? data : (data.utxos || data.utxo || [])
  return { utxos: utxos.map(normalizeUtxo) }
}

function normalizeUtxo(u: any): MempoolUtxo {
  const value = typeof u.value === 'bigint' ? Number(u.value) : typeof u.value === 'string' ? parseInt(u.value, 10) : u.value
  return {
    txid: u.txid || u.tx_id,
    vout: u.vout ?? u.output_index ?? 0,
    value: typeof value === 'number' && !isNaN(value) ? value : 0,
    status: u.status,
    scriptpubkey: u.scriptpubkey || u.script_pub_key?.hex,
    scriptpubkey_address: u.scriptpubkey_address || u.script_pub_key?.address,
    scriptpubkey_type: u.scriptpubkey_type || u.script_pub_key?.type,
  }
}

/**
 * Convert Sandshrew (or other) UTXO shape to mempool-style { txid, vout, value, scriptpubkey, ... }.
 * If already in mempool shape, returns as-is.
 */
export function convertSandshrewToMempoolFormat(utxos: any[]): MempoolUtxo[] {
  if (!Array.isArray(utxos)) return []
  return utxos.map((u: any) => {
    if (u && typeof u.txid === 'string' && typeof u.vout === 'number') return u as MempoolUtxo
    return normalizeUtxo(u)
  })
}

/**
 * Filter out dust (<= MIN_SPENDABLE_SATS) and sort by value ascending (smallest first for coin selection).
 */
export function filterAndSortUtxos(utxos: MempoolUtxo[]): MempoolUtxo[] {
  return utxos
    .filter((u) => u && (typeof u.value === 'number' ? u.value : 0) > MIN_SPENDABLE_SATS)
    .sort((a, b) => (a.value || 0) - (b.value || 0))
}

/**
 * Throw if total UTXO value is less than requiredSats.
 */
export function validateSufficientFunds(utxos: MempoolUtxo[] | { value: number }[], requiredSats: number): void {
  const total = (utxos || []).reduce((sum, u) => sum + (typeof u.value === 'number' ? u.value : 0), 0)
  if (total < requiredSats) {
    throw new Error(`Insufficient funds: need ${requiredSats} sats, have ${total} sats`)
  }
}
