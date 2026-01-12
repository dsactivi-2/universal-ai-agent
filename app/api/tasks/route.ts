import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getAllTasks, createTask, updateTask, getTaskStats, addStep } from '@/lib/database'
import { Orchestrator, StepResult } from '@/lib/orchestrator'
import { apiLogger } from '@/lib/logger'
import { requireAuth, authAndRateLimit } from '@/lib/auth'
import { validateBody, validateQuery, CreateTaskSchema, UpdateTaskSchema, TaskQuerySchema, DeleteTaskQuerySchema } from '@/lib/validation'

const orchestrator = new Orchestrator()

// GET - Alle Tasks abrufen
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { searchParams } = new URL(request.url)
    const statsOnly = searchParams.get('stats')

    if (statsOnly === 'true') {
      const stats = getTaskStats()
      apiLogger.apiResponse('GET', '/api/tasks?stats=true', 200, Date.now() - startTime)
      return NextResponse.json(stats)
    }

    const tasks = getAllTasks()
    apiLogger.apiResponse('GET', '/api/tasks', 200, Date.now() - startTime)
    return NextResponse.json(tasks)
  } catch (error) {
    apiLogger.error('Failed to fetch tasks', error)
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

// POST - Neuen Task erstellen (startet mit Planning)
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    // Auth + Rate Limit prüfen
    const authResult = authAndRateLimit(request)
    if ('error' in authResult) return authResult.error

    // Zod Validierung
    const body = await request.json()
    const validationResult = validateBody(CreateTaskSchema, body)
    if (!validationResult.success) return validationResult.error

    const { message } = validationResult.data

    const taskId = uuidv4()
    apiLogger.info('Creating new task', { taskId, goal: message.slice(0, 50) })

    // Task in DB speichern mit Phase "planning"
    const task = createTask({
      id: taskId,
      goal: message,
      phase: 'planning'
    })

    // Orchestrator im Planning-Modus starten (async)
    orchestrator.handleRequest({
      message,
      taskId,
      mode: 'plan'
    }).then(result => {
      if (result.success && result.plan) {
        // Plan erstellt - warte auf Bestätigung
        apiLogger.info('Planning completed', {
          taskId,
          estimatedSteps: result.estimatedSteps,
          estimatedCost: result.estimatedCost
        })
        updateTask(taskId, {
          phase: 'awaiting_approval',
          plan: result.plan,
          output: result.output,
          summary: 'Plan erstellt - Warte auf Bestätigung',
          totalDuration: result.totalDuration,
          totalCost: result.totalCost,
          estimatedSteps: result.estimatedSteps || 0,
          estimatedCost: result.estimatedCost || 0,
          progress: 0,
          currentStep: 0
        })
      } else {
        // Planung fehlgeschlagen
        apiLogger.error('Planning failed', new Error(result.summary), { taskId })
        updateTask(taskId, {
          phase: 'failed',
          output: result.output,
          summary: result.summary
        })
      }
    }).catch(error => {
      apiLogger.error('Planning threw exception', error, { taskId })
      updateTask(taskId, {
        phase: 'failed',
        output: error.message
      })
    })

    apiLogger.apiResponse('POST', '/api/tasks', 200, Date.now() - startTime)
    return NextResponse.json({
      taskId: task.id,
      success: true,
      message: 'Task created - Planning started'
    })
  } catch (error) {
    apiLogger.error('Failed to create task', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}

// DELETE - Task löschen
export async function DELETE(request: NextRequest) {
  const startTime = Date.now()
  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    // Zod Validierung für Query-Parameter
    const { searchParams } = new URL(request.url)
    const queryResult = validateQuery(DeleteTaskQuerySchema, searchParams)
    if (!queryResult.success) return queryResult.error

    const { id } = queryResult.data

    apiLogger.info('Deleting task', { taskId: id })
    const { deleteTask } = await import('@/lib/database')
    const deleted = deleteTask(id)

    if (!deleted) {
      apiLogger.warn('DELETE /api/tasks - Task not found', { taskId: id })
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    apiLogger.apiResponse('DELETE', '/api/tasks', 200, Date.now() - startTime)
    return NextResponse.json({ success: true, message: 'Task deleted' })
  } catch (error) {
    apiLogger.error('Failed to delete task', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}

// PATCH - Task aktualisieren
export async function PATCH(request: NextRequest) {
  const startTime = Date.now()
  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    // Zod Validierung
    const body = await request.json()
    const validationResult = validateBody(UpdateTaskSchema, body)
    if (!validationResult.success) return validationResult.error

    const { id, phase, output, summary, plan } = validationResult.data

    apiLogger.debug('Updating task', { taskId: id, phase })
    const updated = updateTask(id, { phase, output, summary, plan })

    if (!updated) {
      apiLogger.warn('PATCH /api/tasks - Task not found', { taskId: id })
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    apiLogger.apiResponse('PATCH', '/api/tasks', 200, Date.now() - startTime)
    return NextResponse.json(updated)
  } catch (error) {
    apiLogger.error('Failed to update task', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}
