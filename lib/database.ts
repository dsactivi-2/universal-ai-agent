import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

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
  const stmt = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC')
  const rows = stmt.all() as any[]

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
    errorStep: row.error_step
  }))
}

// Get task by ID
export function getTaskById(id: string): Task | null {
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?')
  const row = stmt.get(id) as any

  if (!row) return null

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
    errorStep: row.error_step
  }
}

// Create new task
export function createTask(input: CreateTaskInput): Task {
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO tasks (id, goal, status, phase, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  stmt.run(input.id, input.goal, input.phase || 'waiting', input.phase || 'waiting', now, now)

  return {
    id: input.id,
    goal: input.goal,
    status: { phase: input.phase || 'waiting' },
    createdAt: now,
    updatedAt: now
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
}>): Task | null {
  const now = new Date().toISOString()
  const existing = getTaskById(id)

  if (!existing) return null

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
    now,
    id
  )

  return getTaskById(id)
}

// Set action required on task
export function setTaskAction(id: string, actionType: string, actionMessage: string, blocking: boolean): Task | null {
  return updateTask(id, {
    actionRequired: true,
    actionType,
    actionMessage,
    actionBlocking: blocking
  })
}

// Clear action required on task
export function clearTaskAction(id: string): Task | null {
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
}

// Set error details on task
export function setTaskError(id: string, reason: string, recommendation: string, step?: string): Task | null {
  return updateTask(id, {
    phase: 'failed',
    errorReason: reason,
    errorRecommendation: recommendation,
    errorStep: step || ''
  })
}

// Clear error details on task (for retry/continue)
export function clearTaskError(id: string): Task | null {
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
}

// Delete task
export function deleteTask(id: string): boolean {
  // Delete messages and steps first
  db.prepare('DELETE FROM messages WHERE task_id = ?').run(id)
  db.prepare('DELETE FROM steps WHERE task_id = ?').run(id)
  const stmt = db.prepare('DELETE FROM tasks WHERE id = ?')
  const result = stmt.run(id)
  return result.changes > 0
}

// Get task stats
export function getTaskStats() {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN phase = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN phase = 'executing' THEN 1 ELSE 0 END) as executing,
      SUM(CASE WHEN phase = 'planning' THEN 1 ELSE 0 END) as planning,
      SUM(CASE WHEN phase = 'awaiting_approval' THEN 1 ELSE 0 END) as awaiting_approval,
      SUM(CASE WHEN phase = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN phase = 'stopped' THEN 1 ELSE 0 END) as stopped,
      SUM(CASE WHEN phase = 'rejected' THEN 1 ELSE 0 END) as rejected
    FROM tasks
  `)
  return stmt.get()
}

// ==================== MESSAGE FUNCTIONS ====================

// Get messages for a task
export function getMessagesByTaskId(taskId: string): Message[] {
  const stmt = db.prepare('SELECT * FROM messages WHERE task_id = ? ORDER BY created_at ASC')
  const rows = stmt.all(taskId) as any[]

  return rows.map(row => ({
    id: row.id,
    taskId: row.task_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  }))
}

// Add message to task
export function addMessage(taskId: string, messageId: string, role: 'user' | 'assistant', content: string): Message {
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO messages (id, task_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  stmt.run(messageId, taskId, role, content, now)

  return {
    id: messageId,
    taskId,
    role,
    content,
    createdAt: now
  }
}

// Get conversation history for Claude API
export function getConversationHistory(taskId: string): Array<{ role: 'user' | 'assistant', content: string }> {
  const messages = getMessagesByTaskId(taskId)
  return messages.map(m => ({
    role: m.role,
    content: m.content
  }))
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
  const now = new Date().toISOString()
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input)

  const stmt = db.prepare(`
    INSERT INTO steps (task_id, step_number, tool, input, output, success, duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const result = stmt.run(taskId, stepNumber, tool, inputStr, output, success ? 1 : 0, duration, now)

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
}

// Get steps for a task
export function getStepsByTaskId(taskId: string): Step[] {
  const stmt = db.prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_number ASC')
  const rows = stmt.all(taskId) as any[]

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
}

// Delete steps for a task
export function deleteStepsByTaskId(taskId: string): void {
  db.prepare('DELETE FROM steps WHERE task_id = ?').run(taskId)
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
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO attachments (id, task_id, filename, original_name, mime_type, size, analysis, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(id, taskId, filename, originalName, mimeType, size, analysis || null, now)

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
}

// Get attachments for a task
export function getAttachmentsByTaskId(taskId: string): Attachment[] {
  const stmt = db.prepare('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at ASC')
  const rows = stmt.all(taskId) as any[]

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
}

// Update attachment analysis
export function updateAttachmentAnalysis(id: string, analysis: string): Attachment | null {
  const stmt = db.prepare('UPDATE attachments SET analysis = ? WHERE id = ?')
  stmt.run(analysis, id)

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
}

// Delete attachments for a task
export function deleteAttachmentsByTaskId(taskId: string): void {
  db.prepare('DELETE FROM attachments WHERE task_id = ?').run(taskId)
}

export default db
