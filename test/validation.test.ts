import { describe, it, expect } from 'vitest'
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  SendMessageSchema,
  LoginSchema,
  sanitizeString,
  sanitizePath,
  sanitizeForBash
} from '@/lib/validation'

describe('Validation Schemas', () => {
  describe('CreateTaskSchema', () => {
    it('should accept valid message', () => {
      const result = CreateTaskSchema.safeParse({ message: 'Create a hello world app' })
      expect(result.success).toBe(true)
    })

    it('should reject empty message', () => {
      const result = CreateTaskSchema.safeParse({ message: '' })
      expect(result.success).toBe(false)
    })

    it('should reject missing message', () => {
      const result = CreateTaskSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('should trim whitespace', () => {
      const result = CreateTaskSchema.safeParse({ message: '  hello world  ' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.message).toBe('hello world')
      }
    })

    it('should reject message exceeding max length', () => {
      const longMessage = 'a'.repeat(10001)
      const result = CreateTaskSchema.safeParse({ message: longMessage })
      expect(result.success).toBe(false)
    })
  })

  describe('UpdateTaskSchema', () => {
    it('should accept valid UUID', () => {
      const result = UpdateTaskSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        phase: 'completed'
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid UUID', () => {
      const result = UpdateTaskSchema.safeParse({
        id: 'not-a-uuid',
        phase: 'completed'
      })
      expect(result.success).toBe(false)
    })

    it('should accept valid phase values', () => {
      const phases = ['planning', 'awaiting_approval', 'executing', 'completed', 'failed']

      for (const phase of phases) {
        const result = UpdateTaskSchema.safeParse({
          id: '123e4567-e89b-12d3-a456-426614174000',
          phase
        })
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid phase', () => {
      const result = UpdateTaskSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        phase: 'invalid_phase'
      })
      expect(result.success).toBe(false)
    })
  })

  describe('SendMessageSchema', () => {
    it('should accept valid message', () => {
      const result = SendMessageSchema.safeParse({ message: 'What is the status?' })
      expect(result.success).toBe(true)
    })

    it('should reject empty message', () => {
      const result = SendMessageSchema.safeParse({ message: '' })
      expect(result.success).toBe(false)
    })
  })

  describe('LoginSchema', () => {
    it('should accept valid credentials', () => {
      const result = LoginSchema.safeParse({
        email: 'user@example.com',
        password: 'SecurePass123'
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid email', () => {
      const result = LoginSchema.safeParse({
        email: 'not-an-email',
        password: 'SecurePass123'
      })
      expect(result.success).toBe(false)
    })

    it('should reject short password', () => {
      const result = LoginSchema.safeParse({
        email: 'user@example.com',
        password: 'short'
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('Sanitization Helpers', () => {
  describe('sanitizeString', () => {
    it('should remove angle brackets', () => {
      expect(sanitizeString('<script>alert(1)</script>')).toBe('scriptalert(1)/script')
    })

    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello')
    })

    it('should handle empty string', () => {
      expect(sanitizeString('')).toBe('')
    })
  })

  describe('sanitizePath', () => {
    it('should remove parent directory traversal', () => {
      expect(sanitizePath('../../../etc/passwd')).toBe('etc/passwd')
    })

    it('should remove leading slashes', () => {
      expect(sanitizePath('/etc/passwd')).toBe('etc/passwd')
    })

    it('should remove Windows-incompatible characters', () => {
      expect(sanitizePath('file<>:"|?*.txt')).toBe('file.txt')
    })

    it('should handle safe paths', () => {
      expect(sanitizePath('src/components/Button.tsx')).toBe('src/components/Button.tsx')
    })
  })

  describe('sanitizeForBash', () => {
    it('should remove shell metacharacters', () => {
      expect(sanitizeForBash('echo $(whoami)')).toBe('echo whoami')
    })

    it('should remove pipe operators', () => {
      expect(sanitizeForBash('cat file | grep secret')).toBe('cat file  grep secret')
    })

    it('should remove command chaining', () => {
      expect(sanitizeForBash('cmd1 && cmd2 ; cmd3')).toBe('cmd1  cmd2  cmd3')
    })

    it('should handle safe input', () => {
      expect(sanitizeForBash('npm install')).toBe('npm install')
    })
  })
})
