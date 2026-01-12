import { describe, it, expect } from 'vitest'
import { verifyToken, createToken, extractToken, JWTPayload } from '../../lib/auth'
import { NextRequest } from 'next/server'

describe('Auth Module', () => {
  const testUserId = 'user-123'
  const testEmail = 'test@example.com'
  const testRole = 'user' as const

  describe('createToken', () => {
    it('should generate a valid JWT token', () => {
      const token = createToken(testUserId, testEmail, testRole)

      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3)
    })

    it('should generate different tokens for different users', () => {
      const token1 = createToken(testUserId, testEmail, testRole)
      const token2 = createToken('user-456', 'other@example.com', testRole)

      expect(token1).not.toBe(token2)
    })
  })

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = createToken(testUserId, testEmail, testRole)
      const decoded = verifyToken(token)

      expect(decoded).toBeTruthy()
      expect(decoded?.userId).toBe(testUserId)
      expect(decoded?.email).toBe(testEmail)
      expect(decoded?.role).toBe(testRole)
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
  })
})
