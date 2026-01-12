import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, updateTask, addStep } from '@/lib/database'
import { Orchestrator, StepResult } from '@/lib/orchestrator'
import { apiLogger, createLogger } from '@/lib/logger'

const orchestrator = new Orchestrator()

// POST /api/tasks/[id]/approve - Approve plan and start execution
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  try {
    const { id: taskId } = await params
    const logger = createLogger('api.approve', taskId)

    // Check if task exists
    const task = getTaskById(taskId)
    if (!task) {
      logger.warn('Task not found for approval')
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if task is awaiting approval
    if (task.status.phase !== 'awaiting_approval') {
      logger.warn('Task not awaiting approval', { currentPhase: task.status.phase })
      return NextResponse.json(
        { error: `Task is not awaiting approval. Current phase: ${task.status.phase}` },
        { status: 400 }
      )
    }

    logger.info('Plan approved, starting execution')

    // Update status to executing
    updateTask(taskId, {
      phase: 'executing',
      summary: 'Plan genehmigt - Ausführung gestartet'
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

    // Start execution with the original goal + plan context
    const executionMessage = `${task.goal}

Der folgende Plan wurde genehmigt. Bitte führe ihn aus:

${task.plan}`

    orchestrator.handleRequest({
      message: executionMessage,
      taskId,
      mode: 'execute',
      onStep
    }).then(result => {
      if (result.success) {
        logger.info('Execution completed successfully')
        updateTask(taskId, {
          phase: 'completed',
          output: result.output,
          summary: result.summary,
          totalDuration: (task.totalDuration || 0) + result.totalDuration,
          totalCost: (task.totalCost || 0) + result.totalCost
        })
      } else {
        // Save error details for failed tasks
        logger.error('Execution failed', new Error(result.errorReason || 'Unknown'))
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
      logger.error('Execution threw exception', error)
      updateTask(taskId, {
        phase: 'failed',
        output: error.message,
        errorReason: error.message,
        errorRecommendation: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.'
      })
    })

    apiLogger.apiResponse('POST', `/api/tasks/${taskId}/approve`, 200, Date.now() - startTime)
    return NextResponse.json({
      success: true,
      message: 'Plan approved - Execution started',
      taskId
    })
  } catch (error) {
    apiLogger.error('Failed to approve task', error)
    return NextResponse.json({ error: 'Failed to approve task' }, { status: 500 })
  }
}
