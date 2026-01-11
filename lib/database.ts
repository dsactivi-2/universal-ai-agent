import Database from 'better-sqlite3'
import path from 'path'

const dbPath = path.join(process.cwd(), 'data', 'tasks.db')

// Ensure data directory exists
import fs from 'fs'
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
    phase TEXT NOT NULL DEFAULT 'waiting',
    output TEXT,
    summary TEXT,
    total_duration INTEGER DEFAULT 0,
    total_cost REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

export interface Task {
  id: string
  goal: string
  status: { phase: string }
  output?: string
  summary?: string
  totalDuration?: number
  totalCost?: number
  createdAt: string
  updatedAt: string
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
        output = COALESCE(?, output),
        summary = COALESCE(?, summary),
        total_duration = COALESCE(?, total_duration),
        total_cost = COALESCE(?, total_cost),
        updated_at = ?
    WHERE id = ?
  `)

  stmt.run(
    updates.phase,
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
      SUM(CASE WHEN phase = 'waiting' THEN 1 ELSE 0 END) as waiting,
      SUM(CASE WHEN phase = 'failed' THEN 1 ELSE 0 END) as failed
    FROM tasks
  `)
  return stmt.get()
}

export default db
