import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
})

interface OrchestratorRequest {
  message: string
  context?: {
    explicit?: Record<string, unknown>
    historical?: unknown[]
    conversational?: unknown[]
    preferences?: Record<string, unknown>
  }
}

interface OrchestratorResponse {
  taskId: string
  success: boolean
  output: string
  summary: string
  stepResults: unknown[]
  totalDuration: number
  totalCost: number
}

export class Orchestrator {
  async handleRequest(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    const startTime = Date.now()

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        taskId: 'error-' + Date.now(),
        success: false,
        output: 'ANTHROPIC_API_KEY not configured. Please set the environment variable.',
        summary: 'API key missing',
        stepResults: [],
        totalDuration: Date.now() - startTime,
        totalCost: 0
      }
    }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `Du bist ein hilfreicher AI-Assistent. Bearbeite folgende Aufgabe und gib eine detaillierte Antwort:

Aufgabe: ${request.message}

Antworte strukturiert und vollständig.`
          }
        ]
      })

      const outputText = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as { type: 'text'; text: string }).text)
        .join('\n')

      // Calculate cost (approximate: $3/1M input, $15/1M output for Claude 3.5 Sonnet)
      const inputTokens = response.usage?.input_tokens || 0
      const outputTokens = response.usage?.output_tokens || 0
      const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000

      return {
        taskId: 'task-' + Date.now(),
        success: true,
        output: outputText,
        summary: outputText.slice(0, 200) + (outputText.length > 200 ? '...' : ''),
        stepResults: [{
          step: 'Claude API Call',
          model: 'claude-sonnet-4-20250514',
          inputTokens,
          outputTokens
        }],
        totalDuration: Date.now() - startTime,
        totalCost: cost
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      return {
        taskId: 'error-' + Date.now(),
        success: false,
        output: `Error: ${errorMessage}`,
        summary: 'Task failed',
        stepResults: [],
        totalDuration: Date.now() - startTime,
        totalCost: 0
      }
    }
  }
}
