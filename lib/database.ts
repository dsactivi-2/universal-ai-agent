import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { dbLogger } from './logger'

const dbPath = path.join(process.cwd(), 'data', 'tasks.db')

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(dbPath)

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    goal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    phase TEXT NOT NULL DEFAULT 'planning',
    plan TEXT,
    output TEXT,
    summary TEXT,
    total_duration INTEGER DEFAULT 0,
    total_cost REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

// Add plan column if not exists (for existing DBs)
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN plan TEXT`)
} catch {
  // Column already exists
}

// Add action_required columns for user input tracking
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN action_required INTEGER DEFAULT 0`)
} catch { /* exists */ }
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN action_type TEXT`)
} catch { /* exists */ }
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN action_message TEXT`)
} catch { /* exists */ }
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN action_blocking INTEGER DEFAULT 0`)
} catch { /* exists */ }

// Add error detail columns for failed tasks
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN error_reason TEXT`)
} catch { /* exists */ }
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN error_recommendation TEXT`)
} catch { /* exists */ }
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN error_step TEXT`)
} catch { /* exists */ }

// Add cost estimation and progress tracking columns
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN estimated_cost REAL DEFAULT 0`)
} catch { /* exists */ }
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN estimated_steps INTEGER DEFAULT 0`)
} catch { /* exists */ }
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN current_step INTEGER DEFAULT 0`)
} catch { /* exists */ }
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN progress INTEGER DEFAULT 0`)
} catch { /* exists */ }

// Messages table for task conversations
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )
`)

// Steps table for tool executions
db.exec(`
  CREATE TABLE IF NOT EXISTS steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    step_number INTEGER NOT NULL,
    tool TEXT NOT NULL,
    input TEXT NOT NULL,
    output TEXT,
    success INTEGER DEFAULT 1,
    duration INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )
`)

// Attachments table for file uploads
db.exec(`
  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    analysis TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )
`)

export interface Task {
  id: string
  goal: string
  status: { phase: string }
  plan?: string
  output?: string
  summary?: string
  totalDuration?: number
  totalCost?: number
  createdAt: string
  updatedAt: string
  // Action required fields
  actionRequired?: boolean
  actionType?: string
  actionMessage?: string
  actionBlocking?: boolean
  // Error detail fields
  errorReason?: string
  errorRecommendation?: string
  errorStep?: string
  // Cost estimation and progress tracking
  estimatedCost?: number
  estimatedSteps?: number
  currentStep?: number
  progress?: number
}

export interface Message {
  id: string
  taskId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface Step {
  id: number
  taskId: string
  stepNumber: number
  tool: string
  input: string
  output: string
  success: boolean
  duration: number
  createdAt: string
}

export interface Attachment {
  id: string
  taskId: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  analysis?: string
  createdAt: string
}

export interface CreateTaskInput {
  id: string
  goal: string
  status?: string
  phase?: string
}

// Get all tasks
export function getAllTasks(): Task[] {
  try {
    const stmt = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC')
    const rows = stmt.all() as any[]
    dbLogger.debug('getAllTasks', { count: rows.length })

    return rows.map(row => ({
    id: row.id,
    goal: row.goal,
    status: { phase: row.phase },
    plan: row.plan,
    output: row.output,
    summary: row.summary,
    totalDuration: row.total_duration,
    totalCost: row.total_cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    actionRequired: row.action_required === 1,
    actionType: row.action_type,
    actionMessage: row.action_message,
    actionBlocking: row.action_blocking === 1,
    errorReason: row.error_reason,
    errorRecommendation: row.error_recommendation,
    errorStep: row.error_step,
    estimatedCost: row.estimated_cost,
    estimatedSteps: row.estimated_steps,
    currentStep: row.current_step,
    progress: row.progress
  }))
  } catch (error) {
    dbLogger.error('getAllTasks failed', error)
    throw error
  }
}

// Get task by ID
export function getTaskById(id: string): Task | null {
  try {
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?')
    const row = stmt.get(id) as any

    if (!row) {
      dbLogger.debug('getTaskById: not found', { taskId: id })
      return null
    }

    dbLogger.debug('getTaskById: found', { taskId: id, phase: row.phase })
    return {
      id: row.id,
      goal: row.goal,
      status: { phase: row.phase },
      plan: row.plan,
      output: row.output,
      summary: row.summary,
      totalDuration: row.total_duration,
      totalCost: row.total_cost,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      actionRequired: row.action_required === 1,
      actionType: row.action_type,
      actionMessage: row.action_message,
      actionBlocking: row.action_blocking === 1,
      errorReason: row.error_reason,
      errorRecommendation: row.error_recommendation,
      errorStep: row.error_step,
      estimatedCost: row.estimated_cost,
      estimatedSteps: row.estimated_steps,
      currentStep: row.current_step,
      progress: row.progress
    }
  } catch (error) {
    dbLogger.error('getTaskById failed', error, { taskId: id })
    throw error
  }
}

// Create new task
export function createTask(input: CreateTaskInput): Task {
  try {
    const now = new Date().toISOString()
    const stmt = db.prepare(`
      INSERT INTO tasks (id, goal, status, phase, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    stmt.run(input.id, input.goal, input.phase || 'waiting', input.phase || 'waiting', now, now)
    dbLogger.info('Task created', { taskId: input.id, goal: input.goal.slice(0, 50) })

    return {
      id: input.id,
      goal: input.goal,
      status: { phase: input.phase || 'waiting' },
      createdAt: now,
      updatedAt: now
    }
  } catch (error) {
    dbLogger.error('createTask failed', error, { taskId: input.id })
    throw error
  }
}

