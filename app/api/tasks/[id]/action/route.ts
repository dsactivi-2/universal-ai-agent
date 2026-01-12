import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, setTaskAction, clearTaskAction, addMessage } from '@/lib/database'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '@/lib/auth'
import { validateBody, validateParams, TaskIdParamSchema, SetActionSchema, ClearActionSchema } from '@/lib/validation'

// POST /api/tasks/[id]/action - Set action required
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
    const bodyResult = validateBody(SetActionSchema, body)
    if (!bodyResult.success) return bodyResult.error

    const { actionType, actionMessage, blocking } = bodyResult.data

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
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    // Params validieren
    const { id: taskId } = await params
    const paramResult = validateParams(TaskIdParamSchema, { id: taskId })
    if (!paramResult.success) return paramResult.error

    // Body validieren (optional body)
    const body = await request.json().catch(() => ({}))
    const bodyResult = validateBody(ClearActionSchema, body)
    if (!bodyResult.success) return bodyResult.error

    const { userInput } = bodyResult.data

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
