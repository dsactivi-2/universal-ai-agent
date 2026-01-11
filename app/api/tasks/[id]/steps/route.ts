import { NextRequest, NextResponse } from 'next/server'
import { getStepsByTaskId, getTaskById } from '@/lib/database'

// GET /api/tasks/[id]/steps - Get all steps for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if task exists
    const task = getTaskById(id)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const steps = getStepsByTaskId(id)

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
    console.error('Failed to fetch steps:', error)
    return NextResponse.json({ error: 'Failed to fetch steps' }, { status: 500 })
  }
}
