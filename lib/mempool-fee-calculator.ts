/**
 * Mempool fee calculator - fetches recommended fee rates and block health from mempool.space.
 * Used by self-inscribe, launchpad, and mint pages for Bitcoin fee estimation.
 */

export interface MempoolHealth {
  suggestedFeeRate: number
  healthRating: string
  healthMessage: string
  blocksWithSub1Sat: number
  totalBlocks: number
  lastSub1SatFee: number | null
}

const MEMPOOL_BASE = 'https://mempool.space/api'

/**
 * Fetch recommended fees (precise endpoint supports sub-1 sat/vB).
 */
async function fetchRecommendedFees(): Promise<{
  economyFee: number
  halfHourFee: number
  hourFee: number
  minimumFee: number
}> {
  const res = await fetch(`${MEMPOOL_BASE}/v1/fees/precise`)
  if (!res.ok) throw new Error('Failed to fetch fee recommendations')
  const data = await res.json()
  return {
    economyFee: data.economyFee ?? data.economy ?? 1,
    halfHourFee: data.halfHourFee ?? data.halfHour ?? 1,
    hourFee: data.hourFee ?? data.hour ?? 1,
    minimumFee: data.minimumFee ?? data.minimum ?? 0.1,
  }
}

/**
 * Fetch recent blocks to count sub-1 sat/vB blocks and get last sub-1 sat fee.
 */
async function fetchRecentBlocksFeeRates(): Promise<{ blocksWithSub1Sat: number; totalBlocks: number; lastSub1SatFee: number | null }> {
  try {
    const res = await fetch(`${MEMPOOL_BASE}/v1/blocks`)
    if (!res.ok) return { blocksWithSub1Sat: 0, totalBlocks: 10, lastSub1SatFee: null }
    const blocks = await res.json()
    if (!Array.isArray(blocks) || blocks.length === 0) return { blocksWithSub1Sat: 0, totalBlocks: 10, lastSub1SatFee: null }
    let blocksWithSub1Sat = 0
    let lastSub1SatFee: number | null = null
    for (const b of blocks) {
      const extras = b.extras
      if (!extras) continue
      const medianFee = extras.medianFee ?? extras.avgFeeRate ?? 1
      if (medianFee < 1) {
        blocksWithSub1Sat++
        if (lastSub1SatFee === null || medianFee < lastSub1SatFee) lastSub1SatFee = medianFee
      }
    }
    return { blocksWithSub1Sat, totalBlocks: blocks.length, lastSub1SatFee }
  } catch {
    return { blocksWithSub1Sat: 0, totalBlocks: 10, lastSub1SatFee: null }
  }
}

/**
 * Calculate optimal fee rate and mempool health for UI.
 * Uses precise fees (sub-1 sat) and recent block stats when available.
 */
export async function calculateOptimalFeeRate(): Promise<MempoolHealth> {
  const [fees, blocks] = await Promise.all([fetchRecommendedFees(), fetchRecentBlocksFeeRates()])
  const { blocksWithSub1Sat, totalBlocks, lastSub1SatFee } = blocks
  const economyFee = fees.economyFee
  const suggestedFeeRate = economyFee < 1
    ? Math.max(0.1, Math.min(1, economyFee + 0.02))
    : economyFee
  const ratio = totalBlocks > 0 ? blocksWithSub1Sat / totalBlocks : 0
  let healthRating: string
  let healthMessage: string
  if (ratio >= 0.5) {
    healthRating = 'excellent'
    healthMessage = 'Many recent blocks with sub-1 sat/vB. Economy fee is a good default.'
  } else if (ratio >= 0.2) {
    healthRating = 'good'
    healthMessage = 'Some recent blocks had sub-1 sat/vB. You can try economy or slightly higher.'
  } else if (ratio > 0) {
    healthRating = 'fair'
    healthMessage = 'Few recent sub-1 sat blocks. Consider half-hour or hour fee for faster confirm.'
  } else {
    healthRating = 'high'
    healthMessage = 'No recent sub-1 sat blocks. Use recommended fee for reliable confirmation.'
  }
  return {
    suggestedFeeRate: suggestedFeeRate < 0.1 ? 0.9 : suggestedFeeRate,
    healthRating,
    healthMessage,
    blocksWithSub1Sat,
    totalBlocks,
    lastSub1SatFee,
  }
}