// Update task
export function updateTask(id: string, updates: Partial<{
  phase: string
  plan: string
  output: string
  summary: string
  totalDuration: number
  totalCost: number
  actionRequired: boolean
  actionType: string
  actionMessage: string
  actionBlocking: boolean
  errorReason: string
  errorRecommendation: string
  errorStep: string
  estimatedCost: number
  estimatedSteps: number
  currentStep: number
  progress: number
}>): Task | null {
  try {
    const now = new Date().toISOString()
    const existing = getTaskById(id)

    if (!existing) {
      dbLogger.warn('updateTask: task not found', { taskId: id })
      return null
    }

    const stmt = db.prepare(`
      UPDATE tasks
      SET phase = COALESCE(?, phase),
          plan = COALESCE(?, plan),
          output = COALESCE(?, output),
          summary = COALESCE(?, summary),
          total_duration = COALESCE(?, total_duration),
          total_cost = COALESCE(?, total_cost),
          action_required = COALESCE(?, action_required),
          action_type = COALESCE(?, action_type),
          action_message = COALESCE(?, action_message),
          action_blocking = COALESCE(?, action_blocking),
          error_reason = COALESCE(?, error_reason),
          error_recommendation = COALESCE(?, error_recommendation),
          error_step = COALESCE(?, error_step),
          estimated_cost = COALESCE(?, estimated_cost),
          estimated_steps = COALESCE(?, estimated_steps),
          current_step = COALESCE(?, current_step),
          progress = COALESCE(?, progress),
          updated_at = ?
      WHERE id = ?
    `)

    stmt.run(
      updates.phase,
      updates.plan,
      updates.output,
      updates.summary,
      updates.totalDuration,
      updates.totalCost,
      updates.actionRequired !== undefined ? (updates.actionRequired ? 1 : 0) : null,
      updates.actionType,
      updates.actionMessage,
      updates.actionBlocking !== undefined ? (updates.actionBlocking ? 1 : 0) : null,
      updates.errorReason,
      updates.errorRecommendation,
      updates.errorStep,
      updates.estimatedCost,
      updates.estimatedSteps,
      updates.currentStep,
      updates.progress,
      now,
      id
    )

    if (updates.phase) {
      dbLogger.info('Task phase updated', { taskId: id, phase: updates.phase })
    } else {
      dbLogger.debug('Task updated', { taskId: id, fields: Object.keys(updates) })
    }

    return getTaskById(id)
  } catch (error) {
    dbLogger.error('updateTask failed', error, { taskId: id })
    throw error
  }
}

// Set action required on task
export function setTaskAction(id: string, actionType: string, actionMessage: string, blocking: boolean): Task | null {
  dbLogger.info('Setting task action', { taskId: id, actionType, blocking })
  return updateTask(id, {
    actionRequired: true,
    actionType,
    actionMessage,
    actionBlocking: blocking
  })
}

// Clear action required on task
export function clearTaskAction(id: string): Task | null {
  try {
    dbLogger.info('Clearing task action', { taskId: id })
    const now = new Date().toISOString()
    const stmt = db.prepare(`
      UPDATE tasks
      SET action_required = 0,
          action_type = NULL,
          action_message = NULL,
          action_blocking = 0,
          updated_at = ?
      WHERE id = ?
    `)
    stmt.run(now, id)
    return getTaskById(id)
  } catch (error) {
    dbLogger.error('clearTaskAction failed', error, { taskId: id })
    throw error
  }
}

