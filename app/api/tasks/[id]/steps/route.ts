import { NextRequest, NextResponse } from 'next/server'
import { getStepsByTaskId, getTaskById } from '@/lib/database'
import { requireAuth } from '@/lib/auth'
import { validateParams, TaskIdParamSchema } from '@/lib/validation'
import { logger, handleApiError } from '@/lib/logger'

// GET /api/tasks/[id]/steps - Get all steps for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()

  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    // Params validieren
    const { id } = await params
    const paramResult = validateParams(TaskIdParamSchema, { id })
    if (!paramResult.success) return paramResult.error

    // Task prüfen
    const task = getTaskById(id)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const steps = getStepsByTaskId(id)

    logger.info('Steps fetched', {
      userId: authResult.user.userId,
      taskId: id,
      count: steps.length,
      duration: Date.now() - startTime
    })

    return NextResponse.json({
      taskId: id,
      taskPhase: task.status.phase,
      steps: steps.map(step => ({
        ...step,
        input: (() => {
          try {
            return JSON.parse(step.input)
          } catch {
            return step.input
          }
        })()
      }))
    })
  } catch (error) {
    const { message, status } = handleApiError(error, { path: '/api/tasks/[id]/steps', method: 'GET' })
    return NextResponse.json({ error: message }, { status })
  }
}
