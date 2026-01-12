// ============================================================
// STRUCTURED LOGGING MODULE
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  requestId?: string
  userId?: string
  taskId?: string
  tool?: string
  duration?: number
  [key: string]: unknown
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  error?: {
    name: string
    message: string
    stack?: string
  }
}

// Konfiguration
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info') as LogLevel
const LOG_FORMAT = process.env.LOG_FORMAT || 'json' // 'json' oder 'pretty'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[LOG_LEVEL]
}

function formatLog(entry: LogEntry): string {
  if (LOG_FORMAT === 'pretty') {
    const prefix = {
      debug: '\x1b[36m[DEBUG]\x1b[0m',
      info: '\x1b[32m[INFO]\x1b[0m',
      warn: '\x1b[33m[WARN]\x1b[0m',
      error: '\x1b[31m[ERROR]\x1b[0m'
    }[entry.level]

    let msg = `${entry.timestamp} ${prefix} ${entry.message}`

    if (entry.context && Object.keys(entry.context).length > 0) {
      msg += ` ${JSON.stringify(entry.context)}`
    }

    if (entry.error) {
      msg += `\n  Error: ${entry.error.name}: ${entry.error.message}`
      if (entry.error.stack) {
        msg += `\n  ${entry.error.stack.split('\n').slice(1, 4).join('\n  ')}`
      }
    }

    return msg
  }

  // JSON format (für Production/Log Aggregation)
  return JSON.stringify(entry)
}

function log(level: LogLevel, message: string, context?: LogContext, error?: Error) {
  if (!shouldLog(level)) return

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: context ? { ...context } : undefined
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }

  const formatted = formatLog(entry)

  if (level === 'error') {
    console.error(formatted)
  } else if (level === 'warn') {
    console.warn(formatted)
  } else {
    console.log(formatted)
  }
}

// ============================================================
// PUBLIC API
// ============================================================

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext, error?: Error) => log('warn', message, context, error),
  error: (message: string, context?: LogContext, error?: Error) => log('error', message, context, error)
}

// Request Logger - für API Routes
export function logRequest(
  method: string,
  path: string,
  status: number,
  duration: number,
  context?: LogContext
) {
  const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
  log(level, `${method} ${path} ${status}`, { ...context, duration })
}

// Task Logger - für Agent-Operationen
export function logTask(taskId: string, action: string, context?: Omit<LogContext, 'taskId'>) {
  log('info', `Task ${action}`, { ...context, taskId })
}

// Tool Logger - für Tool-Ausführungen
export function logTool(
  taskId: string,
  tool: string,
  success: boolean,
  duration: number,
  error?: Error
) {
  const level: LogLevel = success ? 'info' : 'error'
  log(level, `Tool ${tool} ${success ? 'succeeded' : 'failed'}`, { taskId, tool, duration }, error)
}

// Security Logger - für Auth/Security Events
export function logSecurity(event: string, context?: LogContext) {
  log('warn', `SECURITY: ${event}`, context)
}

// ============================================================
// ERROR WRAPPER
// ============================================================

export function withErrorLogging<T>(
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  return fn().catch(error => {
    logger.error('Unhandled error', context, error instanceof Error ? error : new Error(String(error)))
    throw error
  })
}

// API Route Error Handler
export function handleApiError(error: unknown, context?: LogContext): { message: string; status: number } {
  const err = error instanceof Error ? error : new Error(String(error))

  logger.error('API Error', context, err)

  // Bekannte Fehlertypen
  if (err.message.includes('not found')) {
    return { message: err.message, status: 404 }
  }

  if (err.message.includes('Access denied') || err.message.includes('outside workspace')) {
    return { message: 'Access denied', status: 403 }
  }

  if (err.message.includes('validation') || err.message.includes('invalid')) {
    return { message: err.message, status: 400 }
  }

  // Generischer Serverfehler - keine Details preisgeben
  return { message: 'Internal server error', status: 500 }
}
