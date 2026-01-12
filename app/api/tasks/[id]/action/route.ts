import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, setTaskAction, clearTaskAction, addMessage } from '@/lib/database'
import { v4 as uuidv4 } from 'uuid'

// POST /api/tasks/[id]/action - Set action required
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    const { actionType, actionMessage, blocking } = await request.json()

    if (!actionType || !actionMessage) {
      return NextResponse.json(
        { error: 'actionType and actionMessage are required' },
        { status: 400 }
      )
    }

    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const updated = setTaskAction(taskId, actionType, actionMessage, blocking ?? false)

    return NextResponse.json({
      success: true,
      message: 'Action required status set',
      task: updated
    })
  } catch (error) {
    console.error('Failed to set action:', error)
    return NextResponse.json({ error: 'Failed to set action' }, { status: 500 })
  }
}

// DELETE /api/tasks/[id]/action - Clear action required (user provided input)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    const body = await request.json().catch(() => ({}))
    const { userInput } = body

    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // If user provided input, save it as a message
    if (userInput) {
      addMessage(taskId, uuidv4(), 'user', `[Action Response - ${task.actionType}]: ${userInput}`)
    }

    const updated = clearTaskAction(taskId)

    return NextResponse.json({
      success: true,
      message: 'Action cleared',
      task: updated
    })
  } catch (error) {
    console.error('Failed to clear action:', error)
    return NextResponse.json({ error: 'Failed to clear action' }, { status: 500 })
  }
}
