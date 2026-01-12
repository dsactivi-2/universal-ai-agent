import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createToken, checkRateLimit, rateLimitResponse } from '@/lib/auth'
import { validateBody, LoginSchema } from '@/lib/validation'
import { logger, logSecurity } from '@/lib/logger'

// In-Memory User Store (für Production: Datenbank verwenden)
interface User {
  id: string
  email: string
  passwordHash: string
  role: 'user' | 'admin'
}

// Bcrypt cost factor (10-12 recommended for production)
const BCRYPT_ROUNDS = 10

// Demo-Users (für Production: aus DB laden)
// Passwort: "password123" -> Hash generiert mit bcrypt
// Generate new hash: bcrypt.hashSync('password123', 10)
const DEMO_USERS: User[] = [
  {
    id: 'admin-001',
    email: 'admin@example.com',
    // bcrypt hash for "password123"
    passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMy.MRjRnCKXnZpRrgPNZ6ZmhP8FqkjhJPa',
    role: 'admin'
  },
  {
    id: 'user-001',
    email: 'user@example.com',
    // bcrypt hash for "password123"
    passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMy.MRjRnCKXnZpRrgPNZ6ZmhP8FqkjhJPa',
    role: 'user'
  }
]

// Secure password hashing with bcrypt (internal use only)
function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

// Secure password verification with bcrypt (timing-safe)
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash)
  } catch {
    // Invalid hash format
    return false
  }
}

// POST /api/auth/login - Login and get JWT token
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'

  try {
    // Rate Limit für Login (strenger: 5 Versuche pro Minute)
    const rateResult = checkRateLimit(`login:${clientIp}`, { windowMs: 60000, maxRequests: 5 })
    if (!rateResult.allowed) {
      logSecurity('Login rate limit exceeded', { ip: clientIp })
      return rateLimitResponse(rateResult.resetAt)
    }

    // Body validieren
    const body = await request.json()
    const validationResult = validateBody(LoginSchema, body)
    if (!validationResult.success) return validationResult.error

    const { email, password } = validationResult.data

    // User suchen
    const user = DEMO_USERS.find(u => u.email.toLowerCase() === email.toLowerCase())

    if (!user) {
      logSecurity('Login failed - user not found', { email, ip: clientIp })
      // Generische Fehlermeldung (keine Info ob User existiert)
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Passwort prüfen (bcrypt - timing-safe)
    const passwordValid = await verifyPassword(password, user.passwordHash)
    if (!passwordValid) {
      logSecurity('Login failed - wrong password', { email, ip: clientIp })
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Token erstellen
    const token = createToken(user.id, user.email, user.role)

    logSecurity('Login successful', { userId: user.id, email, ip: clientIp })
    logger.info('User logged in', {
      userId: user.id,
      email,
      role: user.role,
      duration: Date.now() - startTime
    })

    // Response mit Token
    const response = NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    })

    // Optional: Token auch als HttpOnly Cookie setzen
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 // 24 Stunden
    })

    return response
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Login failed'
    logger.error('Login error', error instanceof Error ? error : undefined, { ip: clientIp })
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
