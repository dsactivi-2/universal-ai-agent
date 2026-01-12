import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRetry, withTimeout, withRetryAndTimeout } from '../../lib/utils/retry'

describe('Retry Utility', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('withRetry', () => {
    it('should return result on first successful attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const promise = withRetry(fn, { maxRetries: 3 })
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on retryable errors', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValue('success')

      const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100 })

      // Run timers to process retries
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should throw after max retries', async () => {
      const error = new Error('ECONNRESET')
      const fn = vi.fn().mockRejectedValue(error)

      const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 100 })

      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('ECONNRESET')
      expect(fn).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })

    it('should not retry non-retryable errors', async () => {
      const error = new Error('Invalid input')
      const fn = vi.fn().mockRejectedValue(error)

      const promise = withRetry(fn, { maxRetries: 3 })

      await expect(promise).rejects.toThrow('Invalid input')
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  describe('withTimeout', () => {
    it('should return result if completed before timeout', async () => {
      const fn = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return 'success'
      })

      const promise = withTimeout(fn, 1000)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
    })

    it('should throw if timeout exceeded', async () => {
      const fn = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 2000))
      )

      const promise = withTimeout(fn, 1000)

      // Advance time past timeout
      vi.advanceTimersByTime(1100)

      await expect(promise).rejects.toThrow('timed out')
    })

    it('should use custom timeout error', async () => {
      const fn = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 2000))
      )

      const customError = new Error('Custom timeout')
      const promise = withTimeout(fn, 1000, customError)

      vi.advanceTimersByTime(1100)

      await expect(promise).rejects.toThrow('Custom timeout')
    })
  })

  describe('withRetryAndTimeout', () => {
    it('should retry with timeout on each attempt', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('rate_limit_error'))
        .mockResolvedValue('success')

      const promise = withRetryAndTimeout(
        fn,
        5000,
        { maxRetries: 2, baseDelayMs: 100 }
      )

      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })
})

describe('Retry Configuration', () => {
  it('should use exponential backoff', () => {
    const baseDelay = 1000
    const multiplier = 2

    const delays = [0, 1, 2, 3].map(attempt =>
      baseDelay * Math.pow(multiplier, attempt)
    )

    expect(delays).toEqual([1000, 2000, 4000, 8000])
  })

  it('should respect max delay', () => {
    const baseDelay = 1000
    const multiplier = 2
    const maxDelay = 5000

    const delays = [0, 1, 2, 3, 4].map(attempt =>
      Math.min(baseDelay * Math.pow(multiplier, attempt), maxDelay)
    )

    expect(delays).toEqual([1000, 2000, 4000, 5000, 5000])
  })
})
