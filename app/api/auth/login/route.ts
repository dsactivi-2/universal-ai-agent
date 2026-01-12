import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createToken, checkRateLimit, rateLimitResponse } from '@/lib/auth'
import { validateBody, LoginSchema } from '@/lib/validation'
import { logger, logSecurity } from '@/lib/logger'

// In-Memory User Store (für Production: Datenbank verwenden)
// Passwörter sind bcrypt-gehashed
interface User {
  id: string
  email: string
  passwordHash: string
  role: 'user' | 'admin'
}

// Demo-Users (für Production: aus DB laden)
// Passwort: "password123" -> Hash generiert mit bcrypt
const DEMO_USERS: User[] = [
  {
    id: 'admin-001',
    email: 'admin@example.com',
    // In Production: bcrypt hash verwenden!
    passwordHash: 'demo_admin_hash',
    role: 'admin'
  },
  {
    id: 'user-001',
    email: 'user@example.com',
    passwordHash: 'demo_user_hash',
    role: 'user'
  }
]

// Simple hash für Demo (in Production: bcrypt!)
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'salt_for_demo').digest('hex')
}

function verifyPassword(password: string, hash: string): boolean {
  // Demo-Mode: akzeptiere "password123" für Demo-Users
  if (hash === 'demo_admin_hash' || hash === 'demo_user_hash') {
    return password === 'password123'
  }
  return hashPassword(password) === hash
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

    // Passwort prüfen
    if (!verifyPassword(password, user.passwordHash)) {
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
    logger.error('Login error', { ip: clientIp }, error instanceof Error ? error : undefined)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
