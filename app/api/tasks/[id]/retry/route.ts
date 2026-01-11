import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, updateTask, deleteStepsByTaskId, addStep } from '@/lib/database'
import { Orchestrator, StepResult } from '@/lib/orchestrator'

const orchestrator = new Orchestrator()

// POST /api/tasks/[id]/retry - Retry a failed/stopped task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params

    // Check if task exists
    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if task can be retried (failed or stopped)
    if (!['failed', 'stopped'].includes(task.status.phase)) {
      return NextResponse.json(
        { error: `Task kann nicht wiederholt werden. Aktueller Status: ${task.status.phase}` },
        { status: 400 }
      )
    }

    // Clear previous steps
    deleteStepsByTaskId(taskId)

    // Update status to planning (start fresh)
    updateTask(taskId, {
      phase: 'planning',
      summary: 'Task wird neu gestartet...',
      output: undefined
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

    // Start planning again
    orchestrator.handleRequest({
      message: task.goal,
      taskId,
      mode: 'plan'
    }).then(result => {
      if (result.success && result.plan) {
        updateTask(taskId, {
          phase: 'awaiting_approval',
          plan: result.plan,
          output: result.output,
          summary: 'Neuer Plan erstellt - Warte auf Bestätigung',
          totalDuration: result.totalDuration,
          totalCost: result.totalCost
        })
      } else {
        updateTask(taskId, {
          phase: 'failed',
          output: result.output,
          summary: result.summary
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
      message: 'Task wird neu gestartet - Planung beginnt',
      taskId
    })
  } catch (error) {
    console.error('Failed to retry task:', error)
    return NextResponse.json({ error: 'Failed to retry task' }, { status: 500 })
  }
}
