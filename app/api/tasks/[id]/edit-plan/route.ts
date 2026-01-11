import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, updateTask } from '@/lib/database'

// PATCH /api/tasks/[id]/edit-plan - Edit plan before approval
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    const { plan } = await request.json()

    if (!plan || typeof plan !== 'string') {
      return NextResponse.json({ error: 'Plan is required' }, { status: 400 })
    }

    // Check if task exists
    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if task is in a state where plan can be edited
    if (task.status.phase !== 'awaiting_approval') {
      return NextResponse.json(
        { error: `Plan kann nur bearbeitet werden wenn Status "awaiting_approval". Aktuell: ${task.status.phase}` },
        { status: 400 }
      )
    }

    // Update the plan
    const updated = updateTask(taskId, {
      plan,
      output: plan,
      summary: 'Plan wurde manuell bearbeitet'
    })

    return NextResponse.json({
      success: true,
      message: 'Plan wurde aktualisiert',
      task: updated
    })
  } catch (error) {
    console.error('Failed to edit plan:', error)
    return NextResponse.json({ error: 'Failed to edit plan' }, { status: 500 })
  }
}
