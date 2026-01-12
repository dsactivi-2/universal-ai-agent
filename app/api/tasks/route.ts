import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getAllTasks, createTask, updateTask, getTaskStats, deleteTask } from '@/lib/database'
import { Orchestrator } from '@/lib/orchestrator'
import { authAndLLMRateLimit, requireAuth } from '@/lib/auth'
import { validateBody, validateQuery, CreateTaskSchema, UpdateTaskSchema, TaskQuerySchema, DeleteTaskQuerySchema } from '@/lib/validation'
import { logger, logTask, handleApiError } from '@/lib/logger'

const orchestrator = new Orchestrator()

// GET - Alle Tasks abrufen
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    // Query Parameter validieren
    const queryResult = validateQuery(TaskQuerySchema, new URL(request.url).searchParams)
    if (!queryResult.success) return queryResult.error

    const { stats, phase, limit, offset } = queryResult.data

    if (stats === 'true') {
      const taskStats = getTaskStats()
      logger.info('Task stats fetched', { userId: authResult.user.userId, duration: Date.now() - startTime })
      return NextResponse.json(taskStats)
    }

    let tasks = getAllTasks()

    // Filter by phase if specified
    if (phase) {
      tasks = tasks.filter(t => t.status.phase === phase)
    }

    // Pagination
    const paginatedTasks = tasks.slice(offset, offset + limit)

    logger.info('Tasks fetched', {
      userId: authResult.user.userId,
      count: paginatedTasks.length,
      total: tasks.length,
      duration: Date.now() - startTime
    })

    return NextResponse.json({
      tasks: paginatedTasks,
      total: tasks.length,
      limit,
      offset
    })
  } catch (error) {
    const { message, status } = handleApiError(error, { path: '/api/tasks', method: 'GET' })
    return NextResponse.json({ error: message }, { status })
  }
}

// POST - Neuen Task erstellen (startet mit Planning)
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Auth + Rate Limit prüfen (LLM Rate Limit)
    const authResult = authAndLLMRateLimit(request)
    if ('error' in authResult) return authResult.error

    // Body validieren
    const body = await request.json()
    const validationResult = validateBody(CreateTaskSchema, body)
    if (!validationResult.success) return validationResult.error

    const { message } = validationResult.data
    const taskId = uuidv4()

    // Task in DB speichern mit Phase "planning"
    const task = createTask({
      id: taskId,
      goal: message,
      phase: 'planning'
    })

    logTask(taskId, 'created', { userId: authResult.user.userId, goal: message.slice(0, 100) })

    // Orchestrator im Planning-Modus starten (async)
    orchestrator.handleRequest({
      message,
      taskId,
      mode: 'plan'
    }).then(result => {
      if (result.success && result.plan) {
        updateTask(taskId, {
          phase: 'awaiting_approval',
          plan: result.plan,
          output: result.output,
          summary: 'Plan erstellt - Warte auf Bestätigung',
          totalDuration: result.totalDuration,
          totalCost: result.totalCost
        })
        logTask(taskId, 'plan_completed', { duration: result.totalDuration, cost: result.totalCost })
      } else {
        updateTask(taskId, {
          phase: 'failed',
          output: result.output,
          summary: result.summary
        })
        logTask(taskId, 'plan_failed', { output: result.output?.slice(0, 200) })
      }
    }).catch(error => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      updateTask(taskId, {
        phase: 'failed',
        output: errorMessage
      })
      logger.error('Planning failed', { taskId }, error instanceof Error ? error : undefined)
    })

    logger.info('Task creation started', {
      userId: authResult.user.userId,
      taskId,
      duration: Date.now() - startTime
    })

    return NextResponse.json({
      taskId: task.id,
      success: true,
      message: 'Task created - Planning started'
    })
  } catch (error) {
    const { message, status } = handleApiError(error, { path: '/api/tasks', method: 'POST' })
    return NextResponse.json({ error: message }, { status })
  }
}

// DELETE - Task löschen
export async function DELETE(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    // Query Parameter validieren
    const queryResult = validateQuery(DeleteTaskQuerySchema, new URL(request.url).searchParams)
    if (!queryResult.success) return queryResult.error

    const { id } = queryResult.data

    const deleted = deleteTask(id)

    if (!deleted) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    logTask(id, 'deleted', { userId: authResult.user.userId })
    logger.info('Task deleted', { userId: authResult.user.userId, taskId: id, duration: Date.now() - startTime })

    return NextResponse.json({ success: true, message: 'Task deleted' })
  } catch (error) {
    const { message, status } = handleApiError(error, { path: '/api/tasks', method: 'DELETE' })
    return NextResponse.json({ error: message }, { status })
  }
}

// PATCH - Task aktualisieren
export async function PATCH(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    // Body validieren
    const body = await request.json()
    const validationResult = validateBody(UpdateTaskSchema, body)
    if (!validationResult.success) return validationResult.error

    const { id, phase, output, summary, plan } = validationResult.data

    const updated = updateTask(id, { phase, output, summary, plan })

    if (!updated) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    logTask(id, 'updated', { userId: authResult.user.userId, phase })
    logger.info('Task updated', { userId: authResult.user.userId, taskId: id, duration: Date.now() - startTime })

    return NextResponse.json(updated)
  } catch (error) {
    const { message, status } = handleApiError(error, { path: '/api/tasks', method: 'PATCH' })
    return NextResponse.json({ error: message }, { status })
  }
}
