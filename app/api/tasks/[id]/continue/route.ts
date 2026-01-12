import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, updateTask, addStep, clearTaskError } from '@/lib/database'
import { Orchestrator, StepResult } from '@/lib/orchestrator'
import { requireAuth } from '@/lib/auth'
import { validateBody, validateParams, TaskIdParamSchema, ContinueTaskSchema } from '@/lib/validation'

const orchestrator = new Orchestrator()

// POST /api/tasks/[id]/continue - Continue a failed task with adjustments
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    // Params validieren
    const { id: taskId } = await params
    const paramResult = validateParams(TaskIdParamSchema, { id: taskId })
    if (!paramResult.success) return paramResult.error

    // Body validieren
    const body = await request.json()
    const bodyResult = validateBody(ContinueTaskSchema, body)
    if (!bodyResult.success) return bodyResult.error

    const { adjustment } = bodyResult.data

    // Check if task exists
    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if task is in a failed state
    if (task.status.phase !== 'failed') {
      return NextResponse.json(
        { error: `Task ist nicht fehlgeschlagen. Aktueller Status: ${task.status.phase}` },
        { status: 400 }
      )
    }

    // Clear error details and update status
    clearTaskError(taskId)
    updateTask(taskId, {
      phase: 'executing',
      summary: 'Fortgesetzt mit Anpassung'
    })

    // Step callback to save steps to database
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
    }

    // Build continuation message with context about what happened
    const continuationMessage = `${task.goal}

## Urspruenglicher Plan
${task.plan}

## Was bisher passiert ist
Der Task ist fehlgeschlagen mit folgendem Fehler:
- Grund: ${task.errorReason || 'Unbekannt'}
- Bei Schritt: ${task.errorStep || 'Unbekannt'}

## Anpassung vom Benutzer
${adjustment || 'Bitte versuche es erneut mit einer anderen Herangehensweise.'}

## Deine Aufgabe
Setze die Arbeit fort und beruecksichtige die Anpassung des Benutzers. Behebe das Problem und fuehre den Task zu Ende.`

    orchestrator.handleRequest({
      message: continuationMessage,
      taskId,
      mode: 'execute',
      onStep
    }).then(result => {
      if (result.success) {
        updateTask(taskId, {
          phase: 'completed',
          output: result.output,
          summary: result.summary,
          totalDuration: (task.totalDuration || 0) + result.totalDuration,
          totalCost: (task.totalCost || 0) + result.totalCost
        })
      } else {
        updateTask(taskId, {
          phase: 'failed',
          output: result.output,
          summary: result.summary,
          totalDuration: (task.totalDuration || 0) + result.totalDuration,
          totalCost: (task.totalCost || 0) + result.totalCost,
          errorReason: result.errorReason,
          errorRecommendation: result.errorRecommendation,
          errorStep: result.errorStep
        })
      }
    }).catch(error => {
      updateTask(taskId, {
        phase: 'failed',
        output: error.message,
        errorReason: error.message,
        errorRecommendation: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.'
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Task wird mit Anpassung fortgesetzt',
      taskId
    })
  } catch (error) {
    console.error('Failed to continue task:', error)
    return NextResponse.json({ error: 'Failed to continue task' }, { status: 500 })
  }
}
