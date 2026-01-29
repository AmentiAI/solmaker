'use client'

import { useState, useEffect } from 'react'

export interface CreditCosts {
  image_generation: number
  trait_generation: number
  collection_generation: number
}

// Module-level cache to prevent duplicate fetches
let cachedCosts: CreditCosts | null = null
let cacheTimestamp = 0
let inFlightPromise: Promise<CreditCosts> | null = null
const CACHE_TTL = 30000 // 30 seconds

const DEFAULT_COSTS: CreditCosts = {
  image_generation: 1.0,
  trait_generation: 0.05,
  collection_generation: 1.0,
}

async function fetchCreditCosts(): Promise<CreditCosts> {
  // Return cached data if fresh
  if (cachedCosts && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    return cachedCosts
  }
  
  // Deduplicate in-flight requests
  if (inFlightPromise) {
    return inFlightPromise
  }
  
  inFlightPromise = fetch('/api/credit-costs')
    .then(res => res.json())
    .then(data => {
      if (data.costs) {
        cachedCosts = data.costs
        cacheTimestamp = Date.now()
        return data.costs
      }
      return DEFAULT_COSTS
    })
    .catch(err => {
      console.error('Error fetching credit costs:', err)
      return cachedCosts || DEFAULT_COSTS
    })
    .finally(() => {
      inFlightPromise = null
    })
  
  return inFlightPromise
}

export function useCreditCosts() {
  const [costs, setCosts] = useState<CreditCosts>(cachedCosts || DEFAULT_COSTS)
  const [loading, setLoading] = useState(!cachedCosts)

  useEffect(() => {
    // If we have fresh cached data, use it immediately
    if (cachedCosts && (Date.now() - cacheTimestamp) < CACHE_TTL) {
      setCosts(cachedCosts)
      setLoading(false)
      return
    }
    
    fetchCreditCosts()
      .then(setCosts)
      .finally(() => setLoading(false))
  }, [])

  return { costs, loading }
}

/**
 * Calculate credits needed for traits
 * Returns the actual decimal value (e.g., 5 traits * 0.05 = 0.25 credits)
 */
export function calculateTraitCredits(quantity: number, costPerTrait: number): number {
  // Round up to nearest 0.05 increment to avoid undercharging
  const total = quantity * costPerTrait;
  return Math.ceil(total * 20) / 20;
}

/**
 * Format credit cost display
 */
export function formatCreditCost(cost: number, unitName: string): string {
  if (cost >= 1) {
    return `${cost} credit${cost > 1 ? 's' : ''} per ${unitName}`
  } else {
    const unitsPerCredit = Math.round(1 / cost)
    return `1 credit = ${unitsPerCredit} ${unitName}${unitsPerCredit > 1 ? 's' : ''}`
  }
}

