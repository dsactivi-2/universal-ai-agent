import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, updateTask } from '@/lib/database'
import { Orchestrator } from '@/lib/orchestrator'
import { requireAuth } from '@/lib/auth'

// POST /api/tasks/[id]/stop - Stop a running task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { id: taskId } = await params

    // Check if task exists
    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if task is actually running
    if (task.status.phase !== 'executing' && task.status.phase !== 'planning') {
      return NextResponse.json(
        { error: `Task ist nicht aktiv. Aktueller Status: ${task.status.phase}` },
        { status: 400 }
      )
    }

    // Stop the task
    const stopped = Orchestrator.stopTask(taskId)

    // Update task status
    updateTask(taskId, {
      phase: 'stopped',
      summary: 'Task wurde manuell abgebrochen'
    })

    return NextResponse.json({
      success: true,
      message: stopped ? 'Task wird abgebrochen...' : 'Task wurde als gestoppt markiert',
      taskId
    })
  } catch (error) {
    console.error('Failed to stop task:', error)
    return NextResponse.json({ error: 'Failed to stop task' }, { status: 500 })
  }
}
