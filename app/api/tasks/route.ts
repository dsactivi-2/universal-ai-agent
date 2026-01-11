import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getAllTasks, createTask, updateTask, getTaskStats, addStep } from '@/lib/database'
import { Orchestrator, StepResult } from '@/lib/orchestrator'

const orchestrator = new Orchestrator()

// GET - Alle Tasks abrufen
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const statsOnly = searchParams.get('stats')

    if (statsOnly === 'true') {
      const stats = getTaskStats()
      return NextResponse.json(stats)
    }

    const tasks = getAllTasks()
    return NextResponse.json(tasks)
  } catch (error) {
    console.error('Failed to fetch tasks:', error)
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

// POST - Neuen Task erstellen
export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const taskId = uuidv4()

    // Task in DB speichern
    const task = createTask({
      id: taskId,
      goal: message,
      phase: 'executing'
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

    // Orchestrator starten (async)
    orchestrator.handleRequest({
      message,
      taskId,
      onStep,
      context: {
        explicit: {},
        historical: [],
        conversational: [],
        preferences: {}
      }
    }).then(result => {
      // Task nach Verarbeitung aktualisieren
      updateTask(taskId, {
        phase: result.success ? 'completed' : 'failed',
        output: result.output,
        summary: result.summary,
        totalDuration: result.totalDuration,
        totalCost: result.totalCost
      })
    }).catch(error => {
      updateTask(taskId, {
        phase: 'failed',
        output: error.message
      })
    })

    return NextResponse.json({
      taskId: task.id,
      success: true,
      message: 'Task created and processing started'
    })
  } catch (error) {
    console.error('Failed to create task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}

// DELETE - Task löschen
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }

    const { deleteTask } = await import('@/lib/database')
    const deleted = deleteTask(id)

    if (!deleted) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Task deleted' })
  } catch (error) {
    console.error('Failed to delete task:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}

// PATCH - Task aktualisieren
export async function PATCH(request: NextRequest) {
  try {
    const { id, phase, output, summary } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }

    const updated = updateTask(id, { phase, output, summary })

    if (!updated) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Failed to update task:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}
