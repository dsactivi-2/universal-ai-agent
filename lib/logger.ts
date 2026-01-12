import fs from 'fs'
import path from 'path'

// Log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

// Log entry structure
export interface LogEntry {
  timestamp: string
  level: string
  source: string
  message: string
  taskId?: string
  error?: string
  stack?: string
  meta?: Record<string, unknown>
}

// Logger configuration - use absolute path for production reliability
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'data', 'logs')
const LOG_LEVEL = (process.env.LOG_LEVEL || 'INFO').toUpperCase() as keyof typeof LogLevel
const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_LOG_FILES = 5
const FILE_LOGGING_ENABLED = process.env.DISABLE_FILE_LOGGING !== 'true'

// Track if we've logged the initialization
let initialized = false

// Ensure log directory exists
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

// Get current log file path
function getLogFilePath(type: 'app' | 'error' = 'app'): string {
  const date = new Date().toISOString().split('T')[0]
  return path.join(LOG_DIR, `${type}-${date}.log`)
}

// Rotate logs if needed
function rotateLogsIfNeeded(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath)
      if (stats.size >= MAX_LOG_SIZE) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const newPath = filePath.replace('.log', `-${timestamp}.log`)
        fs.renameSync(filePath, newPath)

        // Clean old log files
        cleanOldLogs()
      }
    }
  } catch {
    // Ignore rotation errors
  }
}

