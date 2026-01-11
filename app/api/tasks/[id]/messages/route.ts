import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getMessagesByTaskId, addMessage, getConversationHistory, getTaskById, updateTask } from '@/lib/database'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
})

// GET /api/tasks/[id]/messages - Get all messages for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const messages = getMessagesByTaskId(id)
    return NextResponse.json(messages)
  } catch (error) {
    console.error('Failed to fetch messages:', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}

// POST /api/tasks/[id]/messages - Send a follow-up message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    const { message } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Check if task exists
    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    // Save user message
    const userMessageId = uuidv4()
    addMessage(taskId, userMessageId, 'user', message)

    // Get conversation history
    const history = getConversationHistory(taskId)

    // If no history, add the original task as first message
    const messages: Array<{ role: 'user' | 'assistant', content: string }> = []

    if (history.length === 1) {
      // First follow-up: include original task context
      messages.push({
        role: 'user',
        content: `Ursprüngliche Aufgabe: ${task.goal}\n\nLetzte Antwort:\n${task.output || 'Keine Antwort'}`
      })
      messages.push({
        role: 'assistant',
        content: 'Verstanden. Ich habe den Kontext der vorherigen Aufgabe.'
      })
    }

    // Add conversation history
    messages.push(...history)

    // Call Claude API
    const startTime = Date.now()
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `Du bist ein hilfreicher AI-Assistent. Du arbeitest an einer laufenden Aufgabe und beantwortest Folgefragen oder führst weitere Anweisungen aus. Der Kontext der ursprünglichen Aufgabe ist: "${task.goal}"`,
      messages: messages
    })

    const outputText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('\n')

    // Save assistant response
    const assistantMessageId = uuidv4()
    addMessage(taskId, assistantMessageId, 'assistant', outputText)

    // Calculate cost
    const inputTokens = response.usage?.input_tokens || 0
    const outputTokens = response.usage?.output_tokens || 0
    const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000
    const duration = Date.now() - startTime

    // Update task with latest response
    updateTask(taskId, {
      output: outputText,
      summary: outputText.slice(0, 200) + (outputText.length > 200 ? '...' : ''),
      totalDuration: (task.totalDuration || 0) + duration,
      totalCost: (task.totalCost || 0) + cost
    })

    return NextResponse.json({
      success: true,
      message: {
        id: assistantMessageId,
        taskId,
        role: 'assistant',
        content: outputText,
        createdAt: new Date().toISOString()
      },
      usage: {
        inputTokens,
        outputTokens,
        cost,
        duration
      }
    })
  } catch (error) {
    console.error('Failed to process message:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
