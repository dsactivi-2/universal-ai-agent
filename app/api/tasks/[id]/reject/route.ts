import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, updateTask } from '@/lib/database'
import { Orchestrator } from '@/lib/orchestrator'
import { requireAuth } from '@/lib/auth'
import { validateBody, validateParams, TaskIdParamSchema, RejectTaskSchema } from '@/lib/validation'

const orchestrator = new Orchestrator()

// POST /api/tasks/[id]/reject - Reject plan with optional feedback for new plan
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
    const body = await request.json().catch(() => ({}))
    const bodyResult = validateBody(RejectTaskSchema, body)
    if (!bodyResult.success) return bodyResult.error

    const { feedback, regenerate } = bodyResult.data

    // Check if task exists
    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if task is awaiting approval
    if (task.status.phase !== 'awaiting_approval') {
      return NextResponse.json(
        { error: `Task wartet nicht auf Genehmigung. Aktueller Status: ${task.status.phase}` },
        { status: 400 }
      )
    }

    // If regenerate is requested with feedback, create new plan
    if (regenerate && feedback) {
      updateTask(taskId, {
        phase: 'planning',
        summary: 'Plan abgelehnt - Erstelle neuen Plan basierend auf Feedback...'
      })

      // Create new plan with feedback context
      const enhancedMessage = `${task.goal}

WICHTIG - Vorheriger Plan wurde abgelehnt mit folgendem Feedback:
"${feedback}"

Bitte erstelle einen NEUEN Plan, der dieses Feedback berücksichtigt.`

      orchestrator.handleRequest({
        message: enhancedMessage,
        taskId,
        mode: 'plan'
      }).then(result => {
        if (result.success && result.plan) {
          updateTask(taskId, {
            phase: 'awaiting_approval',
            plan: result.plan,
            output: result.output,
            summary: 'Neuer Plan basierend auf Feedback erstellt',
            totalDuration: (task.totalDuration || 0) + result.totalDuration,
            totalCost: (task.totalCost || 0) + result.totalCost
          })
        } else {
          updateTask(taskId, {
            phase: 'failed',
            output: result.output,
            summary: 'Neue Planung fehlgeschlagen'
          })
        }
      }).catch(error => {
        updateTask(taskId, {
          phase: 'failed',
          output: error.message
        })
      })

      return NextResponse.json({
        success: true,
        message: 'Plan abgelehnt - Neuer Plan wird erstellt',
        taskId,
        regenerating: true
      })
    }

    // Just reject without regenerating
    updateTask(taskId, {
      phase: 'rejected',
      summary: feedback ? `Plan abgelehnt: ${feedback}` : 'Plan abgelehnt'
    })

    return NextResponse.json({
      success: true,
      message: 'Plan wurde abgelehnt',
      taskId,
      regenerating: false
    })
  } catch (error) {
    console.error('Failed to reject task:', error)
    return NextResponse.json({ error: 'Failed to reject task' }, { status: 500 })
  }
}
