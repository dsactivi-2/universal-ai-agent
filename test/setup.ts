import { afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'

// Mock environment variables
process.env.ANTHROPIC_API_KEY = 'test-api-key'
process.env.JWT_SECRET = 'test-secret-key-for-testing-purposes-only'
process.env.AGENT_WORKSPACE = '/tmp/test-workspace'
process.env.NODE_ENV = 'test'

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks()
})

// Mock console methods to reduce noise in tests
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})
