import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, updateTask, addStep } from '@/lib/database'
import { Orchestrator, StepResult } from '@/lib/orchestrator'
import { authAndLLMRateLimit } from '@/lib/auth'
import { validateParams, TaskIdParamSchema } from '@/lib/validation'
import { logger, logTask, logTool, handleApiError } from '@/lib/logger'

const orchestrator = new Orchestrator()

// POST /api/tasks/[id]/approve - Approve plan and start execution
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()

  try {
    // Auth + Rate Limit prüfen
    const authResult = authAndLLMRateLimit(request)
    if ('error' in authResult) return authResult.error

    // Params validieren
    const { id: taskId } = await params
    const paramResult = validateParams(TaskIdParamSchema, { id: taskId })
    if (!paramResult.success) return paramResult.error

    // Task prüfen
    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Phase prüfen
    if (task.status.phase !== 'awaiting_approval') {
      return NextResponse.json(
        { error: `Task is not awaiting approval. Current phase: ${task.status.phase}` },
        { status: 400 }
      )
    }

    // Status auf executing setzen
    updateTask(taskId, {
      phase: 'executing',
      summary: 'Plan genehmigt - Ausführung gestartet'
    })

    logTask(taskId, 'approved', { userId: authResult.user.userId })

    // Step callback für DB-Speicherung
    const onStep = (step: StepResult) => {
      addStep(
        taskId,
        step.step,
        step.tool,
        step.input,
        step.output,
        step.success,
        step.duration
      )
      logTool(taskId, step.tool, step.success, step.duration)
    }

    // Ausführung mit Original-Goal + Plan-Kontext starten
    const executionMessage = `${task.goal}

Der folgende Plan wurde genehmigt. Bitte führe ihn aus:

${task.plan}`

    orchestrator.handleRequest({
      message: executionMessage,
      taskId,
      mode: 'execute',
      onStep
    }).then(result => {
      updateTask(taskId, {
        phase: result.success ? 'completed' : 'failed',
        output: result.output,
        summary: result.summary,
        totalDuration: (task.totalDuration || 0) + result.totalDuration,
        totalCost: (task.totalCost || 0) + result.totalCost
      })

      logTask(taskId, result.success ? 'completed' : 'failed', {
        duration: result.totalDuration,
        cost: result.totalCost,
        stepCount: result.stepResults.length
      })
    }).catch(error => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      updateTask(taskId, {
        phase: 'failed',
        output: errorMessage
      })
      logger.error('Execution failed', { taskId }, error instanceof Error ? error : undefined)
    })

    logger.info('Task execution started', {
      userId: authResult.user.userId,
      taskId,
      duration: Date.now() - startTime
    })

    return NextResponse.json({
      success: true,
      message: 'Plan approved - Execution started',
      taskId
    })
  } catch (error) {
    const { message, status } = handleApiError(error, { path: '/api/tasks/[id]/approve', method: 'POST' })
    return NextResponse.json({ error: message }, { status })
  }
}
