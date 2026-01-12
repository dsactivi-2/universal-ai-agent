import { NextRequest, NextResponse } from 'next/server'

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store (use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  rateLimitStore.forEach((entry, key) => {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key)
    }
  })
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  windowMs: number      // Time window in milliseconds
  maxRequests: number   // Max requests per window
  keyGenerator?: (request: NextRequest) => string
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 60,      // 60 requests per minute
}

/**
 * Get client identifier for rate limiting
 */
function getClientKey(request: NextRequest): string {
  // Try to get real IP from various headers
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const cfIp = request.headers.get('cf-connecting-ip')

  // Use first forwarded IP, or fallback
  const ip = forwarded?.split(',')[0]?.trim() || realIp || cfIp || 'unknown'

  // Include user agent for additional uniqueness
  const ua = request.headers.get('user-agent') || 'unknown'

  return `${ip}:${ua.slice(0, 50)}`
}

/**
 * Rate limiting middleware
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  config: Partial<RateLimitConfig> = {}
) {
  const { windowMs, maxRequests, keyGenerator } = { ...defaultConfig, ...config }

  return async (request: NextRequest): Promise<NextResponse> => {
    const key = keyGenerator ? keyGenerator(request) : getClientKey(request)
    const now = Date.now()

    let entry = rateLimitStore.get(key)

    if (!entry || entry.resetTime < now) {
      // Create new entry or reset expired one
      entry = {
        count: 1,
        resetTime: now + windowMs
      }
      rateLimitStore.set(key, entry)
    } else {
      entry.count++
    }

    // Add rate limit headers
    const remaining = Math.max(0, maxRequests - entry.count)
    const reset = Math.ceil((entry.resetTime - now) / 1000)

    if (entry.count > maxRequests) {
      return NextResponse.json(
        {
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: reset
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': entry.resetTime.toString(),
            'Retry-After': reset.toString()
          }
        }
      )
    }

    const response = await handler(request)

    // Add rate limit headers to successful response
    response.headers.set('X-RateLimit-Limit', maxRequests.toString())
    response.headers.set('X-RateLimit-Remaining', remaining.toString())
    response.headers.set('X-RateLimit-Reset', entry.resetTime.toString())

    return response
  }
}

/**
 * Stricter rate limit for expensive operations (like LLM calls)
 */
export const llmRateLimitConfig: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 10,      // 10 LLM requests per minute
}

/**
 * Standard API rate limit
 */
export const apiRateLimitConfig: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 100,     // 100 requests per minute
}
