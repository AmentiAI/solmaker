// Simple in-memory rate limiter for edge functions
// In production, consider using Redis or a database-backed solution
// This implementation auto-cleans expired entries on each check

interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries (called on each rate limit check)
function cleanupExpiredEntries() {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: number } {
  // Clean up expired entries first
  cleanupExpiredEntries()
  
  const now = Date.now()
  const entry = rateLimitStore.get(identifier)

  if (!entry || now > entry.resetTime) {
    // Create new entry or reset expired entry
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs,
    })
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: now + config.windowMs,
    }
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    }
  }

  // Increment count
  entry.count++
  rateLimitStore.set(identifier, entry)

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
  }
}

// Rate limit configs
export const RATE_LIMITS = {
  CREATE_TICKET: { maxRequests: 5, windowMs: 60 * 60 * 1000 }, // 5 tickets per hour
  SEND_MESSAGE: { maxRequests: 20, windowMs: 60 * 1000 }, // 20 messages per minute
  GET_TICKETS: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 requests per minute
}

