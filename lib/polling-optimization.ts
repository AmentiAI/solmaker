/**
 * Polling optimization utilities
 * Handles adaptive polling rates and efficient data fetching
 */

/**
 * Calculate adaptive polling interval based on activity
 * - Active minting: 2 seconds (fast updates)
 * - Recent activity: 3 seconds (moderate)
 * - Idle: 5 seconds (default)
 */
export function getAdaptivePollInterval(
  lastMintTime: number | null,
  isMinting: boolean,
  totalMinted: number,
  previousTotalMinted: number
): number {
  // Fast polling if actively minting
  if (isMinting) {
    return 2000 // 2 seconds
  }

  // Fast polling if mints happened recently (within last 30 seconds)
  if (lastMintTime && Date.now() - lastMintTime < 30000) {
    return 2000 // 2 seconds
  }

  // Moderate polling if count changed recently
  if (totalMinted !== previousTotalMinted) {
    return 3000 // 3 seconds
  }

  // Default polling for idle state
  return 5000 // 5 seconds
}

/**
 * Debounce function to prevent excessive API calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

