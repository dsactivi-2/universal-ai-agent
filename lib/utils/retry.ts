/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  retryableErrors?: string[]
}

const defaultConfig: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'rate_limit_error',
    'overloaded_error',
    '529',  // Overloaded
    '503',  // Service unavailable
    '502',  // Bad gateway
  ]
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown, retryableErrors: string[]): boolean {
  if (!error) return false

  const errorString = String(error)
  const errorMessage = error instanceof Error ? error.message : ''
  const errorCode = (error as { code?: string })?.code || ''
  const statusCode = (error as { status?: number })?.status?.toString() || ''

  return retryableErrors.some(e =>
    errorString.includes(e) ||
    errorMessage.includes(e) ||
    errorCode.includes(e) ||
    statusCode === e
  )
}

/**
 * Execute function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, backoffMultiplier, retryableErrors } = {
    ...defaultConfig,
    ...config
  }

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Don't retry on last attempt or non-retryable errors
      if (attempt === maxRetries || !isRetryableError(error, retryableErrors!)) {
        throw error
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt)
      const jitter = Math.random() * 0.3 * exponentialDelay // 30% jitter
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs)

      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`)
      await sleep(delay)
    }
  }

  throw lastError
}

/**
 * Execute function with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutError?: Error
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(timeoutError || new Error(`Operation timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ])
}

/**
 * Combined retry with timeout
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  retryConfig: Partial<RetryConfig> = {}
): Promise<T> {
  return withRetry(
    () => withTimeout(fn, timeoutMs),
    retryConfig
  )
}
