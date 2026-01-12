import { describe, it, expect, beforeEach, vi } from 'vitest'
import { verifyToken, generateToken, extractToken, AuthUser } from '../../lib/middleware/auth'
import { NextRequest } from 'next/server'

describe('Auth Middleware', () => {
  const testUser: AuthUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'user'
  }

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(testUser)

      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3) // JWT format: header.payload.signature
    })

    it('should generate different tokens for different users', () => {
      const user2: AuthUser = { ...testUser, id: 'user-456' }

      const token1 = generateToken(testUser)
      const token2 = generateToken(user2)

      expect(token1).not.toBe(token2)
    })
  })

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = generateToken(testUser)
      const decoded = verifyToken(token)

      expect(decoded).toBeTruthy()
      expect(decoded?.id).toBe(testUser.id)
      expect(decoded?.email).toBe(testUser.email)
      expect(decoded?.role).toBe(testUser.role)
    })

    it('should return null for invalid token', () => {
      const decoded = verifyToken('invalid-token')

      expect(decoded).toBeNull()
    })

    it('should return null for malformed token', () => {
      const decoded = verifyToken('not.a.valid.jwt.token')

      expect(decoded).toBeNull()
    })

    it('should return null for empty token', () => {
      const decoded = verifyToken('')

      expect(decoded).toBeNull()
    })
  })

  describe('extractToken', () => {
    it('should extract token from Bearer header', () => {
      const token = 'test-token-123'
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const extracted = extractToken(request)

      expect(extracted).toBe(token)
    })

    it('should return null for missing Authorization header', () => {
      const request = new NextRequest('http://localhost/api/test')

      const extracted = extractToken(request)

      expect(extracted).toBeNull()
    })

    it('should return null for non-Bearer Authorization', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          'Authorization': 'Basic dXNlcjpwYXNz'
        }
      })

      const extracted = extractToken(request)

      expect(extracted).toBeNull()
    })

    it('should handle Bearer with empty token', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          'Authorization': 'Bearer '
        }
      })

      const extracted = extractToken(request)

      // Empty Bearer returns empty string (slice(7) of 'Bearer ')
      // This empty token will be rejected by verifyToken anyway
      expect(extracted === '' || extracted === null).toBe(true)
    })
  })

  describe('Token Expiration', () => {
    it('should create token with custom expiration', () => {
      const token = generateToken(testUser, '1h')
      const decoded = verifyToken(token)

      expect(decoded).toBeTruthy()
    })
  })
})