// Clean old log files
function cleanOldLogs() {
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: path.join(LOG_DIR, f),
        time: fs.statSync(path.join(LOG_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time)

    // Keep only MAX_LOG_FILES per type
    const appLogs = files.filter(f => f.name.startsWith('app-'))
    const errorLogs = files.filter(f => f.name.startsWith('error-'))

    for (const logs of [appLogs, errorLogs]) {
      if (logs.length > MAX_LOG_FILES) {
        logs.slice(MAX_LOG_FILES).forEach(f => {
          try { fs.unlinkSync(f.path) } catch { /* ignore */ }
        })
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

// Format log entry for file
function formatLogEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level}]`,
    `[${entry.source}]`
  ]

  if (entry.taskId) {
    parts.push(`[task:${entry.taskId}]`)
  }

  parts.push(entry.message)

  if (entry.error) {
    parts.push(`| Error: ${entry.error}`)
  }

  if (entry.meta && Object.keys(entry.meta).length > 0) {
    parts.push(`| Meta: ${JSON.stringify(entry.meta)}`)
  }

  let result = parts.join(' ')

  if (entry.stack) {
    result += `\n  Stack: ${entry.stack}`
  }

  return result
}

// Write to log file
function writeToFile(entry: LogEntry) {
  if (!FILE_LOGGING_ENABLED) return

  try {
    ensureLogDir()

    // Log initialization once
    if (!initialized) {
      initialized = true
      console.log(`[LOGGER] Initialized - LOG_DIR: ${LOG_DIR}, LEVEL: ${LOG_LEVEL}`)
    }

    const appLogPath = getLogFilePath('app')
    rotateLogsIfNeeded(appLogPath)

    const line = formatLogEntry(entry) + '\n'
    fs.appendFileSync(appLogPath, line, { encoding: 'utf-8', flag: 'a' })

    // Also write errors to separate error log
    if (entry.level === 'ERROR') {
      const errorLogPath = getLogFilePath('error')
      rotateLogsIfNeeded(errorLogPath)
      fs.appendFileSync(errorLogPath, line, { encoding: 'utf-8', flag: 'a' })
    }
  } catch (err) {
    // Fallback to console if file write fails - only log once per session
    if (!initialized) {
      initialized = true
      console.error(`[LOGGER] File logging failed: ${err instanceof Error ? err.message : err}`)
      console.error(`[LOGGER] LOG_DIR was: ${LOG_DIR}`)
    }
  }
}

// Console output with colors
function consoleOutput(entry: LogEntry) {
  const colors = {
    ERROR: '\x1b[31m', // Red
    WARN: '\x1b[33m',  // Yellow
    INFO: '\x1b[36m',  // Cyan
    DEBUG: '\x1b[90m', // Gray
    RESET: '\x1b[0m'
  }

  const color = colors[entry.level as keyof typeof colors] || colors.RESET
  const prefix = `${color}[${entry.level}]\x1b[0m [${entry.source}]`
  const taskInfo = entry.taskId ? ` [task:${entry.taskId.slice(0, 8)}]` : ''

  if (entry.level === 'ERROR') {
    console.error(`${prefix}${taskInfo} ${entry.message}`, entry.error || '')
    if (entry.stack) {
      console.error(`  Stack:`, entry.stack)
    }
  } else if (entry.level === 'WARN') {
    console.warn(`${prefix}${taskInfo} ${entry.message}`)
  } else {
    console.log(`${prefix}${taskInfo} ${entry.message}`)
  }
}

// Check if should log based on level
function shouldLog(level: LogLevel): boolean {
  const configuredLevel = LogLevel[LOG_LEVEL] ?? LogLevel.INFO
  return level <= configuredLevel
}

// Main logger class
class Logger {
  private source: string
  private taskId?: string

  constructor(source: string, taskId?: string) {
    this.source = source
    this.taskId = taskId
  }

  // Create child logger with task context
  withTask(taskId: string): Logger {
    return new Logger(this.source, taskId)
  }

  // Create child logger with different source
  child(source: string): Logger {
    return new Logger(source, this.taskId)
  }

  private log(level: LogLevel, message: string, error?: Error | unknown, meta?: Record<string, unknown>) {
    if (!shouldLog(level)) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      source: this.source,
      message,
      taskId: this.taskId,
      meta
    }

    if (error) {
      if (error instanceof Error) {
        entry.error = error.message
        entry.stack = error.stack
      } else if (typeof error === 'string') {
        entry.error = error
      } else {
        entry.error = JSON.stringify(error)
      }
    }

    writeToFile(entry)
    consoleOutput(entry)
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>) {
    this.log(LogLevel.ERROR, message, error, meta)
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.log(LogLevel.WARN, message, undefined, meta)
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.log(LogLevel.INFO, message, undefined, meta)
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.log(LogLevel.DEBUG, message, undefined, meta)
  }

  // Log API request
  apiRequest(method: string, path: string, meta?: Record<string, unknown>) {
    this.info(`${method} ${path}`, { type: 'api_request', ...meta })
  }

  // Log API response
  apiResponse(method: string, path: string, status: number, durationMs?: number) {
    const level = status >= 500 ? LogLevel.ERROR : status >= 400 ? LogLevel.WARN : LogLevel.INFO
    this.log(level, `${method} ${path} -> ${status}`, undefined, {
      type: 'api_response',
      status,
      durationMs
    })
  }

  // Log tool execution
  toolExecution(tool: string, success: boolean, durationMs: number, meta?: Record<string, unknown>) {
    const level = success ? LogLevel.INFO : LogLevel.ERROR
    this.log(level, `Tool ${tool} ${success ? 'succeeded' : 'failed'}`, undefined, {
      type: 'tool_execution',
      tool,
      success,
      durationMs,
      ...meta
    })
  }

  // Log task state change
  taskStateChange(fromPhase: string, toPhase: string) {
    this.info(`Task state: ${fromPhase} -> ${toPhase}`, {
      type: 'task_state_change',
      fromPhase,
      toPhase
    })
  }

  // Log database operation
  dbOperation(operation: string, table: string, success: boolean, meta?: Record<string, unknown>) {
    const level = success ? LogLevel.DEBUG : LogLevel.ERROR
    this.log(level, `DB ${operation} on ${table}`, undefined, {
      type: 'db_operation',
      operation,
      table,
      success,
      ...meta
    })
  }
}

// Create default logger instances
export const logger = new Logger('app')
export const dbLogger = new Logger('database')
export const apiLogger = new Logger('api')
export const toolLogger = new Logger('tool')
export const orchestratorLogger = new Logger('orchestrator')

// Factory function for creating loggers
export function createLogger(source: string, taskId?: string): Logger {
  return new Logger(source, taskId)
}

// Get recent logs (for debugging/admin)
export function getRecentLogs(type: 'app' | 'error' = 'app', lines: number = 100): string[] {
  try {
    const logPath = getLogFilePath(type)
    if (!fs.existsSync(logPath)) {
      return []
    }

    const content = fs.readFileSync(logPath, 'utf-8')
    const allLines = content.split('\n').filter(l => l.trim())
    return allLines.slice(-lines)
  } catch {
    return []
  }
}

// Security logging helper
export function logSecurity(
  event: string,
  details: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  const securityLogger = new Logger('security')
  const meta = { type: 'security_event', event, ...details }

  if (level === 'error') {
    securityLogger.error(`Security: ${event}`, undefined, meta)
  } else if (level === 'warn') {
    securityLogger.warn(`Security: ${event}`, meta)
  } else {
    securityLogger.info(`Security: ${event}`, meta)
  }
}

// Task logging helper
export function logTask(taskId: string, message: string, meta?: Record<string, unknown>): void {
  const taskLogger = new Logger('task', taskId)
  taskLogger.info(message, meta)
}

// API error handler
export function handleApiError(
  error: unknown,
  context: string | { path: string; method: string },
  meta?: Record<string, unknown>
): { message: string; status: number; error?: string } {
  const errorLogger = new Logger('api')
  const contextStr = typeof context === 'string' ? context : `${context.method} ${context.path}`
  const contextMeta = typeof context === 'object' ? context : undefined

  if (error instanceof Error) {
    errorLogger.error(`${contextStr}: ${error.message}`, error, { ...contextMeta, ...meta })
    return {
      message: error.message,
      error: error.message,
      status: 500
    }
  }

  errorLogger.error(`${contextStr}: Unknown error`, undefined, { error, ...contextMeta, ...meta })
  return {
    message: 'An unexpected error occurred',
    error: 'An unexpected error occurred',
    status: 500
  }
}

// Get log stats
export function getLogStats(): { appSize: number; errorSize: number; logDir: string } {
  try {
    ensureLogDir()
    const appLogPath = getLogFilePath('app')
    const errorLogPath = getLogFilePath('error')

    return {
      logDir: LOG_DIR,
      appSize: fs.existsSync(appLogPath) ? fs.statSync(appLogPath).size : 0,
      errorSize: fs.existsSync(errorLogPath) ? fs.statSync(errorLogPath).size : 0
    }
  } catch {
    return { logDir: LOG_DIR, appSize: 0, errorSize: 0 }
  }
}

export default logger
