import { neon } from '@neondatabase/serverless';

const getDatabaseUrl = () => {
  return process.env.NEON_DATABASE || 
         process.env.DATABASE_URL || 
         process.env.NEXT_PUBLIC_NEON_DATABASE ||
         ''
}

const databaseUrl = getDatabaseUrl();
let sql: ReturnType<typeof neon> | null = null;

if (typeof window === 'undefined' && databaseUrl) {
  sql = neon(databaseUrl);
}

// Cache for credit costs (refreshed on each request to allow updates)
let creditCostsCache: Map<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10000; // 10 second cache (reduced for faster updates)

/**
 * Get credit cost for a specific action type
 * @param actionType - The action type (e.g., 'image_generation', 'trait_generation', 'collection_generation')
 * @returns The cost per unit, or default value if not found
 */
export async function getCreditCost(actionType: string): Promise<number> {
  if (!sql) {
    // Fallback to defaults if database not available
    return getDefaultCost(actionType);
  }

  try {
    // Check cache (with short TTL to allow updates)
    const now = Date.now();
    if (creditCostsCache && (now - cacheTimestamp) < CACHE_TTL) {
      const cached = creditCostsCache.get(actionType);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Fetch from database
    const result = await sql`
      SELECT cost_per_unit FROM credit_costs WHERE action_type = ${actionType}
    ` as any[];

    if (Array.isArray(result) && result.length > 0) {
      const cost = parseFloat(result[0].cost_per_unit);
      if (!isNaN(cost) && cost >= 0) {
        // Update cache
        if (!creditCostsCache) {
          creditCostsCache = new Map();
        }
        creditCostsCache.set(actionType, cost);
        cacheTimestamp = now;
        return cost;
      }
    }

    // If not found, use default and cache it
    const defaultCost = getDefaultCost(actionType);
    if (!creditCostsCache) {
      creditCostsCache = new Map();
    }
    creditCostsCache.set(actionType, defaultCost);
    cacheTimestamp = now;
    return defaultCost;
  } catch (error) {
    console.error(`Error fetching credit cost for ${actionType}:`, error);
    return getDefaultCost(actionType);
  }
}

/**
 * Get default credit cost (fallback)
 */
function getDefaultCost(actionType: string): number {
  const defaults: Record<string, number> = {
    'image_generation': 1.0,
    'trait_generation': 0.05, // 1 credit = 20 traits
    'collection_generation': 1.0,
  };
  return defaults[actionType] ?? 1.0;
}

/**
 * Calculate credits needed for a quantity of units
 * @param actionType - The action type
 * @param quantity - Number of units
 * @returns Credits needed (uses exact DB value, rounds appropriately)
 */
export async function calculateCreditsNeeded(actionType: string, quantity: number): Promise<number> {
  // Get cost from DB (cache will be used if fresh, otherwise fetches from DB)
  const costPerUnit = await getCreditCost(actionType);
  const totalCost = quantity * costPerUnit;
  
  // For trait generation, we need to support fractional credits (0.05 per trait)
  // Since credits are stored as INTEGER in the database, we'll use a multiplier approach:
  // Store credits as "credit units" where 1 credit = 100 units
  // So 0.25 credits = 25 units, 0.05 credits = 5 units, etc.
  // This allows us to track fractional credits without changing the database schema
  
  if (actionType === 'trait_generation') {
    // Round up to nearest 0.05 increment to avoid undercharging
    // Example: 0.25 → 0.25, 0.23 → 0.25, 0.27 → 0.30
    // This ensures we charge correctly: 5 traits = 0.25 credits, not 1 credit
    const roundedToNearest005 = Math.ceil(totalCost * 20) / 20;
    return roundedToNearest005;
  }
  
  // For other actions (image_generation, etc.), round up to at least 1 credit if < 1
  // This ensures that any generation costs at least 1 credit
  // Example: 0.5 images → 1 credit (minimum charge)
  if (totalCost > 0 && totalCost < 1) {
    return 1; // Minimum 1 credit for any generation
  }
  
  // For costs >= 1, round to nearest integer
  return Math.round(totalCost);
}

/**
 * Clear the credit costs cache (useful after updates)
 */
export function clearCreditCostsCache() {
  creditCostsCache = null;
  cacheTimestamp = 0;
}

