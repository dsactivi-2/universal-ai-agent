import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// ============================================================
// AUTH MODULE - JWT-basierte Authentifizierung
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000 // 24 Stunden

export interface JWTPayload {
  userId: string
  email: string
  role: 'user' | 'admin'
  iat: number
  exp: number
}

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload
}

// Base64URL encode/decode
function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function base64UrlDecode(data: string): string {
  const padded = data + '='.repeat((4 - (data.length % 4)) % 4)
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}

// HMAC-SHA256 Signatur
function sign(data: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// JWT erstellen
export function createToken(userId: string, email: string, role: 'user' | 'admin' = 'user'): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Date.now()

  const payload: JWTPayload = {
    userId,
    email,
    role,
    iat: now,
    exp: now + TOKEN_EXPIRY
  }

  const headerEncoded = base64UrlEncode(JSON.stringify(header))
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload))
  const signature = sign(`${headerEncoded}.${payloadEncoded}`, JWT_SECRET)

  return `${headerEncoded}.${payloadEncoded}.${signature}`
}

// JWT validieren
export function verifyToken(token: string): JWTPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerEncoded, payloadEncoded, signature] = parts

    // Signatur prüfen
    const expectedSignature = sign(`${headerEncoded}.${payloadEncoded}`, JWT_SECRET)
    if (signature !== expectedSignature) return null

    // Payload dekodieren
    const payload: JWTPayload = JSON.parse(base64UrlDecode(payloadEncoded))

    // Ablauf prüfen
    if (payload.exp < Date.now()) return null

    return payload
  } catch {
    return null
  }
}

// Token aus Request extrahieren
export function extractToken(request: NextRequest): string | null {
  // Authorization Header prüfen
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  // Cookie prüfen
  const cookieToken = request.cookies.get('auth-token')?.value
  if (cookieToken) {
    return cookieToken
  }

  // Query Parameter (für WebSocket-Verbindungen)
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')
  if (queryToken) {
    return queryToken
  }

  return null
}

// Auth Middleware Response
export function unauthorizedResponse(message: string = 'Unauthorized'): NextResponse {
  return NextResponse.json(
    { error: message, code: 'UNAUTHORIZED' },
    { status: 401 }
  )
}

export function forbiddenResponse(message: string = 'Forbidden'): NextResponse {
  return NextResponse.json(
    { error: message, code: 'FORBIDDEN' },
    { status: 403 }
  )
}

// Auth Check Funktion für API Routes
export function requireAuth(request: NextRequest): { user: JWTPayload } | { error: NextResponse } {
  const token = extractToken(request)

  if (!token) {
    return { error: unauthorizedResponse('No authentication token provided') }
  }

  const payload = verifyToken(token)

  if (!payload) {
    return { error: unauthorizedResponse('Invalid or expired token') }
  }

  return { user: payload }
}

// Admin-Only Check
export function requireAdmin(request: NextRequest): { user: JWTPayload } | { error: NextResponse } {
  const result = requireAuth(request)

  if ('error' in result) return result

  if (result.user.role !== 'admin') {
    return { error: forbiddenResponse('Admin access required') }
  }

  return result
}

// ============================================================
// RATE LIMITING
// ============================================================

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-Memory Rate Limit Store (für Production: Redis verwenden)
const rateLimitStore = new Map<string, RateLimitEntry>()

interface RateLimitConfig {
  windowMs: number      // Zeitfenster in ms
  maxRequests: number   // Max Requests pro Fenster
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 Minute
  maxRequests: 30       // 30 Requests pro Minute
}

const LLM_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 Minute
  maxRequests: 10       // 10 LLM Calls pro Minute
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const key = `${identifier}:${Math.floor(now / config.windowMs)}`

  // Alte Entries aufräumen
  for (const [k, v] of rateLimitStore.entries()) {
    if (v.resetAt < now) {
      rateLimitStore.delete(k)
    }
  }

  const entry = rateLimitStore.get(key)

  if (!entry) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + config.windowMs
    })
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs }
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}

export function rateLimitResponse(resetAt: number): NextResponse {
  return NextResponse.json(
    {
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000)
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
        'X-RateLimit-Reset': String(resetAt)
      }
    }
  )
}

// Combined Auth + Rate Limit Check
export function authAndRateLimit(
  request: NextRequest,
  rateLimitConfig: RateLimitConfig = DEFAULT_RATE_LIMIT
): { user: JWTPayload } | { error: NextResponse } {
  // Auth prüfen
  const authResult = requireAuth(request)
  if ('error' in authResult) return authResult

  // Rate Limit prüfen (per User)
  const rateResult = checkRateLimit(authResult.user.userId, rateLimitConfig)
  if (!rateResult.allowed) {
    return { error: rateLimitResponse(rateResult.resetAt) }
  }

  return authResult
}

// LLM-spezifisches Rate Limit
export function authAndLLMRateLimit(request: NextRequest): { user: JWTPayload } | { error: NextResponse } {
  return authAndRateLimit(request, LLM_RATE_LIMIT)
}

// ============================================================
// API KEY AUTH (für externe Services)
// ============================================================

export function requireApiKey(request: NextRequest): { valid: true } | { error: NextResponse } {
  const apiKey = request.headers.get('x-api-key')
  const expectedKey = process.env.API_KEY

  if (!expectedKey) {
    console.error('API_KEY not configured in environment')
    return { error: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  }

  if (!apiKey || apiKey !== expectedKey) {
    return { error: unauthorizedResponse('Invalid API key') }
  }

  return { valid: true }
}
