import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, getStepsByTaskId, getMessagesByTaskId } from '@/lib/database'
import { requireAuth } from '@/lib/auth'

// GET /api/tasks/[id] - Get single task with full details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { id: taskId } = await params
    const { searchParams } = new URL(request.url)
    const includeSteps = searchParams.get('steps') === 'true'
    const includeMessages = searchParams.get('messages') === 'true'

    // Get task
    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Build response
    const response: Record<string, unknown> = { ...task }

    // Optionally include steps
    if (includeSteps) {
      const steps = getStepsByTaskId(taskId)
      response.steps = steps.map(step => ({
        ...step,
        input: (() => {
          try {
            return JSON.parse(step.input)
          } catch {
            return step.input
          }
        })()
      }))
    }

    // Optionally include messages
    if (includeMessages) {
      response.messages = getMessagesByTaskId(taskId)
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Failed to fetch task:', error)
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 })
  }
}
