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
    updatedAt: row.updated_at
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
    updatedAt: row.updated_at
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
    now,
    id
  )

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
      SUM(CASE WHEN phase = 'failed' THEN 1 ELSE 0 END) as failed
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

export default db
