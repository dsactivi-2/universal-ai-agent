import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getMessagesByTaskId, addMessage, getConversationHistory, getTaskById, updateTask } from '@/lib/database'
import Anthropic from '@anthropic-ai/sdk'
import { authAndLLMRateLimit, requireAuth } from '@/lib/auth'
import { validateParams, validateBody, TaskIdParamSchema, SendMessageSchema } from '@/lib/validation'
import { logger, logTask, handleApiError } from '@/lib/logger'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
})

// GET /api/tasks/[id]/messages - Get all messages for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()

  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    // Params validieren
    const { id } = await params
    const paramResult = validateParams(TaskIdParamSchema, { id })
    if (!paramResult.success) return paramResult.error

    const messages = getMessagesByTaskId(id)

    logger.info('Messages fetched', {
      userId: authResult.user.userId,
      taskId: id,
      count: messages.length,
      duration: Date.now() - startTime
    })

    return NextResponse.json(messages)
  } catch (error) {
    const { message, status } = handleApiError(error, { path: '/api/tasks/[id]/messages', method: 'GET' })
    return NextResponse.json({ error: message }, { status })
  }
}

// POST /api/tasks/[id]/messages - Send a follow-up message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()

  try {
    // Auth + Rate Limit prüfen
    const authResult = authAndLLMRateLimit(request)
    if ('error' in authResult) return authResult.error

    // Params validieren
    const { id: taskId } = await params
    const paramResult = validateParams(TaskIdParamSchema, { id: taskId })
    if (!paramResult.success) return paramResult.error

    // Body validieren
    const body = await request.json()
    const bodyResult = validateBody(SendMessageSchema, body)
    if (!bodyResult.success) return bodyResult.error

    const { message } = bodyResult.data

    // Task prüfen
    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // API Key prüfen
    if (!process.env.ANTHROPIC_API_KEY) {
      logger.error('ANTHROPIC_API_KEY not configured', { taskId })
      return NextResponse.json({ error: 'API configuration error' }, { status: 500 })
    }

    // User-Nachricht speichern
    const userMessageId = uuidv4()
    addMessage(taskId, userMessageId, 'user', message)

    // Konversationshistorie abrufen
    const history = getConversationHistory(taskId)

    // Messages für Claude vorbereiten
    const messages: Array<{ role: 'user' | 'assistant', content: string }> = []

    if (history.length === 1) {
      // Erste Folgenachricht: Original-Kontext hinzufügen
      messages.push({
        role: 'user',
        content: `Ursprüngliche Aufgabe: ${task.goal}\n\nLetzte Antwort:\n${task.output || 'Keine Antwort'}`
      })
      messages.push({
        role: 'assistant',
        content: 'Verstanden. Ich habe den Kontext der vorherigen Aufgabe.'
      })
    }

    // Konversationshistorie hinzufügen
    messages.push(...history)

    // Claude API aufrufen
    const llmStartTime = Date.now()
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

    // Assistant-Antwort speichern
    const assistantMessageId = uuidv4()
    addMessage(taskId, assistantMessageId, 'assistant', outputText)

    // Kosten berechnen (aktualisierte Preise)
    const inputTokens = response.usage?.input_tokens || 0
    const outputTokens = response.usage?.output_tokens || 0
    // Claude Sonnet 4: $3/$15 per million tokens
    const cost = (inputTokens * 3 + outputTokens * 15) / 1000000
    const duration = Date.now() - llmStartTime

    // Task aktualisieren
    updateTask(taskId, {
      output: outputText,
      summary: outputText.slice(0, 200) + (outputText.length > 200 ? '...' : ''),
      totalDuration: (task.totalDuration || 0) + duration,
      totalCost: (task.totalCost || 0) + cost
    })

    logTask(taskId, 'message_sent', {
      userId: authResult.user.userId,
      inputTokens,
      outputTokens,
      cost,
      duration
    })

    logger.info('Message processed', {
      userId: authResult.user.userId,
      taskId,
      inputTokens,
      outputTokens,
      duration: Date.now() - startTime
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
    const { message, status } = handleApiError(error, { path: '/api/tasks/[id]/messages', method: 'POST' })
    return NextResponse.json({ error: message }, { status })
  }
}