// Set error details on task
export function setTaskError(id: string, reason: string, recommendation: string, step?: string): Task | null {
  dbLogger.error('Task failed', new Error(reason), { taskId: id, step, recommendation })
  return updateTask(id, {
    phase: 'failed',
    errorReason: reason,
    errorRecommendation: recommendation,
    errorStep: step || ''
  })
}

// Clear error details on task (for retry/continue)
export function clearTaskError(id: string): Task | null {
  try {
    dbLogger.info('Clearing task error for retry', { taskId: id })
    const now = new Date().toISOString()
    const stmt = db.prepare(`
      UPDATE tasks
      SET error_reason = NULL,
          error_recommendation = NULL,
          error_step = NULL,
          updated_at = ?
      WHERE id = ?
    `)
    stmt.run(now, id)
    return getTaskById(id)
  } catch (error) {
    dbLogger.error('clearTaskError failed', error, { taskId: id })
    throw error
  }
}

// Delete task
export function deleteTask(id: string): boolean {
  try {
    dbLogger.info('Deleting task', { taskId: id })
    // Delete messages and steps first
    db.prepare('DELETE FROM messages WHERE task_id = ?').run(id)
    db.prepare('DELETE FROM steps WHERE task_id = ?').run(id)
    db.prepare('DELETE FROM attachments WHERE task_id = ?').run(id)
    const stmt = db.prepare('DELETE FROM tasks WHERE id = ?')
    const result = stmt.run(id)
    const deleted = result.changes > 0
    dbLogger.info('Task deleted', { taskId: id, success: deleted })
    return deleted
  } catch (error) {
    dbLogger.error('deleteTask failed', error, { taskId: id })
    throw error
  }
}

// Get task stats
export function getTaskStats() {
  try {
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN phase = 'completed' THEN 1 ELSE 0 END), 0) as completed,
        COALESCE(SUM(CASE WHEN phase = 'executing' THEN 1 ELSE 0 END), 0) as executing,
        COALESCE(SUM(CASE WHEN phase = 'planning' THEN 1 ELSE 0 END), 0) as planning,
        COALESCE(SUM(CASE WHEN phase = 'awaiting_approval' THEN 1 ELSE 0 END), 0) as awaiting_approval,
        COALESCE(SUM(CASE WHEN phase = 'failed' THEN 1 ELSE 0 END), 0) as failed,
        COALESCE(SUM(CASE WHEN phase = 'stopped' THEN 1 ELSE 0 END), 0) as stopped,
        COALESCE(SUM(CASE WHEN phase = 'rejected' THEN 1 ELSE 0 END), 0) as rejected
      FROM tasks
    `)
    const stats = stmt.get()
    dbLogger.debug('getTaskStats', stats as Record<string, unknown>)
    return stats
  } catch (error) {
    dbLogger.error('getTaskStats failed', error)
    throw error
  }
}

// ==================== MESSAGE FUNCTIONS ====================

// Get messages for a task
export function getMessagesByTaskId(taskId: string): Message[] {
  try {
    const stmt = db.prepare('SELECT * FROM messages WHERE task_id = ? ORDER BY created_at ASC')
    const rows = stmt.all(taskId) as any[]
    dbLogger.debug('getMessagesByTaskId', { taskId, count: rows.length })

    return rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at
    }))
  } catch (error) {
    dbLogger.error('getMessagesByTaskId failed', error, { taskId })
    throw error
  }
}

// Add message to task
export function addMessage(taskId: string, messageId: string, role: 'user' | 'assistant', content: string): Message {
  try {
    const now = new Date().toISOString()
    const stmt = db.prepare(`
      INSERT INTO messages (id, task_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    stmt.run(messageId, taskId, role, content, now)
    dbLogger.debug('Message added', { taskId, messageId, role })

    return {
      id: messageId,
      taskId,
      role,
      content,
      createdAt: now
    }
  } catch (error) {
    dbLogger.error('addMessage failed', error, { taskId, role })
    throw error
  }
}

// Get conversation history for Claude API
export function getConversationHistory(taskId: string): Array<{ role: 'user' | 'assistant', content: string }> {
  try {
    const messages = getMessagesByTaskId(taskId)
    dbLogger.debug('getConversationHistory', { taskId, messageCount: messages.length })
    return messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  } catch (error) {
    dbLogger.error('getConversationHistory failed', error, { taskId })
    throw error
  }
}

