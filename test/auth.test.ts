import { describe, it, expect, beforeEach } from 'vitest'
import { createToken, verifyToken, checkRateLimit } from '@/lib/auth'

describe('Auth Module', () => {
  describe('createToken', () => {
    it('should create a valid JWT token', () => {
      const token = createToken('user-123', 'test@example.com', 'user')

      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3)
    })

    it('should create token with admin role', () => {
      const token = createToken('admin-123', 'admin@example.com', 'admin')

      const payload = verifyToken(token)
      expect(payload?.role).toBe('admin')
    })
  })

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = createToken('user-123', 'test@example.com', 'user')
      const payload = verifyToken(token)

      expect(payload).toBeDefined()
      expect(payload?.userId).toBe('user-123')
      expect(payload?.email).toBe('test@example.com')
      expect(payload?.role).toBe('user')
    })

    it('should return null for invalid token', () => {
      const payload = verifyToken('invalid.token.here')

      expect(payload).toBeNull()
    })

    it('should return null for malformed token', () => {
      const payload = verifyToken('not-a-jwt')

      expect(payload).toBeNull()
    })

    it('should return null for tampered token', () => {
      const token = createToken('user-123', 'test@example.com', 'user')
      const parts = token.split('.')
      parts[1] = 'tampered-payload'
      const tamperedToken = parts.join('.')

      const payload = verifyToken(tamperedToken)
      expect(payload).toBeNull()
    })
  })

  describe('checkRateLimit', () => {
    beforeEach(() => {
      // Rate limit store wird zwischen Tests nicht geleert
      // Das ist OK für diese Tests
    })

    it('should allow requests within limit', () => {
      const identifier = `test-${Date.now()}-1`
      const config = { windowMs: 60000, maxRequests: 5 }

      const result1 = checkRateLimit(identifier, config)
      expect(result1.allowed).toBe(true)
      expect(result1.remaining).toBe(4)

      const result2 = checkRateLimit(identifier, config)
      expect(result2.allowed).toBe(true)
      expect(result2.remaining).toBe(3)
    })

    it('should block requests over limit', () => {
      const identifier = `test-${Date.now()}-2`
      const config = { windowMs: 60000, maxRequests: 2 }

      checkRateLimit(identifier, config)
      checkRateLimit(identifier, config)
      const result = checkRateLimit(identifier, config)

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should track different identifiers separately', () => {
      const id1 = `user-a-${Date.now()}`
      const id2 = `user-b-${Date.now()}`
      const config = { windowMs: 60000, maxRequests: 1 }

      const result1 = checkRateLimit(id1, config)
      const result2 = checkRateLimit(id2, config)

      expect(result1.allowed).toBe(true)
      expect(result2.allowed).toBe(true)
    })
  })
})