// ==================== STEP FUNCTIONS ====================

// Add step to task
export function addStep(
  taskId: string,
  stepNumber: number,
  tool: string,
  input: unknown,
  output: string,
  success: boolean,
  duration: number
): Step {
  try {
    const now = new Date().toISOString()
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input)

    const stmt = db.prepare(`
      INSERT INTO steps (task_id, step_number, tool, input, output, success, duration, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(taskId, stepNumber, tool, inputStr, output, success ? 1 : 0, duration, now)

    if (!success) {
      dbLogger.warn('Step failed', { taskId, stepNumber, tool, duration })
    } else {
      dbLogger.debug('Step added', { taskId, stepNumber, tool, success, duration })
    }

    return {
      id: result.lastInsertRowid as number,
      taskId,
      stepNumber,
      tool,
      input: inputStr,
      output,
      success,
      duration,
      createdAt: now
    }
  } catch (error) {
    dbLogger.error('addStep failed', error, { taskId, stepNumber, tool })
    throw error
  }
}

// Get steps for a task
export function getStepsByTaskId(taskId: string): Step[] {
  try {
    const stmt = db.prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_number ASC')
    const rows = stmt.all(taskId) as any[]
    dbLogger.debug('getStepsByTaskId', { taskId, count: rows.length })

    return rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      stepNumber: row.step_number,
      tool: row.tool,
      input: row.input,
      output: row.output,
      success: row.success === 1,
      duration: row.duration,
      createdAt: row.created_at
    }))
  } catch (error) {
    dbLogger.error('getStepsByTaskId failed', error, { taskId })
    throw error
  }
}

// Delete steps for a task
export function deleteStepsByTaskId(taskId: string): void {
  try {
    dbLogger.debug('Deleting steps', { taskId })
    db.prepare('DELETE FROM steps WHERE task_id = ?').run(taskId)
  } catch (error) {
    dbLogger.error('deleteStepsByTaskId failed', error, { taskId })
    throw error
  }
}

// ==================== ATTACHMENT FUNCTIONS ====================

// Add attachment to task
export function addAttachment(
  id: string,
  taskId: string,
  filename: string,
  originalName: string,
  mimeType: string,
  size: number,
  analysis?: string
): Attachment {
  try {
    const now = new Date().toISOString()
    const stmt = db.prepare(`
      INSERT INTO attachments (id, task_id, filename, original_name, mime_type, size, analysis, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(id, taskId, filename, originalName, mimeType, size, analysis || null, now)
    dbLogger.info('Attachment added', { taskId, attachmentId: id, filename: originalName, mimeType, size })

    return {
      id,
      taskId,
      filename,
      originalName,
      mimeType,
      size,
      analysis,
      createdAt: now
    }
  } catch (error) {
    dbLogger.error('addAttachment failed', error, { taskId, filename: originalName })
    throw error
  }
}

// Get attachments for a task
export function getAttachmentsByTaskId(taskId: string): Attachment[] {
  try {
    const stmt = db.prepare('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at ASC')
    const rows = stmt.all(taskId) as any[]
    dbLogger.debug('getAttachmentsByTaskId', { taskId, count: rows.length })

    return rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      filename: row.filename,
      originalName: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      analysis: row.analysis,
      createdAt: row.created_at
    }))
  } catch (error) {
    dbLogger.error('getAttachmentsByTaskId failed', error, { taskId })
    throw error
  }
}

// Update attachment analysis
export function updateAttachmentAnalysis(id: string, analysis: string): Attachment | null {
  try {
    const stmt = db.prepare('UPDATE attachments SET analysis = ? WHERE id = ?')
    stmt.run(analysis, id)
    dbLogger.debug('Attachment analysis updated', { attachmentId: id })

    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as any
    if (!row) return null

    return {
      id: row.id,
      taskId: row.task_id,
      filename: row.filename,
      originalName: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      analysis: row.analysis,
      createdAt: row.created_at
    }
  } catch (error) {
    dbLogger.error('updateAttachmentAnalysis failed', error, { attachmentId: id })
    throw error
  }
}

// Delete attachments for a task
export function deleteAttachmentsByTaskId(taskId: string): void {
  try {
    dbLogger.debug('Deleting attachments', { taskId })
    db.prepare('DELETE FROM attachments WHERE task_id = ?').run(taskId)
  } catch (error) {
    dbLogger.error('deleteAttachmentsByTaskId failed', error, { taskId })
    throw error
  }
}

export default db
